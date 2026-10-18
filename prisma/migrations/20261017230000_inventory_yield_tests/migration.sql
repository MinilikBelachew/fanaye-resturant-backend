-- Persistent registered yield tests (list / edit / delete)
CREATE TABLE IF NOT EXISTS "inventory_yield_tests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID,
    "ingredient_id" UUID NOT NULL,
    "purchased_quantity" DECIMAL(19,4) NOT NULL,
    "usable_quantity" DECIMAL(19,4) NOT NULL,
    "trim_quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "yield_percent" DECIMAL(8,2) NOT NULL,
    "ap_unit_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "ep_unit_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "wrote_off_trim" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(255),
    "posted_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_yield_tests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_inventory_yield_tests__tenant_created"
  ON "inventory_yield_tests"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "ix_inventory_yield_tests__ingredient"
  ON "inventory_yield_tests"("tenant_id", "ingredient_id");

DO $$ BEGIN
  ALTER TABLE "inventory_yield_tests"
    ADD CONSTRAINT "inventory_yield_tests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_yield_tests"
    ADD CONSTRAINT "inventory_yield_tests_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_yield_tests"
    ADD CONSTRAINT "inventory_yield_tests_ingredient_id_fkey"
    FOREIGN KEY ("ingredient_id") REFERENCES "inventory_ingredients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_yield_tests"
    ADD CONSTRAINT "inventory_yield_tests_posted_by_membership_id_fkey"
    FOREIGN KEY ("posted_by_membership_id") REFERENCES "tenant_staff_memberships"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
