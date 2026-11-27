import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { SyncCronService } from './sync.cron';
import { SyncOutboxService } from './sync-outbox.service';
import { BackupModule } from '../backup/backup.module';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { AllConfigType } from '../config/config.type';

@Module({
  imports: [
    BackupModule,
    AuthModule,
    IdentityModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => ({
        secret: configService.get('auth.secret', { infer: true }),
      }),
    }),
  ],
  controllers: [SyncController],
  providers: [SyncOutboxService, SyncService, SyncCronService],
  exports: [SyncOutboxService, SyncService],
})
export class SyncModule {}
