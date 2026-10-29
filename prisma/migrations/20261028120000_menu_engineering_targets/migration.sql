-- Menu engineering targets stored on tenant settings.
ALTER TABLE "tenant_settings"
    ADD COLUMN "target_food_cost_percent" DECIMAL(5, 2) NOT NULL DEFAULT 30,
    ADD COLUMN "food_cost_alert_percent" DECIMAL(5, 2) NOT NULL DEFAULT 35;
