-- Inventory unit catalog (shared across tenants)
CREATE TABLE IF NOT EXISTS "inventory_units" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_units_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_inventory_units__code" UNIQUE ("code"),
    CONSTRAINT "ck_inventory_units__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "ck_inventory_units__category" CHECK ("category" IN ('weight', 'volume', 'count', 'pack'))
);

CREATE INDEX IF NOT EXISTS "ix_inventory_units__status_sort"
ON "inventory_units"("status", "sort_order");
