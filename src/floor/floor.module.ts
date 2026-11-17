import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SiteModule } from '../site/site.module';
import { FloorController } from './floor.controller';
import { FloorKioskController } from './floor-kiosk.controller';
import { FloorKioskService } from './floor-kiosk.service';
import { FloorLayoutController } from './floor-layout.controller';
import { FloorLayoutService } from './floor-layout.service';
import { FloorService } from './floor.service';
import { SessionIdleMonitorService } from './session-idle-monitor.service';
import { StaffCoverageController } from './staff-coverage.controller';
import { StaffCoverageService } from './staff-coverage.service';
import { TableSessionsController } from './table-sessions.controller';
import { DispatcherController } from './dispatcher.controller';
import { WaiterPerformanceController } from './waiter-performance.controller';
import { WaiterPerformanceService } from './waiter-performance.service';
import { WaiterTablesController } from './waiter-tables.controller';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    AuthModule,
    IdentityModule,
    RealtimeModule,
    SiteModule,
  ],
  controllers: [
    FloorController,
    FloorKioskController,
    FloorLayoutController,
    StaffCoverageController,
    WaiterTablesController,
    TableSessionsController,
    DispatcherController,
    WaiterPerformanceController,
  ],
  providers: [
    FloorService,
    FloorKioskService,
    FloorLayoutService,
    StaffCoverageService,
    WaiterPerformanceService,
    SessionIdleMonitorService,
  ],
  exports: [
    FloorService,
    FloorLayoutService,
    StaffCoverageService,
    WaiterPerformanceService,
  ],
})
export class FloorModule {}
