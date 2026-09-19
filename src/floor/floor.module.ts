import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { FloorController } from './floor.controller';
import { FloorLayoutController } from './floor-layout.controller';
import { FloorLayoutService } from './floor-layout.service';
import { FloorService } from './floor.service';
import { StaffCoverageController } from './staff-coverage.controller';
import { StaffCoverageService } from './staff-coverage.service';
import { TableSessionsController } from './table-sessions.controller';
import { WaiterPerformanceController } from './waiter-performance.controller';
import { WaiterPerformanceService } from './waiter-performance.service';
import { WaiterTablesController } from './waiter-tables.controller';

@Module({
  imports: [IdentityModule],
  controllers: [
    FloorController,
    FloorLayoutController,
    StaffCoverageController,
    WaiterTablesController,
    TableSessionsController,
    WaiterPerformanceController,
  ],
  providers: [
    FloorService,
    FloorLayoutService,
    StaffCoverageService,
    WaiterPerformanceService,
  ],
  exports: [
    FloorService,
    FloorLayoutService,
    StaffCoverageService,
    WaiterPerformanceService,
  ],
})
export class FloorModule {}
