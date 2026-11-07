import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SyncService } from './sync.service';

@Injectable()
export class SyncCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncCronService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly syncService: SyncService) {}

  onModuleInit() {
    if (!this.syncService.isOfflineSyncEnabled()) {
      return;
    }

    this.logger.log('Offline Automatic Sync worker initialized (every 45 seconds).');

    // Initial check after 5 seconds
    setTimeout(() => {
      this.syncService.runOfflineSyncCycle().catch(() => {});
    }, 5000);

    // Periodic check every 45 seconds
    this.timer = setInterval(async () => {
      try {
        await this.syncService.runOfflineSyncCycle();
      } catch (err: any) {
        this.logger.debug(`Sync tick: ${err.message}`);
      }
    }, 45_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

