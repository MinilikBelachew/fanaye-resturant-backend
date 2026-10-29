-- AlterTable: add day_code to dining_table_shift_coverages
ALTER TABLE "dining_table_shift_coverages" ADD COLUMN IF NOT EXISTS "day_code" VARCHAR(3) NOT NULL DEFAULT 'Mon';

-- Drop old unique index
DROP INDEX IF EXISTS "uq_dining_table_shift_coverages__table_shift";

-- Create new unique index on (dining_table_id, shift_definition_id, day_code)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_dining_table_shift_coverages__table_shift_day"
  ON "dining_table_shift_coverages"("dining_table_id", "shift_definition_id", "day_code");

-- Drop old indexes
DROP INDEX IF EXISTS "ix_dining_table_shift_coverages__waiter_shift";
DROP INDEX IF EXISTS "ix_dining_table_shift_coverages__branch_shift";

-- Create new indexes
CREATE INDEX IF NOT EXISTS "ix_dining_table_shift_coverages__waiter_shift_day"
  ON "dining_table_shift_coverages"("waiter_membership_id", "shift_definition_id", "day_code");

CREATE INDEX IF NOT EXISTS "ix_dining_table_shift_coverages__branch_shift_day"
  ON "dining_table_shift_coverages"("branch_id", "shift_definition_id", "day_code");
