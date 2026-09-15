import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import {
  AdminQrMenuController,
  PublicQrMenuController,
} from './qr-menu.controller';
import { QrMenuService } from './qr-menu.service';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [PublicQrMenuController, AdminQrMenuController],
  providers: [QrMenuService],
  exports: [QrMenuService],
})
export class QrMenuModule {}
