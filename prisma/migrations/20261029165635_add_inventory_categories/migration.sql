-- CreateTable: inventory_categories
CREATE TABLE IF NOT EXISTS "inventory_categories" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID NOT NULL,
    "branch_id"     UUID,
    "name"          VARCHAR(120) NOT NULL,
    "amharic_name"  VARCHAR(120),
    "code"          VARCHAR(50) NOT NULL,
    "description"   VARCHAR(255),
    "sort_order"    INTEGER NOT NULL DEFAULT 0,
    "status"        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- AddColumn: category_id on inventory_ingredients (nullable, safe to add)
ALTER TABLE "inventory_ingredients"
    ADD COLUMN IF NOT EXISTS "category_id" UUID;

-- ForeignKeys
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_categories_tenant_id_fkey'
    ) THEN
        ALTER TABLE "inventory_categories"
            ADD CONSTRAINT "inventory_categories_tenant_id_fkey"
            FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_categories_branch_id_fkey'
    ) THEN
        ALTER TABLE "inventory_categories"
            ADD CONSTRAINT "inventory_categories_branch_id_fkey"
            FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_ingredients_category_id_fkey'
    ) THEN
        ALTER TABLE "inventory_ingredients"
            ADD CONSTRAINT "inventory_ingredients_category_id_fkey"
            FOREIGN KEY ("category_id") REFERENCES "inventory_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Unique & Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "uq_inventory_categories__tenant_code"
    ON "inventory_categories"("tenant_id", "code");

CREATE INDEX IF NOT EXISTS "ix_inventory_categories__tenant_status"
    ON "inventory_categories"("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "ix_inventory_categories__tenant_branch"
    ON "inventory_categories"("tenant_id", "branch_id");

CREATE INDEX IF NOT EXISTS "ix_inventory_ingredients__tenant_category"
    ON "inventory_ingredients"("tenant_id", "category_id");
