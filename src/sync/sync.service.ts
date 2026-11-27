import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { TenantExporterService } from '../backup/tenant-exporter.service';
import { TenantRestorerService } from '../backup/tenant-restorer.service';
import { AuthService } from '../auth/auth.service';
import { AuthCookiesService } from '../auth/auth-cookies.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AllConfigType } from '../config/config.type';
import {
  DESKTOP_DEVICE_LICENSE_KEY,
  getLocalHardwareFingerprint,
  readLocalDesktopLicense,
  signDesktopLicense,
  SignedDesktopLicense,
  verifyDesktopLicense,
  writeLocalDesktopLicense,
} from './desktop-license.util';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import * as crypto from 'crypto';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

export interface PullCloudDto {
  cloudUrl: string;
  tenantId: string;
  token?: string;
  downloadImages?: boolean;
}

export interface FirstTimeSetupDto {
  cloudUrl: string;
  email: string;
  password: string;
  downloadImages?: boolean;
}

export interface SyncConfigDto {
  cloudSyncUrl?: string;
  tenantId?: string;
  cloudSyncToken?: string;
  offlineSyncEnabled?: boolean;
}

export interface SyncPushPayload {
  tenantId?: string;
  shiftSessions?: any[];
  tableSessions?: any[];
  roomSessions?: any[];
  outsideOrders?: any[];
  orders?: any[];
  bills?: any[];
}

