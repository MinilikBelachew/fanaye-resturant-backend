-- AlterTable
ALTER TABLE "tenant_settings" 
ADD COLUMN IF NOT EXISTS "auto_approve_supply_requests" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "require_driver_for_dispatch" BOOLEAN NOT NULL DEFAULT false;
