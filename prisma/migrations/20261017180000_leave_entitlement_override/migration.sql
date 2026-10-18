-- Per-person leave entitlement override (manager/owner)
ALTER TABLE "staff_leave_balances"
  ADD COLUMN "entitlement_days" DECIMAL(8,2);
