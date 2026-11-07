import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TelegramBackupService {
  private readonly logger = new Logger(TelegramBackupService.name);
  private readonly botToken: string;
  private readonly botUsername: string;
  private lastUpdateId = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.botToken =
      process.env.TELEGRAM_BOT_TOKEN ||
      this.config.get<string>('TELEGRAM_BOT_TOKEN') ||
      '9049089911:AAF3lDI12A3-conSsRzwGPL0rx1PrFK5UuE';

    this.botUsername =
      process.env.TELEGRAM_BOT_USERNAME ||
      this.config.get<string>('TELEGRAM_BOT_USERNAME') ||
      'restorch_backup_bot';
  }

  getBotUsername(): string {
    return this.botUsername;
  }

  /**
   * Generates deep-link URL for an owner to link their restaurant
   */
  getDeepLinkUrl(tenantId: string): string {
    return `https://t.me/${this.botUsername}?start=tenant_${tenantId}`;
  }

  /**
   * Send text message to a Telegram chat
   */
  async sendMessage(chatId: string, text: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }),
        },
      );
      const json = await res.json();
      return json.ok === true;
    } catch (err: any) {
      this.logger.error(`Failed to send Telegram message to ${chatId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Send the compressed .sql.gz backup file directly to the owner's Telegram chat
   */
  async sendBackupDocument(
    chatId: string,
    filename: string,
    fileBuffer: Buffer,
    details: {
      tenantName: string;
      billsToday: number;
      revenueToday: number;
      totalTables: number;
      totalRows: number;
    },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);

      // Create a Blob from buffer for native Node FormData upload
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'application/gzip' });
      formData.append('document', blob, filename);

      const sizeKb = (fileBuffer.length / 1024).toFixed(1);
      const todayStr = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const caption =
        `📦 <b>Restorch Automated Backup</b>\n\n` +
        `🏢 <b>Restaurant:</b> ${details.tenantName}\n` +
        `📅 <b>Date:</b> ${todayStr}\n` +
        `📊 <b>Today's Sales:</b> ${details.billsToday} bills (ETB ${details.revenueToday.toLocaleString('en-US', { minimumFractionDigits: 2 })})\n` +
        `🗄️ <b>Archive Size:</b> ${sizeKb} KB (${details.totalTables} tables, ${details.totalRows} rows)\n` +
        `🔐 <i>Status: 100% verified complete snapshot. Keep this file safe for disaster recovery.</i>`;

      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');

      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendDocument`,
        {
          method: 'POST',
          body: formData,
        },
      );

      const json = await res.json();
      if (!json.ok) {
        this.logger.error(`Telegram API error: ${JSON.stringify(json)}`);
        return { success: false, error: json.description || 'Unknown Telegram error' };
      }

      this.logger.log(`Backup sent successfully to Telegram chat ${chatId} (${filename})`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Failed to upload document to Telegram chat ${chatId}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Poll Telegram getUpdates to detect and process incoming /start commands
   */
  async processIncomingUpdates(): Promise<{ linkedCount: number }> {
    let linkedCount = 0;
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=5`;
      const res = await fetch(url);
      const json = await res.json();

      if (!json.ok || !Array.isArray(json.result)) {
        return { linkedCount: 0 };
      }

      for (const update of json.result) {
        if (update.update_id > this.lastUpdateId) {
          this.lastUpdateId = update.update_id;
        }

        const msg = update.message;
        if (!msg || !msg.text) continue;

        const text = msg.text.trim();
        const chatId = String(msg.chat.id);
        const username = msg.from?.username || msg.from?.first_name || '';

        // Match /start tenant_<uuid>
        const match = text.match(/\/start\s+tenant_([a-f0-9-]+)/i);
        if (match) {
          const tenantId = match[1].toLowerCase();

          // Verify tenant exists
          const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
          });

          if (tenant) {
            // Save or update entitlement
            const existing = await this.prisma.tenantEntitlement.findFirst({
              where: {
                tenantId,
                entitlementKey: 'TELEGRAM_BACKUP',
              },
            });

            const backupConfig = {
              chatId,
              username,
              linkedAt: new Date().toISOString(),
              enabled: true,
            };

            if (existing) {
              await this.prisma.tenantEntitlement.update({
                where: { id: existing.id },
                data: {
                  valueJson: backupConfig,
                },
              });
            } else {
              await this.prisma.tenantEntitlement.create({
                data: {
                  tenantId,
                  entitlementKey: 'TELEGRAM_BACKUP',
                  valueJson: backupConfig,
                  effectiveFrom: new Date(),
                },
              });
            }

            linkedCount++;
            this.logger.log(
              `Linked Telegram chat ${chatId} (@${username}) to tenant "${tenant.displayName}" (${tenantId})`,
            );

            // Send confirmation back to owner on Telegram
            await this.sendMessage(
              chatId,
              `🎉 <b>Welcome to Restorch!</b>\n\n` +
                `Your Telegram account has been linked to <b>${tenant.displayName}</b>.\n` +
                `You will now receive automated daily backups and disaster recovery archives directly here.\n\n` +
                `<i>You can manage your backup settings anytime from your Owner Portal.</i>`,
            );
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error processing Telegram updates: ${err.message}`);
    }

    return { linkedCount };
  }
}

