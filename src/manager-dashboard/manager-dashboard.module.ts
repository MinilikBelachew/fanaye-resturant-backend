import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { ManagerDashboardController } from './manager-dashboard.controller';
import { ManagerDashboardService } from './manager-dashboard.service';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [ManagerDashboardController],
  providers: [ManagerDashboardService],
  exports: [ManagerDashboardService],
})
export class ManagerDashboardModule {}
