-- VIP places/tables + house default VIP % + per-item override
ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "default_vip_percent" DECIMAL(8, 2) NOT NULL DEFAULT 0;

ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "vip_percent" DECIMAL(8, 2);

ALTER TABLE "table_locations"
  ADD COLUMN IF NOT EXISTS "is_vip" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "dining_tables"
  ADD COLUMN IF NOT EXISTS "is_vip" BOOLEAN NOT NULL DEFAULT false;
