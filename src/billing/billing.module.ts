import { Module } from '@nestjs/common';
import { DailyCloseModule } from '../daily-close/daily-close.module';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { VerifyEtModule } from '../verify-et/verify-et.module';
import { BillingService } from './billing.service';
import {
  BillRequestsController,
  CashierBillingController,
} from './bill-requests.controller';
import { BillsController } from './bills.controller';
import { CashierPaymentsController } from './payments.controller';
import { PublicReceiptsController } from './public-receipts.controller';
import { ReceiptExtractController } from './receipt-extract.controller';
import { ReceiptExtractService } from './receipt-extract.service';
import { TableSessionBillController } from './table-session-bill.controller';
import { TableSessionBillingController } from './table-session-billing.controller';

@Module({
  imports: [IdentityModule, RealtimeModule, DailyCloseModule, VerifyEtModule],
  controllers: [
    TableSessionBillingController,
    TableSessionBillController,
    BillRequestsController,
    CashierBillingController,
    BillsController,
    CashierPaymentsController,
    PublicReceiptsController,
    ReceiptExtractController,
  ],
  providers: [BillingService, ReceiptExtractService],
  exports: [BillingService],
})
export class BillingModule {}
