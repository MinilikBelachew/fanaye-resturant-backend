-- Allow LIMITED state for station portion caps
ALTER TABLE "item_availability_overrides"
  DROP CONSTRAINT IF EXISTS "ck_item_availability_overrides__state";

ALTER TABLE "item_availability_overrides"
  ADD CONSTRAINT "ck_item_availability_overrides__state"
  CHECK ("state" IN ('SOLD_OUT', 'TEMPORARILY_DISABLED', 'LIMITED'));
