import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CashCustodyService } from './cash-custody.service';
import {
  CashDropDisputesController,
  CashDropsController,
  CashierCashDropsController,
  WaiterCashController,
} from './cash-custody.controller';

@Module({
  imports: [IdentityModule, RealtimeModule],
  controllers: [
    WaiterCashController,
    CashDropsController,
    CashierCashDropsController,
    CashDropDisputesController,
  ],
  providers: [CashCustodyService],
  exports: [CashCustodyService],
})
export class CashCustodyModule {}
