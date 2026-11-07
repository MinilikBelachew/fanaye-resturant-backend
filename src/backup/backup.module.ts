import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { TenantExporterService } from './tenant-exporter.service';
import { TenantRestorerService } from './tenant-restorer.service';
import { TelegramBackupService } from './telegram-backup.service';
import { BackupCronService } from './backup.cron';

@Module({
  imports: [ConfigModule, PrismaModule, IdentityModule],
  controllers: [BackupController],
  providers: [
    BackupService,
    TenantExporterService,
    TenantRestorerService,
    TelegramBackupService,
    BackupCronService,
  ],
  exports: [BackupService, TenantExporterService, TenantRestorerService, TelegramBackupService],
})
export class BackupModule {}
