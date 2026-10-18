import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { MeHrController } from './me-hr.controller';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [IdentityModule, RealtimeModule],
  controllers: [HrController, MeHrController, PayrollController],
  providers: [HrService, PayrollService],
  exports: [HrService, PayrollService],
})
export class HrModule {}
