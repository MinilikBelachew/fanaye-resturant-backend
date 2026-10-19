-- Allow cashier/waiter handover ledger entry + source types used by shift handover.
ALTER TABLE "cash_ledger_entries"
  DROP CONSTRAINT IF EXISTS "ck_cash_ledger_entries__entry_type";

ALTER TABLE "cash_ledger_entries"
  ADD CONSTRAINT "ck_cash_ledger_entries__entry_type"
  CHECK ("entry_type" IN (
    'CASH_PAYMENT_COLLECTED',
    'CASH_DROP_OUT',
    'OPENING_FLOAT',
    'CASH_DROP_IN',
    'APPROVED_ADJUSTMENT',
    'SAFE_DROP_OUT',
    'HANDOVER_OUT',
    'WAITER_HANDOVER_OUT',
    'WAITER_HANDOVER_IN'
  ));

ALTER TABLE "cash_ledger_entries"
  DROP CONSTRAINT IF EXISTS "ck_cash_ledger_entries__source_type";

ALTER TABLE "cash_ledger_entries"
  ADD CONSTRAINT "ck_cash_ledger_entries__source_type"
  CHECK ("source_type" IN (
    'PAYMENT',
    'CASH_DROP',
    'FINANCIAL_SESSION',
    'ADJUSTMENT',
    'SHIFT_HANDOVER',
    'WAITER_SHIFT_HANDOVER'
  ));
