import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BillingService } from './billing.service';
import {
  BillRequestsController,
  CashierBillingController,
} from './bill-requests.controller';
import { BillsController } from './bills.controller';
import { CashierPaymentsController } from './payments.controller';
import { TableSessionBillController } from './table-session-bill.controller';
import { TableSessionBillingController } from './table-session-billing.controller';

@Module({
  imports: [IdentityModule, RealtimeModule],
  controllers: [
    TableSessionBillingController,
    TableSessionBillController,
    BillRequestsController,
    CashierBillingController,
    BillsController,
    CashierPaymentsController,
  ],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
