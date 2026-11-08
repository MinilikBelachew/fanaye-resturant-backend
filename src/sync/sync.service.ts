import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { TenantExporterService } from '../backup/tenant-exporter.service';
import { TenantRestorerService } from '../backup/tenant-restorer.service';
import { AuthService } from '../auth/auth.service';
import { AuthCookiesService } from '../auth/auth-cookies.service';
import { Response as ExpressResponse } from 'express';
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
    private readonly configService: ConfigService,
    private readonly tenantExporter: TenantExporterService,
    private readonly tenantRestorer: TenantRestorerService,
    private readonly authService: AuthService,
    private readonly authCookiesService: AuthCookiesService,
  ) {}

  isOfflineSyncEnabled(): boolean {
    if (this.runtimeOfflineSyncEnabled !== null) {
      return this.runtimeOfflineSyncEnabled;
    }
    const val = this.configService.get<string>('OFFLINE_SYNC_ENABLED', { infer: true });
    return val === 'true' || val === '1';
  }

  getCloudSyncUrl(): string {
    if (this.runtimeCloudSyncUrl !== null) {
      return this.runtimeCloudSyncUrl.replace(/\/+$/, '');
    }
    return (this.configService.get<string>('CLOUD_SYNC_URL', { infer: true }) || '').replace(/\/+$/, '');
  }

  getCloudSyncToken(): string {
    if (this.runtimeCloudSyncToken !== null) {
      return this.runtimeCloudSyncToken;
    }
    return this.configService.get<string>('CLOUD_SYNC_TOKEN', { infer: true }) || '';
  }

  getTenantId(): string {
    if (this.runtimeTenantId !== null) {
      return this.runtimeTenantId;
    }
    return this.configService.get<string>('TENANT_ID', { infer: true }) || '';
  }

  /**
   * Updates runtime configuration and persists to .env
   */
  async updateConfig(dto: SyncConfigDto) {
    if (dto.cloudSyncUrl !== undefined) this.runtimeCloudSyncUrl = dto.cloudSyncUrl;
    if (dto.tenantId !== undefined) this.runtimeTenantId = dto.tenantId;
    if (dto.cloudSyncToken !== undefined) this.runtimeCloudSyncToken = dto.cloudSyncToken;
    if (dto.offlineSyncEnabled !== undefined) this.runtimeOfflineSyncEnabled = dto.offlineSyncEnabled;

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
      throw new BadRequestException('Cloud URL, Manager Email, and Password are required.');
    }

    let cleanUrl = dto.cloudUrl.replace(/\/+$/, '');
    cleanUrl = cleanUrl.replace(/\/(backend|api)(\/v1)?$/i, '');

    this.logger.log(`Initiating First-Time Setup via Cloud: ${cleanUrl} for ${dto.email}...`);

    // 1. Authenticate against Cloud Server
    let cloudLoginRes: Response;
    try {
      cloudLoginRes = await fetch(`${cleanUrl}/backend/v1/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: dto.email, password: dto.password }),
      });
    } catch (err: any) {
      throw new BadRequestException(`Cannot reach Cloud server at ${cleanUrl}: ${err.message}`);
    }

    if (!cloudLoginRes.ok) {
      const errData: any = await cloudLoginRes.json().catch(() => null);
      if (errData?.errors?.password) {
        throw new UnauthorizedException('Incorrect password for this cloud manager account.');
      }
      if (errData?.errors?.email) {
        throw new UnauthorizedException(`Cloud account not found for email: ${dto.email}`);
      }
      if (cloudLoginRes.status === 404) {
        throw new BadRequestException(`Cloud server reached at ${cleanUrl}, but API endpoint was not found (404).`);
      }
      throw new UnauthorizedException('Invalid Cloud Manager Email or Password.');
    }

    const cloudData: any = await cloudLoginRes.json();
    const tenantId = cloudData?.context?.tenantId;
    const cloudToken = cloudData?.token;

    if (!tenantId) {
      throw new BadRequestException('Your account is not assigned to an active restaurant tenant on the Cloud.');
    }

    this.logger.log(`Cloud authenticated! Tenant ID: ${tenantId}. Pulling restaurant database...`);

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
    this.authCookiesService.setRefreshCookie(res, localSession.refreshToken, true);

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

    let cleanUrl = dto.cloudUrl.replace(/\/+$/, '');
    cleanUrl = cleanUrl.replace(/\/(backend|api)(\/v1)?$/i, '');
    const exportEndpoint = `${cleanUrl}/backend/v1/sync/export-tenant/${dto.tenantId}`;
    const token = dto.token || this.getCloudSyncToken();

    this.logger.log(`Connecting to Cloud at ${cleanUrl} to fetch all tenant data for ${dto.tenantId}...`);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-sync-token'] = token;
    }

    let response: Response;
    try {
      response = await fetch(exportEndpoint, { headers });
    } catch (err: any) {
      throw new BadRequestException(`Cannot reach cloud server at ${cleanUrl}: ${err.message}`);
    }

    if (!response.ok) {
      throw new BadRequestException(
        `Cloud server returned error (${response.status}): ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    this.logger.log(`Received archive (${buffer.length} bytes). Restoring into local database...`);

    const restoreResult = await this.tenantRestorer.restoreFromArchive(buffer, dto.tenantId);

    // Save configuration
    await this.updateConfig({
      cloudSyncUrl: cleanUrl,
      tenantId: dto.tenantId,
      cloudSyncToken: token,
      offlineSyncEnabled: true,
    });

    // Cache Cloudinary / remote images locally so they work without internet!
    let imagesCached = 0;
    if (dto.downloadImages !== false) {
      imagesCached = await this.cacheImagesForOffline(dto.tenantId);
    }

    this.lastSyncedAt = new Date();

    return {
      success: true,
      message: `Successfully synchronized "${restoreResult.tenantName}"! All menus, staff, and tables are active.`,
      tenantId: restoreResult.tenantId,
      tenantName: restoreResult.tenantName,
      statementsExecuted: restoreResult.statementsCount,
      imagesCachedCount: imagesCached,
      syncedAt: this.lastSyncedAt.toISOString(),
    };
  }

  /**
   * Pre-downloads Cloudinary & online images to local disk (./files/)
   * and maps them to local endpoints (/backend/v1/files/:filename)
   */
  async cacheImagesForOffline(tenantId: string): Promise<number> {
    this.logger.log(`Caching remote images locally for tenant ${tenantId}...`);
    let cachedCount = 0;

    const filesDir = path.resolve(process.cwd(), 'files');
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }

    // Find remote files (Cloudinary, S3, or external URLs)
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

        // Extract extension or default to jpg
        const urlParts = imageUrl.split('?')[0].split('.');
        const ext = urlParts.length > 1 ? urlParts[urlParts.length - 1] : 'jpg';
        const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) || 'jpg';
        const localFileName = `img_${file.id.replace(/-/g, '')}.${cleanExt}`;
        const localFilePath = path.join(filesDir, localFileName);

        fs.writeFileSync(localFilePath, buf);

        // Update database to local downloader path
        await this.prisma.file.update({
          where: { id: file.id },
          data: { path: `/backend/v1/files/${localFileName}` },
        });

        cachedCount++;
      } catch (err: any) {
        this.logger.warn(`Failed to cache image ${file.path}: ${err.message}`);
      }
    }

    this.logger.log(`Cached ${cachedCount} remote images into local ./files directory.`);
    return cachedCount;
  }

  /**
   * RECEIVER (Runs on Contabo Cloud):
   * Receives orders and bills pushed from the offline restaurant.
   */
  async handleIncomingPush(tenantId: string, payload: { orders?: any[]; bills?: any[] }) {
    this.logger.log(`Received incoming sync push for tenant ${tenantId}`);
    let ordersCount = 0;
    let billsCount = 0;

    if (payload.orders && payload.orders.length > 0) {
      for (const order of payload.orders) {
        const existing = await this.prisma.order.findUnique({ where: { id: order.id } });
        if (!existing) {
          const orderData = { ...order };
          delete (orderData as any).items;
          await this.prisma.order.create({
            data: {
              ...orderData,
              tenantId,
            },
          });
          ordersCount++;
        }
      }
    }

    if (payload.bills && payload.bills.length > 0) {
      for (const bill of payload.bills) {
        const existing = await this.prisma.bill.findUnique({ where: { id: bill.id } });
        if (!existing) {
          const billData = { ...bill };
          delete (billData as any).lines;
          delete (billData as any).payments;
          await this.prisma.bill.create({
            data: {
              ...billData,
              tenantId,
            },
          });
          billsCount++;
        }
      }
    }

    return {
      success: true,
      ordersSynced: ordersCount,
      billsSynced: billsCount,
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * SENDER (Runs on Local Offline PC):
   * Background cycle: Checks internet, pushes offline orders/bills to cloud.
   */
  async runOfflineSyncCycle(): Promise<{ status: string; message: string }> {
    if (!this.isOfflineSyncEnabled()) {
      return { status: 'disabled', message: 'Offline sync is not enabled on this instance.' };
    }

    const cloudUrl = this.getCloudSyncUrl();
    const token = this.getCloudSyncToken();
    const tenantId = this.getTenantId();

    if (!cloudUrl || !tenantId) {
      return { status: 'skipped', message: 'Missing CLOUD_SYNC_URL or TENANT_ID.' };
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
        return { status: 'offline', message: 'Cloud server not reachable. Operating offline safely.' };
      }

      this.logger.log(`Internet detected! Synchronizing with Cloud: ${cloudUrl}...`);

      // 2. Fetch locally modified orders & bills
      const sinceDate = this.lastSyncedAt || new Date(Date.now() - 24 * 60 * 60 * 1000);

      const recentOrders = await this.prisma.order.findMany({
        where: {
          tenantId,
          updatedAt: { gte: sinceDate },
        },
        take: 100,
      });

      const recentBills = await this.prisma.bill.findMany({
        where: {
          tenantId,
          updatedAt: { gte: sinceDate },
        },
        take: 100,
      });

      // 3. Push to Cloud
      if (recentOrders.length > 0 || recentBills.length > 0) {
        const pushRes = await fetch(`${cloudUrl}/backend/v1/sync/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-tenant-id': tenantId,
          },
          body: JSON.stringify({
            tenantId,
            orders: recentOrders,
            bills: recentBills,
          }),
        });

        if (pushRes.ok) {
          this.logger.log(
            `Successfully pushed ${recentOrders.length} orders and ${recentBills.length} bills to Cloud!`,
          );
        }
      }

      this.lastSyncedAt = new Date();
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
        const res = await fetch(`${cloudUrl}/backend/v1/health`, { signal: controller.signal }).catch(() => null);
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
        const sinceDate = this.lastSyncedAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
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
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
          list.push({ name, ip: iface.address });
        }
      }
    }
    return list;
  }
}
