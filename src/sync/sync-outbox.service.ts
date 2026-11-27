import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  classifySyncTableCategory,
  SYNC_TABLE_MAP,
  SYNC_TABLE_ORDER_INDEX,
  SYNC_TABLE_REGISTRY,
} from './sync-outbox.registry';

export interface OutboxChangeDto {
  seq: string | number;
  tenantId?: string | null;
  tableName: string;
  recordId: string;
  operation: 'UPSERT' | 'DELETE';
  payload?: Record<string, any> | null;
  keyData?: Record<string, any> | null;
  origin?: string;
  createdAt?: string;
}

@Injectable()
export class SyncOutboxService implements OnModuleInit {
  private readonly logger = new Logger(SyncOutboxService.name);
  private readonly tableColumnsCache = new Map<string, string[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const origin = this.resolveOrigin();
    await this.ensureOutboxTriggers(origin);
  }

  resolveOrigin(): 'CLOUD' | 'DESKTOP' {
    const syncEnabledRaw = this.configService.get<string>(
      'OFFLINE_SYNC_ENABLED',
      { infer: true },
    );
    const syncEnabled = syncEnabledRaw === 'true' || syncEnabledRaw === '1';
    const isDesktop =
      this.configService.get<string>('OFFLINE_DESKTOP', { infer: true }) ===
      'true';
    return syncEnabled || isDesktop ? 'DESKTOP' : 'CLOUD';
  }

  /**
   * Installs/updates PostgreSQL capture triggers on all tracked tables so every
   * create, update, or delete writes cleanly to `sync_outbox` inside the same DB transaction.
   */
  async ensureOutboxTriggers(origin: 'CLOUD' | 'DESKTOP'): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION public.restorch_capture_sync_outbox()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        DECLARE
          v_row jsonb;
          v_op text;
          v_pk_cols text[];
          v_col text;
          v_key_data jsonb := '{}'::jsonb;
          v_record_parts text[] := ARRAY[]::text[];
          v_record_id text;
          v_tenant_id uuid := NULL;
          v_lookup_parts text[];
          v_fk_val text;
        BEGIN
          IF current_setting('app.sync_applying', true) = 'true' THEN
            RETURN NULL;
          END IF;

          IF TG_OP = 'DELETE' THEN
            v_row := to_jsonb(OLD);
            v_op := 'DELETE';
          ELSE
            v_row := to_jsonb(NEW);
            v_op := 'UPSERT';
          END IF;

          v_pk_cols := string_to_array(TG_ARGV[0], ',');
          FOREACH v_col IN ARRAY v_pk_cols LOOP
            v_key_data := v_key_data || jsonb_build_object(v_col, v_row -> v_col);
            v_record_parts := array_append(v_record_parts, COALESCE(v_row ->> v_col, ''));
          END LOOP;
          v_record_id := array_to_string(v_record_parts, ':');

          IF v_row ? 'tenant_id' AND NULLIF(v_row ->> 'tenant_id', '') IS NOT NULL THEN
            v_tenant_id := (v_row ->> 'tenant_id')::uuid;
          ELSIF TG_NARGS > 1 AND NULLIF(TG_ARGV[1], '') IS NOT NULL THEN
            v_lookup_parts := string_to_array(TG_ARGV[1], '|');
            v_fk_val := NULLIF(v_row ->> v_lookup_parts[2], '');
            IF v_fk_val IS NOT NULL THEN
              EXECUTE format(
                'SELECT tenant_id FROM public.%I WHERE %I = $1::uuid LIMIT 1',
                v_lookup_parts[1],
                v_lookup_parts[3]
              ) INTO v_tenant_id USING v_fk_val;
            END IF;
          END IF;

          INSERT INTO public.sync_outbox (
            tenant_id,
            table_name,
            record_id,
            operation,
            payload,
            key_data,
            origin
          ) VALUES (
            v_tenant_id,
            TG_TABLE_NAME,
            v_record_id,
            v_op,
            CASE WHEN v_op = 'DELETE' THEN NULL ELSE v_row END,
            v_key_data,
            '${origin}'
          );

