import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BackupService } from './backup.service';
import { TelegramBackupService } from './telegram-backup.service';
import { BackupInterval } from './dto/backup.dto';

@Injectable()
export class BackupCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupCronService.name);
  private checkTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastRunDay = -1;
  private lastRunHour = -1;

  constructor(
    private readonly backupService: BackupService,
    private readonly telegram: TelegramBackupService,
  ) {}

  onModuleInit() {
    this.logger.log('Restorch Backup Cron initialized.');

    // 1. Poll Telegram incoming /start links every 15 seconds
    this.pollTimer = setInterval(async () => {
      try {
        await this.telegram.processIncomingUpdates();
      } catch {
        // ignore
      }
    }, 15_000);

    // 2. Check scheduled backup interval every 60 seconds
    this.checkTimer = setInterval(async () => {
      await this.evaluateSchedule();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async evaluateSchedule() {
    const settings = this.backupService.getGlobalSettings();
    if (!settings.enabled || settings.interval === BackupInterval.MANUAL) {
      return;
    }

    const now = new Date();
    // Use Africa/Addis_Ababa timezone
    const eatDateStr = now.toLocaleDateString('en-US', { timeZone: 'Africa/Addis_Ababa' });
    const eatDate = new Date(eatDateStr);
    const dayOfWeek = eatDate.getDay(); // 0 = Sunday
    const currentDay = eatDate.getDate();

    // Get current hour in Africa/Addis_Ababa
    const currentHourStr = now.toLocaleTimeString('en-US', {
      timeZone: 'Africa/Addis_Ababa',
      hour12: false,
      hour: 'numeric',
    });
    const currentHour = parseInt(currentHourStr, 10);

    let shouldRun = false;

    if (settings.interval === BackupInterval.DAILY) {
      // Run once per day at configured sendHour
      if (currentHour === settings.sendHour && this.lastRunDay !== currentDay) {
        shouldRun = true;
      }
    } else if (settings.interval === BackupInterval.TWICE_DAILY) {
      // Run at sendHour (e.g. 00:00) and 12 hours later (e.g. 12:00)
      const secondHour = (settings.sendHour + 12) % 24;
      if (
        (currentHour === settings.sendHour || currentHour === secondHour) &&
        this.lastRunHour !== currentHour
      ) {
        shouldRun = true;
      }
    } else if (settings.interval === BackupInterval.WEEKLY) {
      // Run once per week on Sunday at sendHour
      if (dayOfWeek === 0 && currentHour === settings.sendHour && this.lastRunDay !== currentDay) {
        shouldRun = true;
      }
    }

    if (shouldRun) {
      this.lastRunDay = currentDay;
      this.lastRunHour = currentHour;
      this.logger.log(
        `Starting automated scheduled backup trigger (${settings.interval} at hour ${currentHour} EAT)...`,
      );
      try {
        const res = await this.backupService.triggerBackupAllTenants();
        this.logger.log(
          `Automated backup complete: ${res.sentCount} sent, ${res.failedCount} failed out of ${res.totalTenants} total tenants.`,
        );
      } catch (err: any) {
        this.logger.error(`Automated backup cron failed: ${err.message}`, err.stack);
      }
    }
  }
}

