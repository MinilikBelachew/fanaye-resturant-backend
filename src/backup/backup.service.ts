import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantExporterService } from './tenant-exporter.service';
import { TenantRestorerService } from './tenant-restorer.service';
import { TelegramBackupService } from './telegram-backup.service';
import { BackupInterval, GlobalBackupSettingsDto, TenantBackupSummaryDto } from './dto/backup.dto';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  // In-memory global settings (or can be stored in platform setting)
  private globalSettings: GlobalBackupSettingsDto = {
    interval: BackupInterval.DAILY,
    enabled: true,
    sendHour: 0, // Midnight 00:00 Africa/Addis_Ababa
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: TenantExporterService,
    private readonly restorer: TenantRestorerService,
    private readonly telegram: TelegramBackupService,
  ) {}

  /**
   * Get backup status for an individual restaurant owner
   */
  async getTenantBackupStatus(tenantId: string) {
    // Process any pending Telegram updates (e.g. user clicked /start)
    await this.telegram.processIncomingUpdates();

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        entitlements: {
          where: { entitlementKey: { in: ['TELEGRAM_BACKUP', 'BACKUP_HISTORY'] } },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found.`);
    }

    const tgEntitlement = tenant.entitlements.find(
      (e) => e.entitlementKey === 'TELEGRAM_BACKUP',
    );
    const historyEntitlement = tenant.entitlements.find(
      (e) => e.entitlementKey === 'BACKUP_HISTORY',
    );

    const tgConfig = (tgEntitlement?.valueJson as any) || null;
    const history = (historyEntitlement?.valueJson as any) || null;

    return {
      tenantId: tenant.id,
      tenantName: tenant.displayName,
      telegramLinked: Boolean(tgConfig?.chatId && tgConfig?.enabled !== false),
      telegramChatId: tgConfig?.chatId,
      telegramUsername: tgConfig?.username,
      deepLinkUrl: this.telegram.getDeepLinkUrl(tenant.id),
      botUsername: this.telegram.getBotUsername(),
      lastBackupAt: history?.lastBackupAt || null,
      lastBackupStatus: history?.status || 'NEVER',
      lastBackupSizeKb: history?.sizeKb || null,
      lastBackupRowsCount: history?.totalRows || null,
      globalInterval: this.globalSettings.interval,
    };
  }

  /**
   * Manually link a Telegram chat ID for an owner
   */
  async linkTelegram(tenantId: string, chatId: string, username?: string) {
    const existing = await this.prisma.tenantEntitlement.findFirst({
      where: { tenantId, entitlementKey: 'TELEGRAM_BACKUP' },
    });

    const data = {
      chatId,
      username: username || '',
      linkedAt: new Date().toISOString(),
      enabled: true,
    };

    if (existing) {
      await this.prisma.tenantEntitlement.update({
        where: { id: existing.id },
        data: { valueJson: data },
      });
    } else {
      await this.prisma.tenantEntitlement.create({
        data: {
          tenantId,
          entitlementKey: 'TELEGRAM_BACKUP',
          valueJson: data,
          effectiveFrom: new Date(),
        },
      });
    }

    await this.telegram.sendMessage(
      chatId,
      `✅ <b>Restorch Backup Connected</b>\n\nYour restaurant has been successfully linked.`,
    );

    return { success: true };
  }

  /**
   * Unlink Telegram for an owner
   */
  async unlinkTelegram(tenantId: string) {
    await this.prisma.tenantEntitlement.deleteMany({
      where: { tenantId, entitlementKey: 'TELEGRAM_BACKUP' },
    });
    return { success: true };
  }

  /**
   * Export tenant data as compressed .sql.gz
   */
  async exportTenantData(tenantId: string) {
    return this.exporter.exportTenantData(tenantId);
  }

  /**
   * Export and send tenant backup directly to their linked Telegram chat
   */
  async sendBackupToTelegram(tenantId: string) {
    const status = await this.getTenantBackupStatus(tenantId);

    if (!status.telegramLinked || !status.telegramChatId) {
      throw new BadRequestException(
        'Please link your Telegram account first by tapping the Connect Telegram button.',
      );
    }

    const exportResult = await this.exporter.exportTenantData(tenantId);

    const sendRes = await this.telegram.sendBackupDocument(
      status.telegramChatId,
      exportResult.filename,
      exportResult.sqlGzBuffer,
      {
        tenantName: exportResult.tenantName,
        billsToday: exportResult.billsToday,
        revenueToday: exportResult.revenueToday,
        totalTables: exportResult.totalTables,
        totalRows: exportResult.totalRows,
      },
    );

    // Record backup history in entitlement
    const sizeKb = Number((exportResult.sqlGzBuffer.length / 1024).toFixed(1));
    const historyData = {
      lastBackupAt: new Date().toISOString(),
      status: sendRes.success ? 'SUCCESS' : 'FAILED',
      sizeKb,
      totalRows: exportResult.totalRows,
      filename: exportResult.filename,
    };

    const existingHist = await this.prisma.tenantEntitlement.findFirst({
      where: { tenantId, entitlementKey: 'BACKUP_HISTORY' },
    });

    if (existingHist) {
      await this.prisma.tenantEntitlement.update({
        where: { id: existingHist.id },
        data: { valueJson: historyData },
      });
    } else {
      await this.prisma.tenantEntitlement.create({
        data: {
          tenantId,
          entitlementKey: 'BACKUP_HISTORY',
          valueJson: historyData,
          effectiveFrom: new Date(),
        },
      });
    }

    if (!sendRes.success) {
      throw new BadRequestException(`Failed to send backup via Telegram: ${sendRes.error}`);
    }

    return {
      success: true,
      filename: exportResult.filename,
      sizeKb,
      sentToChatId: status.telegramChatId,
    };
  }

  /**
   * Preview tenant backup archive contents and metadata before restoring
   */
  previewTenantData(archiveBuffer: Buffer, tenantId?: string) {
    return this.restorer.previewArchive(archiveBuffer, tenantId);
  }

  /**
   * Restore tenant from uploaded archive
   */
  async restoreTenantData(archiveBuffer: Buffer, tenantId?: string) {
    return this.restorer.restoreFromArchive(archiveBuffer, tenantId);
  }

  // ===========================================================================
  // SUPER ADMIN MANAGEMENT CONTROLS
  // ===========================================================================

  /**
   * Get Super Admin dashboard overview across all tenants
   */
  async getSuperAdminOverview() {
    await this.telegram.processIncomingUpdates();

    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true,
        displayName: true,
        status: true,
        createdAt: true,
        entitlements: {
          where: { entitlementKey: { in: ['TELEGRAM_BACKUP', 'BACKUP_HISTORY'] } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const tenantSummaries: TenantBackupSummaryDto[] = tenants.map((t) => {
      const tg = t.entitlements.find((e) => e.entitlementKey === 'TELEGRAM_BACKUP')?.valueJson as any;
      const hist = t.entitlements.find((e) => e.entitlementKey === 'BACKUP_HISTORY')?.valueJson as any;

      return {
        tenantId: t.id,
        tenantName: t.displayName,
        telegramLinked: Boolean(tg?.chatId && tg?.enabled !== false),
        telegramChatId: tg?.chatId,
        telegramUsername: tg?.username,
        lastBackupAt: hist?.lastBackupAt || null,
        lastBackupStatus: hist?.status || 'NEVER',
        lastBackupSizeKb: hist?.sizeKb || null,
        lastBackupBillsCount: hist?.billsToday || null,
      };
    });

    return {
      globalSettings: this.globalSettings,
      botUsername: this.telegram.getBotUsername(),
      totalTenants: tenants.length,
      linkedTenants: tenantSummaries.filter((t) => t.telegramLinked).length,
      tenants: tenantSummaries,
    };
  }

  /**
   * Update global backup interval & settings from Super Admin
   */
  updateGlobalSettings(dto: GlobalBackupSettingsDto) {
    this.globalSettings = { ...dto };
    this.logger.log(`Super Admin updated backup settings: ${JSON.stringify(this.globalSettings)}`);
    return { success: true, settings: this.globalSettings };
  }

  getGlobalSettings(): GlobalBackupSettingsDto {
    return this.globalSettings;
  }

  /**
   * Trigger on-demand backup for all active restaurants with Telegram linked
   */
  async triggerBackupAllTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      include: {
        entitlements: { where: { entitlementKey: 'TELEGRAM_BACKUP' } },
      },
    });

    const results: any[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const t of tenants) {
      const tg = t.entitlements.find((e) => e.entitlementKey === 'TELEGRAM_BACKUP')?.valueJson as any;
      if (tg?.chatId && tg?.enabled !== false) {
        try {
          const res = await this.sendBackupToTelegram(t.id);
          results.push({ tenantId: t.id, tenantName: t.displayName, success: true, sizeKb: res.sizeKb });
          sentCount++;
        } catch (err: any) {
          results.push({ tenantId: t.id, tenantName: t.displayName, success: false, error: err.message });
          failedCount++;
        }
      }
    }

    return {
      totalTenants: tenants.length,
      sentCount,
      failedCount,
      results,
    };
  }
}

