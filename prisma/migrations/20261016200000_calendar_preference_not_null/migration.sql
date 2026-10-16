-- Align live DB with schema: calendar_preference must be NOT NULL.
UPDATE "tenant_settings"
SET "calendar_preference" = 'ETHIOPIAN'
WHERE "calendar_preference" IS NULL;

ALTER TABLE "tenant_settings"
  ALTER COLUMN "calendar_preference" SET DEFAULT 'ETHIOPIAN';

ALTER TABLE "tenant_settings"
  ALTER COLUMN "calendar_preference" SET NOT NULL;
