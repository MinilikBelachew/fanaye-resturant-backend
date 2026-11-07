import { Module } from '@nestjs/common';
import { DailyCloseModule } from '../daily-close/daily-close.module';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CashCustodyService } from './cash-custody.service';
import {
  CashDropDisputesController,
  CashCustodyOverviewController,
  CashDropsController,
  CashierCashDropsController,
  WaiterCashController,
} from './cash-custody.controller';

@Module({
  imports: [IdentityModule, RealtimeModule, DailyCloseModule],
  controllers: [
    WaiterCashController,
    CashDropsController,
    CashierCashDropsController,
    CashDropDisputesController,
  CashCustodyOverviewController,
  ],
  providers: [CashCustodyService],
  exports: [CashCustodyService],
})
export class CashCustodyModule {}
