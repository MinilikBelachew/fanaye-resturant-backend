import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { FloorModule } from '../floor/floor.module';
import { ManagerDashboardController } from './manager-dashboard.controller';
import { ManagerDashboardService } from './manager-dashboard.service';
import { ManagerReportsController } from './manager-reports.controller';
import { ManagerReportsService } from './manager-reports.service';

@Module({
  imports: [PrismaModule, IdentityModule, FloorModule],
  controllers: [ManagerDashboardController, ManagerReportsController],
  providers: [ManagerDashboardService, ManagerReportsService],
  exports: [ManagerDashboardService, ManagerReportsService],
})
export class ManagerDashboardModule {}
