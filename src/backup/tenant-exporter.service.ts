import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as zlib from 'zlib';

@Injectable()
export class TenantExporterService {
  private readonly logger = new Logger(TenantExporterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export 100% of a tenant's operational data into a compressed .sql.gz archive
   */
  async exportTenantData(tenantId: string): Promise<{
    filename: string;
    sqlGzBuffer: Buffer;
    totalTables: number;
    totalRows: number;
    tenantName: string;
    billsToday: number;
    revenueToday: number;
  }> {
    // 1. Fetch Tenant entity
    const tenantRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM public.tenants WHERE id = '${tenantId}'::uuid;`,
    );

    if (!tenantRows || tenantRows.length === 0) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found.`);
    }

    const tenant = tenantRows[0];
    const tenantName = (tenant.display_name || 'restaurant')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${tenantName}_${dateStr}_${timestampStr}.sql.gz`;

    const sqlChunks: string[] = [];
    let totalTables = 0;
    let totalRows = 0;

    sqlChunks.push(`-- =============================================================================`);
    sqlChunks.push(`-- RESTORCH AUTOMATED TENANT BACKUP ARCHIVE`);
    sqlChunks.push(`-- Tenant ID: ${tenantId}`);
    sqlChunks.push(`-- Tenant Name: ${tenant.display_name}`);
    sqlChunks.push(`-- Exported At: ${new Date().toISOString()}`);
    sqlChunks.push(`-- Engine: PostgreSQL`);
    sqlChunks.push(`-- Format: Gzipped SQL Insert Stream`);
    sqlChunks.push(`-- =============================================================================\n`);
    sqlChunks.push(`BEGIN;\n`);

    // Helper to format values for SQL
    const formatSqlValue = (val: any): string => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      if (typeof val === 'number') return String(val);
      if (typeof val === 'bigint') return String(val);
      if (val instanceof Date) return `'${val.toISOString()}'::timestamptz`;

      // Check if it's a Prisma.Decimal or any Decimal-like object
      if (
        typeof val === 'object' &&
        (typeof val.toNumber === 'function' ||
          typeof val.toFixed === 'function' ||
          (val.d !== undefined && val.e !== undefined && val.s !== undefined))
      ) {
        return String(val);
      }

      if (typeof val === 'object') {
        const jsonStr = JSON.stringify(val).replace(/'/g, "''");
        return `'${jsonStr}'::jsonb`;
      }
      const strVal = String(val).replace(/'/g, "''");
      return `'${strVal}'`;
    };

    const appendTableInserts = (tableName: string, records: any[]) => {
      if (!records || records.length === 0) return;
      totalTables++;
      totalRows += records.length;

      sqlChunks.push(`-- Table: public."${tableName}" (${records.length} records)`);
      const columns = Object.keys(records[0]);
      const colList = columns.map((c) => `"${c}"`).join(', ');

      for (const rec of records) {
        const valList = columns.map((c) => formatSqlValue(rec[c])).join(', ');
        sqlChunks.push(
          `INSERT INTO public."${tableName}" (${colList}) VALUES (${valList}) ON CONFLICT ("id") DO UPDATE SET ${columns
            .filter((c) => c !== 'id')
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
            .join(', ')};`,
        );
      }
      sqlChunks.push('');
    };

    // 1. Export Tenant Master Row
    appendTableInserts('tenants', tenantRows);

    // 2. Export Branches first (so app_users.preferred_branch_id FK is satisfied)
    try {
      const branches: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT * FROM public.branches WHERE tenant_id = '${tenantId}'::uuid;
      `);
      appendTableInserts('branches', branches);
    } catch (err: any) {
      this.logger.warn(`Could not export branches: ${err.message}`);
    }

    // 3. Export App Users & Credentials associated with this restaurant
    try {
      const users: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT DISTINCT u.* FROM public.app_users u
        JOIN public.tenant_staff_memberships tsm ON tsm.user_id = u.id
        WHERE tsm.tenant_id = '${tenantId}'::uuid;
      `);
      appendTableInserts('app_users', users);

      const credentials: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT DISTINCT c.* FROM public.user_credentials c
        JOIN public.tenant_staff_memberships tsm ON tsm.user_id = c.user_id
        WHERE tsm.tenant_id = '${tenantId}'::uuid;
      `);
      appendTableInserts('user_credentials', credentials);
    } catch (err: any) {
      this.logger.warn(`Could not export users/credentials: ${err.message}`);
    }

    // 4. Discover all tables in PostgreSQL having tenant_id (excluding branches which were exported above)
    const tenantTables: { table_name: string }[] = await this.prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND column_name = 'tenant_id'
        AND table_name NOT IN ('tenants', 'branches')
      ORDER BY 
        CASE 
          WHEN table_name = 'tenant_settings' THEN 1
          WHEN table_name = 'tenant_entitlements' THEN 2
          WHEN table_name = 'tenant_staff_memberships' THEN 3
          WHEN table_name = 'branch_staff_memberships' THEN 4
          WHEN table_name = 'menus' THEN 5
          WHEN table_name = 'menu_categories' THEN 6
          WHEN table_name = 'preparation_stations' THEN 7
          WHEN table_name = 'menu_items' THEN 8
          WHEN table_name = 'dining_tables' THEN 9
          WHEN table_name = 'inventory_ingredients' THEN 10
          WHEN table_name = 'inventory_stock_balances' THEN 11
          WHEN table_name = 'inventory_recipes' THEN 12
          WHEN table_name = 'orders' THEN 13
          WHEN table_name = 'order_items' THEN 14
          WHEN table_name = 'bills' THEN 15
          WHEN table_name = 'bill_lines' THEN 16
          WHEN table_name = 'payments' THEN 17
          ELSE 50
        END,
        table_name ASC;
    `);

    // 5. Query each table's rows for this tenant
    for (const { table_name } of tenantTables) {
      try {
        const rows: any[] = await this.prisma.$queryRawUnsafe(
          `SELECT * FROM public."${table_name}" WHERE tenant_id = '${tenantId}'::uuid;`,
        );
        if (rows && rows.length > 0) {
          appendTableInserts(table_name, rows);
        }
      } catch (err: any) {
        this.logger.warn(`Skipping table ${table_name}: ${err.message}`);
      }
    }

    sqlChunks.push(`COMMIT;\n`);
    sqlChunks.push(`-- RESTORCH BACKUP COMPLETE: ${totalTables} tables, ${totalRows} rows.\n`);

    const rawSql = sqlChunks.join('\n');
    const sqlGzBuffer = zlib.gzipSync(Buffer.from(rawSql, 'utf-8'));

    // Today's summary stats
    let billsToday = 0;
    let revenueToday = 0;
    try {
      const stats: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::numeric as revenue
        FROM public.bills 
        WHERE tenant_id = '${tenantId}'::uuid AND created_at >= CURRENT_DATE;
      `);
      if (stats && stats.length > 0) {
        billsToday = Number(stats[0].count) || 0;
        revenueToday = Number(stats[0].revenue) || 0;
      }
    } catch {
      // ignore
    }

    this.logger.log(
      `Exported tenant "${tenant.display_name}" (${tenantId}): ${totalTables} tables, ${totalRows} rows. Compressed size: ${(sqlGzBuffer.length / 1024).toFixed(1)} KB`,
    );

    return {
      filename,
      sqlGzBuffer,
      totalTables,
      totalRows,
      tenantName: tenant.display_name,
      billsToday,
      revenueToday,
    };
  }
}
