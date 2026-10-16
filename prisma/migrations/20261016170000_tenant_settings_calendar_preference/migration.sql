-- Column already exists on some environments (added outside migrate).
-- IF NOT EXISTS keeps this safe; no data loss.
ALTER TABLE "tenant_settings"
ADD COLUMN IF NOT EXISTS "calendar_preference" VARCHAR(24) NOT NULL DEFAULT 'ETHIOPIAN';
