import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AllConfigType } from '../config/config.type';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../database/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OpsEventsListener } from './ops-events.listener';
import { OpsGateway } from './ops.gateway';
import { OpsNotifyService } from './ops-notify.service';

@Module({
  imports: [
    PrismaModule,
    IdentityModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AllConfigType>) => ({
        secret: config.getOrThrow('auth.secret', { infer: true }),
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    OpsNotifyService,
    OpsGateway,
    OpsEventsListener,
    NotificationsService,
  ],
  exports: [OpsNotifyService],
})
export class RealtimeModule {}