const SYNC_ALLOWED_ROLES = new Set([
  'PLATFORM_SUPER_ADMIN',
  'OWNER_ADMIN',
  'MANAGER',
]);

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private isSyncing = false;
  private lastSyncedAt: Date | null = null;

  // Runtime memory overrides
  private runtimeCloudSyncUrl: string | null = null;
  private runtimeTenantId: string | null = null;
  private runtimeCloudSyncToken: string | null = null;
  private runtimeOfflineSyncEnabled: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly tenantExporter: TenantExporterService,
    private readonly tenantRestorer: TenantRestorerService,
    private readonly authService: AuthService,
    private readonly authCookiesService: AuthCookiesService,
    private readonly identityContext: IdentityContextService,
    private readonly jwtService: JwtService,
  ) {
    this.lastSyncedAt = this.loadPersistedLastSyncedAt();
  }

  private getSyncStatePath(): string {
    return path.resolve(process.cwd(), 'sync-state.json');
  }

  private loadPersistedLastSyncedAt(): Date | null {
    try {
      const statePath = this.getSyncStatePath();
      if (!fs.existsSync(statePath)) return null;
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (raw?.lastSyncedAt) {
        const parsed = new Date(raw.lastSyncedAt);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    } catch {
      // ignore corrupt state file
    }
    return null;
  }

  private persistLastSyncedAt(date: Date) {
    this.lastSyncedAt = date;
    try {
      fs.writeFileSync(
        this.getSyncStatePath(),
        JSON.stringify({ lastSyncedAt: date.toISOString() }, null, 2),
        'utf8',
      );
    } catch (err: any) {
      this.logger.warn(`Could not persist sync-state.json: ${err.message}`);
    }
  }

  isOfflineSyncEnabled(): boolean {
    if (this.runtimeOfflineSyncEnabled !== null) {
      return this.runtimeOfflineSyncEnabled;
    }
    const val = this.configService.get<string>('OFFLINE_SYNC_ENABLED' as any, {
      infer: true,
    });
    return val === 'true' || val === '1';
  }

  getCloudSyncUrl(): string {
    if (this.runtimeCloudSyncUrl !== null) {
      return this.runtimeCloudSyncUrl.replace(/\/+$/, '');
    }
    return (
      this.configService.get<string>('CLOUD_SYNC_URL' as any, {
        infer: true,
      }) || ''
    ).replace(/\/+$/, '');
  }

  getCloudSyncToken(): string {
    if (this.runtimeCloudSyncToken !== null) {
      return this.runtimeCloudSyncToken;
    }
    return (
      this.configService.get<string>('CLOUD_SYNC_TOKEN' as any, {
        infer: true,
      }) || ''
    );
  }

  getTenantId(): string {
    if (this.runtimeTenantId !== null) {
      return this.runtimeTenantId;
    }
    return (
      this.configService.get<string>('TENANT_ID' as any, { infer: true }) || ''
    );
  }

  async requireLocalAdmin(userId?: string): Promise<void> {
    if (!userId) {
      throw new UnauthorizedException('Authentication required.');
    }
    const ctx = await this.identityContext.getByUserId(String(userId));
    if (!ctx || !SYNC_ALLOWED_ROLES.has(ctx.roleCode)) {
      throw new ForbiddenException(
        'Only restaurant owners or managers can manage cloud sync.',
      );
    }
  }

  /**
   * Authorizes Cloud Sync requests (`export-tenant`, `push`) using:
   * 1. A static `CLOUD_SYNC_TOKEN` (if configured on the server), OR
   * 2. A valid `sync-node` JWT issued for `tenantId`, OR
   * 3. A valid user Bearer JWT belonging to `OWNER_ADMIN` / `MANAGER` of `tenantId`, or `PLATFORM_SUPER_ADMIN`.
   * Returns a long-lived `sync-node` JWT when authenticated as a user so offline nodes can keep syncing.
   */
  async authorizeRemoteTenantSync(
    req: ExpressRequest,
    targetTenantId?: string,
    bindDesktopLicense = false,
  ): Promise<{
    nodeSyncToken: string | null;
    signedLicenseHeader: string | null;
  }> {
    if (!targetTenantId) {
      throw new BadRequestException('tenantId is required.');
    }

    const authHeader = req.headers.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';
    const headerSyncToken =
      typeof req.headers['x-sync-token'] === 'string'
        ? req.headers['x-sync-token'].trim()
        : '';
    const token = bearer || headerSyncToken;

    if (!token) {
      throw new UnauthorizedException('Missing sync authentication token.');
    }

    let actorUserId: string | null = null;
    const configuredSecret = this.getCloudSyncToken();
    if (configuredSecret && this.timingSafeEquals(token, configuredSecret)) {
      actorUserId = null;
    } else {
      const jwtSecret = this.configService.get('auth.secret', { infer: true });
      let payload: any;
      try {
        payload = await this.jwtService.verifyAsync(token, {
          secret: jwtSecret,
        });
      } catch {
        throw new UnauthorizedException('Invalid or expired sync token.');
      }

      if (payload?.scope === 'sync-node') {
        if (String(payload.tenantId) !== String(targetTenantId)) {
          throw new ForbiddenException(
            'Sync node token does not match tenant.',
          );
        }
        actorUserId = payload.id ? String(payload.id) : null;
      } else {
        if (!payload?.id) {
          throw new UnauthorizedException('Invalid sync token payload.');
        }

        const ctx = await this.identityContext.getByUserId(String(payload.id));
        if (!ctx || !SYNC_ALLOWED_ROLES.has(ctx.roleCode)) {
          throw new ForbiddenException('Insufficient role for tenant sync.');
        }
        if (
          ctx.roleCode !== 'PLATFORM_SUPER_ADMIN' &&
          String(ctx.tenantId) !== String(targetTenantId)
        ) {
          throw new ForbiddenException('Tenant mismatch for sync request.');
        }
        actorUserId = ctx.userId;
      }
    }

    const hardwareHash =
      typeof req.headers['x-hardware-hash'] === 'string'
        ? req.headers['x-hardware-hash'].trim()
        : '';
    const deviceLabel =
      typeof req.headers['x-device-label'] === 'string'
        ? req.headers['x-device-label'].trim().slice(0, 120)
        : 'POS-PC';

    let signedLicenseHeader: string | null = null;
    if (hardwareHash) {
      const existingBinding = await this.prisma.tenantEntitlement.findFirst({
        where: {
          tenantId: String(targetTenantId),
          entitlementKey: DESKTOP_DEVICE_LICENSE_KEY,
          effectiveTo: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      const boundData = existingBinding?.valueJson as
        | { hardwareHash?: string }
        | null
        | undefined;

      if (
        existingBinding &&
        boundData?.hardwareHash &&
        boundData.hardwareHash !== hardwareHash
      ) {
        throw new ForbiddenException(
          'This restaurant is already activated on another PC. Reset the Desktop Device License in Super Admin to activate a new computer.',
        );
      }

      if (!bindDesktopLicense && !existingBinding) {
        throw new ForbiddenException(
          'Desktop device license is not bound or was reset. Re-activate this PC.',
        );
      }

      if (bindDesktopLicense) {
        if (!existingBinding) {
          await this.prisma.tenantEntitlement.create({
            data: {
              tenantId: String(targetTenantId),
              entitlementKey: DESKTOP_DEVICE_LICENSE_KEY,
              valueJson: {
                hardwareHash,
                deviceLabel: deviceLabel || 'POS-PC',
                activatedAt: new Date().toISOString(),
              },
              effectiveFrom: new Date(),
              changedByUserId: actorUserId,
            },
          });
        }

        try {
          const signed = signDesktopLicense({
            version: 1,
            tenantId: String(targetTenantId),
            hardwareHash,
            deviceLabel: deviceLabel || 'POS-PC',
            issuedAt: new Date().toISOString(),
          });
          signedLicenseHeader = Buffer.from(
            JSON.stringify(signed),
            'utf8',
          ).toString('base64');
        } catch (err: any) {
          throw new InternalServerErrorException(
            err?.message || 'Unable to sign desktop license.',
          );
        }
      }
    }

    const jwtSecret = this.configService.get('auth.secret', { infer: true });
    const nodeSyncToken =
      bindDesktopLicense && actorUserId
        ? await this.jwtService.signAsync(
            {
              id: actorUserId,
              tenantId: String(targetTenantId),
              scope: 'sync-node',
            },
            { secret: jwtSecret, expiresIn: '365d' },
          )
        : null;

    return { nodeSyncToken, signedLicenseHeader };
  }

  private timingSafeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Updates runtime configuration and persists to .env
   */
  async updateConfig(dto: SyncConfigDto) {
    if (dto.cloudSyncUrl !== undefined)
      this.runtimeCloudSyncUrl = dto.cloudSyncUrl;
    if (dto.tenantId !== undefined) this.runtimeTenantId = dto.tenantId;
    if (dto.cloudSyncToken !== undefined)
      this.runtimeCloudSyncToken = dto.cloudSyncToken;
    if (dto.offlineSyncEnabled !== undefined)
      this.runtimeOfflineSyncEnabled = dto.offlineSyncEnabled;

    this.persistEnvConfig({
      CLOUD_SYNC_URL: this.getCloudSyncUrl(),
      TENANT_ID: this.getTenantId(),
      CLOUD_SYNC_TOKEN: this.getCloudSyncToken(),
      OFFLINE_SYNC_ENABLED: this.isOfflineSyncEnabled() ? 'true' : 'false',
    });

    return this.getSyncStatus();
  }

  private persistEnvConfig(vars: Record<string, string>) {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      let content = '';
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf8');
      }

      for (const [key, value] of Object.entries(vars)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
          content = content.replace(regex, `${key}=${value}`);
        } else {
          content += `\n${key}=${value}`;
        }
      }

      fs.writeFileSync(envPath, content.trim() + '\n', 'utf8');
      this.logger.log(`Persisted sync configuration to ${envPath}`);
    } catch (err: any) {
      this.logger.warn(`Could not persist to .env: ${err.message}`);
    }
  }

  /**
   * CLOUD SERVER ENDPOINT:
   * Exports full tenant data archive for the local offline client to pull.
   */
  async exportTenantData(tenantId: string) {
    return this.tenantExporter.exportTenantData(tenantId);
  }

  /**
   * FIRST TIME SETUP (From Sign-In Page):
   * Validates manager credentials on the Cloud, downloads restaurant database + images,
   * creates local account, and logs the manager in immediately!
   */
  async firstTimeSetup(dto: FirstTimeSetupDto, res: ExpressResponse) {
    if (!dto.cloudUrl || !dto.email || !dto.password) {
      throw new BadRequestException(
        'Cloud URL, Manager Email, and Password are required.',
      );
    }

    let cleanUrl = dto.cloudUrl.replace(/\/+$/, '');
    cleanUrl = cleanUrl.replace(/\/(backend|api)(\/v1)?$/i, '');

    this.logger.log(
      `Initiating First-Time Setup via Cloud: ${cleanUrl} for ${dto.email}...`,
    );

    // 1. Authenticate against Cloud Server
    let cloudLoginRes: Response;
    try {
      cloudLoginRes = await fetch(`${cleanUrl}/backend/v1/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: dto.email, password: dto.password }),
      });
    } catch (err: any) {
      throw new BadRequestException(
        `Cannot reach Cloud server at ${cleanUrl}: ${err.message}`,
      );
    }

    if (!cloudLoginRes.ok) {
      const errData: any = await cloudLoginRes.json().catch(() => null);
      if (errData?.errors?.password) {
        throw new UnauthorizedException(
          'Incorrect password for this cloud manager account.',
        );
      }
      if (errData?.errors?.email) {
        throw new UnauthorizedException(
          `Cloud account not found for email: ${dto.email}`,
        );
      }
      if (cloudLoginRes.status === 404) {
        throw new BadRequestException(
          `Cloud server reached at ${cleanUrl}, but API endpoint was not found (404).`,
        );
      }
      throw new UnauthorizedException(
        'Invalid Cloud Manager Email or Password.',
      );
    }

    const cloudData: any = await cloudLoginRes.json();
    const tenantId = cloudData?.context?.tenantId;
    const cloudToken = cloudData?.token;

    if (!tenantId) {
      throw new BadRequestException(
        'Your account is not assigned to an active restaurant tenant on the Cloud.',
      );
    }

    this.logger.log(
      `Cloud authenticated! Tenant ID: ${tenantId}. Pulling restaurant database...`,
    );

    // 2. Download and restore full restaurant database & images
    await this.pullAllFromCloud({
      cloudUrl: cleanUrl,
      tenantId,
      token: cloudToken,
      downloadImages: dto.downloadImages !== false,
    });

    // 3. Now that the user exists in the local database, validate local login & issue local session
    const localSession = await this.authService.validateLogin({
      email: dto.email,
      password: dto.password,
    });

    // Set cookies for immediate local authorization
    this.authCookiesService.setRefreshCookie(
      res,
      localSession.refreshToken,
      true,
    );

    const responseResult = { ...localSession };
    delete (responseResult as any).refreshToken;
    return responseResult;
  }

  /**
   * LOCAL OFFLINE CLIENT:
   * 1-Click Initial Setup: Connects to Cloud, pulls all menus, tables, staff, and caches Cloudinary images locally.
   */
  async pullAllFromCloud(dto: PullCloudDto) {
    if (!dto.cloudUrl || !dto.tenantId) {
      throw new BadRequestException('Both cloudUrl and tenantId are required.');
    }

    const existingLicense = readLocalDesktopLicense();
    if (
      existingLicense?.tenantId &&
      existingLicense.tenantId !== dto.tenantId
    ) {
      throw new ForbiddenException(
        'This PC is already licensed to another restaurant. Uninstall and clear app data to switch restaurants.',
      );
    }

    const { hardwareHash, deviceLabel } = getLocalHardwareFingerprint();

    let cleanUrl = dto.cloudUrl.replace(/\/+$/, '');
    cleanUrl = cleanUrl.replace(/\/(backend|api)(\/v1)?$/i, '');
    const exportEndpoint = `${cleanUrl}/backend/v1/sync/export-tenant/${dto.tenantId}`;
    const token = dto.token || this.getCloudSyncToken();

    this.logger.log(
      `Connecting to Cloud at ${cleanUrl} to fetch all tenant data for ${dto.tenantId}...`,
    );

    const headers: Record<string, string> = {
      'x-hardware-hash': hardwareHash,
      'x-device-label': deviceLabel,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-sync-token'] = token;
    }

    let response: Response;
    try {
      response = await fetch(exportEndpoint, { headers });
    } catch (err: any) {
      throw new BadRequestException(
        `Cannot reach cloud server at ${cleanUrl}: ${err.message}`,
      );
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      throw new BadRequestException(
        errBody?.message ||
          `Cloud server returned error (${response.status}): ${response.statusText}`,
      );
    }

    const longLivedNodeToken =
      response.headers.get('x-sync-node-token')?.trim() || token;

    const licenseHeader = response.headers.get('x-desktop-license')?.trim();
    let parsedLicense: SignedDesktopLicense | null = null;
    if (licenseHeader) {
      try {
        parsedLicense = JSON.parse(
          Buffer.from(licenseHeader, 'base64').toString('utf8'),
        ) as SignedDesktopLicense;
        const verified = verifyDesktopLicense(
          parsedLicense,
          hardwareHash,
          dto.tenantId,
        );
        if (!verified.valid) {
          throw new ForbiddenException(
            verified.reason || 'Invalid desktop license returned by Cloud.',
          );
        }
      } catch (err: any) {
        if (err instanceof ForbiddenException) throw err;
        throw new BadRequestException('Malformed desktop license from Cloud.');
      }
    } else if (process.env.OFFLINE_DESKTOP === 'true') {
      throw new BadRequestException(
        'Cloud server did not return a signed desktop license. Ensure DESKTOP_LICENSE_PRIVATE_KEY is configured on Cloud.',
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    this.logger.log(
      `Received archive (${buffer.length} bytes). Restoring into local database...`,
    );

    const restoreResult = await this.tenantRestorer.restoreFromArchive(
      buffer,
      dto.tenantId,
    );

    if (parsedLicense) {
      writeLocalDesktopLicense(parsedLicense);
    }

    // Save configuration (persist long-lived node token if issued by cloud)
    await this.updateConfig({
      cloudSyncUrl: cleanUrl,
      tenantId: dto.tenantId,
      cloudSyncToken: longLivedNodeToken,
      offlineSyncEnabled: true,
    });

    // Cache Cloudinary / remote images locally so they work without internet!
    let imagesCached = 0;
    if (dto.downloadImages !== false) {
      imagesCached = await this.cacheImagesForOffline(dto.tenantId);
    }

    const syncedAt = new Date();
    this.persistLastSyncedAt(syncedAt);

    return {
      success: true,
      message: `Successfully synchronized "${restoreResult.tenantName}"! All menus, staff, and tables are active.`,
      tenantId: restoreResult.tenantId,
      tenantName: restoreResult.tenantName,
      statementsExecuted: restoreResult.statementsCount,
      imagesCachedCount: imagesCached,
      syncedAt: syncedAt.toISOString(),
    };
  }

  /**
   * Pre-downloads Cloudinary & online images to local disk (./files/)
   * and maps them to local endpoints (/backend/v1/files/:filename)
   */
  async cacheImagesForOffline(tenantId: string): Promise<number> {
    this.logger.log(
      `Caching remote images locally for tenant ${tenantId}...`,
    );
    let cachedCount = 0;

    const filesDir = path.resolve(process.cwd(), 'files');
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }

    const remoteFiles = await this.prisma.file.findMany({
      where: {
        path: { startsWith: 'http' },
      },
    });

    for (const file of remoteFiles) {
      try {
        const imageUrl = file.path;
        const res = await fetch(imageUrl);
        if (!res.ok) continue;

        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);

        const urlParts = imageUrl.split('?')[0].split('.');
        const ext = urlParts.length > 1 ? urlParts[urlParts.length - 1] : 'jpg';
        const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) || 'jpg';
        const localFileName = `img_${file.id.replace(/-/g, '')}.${cleanExt}`;
        const localFilePath = path.join(filesDir, localFileName);

        fs.writeFileSync(localFilePath, buf);

        await this.prisma.file.update({
          where: { id: file.id },
          data: { path: `/backend/v1/files/${localFileName}` },
        });

        cachedCount++;
      } catch (err: any) {
        this.logger.warn(`Failed to cache image ${file.path}: ${err.message}`);
      }
    }

    this.logger.log(
      `Cached ${cachedCount} remote images into local ./files directory.`,
    );
    return cachedCount;
  }

  /**
   * RECEIVER (Runs on Contabo Cloud):
   * Receives shift sessions, table/room/outside sessions, orders (+ items/modifiers),
   * and bills (+ lines/payments) pushed from the offline restaurant.
   */
  async handleIncomingPush(tenantId: string, payload: SyncPushPayload) {
    this.logger.log(`Received incoming sync push for tenant ${tenantId}`);
    let ordersCount = 0;
    let billsCount = 0;

    await this.prisma.$transaction(
      async (tx) => {
        for (const shift of payload.shiftSessions ?? []) {
          const data = { ...shift, tenantId };
          await tx.shiftSession.upsert({
            where: { id: shift.id },
            create: data,
            update: {
              state: data.state,
              clockOutAt: data.clockOutAt,
              lateByMinutes: data.lateByMinutes,
              version: data.version,
            },
          });
        }

        for (const session of payload.tableSessions ?? []) {
          const data = { ...session, tenantId };
          await tx.tableSession.upsert({
            where: { id: session.id },
            create: data,
            update: {
              status: data.status,
              guestCount: data.guestCount,
              billRequestedAt: data.billRequestedAt,
              closedAt: data.closedAt,
              closedByMembershipId: data.closedByMembershipId,
              closeReason: data.closeReason,
              version: data.version,
            },
          });
        }

        for (const roomSession of payload.roomSessions ?? []) {
          const data = { ...roomSession, tenantId };
          await tx.roomSession.upsert({
            where: { id: roomSession.id },
            create: data,
            update: {
              status: data.status,
              billRequestedAt: data.billRequestedAt,
              closedAt: data.closedAt,
              closedByMembershipId: data.closedByMembershipId,
              version: data.version,
            },
          });
        }

        for (const outsideOrder of payload.outsideOrders ?? []) {
          const data = { ...outsideOrder, tenantId };
          await tx.outsideOrder.upsert({
            where: { id: outsideOrder.id },
            create: data,
            update: {
              status: data.status,
              closedAt: data.closedAt,
              closedByMembershipId: data.closedByMembershipId,
              version: data.version,
            },
          });
        }

        for (const order of payload.orders ?? []) {
          const { items = [], ...orderFields } = order;
          const orderData = { ...orderFields, tenantId };
          await tx.order.upsert({
            where: { id: order.id },
            create: orderData,
            update: {
              status: orderData.status,
              version: orderData.version,
            },
          });

          for (const item of items) {
            const { modifiers = [], ...itemFields } = item;
            const itemData = { ...itemFields, tenantId };
            await tx.orderItem.upsert({
              where: { id: item.id },
              create: itemData,
              update: {
                state: itemData.state,
                quantity: itemData.quantity,
                acknowledgedAt: itemData.acknowledgedAt,
                preparationStartedAt: itemData.preparationStartedAt,
                readyAt: itemData.readyAt,
                servedAt: itemData.servedAt,
                cancelledAt: itemData.cancelledAt,
                cancelledByMembershipId: itemData.cancelledByMembershipId,
                cancellationReason: itemData.cancellationReason,
                version: itemData.version,
              },
            });

            for (const mod of modifiers) {
              await tx.orderItemModifier.upsert({
                where: { id: mod.id },
                create: { ...mod, tenantId },
                update: {},
              });
            }
          }
          ordersCount++;
        }

        for (const bill of payload.bills ?? []) {
          const { lines = [], payments = [], ...billFields } = bill;
          const billData = { ...billFields, tenantId };
          await tx.bill.upsert({
            where: { id: bill.id },
            create: billData,
            update: {
              status: billData.status,
              subtotalAmount: billData.subtotalAmount,
              cancelledAmount: billData.cancelledAmount,
              totalAmount: billData.totalAmount,
              amountPaid: billData.amountPaid,
              paidAt: billData.paidAt,
              closedAt: billData.closedAt,
              closedByMembershipId: billData.closedByMembershipId,
              reopenedAt: billData.reopenedAt,
              version: billData.version,
            },
          });

          for (const line of lines) {
            await tx.billLine.upsert({
              where: { id: line.id },
              create: { ...line, tenantId },
              update: {
                quantity: line.quantity,
                lineTotal: line.lineTotal,
                chargeStatus: line.chargeStatus,
              },
            });
          }

          for (const payment of payments) {
            await tx.payment.upsert({
              where: { id: payment.id },
              create: { ...payment, tenantId },
              update: {
                status: payment.status,
                collectedAt: payment.collectedAt,
                verifiedAt: payment.verifiedAt,
                settledAt: payment.settledAt,
                cancelledAt: payment.cancelledAt,
                version: payment.version,
              },
            });
          }

          billsCount++;
        }
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    return {
      success: true,
      ordersSynced: ordersCount,
      billsSynced: billsCount,
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * SENDER (Runs on Local Offline PC):
   * Background cycle: Checks internet, pushes offline sessions/orders/bills to cloud.
   */
  async runOfflineSyncCycle(): Promise<{ status: string; message: string }> {
    if (!this.isOfflineSyncEnabled()) {
      return {
        status: 'disabled',
        message: 'Offline sync is not enabled on this instance.',
      };
    }

    const cloudUrl = this.getCloudSyncUrl();
    const token = this.getCloudSyncToken();
    const tenantId = this.getTenantId();

    if (!cloudUrl || !tenantId) {
      return {
        status: 'skipped',
        message: 'Missing CLOUD_SYNC_URL or TENANT_ID.',
      };
    }

    if (this.isSyncing) {
      return { status: 'busy', message: 'Sync cycle already in progress.' };
    }

    this.isSyncing = true;
    try {
      // 1. Internet Check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const healthRes = await fetch(`${cloudUrl}/backend/v1/health`, {
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (!healthRes || !healthRes.ok) {
        return {
          status: 'offline',
          message: 'Cloud server not reachable. Operating offline safely.',
        };
      }

      this.logger.log(
        `Internet detected! Synchronizing with Cloud: ${cloudUrl}...`,
      );

      // 2. Fetch locally modified records since last successful sync
      const sinceDate =
        this.lastSyncedAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const syncRunStartedAt = new Date();

      const [
        shiftSessions,
        tableSessions,
        roomSessions,
        outsideOrders,
        recentOrders,
        recentBills,
      ] = await Promise.all([
        this.prisma.shiftSession.findMany({
          where: { tenantId, updatedAt: { gte: sinceDate } },
          orderBy: { updatedAt: 'asc' },
          take: 500,
        }),
        this.prisma.tableSession.findMany({
          where: { tenantId, updatedAt: { gte: sinceDate } },
          orderBy: { updatedAt: 'asc' },
          take: 500,
        }),
        this.prisma.roomSession.findMany({
          where: { tenantId, updatedAt: { gte: sinceDate } },
          orderBy: { updatedAt: 'asc' },
          take: 500,
        }),
        this.prisma.outsideOrder.findMany({
          where: { tenantId, updatedAt: { gte: sinceDate } },
          orderBy: { updatedAt: 'asc' },
          take: 500,
        }),
        this.prisma.order.findMany({
          where: {
            tenantId,
            OR: [
              { updatedAt: { gte: sinceDate } },
              { items: { some: { updatedAt: { gte: sinceDate } } } },
            ],
          },
          include: {
            items: {
              include: { modifiers: true },
            },
          },
          orderBy: { updatedAt: 'asc' },
          take: 500,
        }),
        this.prisma.bill.findMany({
          where: {
            tenantId,
            OR: [
              { updatedAt: { gte: sinceDate } },
              { payments: { some: { updatedAt: { gte: sinceDate } } } },
            ],
          },
          include: {
            lines: true,
            payments: true,
          },
          orderBy: { updatedAt: 'asc' },
          take: 500,
        }),
      ]);

      // 3. Push to Cloud
      if (
        shiftSessions.length > 0 ||
        tableSessions.length > 0 ||
        roomSessions.length > 0 ||
        outsideOrders.length > 0 ||
        recentOrders.length > 0 ||
        recentBills.length > 0
      ) {
        const { hardwareHash, deviceLabel } = getLocalHardwareFingerprint();
        const pushRes = await fetch(`${cloudUrl}/backend/v1/sync/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-sync-token': token,
            'x-tenant-id': tenantId,
            'x-hardware-hash': hardwareHash,
            'x-device-label': deviceLabel,
          },
          body: JSON.stringify({
            tenantId,
            shiftSessions,
            tableSessions,
            roomSessions,
            outsideOrders,
            orders: recentOrders,
            bills: recentBills,
          }),
        });

        if (!pushRes.ok) {
          const errText = await pushRes.text().catch(() => pushRes.statusText);
          this.logger.warn(
            `Cloud sync push rejected (${pushRes.status}): ${errText}`,
          );
          return {
            status: 'error',
            message: `Cloud rejected sync push (${pushRes.status}): ${errText}`,
          };
        }

        this.logger.log(
          `Successfully pushed ${recentOrders.length} orders and ${recentBills.length} bills to Cloud!`,
        );
      }

      this.persistLastSyncedAt(syncRunStartedAt);
      return {
        status: 'success',
        message: `Synced ${recentOrders.length} orders and ${recentBills.length} bills.`,
      };
    } catch (err: any) {
      this.logger.warn(`Sync attempt notice: ${err.message}`);
      return { status: 'error', message: err.message };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Status summary for the Manager UI
   */
  async getSyncStatus() {
    const cloudUrl = this.getCloudSyncUrl();
    const tenantId = this.getTenantId();
    const isEnabled = this.isOfflineSyncEnabled();

    let isCloudReachable = false;
    if (cloudUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`${cloudUrl}/backend/v1/health`, {
          signal: controller.signal,
        }).catch(() => null);
        clearTimeout(timeoutId);
        isCloudReachable = Boolean(res && res.ok);
      } catch {
        isCloudReachable = false;
      }
    }

    let pendingOrdersCount = 0;
    let pendingBillsCount = 0;
    if (tenantId) {
      try {
        const sinceDate =
          this.lastSyncedAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
        pendingOrdersCount = await this.prisma.order.count({
          where: { tenantId, updatedAt: { gte: sinceDate } },
        });
        pendingBillsCount = await this.prisma.bill.count({
          where: { tenantId, updatedAt: { gte: sinceDate } },
        });
      } catch {
        // quiet fallback
      }
    }

    return {
      offlineSyncEnabled: isEnabled,
      cloudSyncUrl: cloudUrl,
      tenantId: tenantId,
      cloudReachable: isCloudReachable,
      lastSyncedAt: this.lastSyncedAt ? this.lastSyncedAt.toISOString() : null,
      pendingOrdersCount,
      pendingBillsCount,
      localServerIp: this.getLocalIpAddress(),
      availableIps: this.getAllLocalIpAddresses(),
    };
  }

  getLocalIpAddress(): string {
    const all = this.getAllLocalIpAddresses();
    return all.length > 0 ? all[0].ip : 'localhost';
  }

  getAllLocalIpAddresses(): { name: string; ip: string }[] {
    const list: { name: string; ip: string }[] = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name] || [];
      for (const iface of ifaceList) {
        if (
          iface.family === 'IPv4' &&
          !iface.internal &&
          !iface.address.startsWith('169.254.')
        ) {
          list.push({ name, ip: iface.address });
        }
      }
    }
    return list;
  }
}
