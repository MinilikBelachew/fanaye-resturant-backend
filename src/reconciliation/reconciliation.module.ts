import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import {
  CashierReconciliationController,
  ManagerReconciliationReviewController,
  ReconciliationsController,
} from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [IdentityModule],
  controllers: [
    CashierReconciliationController,
    ManagerReconciliationReviewController,
    ReconciliationsController,
  ],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
