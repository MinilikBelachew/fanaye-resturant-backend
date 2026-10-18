-- Global entitlement days on leave types
ALTER TABLE "leave_types"
  ADD COLUMN "default_days" DECIMAL(8,2) NOT NULL DEFAULT 0;