          RETURN NULL;
        EXCEPTION WHEN OTHERS THEN
          RETURN NULL;
        END;
        $$;
      `);

      const existingTablesRows: { table_name: string }[] =
        await this.prisma.$queryRawUnsafe(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `);
      const existingTables = new Set(existingTablesRows.map((r) => r.table_name));

      const existingTriggersRows: { tgname: string }[] =
        await this.prisma.$queryRawUnsafe(`
          SELECT tgname
          FROM pg_trigger
          WHERE NOT tgisinternal AND tgname LIKE 'trg_sync_outbox_%';
        `);
      const existingTriggers = new Set(
        existingTriggersRows.map((r) => r.tgname),
      );

      let installedCount = 0;
      for (const cfg of SYNC_TABLE_REGISTRY) {
        if (!existingTables.has(cfg.table)) continue;
        const triggerName = `trg_sync_outbox_${cfg.table}`;
        if (existingTriggers.has(triggerName)) continue;

        const pkArg = cfg.pkColumns.join(',');
        const lookupArg = cfg.tenantLookup
          ? `${cfg.tenantLookup.parentTable}|${cfg.tenantLookup.fkCol}|${cfg.tenantLookup.parentPkCol || 'id'}`
          : '';

        await this.prisma.$executeRawUnsafe(`
          CREATE TRIGGER "${triggerName}"
          AFTER INSERT OR UPDATE OR DELETE ON public."${cfg.table}"
          FOR EACH ROW
          EXECUTE FUNCTION public.restorch_capture_sync_outbox('${pkArg}', '${lookupArg}');
        `);
        installedCount++;
      }

      this.logger.log(
        `Sync outbox triggers verified (origin=${origin}, newly installed=${installedCount}, tracked tables=${SYNC_TABLE_REGISTRY.length}).`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Could not initialize sync_outbox triggers: ${err?.message || err}`,
      );
    }
  }

  private async getTableColumns(
    tx: Prisma.TransactionClient,
    tableName: string,
  ): Promise<string[]> {
    const cached = this.tableColumnsCache.get(tableName);
    if (cached) return cached;

    const rows: { column_name: string }[] = await tx.$queryRawUnsafe(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position ASC;`,
      tableName,
    );
    const cols = rows.map((r) => r.column_name);
    if (cols.length > 0) {
      this.tableColumnsCache.set(tableName, cols);
    }
    return cols;
  }

  async getPendingLocalOutbox(limit = 200): Promise<OutboxChangeDto[]> {
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT seq::text AS seq, tenant_id, table_name, record_id, operation, payload, key_data, origin, created_at
       FROM public.sync_outbox
       WHERE synced_at IS NULL
       ORDER BY seq ASC
       LIMIT $1;`,
      limit,
    );

    return rows.map((r) => ({
      seq: r.seq,
      tenantId: r.tenant_id,
      tableName: r.table_name,
      recordId: r.record_id,
      operation: r.operation === 'DELETE' ? 'DELETE' : 'UPSERT',
      payload: r.payload,
      keyData: r.key_data,
      origin: r.origin,
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
  }

  async markOutboxSynced(seqs: (string | number)[]): Promise<void> {
    if (!seqs.length) return;
    const ids = seqs.map((s) => String(s));
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.sync_outbox
       SET synced_at = NOW(), last_error = NULL
       WHERE seq = ANY($1::bigint[]);`,
      ids,
    );
  }

  async markOutboxError(
    seqs: (string | number)[],
    errorMessage: string,
  ): Promise<void> {
    if (!seqs.length) return;
    const ids = seqs.map((s) => String(s));
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.sync_outbox
       SET attempts = attempts + 1, last_error = $2
       WHERE seq = ANY($1::bigint[]);`,
      ids,
      errorMessage.slice(0, 1000),
    );
  }

  async clearLocalOutboxBeforeRestore(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`DELETE FROM public.sync_outbox;`);
  }

  async getLocalPendingKeys(): Promise<Set<string>> {
    const rows: { table_name: string; record_id: string }[] =
      await this.prisma.$queryRawUnsafe(`
        SELECT DISTINCT table_name, record_id
        FROM public.sync_outbox
        WHERE synced_at IS NULL;
      `);
    return new Set(rows.map((r) => `${r.table_name}::${r.record_id}`));
  }

  async getOutboxStatusStats() {
    const rows: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT table_name, COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE last_error IS NOT NULL)::int AS err_cnt
      FROM public.sync_outbox
      WHERE synced_at IS NULL
      GROUP BY table_name;
    `);

    const lastErrRows: { last_error: string }[] =
      await this.prisma.$queryRawUnsafe(`
        SELECT last_error
        FROM public.sync_outbox
        WHERE synced_at IS NULL AND last_error IS NOT NULL
        ORDER BY seq DESC
        LIMIT 1;
      `);

    let pendingOutboxCount = 0;
    let failedOutboxCount = 0;
    const pendingByCategory = {
      menusAndCatalog: 0,
      ordersAndBills: 0,
      filesAndMedia: 0,
      other: 0,
    };

    for (const row of rows) {
      const cnt = Number(row.cnt) || 0;
      const errCnt = Number(row.err_cnt) || 0;
      pendingOutboxCount += cnt;
      failedOutboxCount += errCnt;
      const category = classifySyncTableCategory(row.table_name);
      pendingByCategory[category] += cnt;
    }

    return {
      pendingOutboxCount,
      failedOutboxCount,
      lastSyncError: lastErrRows[0]?.last_error || null,
      pendingByCategory,
    };
  }

  /**
   * CLOUD SERVER:
   * Returns incremental changes recorded in Cloud's `sync_outbox` for `tenantId` after `afterSeq`,
   * attaching any referenced `file` rows ahead of menu/staff/receipt changes so dish photos stay in sync.
   */
  async getCloudChangesAfterSeq(
    tenantId: string,
    afterSeqRaw: string | number,
    limit = 200,
  ): Promise<{
    changes: OutboxChangeDto[];
    nextSeq: string;
    latestSeq: string;
    hasMore: boolean;
  }> {
    const afterSeq = String(afterSeqRaw || '0');
    if (!/^\d+$/.test(afterSeq)) {
      throw new BadRequestException('Invalid afterSeq cursor.');
    }

    const maxSeqRows: { max_seq: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(MAX(seq), 0)::text AS max_seq FROM public.sync_outbox;`,
    );
    const latestSeq = maxSeqRows[0]?.max_seq || '0';

    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT o.seq::text AS seq, o.tenant_id, o.table_name, o.record_id, o.operation, o.payload, o.key_data, o.origin, o.created_at
       FROM public.sync_outbox o
       WHERE o.seq > $1::bigint
         AND (
           o.tenant_id = $2::uuid
           OR (
             o.tenant_id IS NULL
             AND o.table_name = 'app_users'
             AND EXISTS (
               SELECT 1 FROM public.tenant_staff_memberships m
               WHERE m.user_id = o.record_id::uuid AND m.tenant_id = $2::uuid
             )
           )
           OR (
             o.tenant_id IS NULL
             AND o.table_name = 'user_credentials'
             AND EXISTS (
               SELECT 1 FROM public.user_credentials uc
               JOIN public.tenant_staff_memberships m ON m.user_id = uc.user_id
               WHERE uc.id = o.record_id::uuid AND m.tenant_id = $2::uuid
             )
           )
         )
       ORDER BY o.seq ASC
       LIMIT $3;`,
      afterSeq,
      tenantId,
      limit,
    );

    const hasMore = rows.length === limit;
    const nextSeq = hasMore
      ? String(rows[rows.length - 1].seq)
      : BigInt(latestSeq) > BigInt(afterSeq)
        ? latestSeq
        : afterSeq;

    // Collect referenced file IDs so Cloudinary dish/avatar/receipt images always arrive before parents
    const fileIds = new Set<string>();
    for (const r of rows) {
      if (r.operation === 'DELETE' || !r.payload) continue;
      if (r.table_name === 'menu_items' && r.payload.image_file_id) {
        fileIds.add(String(r.payload.image_file_id));
      } else if (r.table_name === 'app_users' && r.payload.photo_id) {
        fileIds.add(String(r.payload.photo_id));
      } else if (
        r.table_name === 'transfer_receipts' &&
        r.payload.receipt_file_id
      ) {
        fileIds.add(String(r.payload.receipt_file_id));
      }
    }

    const fileChanges: OutboxChangeDto[] = [];
    if (fileIds.size > 0) {
      const files: { id: string; path: string }[] =
        await this.prisma.$queryRawUnsafe(
          `SELECT id::text AS id, path FROM public.file WHERE id = ANY($1::uuid[]);`,
          Array.from(fileIds),
        );
      for (const f of files) {
        fileChanges.push({
          seq: afterSeq,
          tenantId,
          tableName: 'file',
          recordId: f.id,
          operation: 'UPSERT',
          payload: { id: f.id, path: f.path },
          keyData: { id: f.id },
          origin: 'CLOUD',
        });
      }
    }

    const mappedRows: OutboxChangeDto[] = rows
      .filter((r) => {
        const cfg = SYNC_TABLE_MAP.get(r.table_name);
        return Boolean(cfg && cfg.allowPullToDesktop);
      })
      .map((r) => ({
        seq: r.seq,
        tenantId: r.tenant_id,
        tableName: r.table_name,
        recordId: r.record_id,
        operation: r.operation === 'DELETE' ? 'DELETE' : 'UPSERT',
        payload: r.payload,
        keyData: r.key_data,
        origin: r.origin,
        createdAt:
          r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      }));

    return {
      changes: [...fileChanges, ...mappedRows],
      nextSeq,
      latestSeq,
      hasMore,
    };
  }

  /**
   * Applies a batch of outbox entries inside a single PostgreSQL transaction
   * with `SET LOCAL app.sync_applying = 'true'` to prevent ping-pong trigger echoes.
   */
  async applyOutboxBatch(
    tenantId: string,
    entries: OutboxChangeDto[],
    direction: 'PUSH_TO_CLOUD' | 'PULL_TO_DESKTOP',
    protectedLocalKeys?: Set<string>,
  ): Promise<{ appliedCount: number; skippedCount: number }> {
    if (!entries || entries.length === 0) {
      return { appliedCount: 0, skippedCount: 0 };
    }

    // Deduplicate keeping highest-seq (latest) event per (tableName, recordId)
    const latestByKey = new Map<string, OutboxChangeDto>();
    for (const entry of entries) {
      const key = `${entry.tableName}::${entry.recordId}`;
      const prev = latestByKey.get(key);
      if (
        !prev ||
        BigInt(entry.seq || 0) >= BigInt(prev.seq || 0)
      ) {
        latestByKey.set(key, entry);
      }
    }

    const deduped = Array.from(latestByKey.values());
    const upserts: OutboxChangeDto[] = [];
    const deletes: OutboxChangeDto[] = [];
    let skippedCount = 0;

    // Pre-scan incoming tenant_staff_memberships so new offline staff app_users are authorized cleanly
    const incomingMemberUserIds = new Set<string>();
    for (const item of deduped) {
      if (
        item.tableName === 'tenant_staff_memberships' &&
        item.operation === 'UPSERT' &&
        item.payload?.user_id
      ) {
        incomingMemberUserIds.add(String(item.payload.user_id));
      }
    }

    for (const item of deduped) {
      const cfg = SYNC_TABLE_MAP.get(item.tableName);
      if (!cfg) {
        skippedCount++;
        continue;
      }
      if (direction === 'PUSH_TO_CLOUD' && !cfg.allowPushToCloud) {
        skippedCount++;
        continue;
      }
      if (direction === 'PULL_TO_DESKTOP' && !cfg.allowPullToDesktop) {
        skippedCount++;
        continue;
      }
      if (
        direction === 'PULL_TO_DESKTOP' &&
        protectedLocalKeys?.has(`${item.tableName}::${item.recordId}`)
      ) {
        skippedCount++;
        continue;
      }

      if (item.operation === 'DELETE') {
        deletes.push(item);
      } else if (item.payload) {
        upserts.push(item);
      } else {
        skippedCount++;
      }
    }

    const getOrder = (tableName: string) =>
      SYNC_TABLE_ORDER_INDEX.get(tableName) ?? 9999;

    // Parent-first for upserts (tie-break by created_at ASC so self-FK parents go before children)
    upserts.sort((a, b) => {
      const diff = getOrder(a.tableName) - getOrder(b.tableName);
      if (diff !== 0) return diff;
      const ca = String(a.payload?.created_at || '');
      const cb = String(b.payload?.created_at || '');
      if (ca !== cb) return ca < cb ? -1 : 1;
      return Number(a.seq || 0) - Number(b.seq || 0);
    });

    // Child-first for deletes
    deletes.sort((a, b) => getOrder(b.tableName) - getOrder(a.tableName));

    let appliedCount = 0;

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.sync_applying = 'true';`);

        // Validate existing staff users on Cloud push
        let allowedUserIdsOnCloud: Set<string> | null = null;
        if (
          direction === 'PUSH_TO_CLOUD' &&
          (upserts.some(
            (u) =>
              u.tableName === 'app_users' || u.tableName === 'user_credentials',
          ) ||
            deletes.some(
              (d) =>
                d.tableName === 'app_users' ||
                d.tableName === 'user_credentials',
            ))
        ) {
          const existingStaff: { user_id: string }[] =
            await tx.$queryRawUnsafe(
              `SELECT user_id::text AS user_id FROM public.tenant_staff_memberships WHERE tenant_id = $1::uuid;`,
              tenantId,
            );
          allowedUserIdsOnCloud = new Set<string>([
            ...existingStaff.map((s) => s.user_id),
            ...incomingMemberUserIds,
          ]);
        }

        for (const item of upserts) {
          const cfg = SYNC_TABLE_MAP.get(item.tableName)!;
          const rowPayload: Record<string, any> = { ...item.payload };

          if (direction === 'PUSH_TO_CLOUD') {
            if (cfg.hasTenantId) {
              rowPayload.tenant_id = tenantId;
            }
            if (
              item.tableName === 'app_users' &&
              allowedUserIdsOnCloud &&
              !allowedUserIdsOnCloud.has(String(rowPayload.id))
            ) {
              skippedCount++;
              continue;
            }
            if (
              item.tableName === 'user_credentials' &&
              allowedUserIdsOnCloud &&
              !allowedUserIdsOnCloud.has(String(rowPayload.user_id))
            ) {
              skippedCount++;
              continue;
            }
            // Never overwrite an existing Cloudinary HTTPS URL on Cloud with a local /backend/v1/files/ path
            if (
              item.tableName === 'file' &&
              typeof rowPayload.path === 'string' &&
              rowPayload.path.startsWith('/backend/v1/files/')
            ) {
              const existingFile: { path: string }[] = await tx.$queryRawUnsafe(
                `SELECT path FROM public.file WHERE id = $1::uuid LIMIT 1;`,
                String(rowPayload.id),
              );
              if (
                existingFile[0]?.path &&
                existingFile[0].path.startsWith('http')
              ) {
                skippedCount++;
                continue;
              }
            }
          }

          await this.upsertWithJsonb(
            tx,
            item.tableName,
            cfg.pkColumns,
            rowPayload,
          );
          appliedCount++;
        }

        for (const item of deletes) {
          const cfg = SYNC_TABLE_MAP.get(item.tableName)!;
          const keyData =
            item.keyData && Object.keys(item.keyData).length > 0
              ? item.keyData
              : this.buildKeyDataFromRecordId(cfg.pkColumns, item.recordId);

          if (!keyData) {
            skippedCount++;
            continue;
          }

          if (
            direction === 'PUSH_TO_CLOUD' &&
            (item.tableName === 'app_users' ||
              item.tableName === 'user_credentials')
          ) {
            // Never delete global app_users/credentials blindly from a tenant push
            skippedCount++;
            continue;
          }

          await this.deleteWithJsonb(
            tx,
            item.tableName,
            cfg.pkColumns,
            keyData,
            direction === 'PUSH_TO_CLOUD' && cfg.hasTenantId ? tenantId : null,
          );
          appliedCount++;
        }
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    return { appliedCount, skippedCount };
  }

  private buildKeyDataFromRecordId(
    pkColumns: string[],
    recordId: string,
  ): Record<string, string> | null {
    const parts = recordId.split(':');
    if (parts.length !== pkColumns.length) return null;
    const obj: Record<string, string> = {};
    for (let i = 0; i < pkColumns.length; i++) {
      obj[pkColumns[i]] = parts[i];
    }
    return obj;
  }

  private async upsertWithJsonb(
    tx: Prisma.TransactionClient,
    tableName: string,
    pkColumns: string[],
    payload: Record<string, any>,
  ): Promise<void> {
    const tableCols = await this.getTableColumns(tx, tableName);
    const cols = tableCols.filter((c) => c in payload);
    if (cols.length === 0) return;

    const colsSql = cols.map((c) => `"${c}"`).join(', ');
    const pkSql = pkColumns.map((c) => `"${c}"`).join(', ');
    const updateCols = cols.filter((c) => !pkColumns.includes(c));
    const conflictClause =
      updateCols.length > 0
        ? `ON CONFLICT (${pkSql}) DO UPDATE SET ${updateCols
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
            .join(', ')}`
        : `ON CONFLICT (${pkSql}) DO NOTHING`;

    await tx.$executeRawUnsafe(
      `INSERT INTO public."${tableName}" (${colsSql})
       SELECT ${colsSql} FROM jsonb_populate_record(NULL::public."${tableName}", $1::jsonb)
       ${conflictClause};`,
      JSON.stringify(payload),
    );
  }

  private async deleteWithJsonb(
    tx: Prisma.TransactionClient,
    tableName: string,
    pkColumns: string[],
    keyData: Record<string, any>,
    scopedTenantId: string | null,
  ): Promise<void> {
    const pkColsSql = pkColumns.map((c) => `"${c}"`).join(', ');
    const whereMatch = pkColumns
      .map((c) => `t."${c}" = k."${c}"`)
      .join(' AND ');
    const tenantClause = scopedTenantId ? ` AND t."tenant_id" = $2::uuid` : '';

    const sql = `
      DELETE FROM public."${tableName}" t
      USING (
        SELECT ${pkColsSql}
        FROM jsonb_populate_record(NULL::public."${tableName}", $1::jsonb)
      ) k
      WHERE ${whereMatch}${tenantClause};
    `;

    if (scopedTenantId) {
      await tx.$executeRawUnsafe(sql, JSON.stringify(keyData), scopedTenantId);
    } else {
      await tx.$executeRawUnsafe(sql, JSON.stringify(keyData));
    }
  }
}
