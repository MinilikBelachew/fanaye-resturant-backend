import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export enum BackupInterval {
  DAILY = 'DAILY',
  TWICE_DAILY = 'TWICE_DAILY',
  WEEKLY = 'WEEKLY',
  MANUAL = 'MANUAL',
}

export class GlobalBackupSettingsDto {
  @ApiProperty({ enum: BackupInterval, default: BackupInterval.DAILY })
  @IsEnum(BackupInterval)
  interval: BackupInterval;

  @ApiProperty({ default: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ default: 0, description: 'Hour of day (0-23 in Africa/Addis_Ababa) to run daily backup' })
  @IsNumber()
  @Min(0)
  @Max(23)
  sendHour: number;
}

export class TelegramLinkDto {
  @ApiProperty({ description: 'Telegram Chat ID obtained from bot' })
  @IsString()
  chatId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  username?: string;
}

export class TenantBackupSummaryDto {
  tenantId: string;
  tenantName: string;
  telegramLinked: boolean;
  telegramChatId?: string;
  telegramUsername?: string;
  lastBackupAt?: string;
  lastBackupStatus?: 'SUCCESS' | 'FAILED' | 'NEVER';
  lastBackupSizeKb?: number;
  lastBackupBillsCount?: number;
}

