import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { FloorController } from './floor.controller';
import { FloorLayoutController } from './floor-layout.controller';
import { FloorLayoutService } from './floor-layout.service';
import { FloorService } from './floor.service';
import { StaffCoverageController } from './staff-coverage.controller';
import { StaffCoverageService } from './staff-coverage.service';
import { TableSessionsController } from './table-sessions.controller';
import { WaiterTablesController } from './waiter-tables.controller';

@Module({
  imports: [IdentityModule],
  controllers: [
    FloorController,
    FloorLayoutController,
    StaffCoverageController,
    WaiterTablesController,
    TableSessionsController,
  ],
  providers: [FloorService, FloorLayoutService, StaffCoverageService],
  exports: [FloorService, FloorLayoutService, StaffCoverageService],
})
export class FloorModule {}
