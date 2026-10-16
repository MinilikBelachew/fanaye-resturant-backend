-- DropIndex
DROP INDEX "uq_inventory_ingredients__branch_name";

-- DropIndex
DROP INDEX "inventory_stock_balances_ingredient_id_key";

-- AlterTable
ALTER TABLE "inventory_count_sessions" ADD COLUMN     "location_id" UUID;

-- AlterTable
ALTER TABLE "inventory_ingredients" ADD COLUMN     "item_kind" VARCHAR(20) NOT NULL DEFAULT 'RAW',
ALTER COLUMN "branch_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "inventory_ledger_entries" ADD COLUMN     "location_id" UUID,
ADD COLUMN     "production_batch_id" UUID,
ADD COLUMN     "transfer_id" UUID,
ALTER COLUMN "branch_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "inventory_stock_balances" ADD COLUMN     "location_id" UUID,
ALTER COLUMN "branch_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "note" VARCHAR(255),
    "supply_request_id" UUID,
    "sent_by_membership_id" UUID,
    "received_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfer_lines" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity_sent" DECIMAL(19,4) NOT NULL,
    "quantity_received" DECIMAL(19,4),

    CONSTRAINT "inventory_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_supply_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "note" VARCHAR(255),
    "decision_note" VARCHAR(255),
    "requested_by_membership_id" UUID,
    "decided_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "inventory_supply_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_supply_request_lines" (
    "id" UUID NOT NULL,
    "supply_request_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity_requested" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "inventory_supply_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_production_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "output_ingredient_id" UUID NOT NULL,
    "output_quantity" DECIMAL(19,4) NOT NULL,
    "note" VARCHAR(255),
    "posted_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_production_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_production_inputs" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "inventory_production_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_inventory_locations__tenant_type" ON "inventory_locations"("tenant_id", "type", "status");

-- CreateIndex
CREATE INDEX "ix_inventory_locations__branch" ON "inventory_locations"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_locations__tenant_code" ON "inventory_locations"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfers_supply_request_id_key" ON "inventory_transfers"("supply_request_id");

-- CreateIndex
CREATE INDEX "ix_inventory_transfers__tenant_status" ON "inventory_transfers"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ix_inventory_transfer_lines__transfer" ON "inventory_transfer_lines"("transfer_id");

-- CreateIndex
CREATE INDEX "ix_inventory_supply_requests__tenant_status" ON "inventory_supply_requests"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ix_inventory_supply_request_lines__request" ON "inventory_supply_request_lines"("supply_request_id");

-- CreateIndex
CREATE INDEX "ix_inventory_production_batches__location" ON "inventory_production_batches"("tenant_id", "location_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_inventory_production_inputs__batch" ON "inventory_production_inputs"("batch_id");

-- CreateIndex
CREATE INDEX "ix_inventory_ingredients__tenant_status" ON "inventory_ingredients"("tenant_id", "status");

-- Data: make ingredient names unique per tenant before unique index
UPDATE "inventory_ingredients" AS i
SET "name" = LEFT(i."name" || ' (' || COALESCE(b."display_code", LEFT(i."branch_id"::text, 8)) || ')', 180)
FROM "branches" AS b
WHERE i."branch_id" = b."id"
  AND EXISTS (
    SELECT 1
    FROM "inventory_ingredients" AS i2
    WHERE i2."tenant_id" = i."tenant_id"
      AND lower(i2."name") = lower(i."name")
      AND i2."id" <> i."id"
      AND i2."created_at" < i."created_at"
  );

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_ingredients__tenant_name" ON "inventory_ingredients"("tenant_id", "name");

-- Data: default BRANCH_STORE per branch + backfill balances.location_id
INSERT INTO "inventory_locations" (
  "id", "tenant_id", "branch_id", "code", "name", "type", "is_default", "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  b."tenant_id",
  b."id",
  LEFT('BRANCH_' || b."display_code", 40),
  LEFT(b."name" || ' store', 120),
  'BRANCH_STORE',
  true,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "branches" AS b
WHERE b."archived_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "inventory_locations" AS loc
    WHERE loc."tenant_id" = b."tenant_id"
      AND loc."branch_id" = b."id"
  );

UPDATE "inventory_stock_balances" AS bal
SET "location_id" = loc."id"
FROM "inventory_locations" AS loc
WHERE bal."location_id" IS NULL
  AND bal."branch_id" IS NOT NULL
  AND loc."branch_id" = bal."branch_id"
  AND loc."is_default" = true;

UPDATE "inventory_ledger_entries" AS led
SET "location_id" = loc."id"
FROM "inventory_locations" AS loc
WHERE led."location_id" IS NULL
  AND led."branch_id" IS NOT NULL
  AND loc."branch_id" = led."branch_id"
  AND loc."is_default" = true;

UPDATE "inventory_count_sessions" AS cs
SET "location_id" = loc."id"
FROM "inventory_locations" AS loc
WHERE cs."location_id" IS NULL
  AND loc."branch_id" = cs."branch_id"
  AND loc."is_default" = true;

-- CreateIndex
CREATE INDEX "ix_inventory_ledger__location_created" ON "inventory_ledger_entries"("tenant_id", "location_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_inventory_stock_balances__location" ON "inventory_stock_balances"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "ix_inventory_stock_balances__ingredient" ON "inventory_stock_balances"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_stock_balances__location_ingredient" ON "inventory_stock_balances"("location_id", "ingredient_id");

-- AddForeignKey
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_balances" ADD CONSTRAINT "inventory_stock_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_supply_request_id_fkey" FOREIGN KEY ("supply_request_id") REFERENCES "inventory_supply_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_sent_by_membership_id_fkey" FOREIGN KEY ("sent_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_received_by_membership_id_fkey" FOREIGN KEY ("received_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inventory_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "inventory_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_supply_requests" ADD CONSTRAINT "inventory_supply_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_supply_requests" ADD CONSTRAINT "inventory_supply_requests_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_supply_requests" ADD CONSTRAINT "inventory_supply_requests_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_supply_requests" ADD CONSTRAINT "inventory_supply_requests_requested_by_membership_id_fkey" FOREIGN KEY ("requested_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_supply_requests" ADD CONSTRAINT "inventory_supply_requests_decided_by_membership_id_fkey" FOREIGN KEY ("decided_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_supply_request_lines" ADD CONSTRAINT "inventory_supply_request_lines_supply_request_id_fkey" FOREIGN KEY ("supply_request_id") REFERENCES "inventory_supply_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_supply_request_lines" ADD CONSTRAINT "inventory_supply_request_lines_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "inventory_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_production_batches" ADD CONSTRAINT "inventory_production_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_production_batches" ADD CONSTRAINT "inventory_production_batches_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_production_batches" ADD CONSTRAINT "inventory_production_batches_output_ingredient_id_fkey" FOREIGN KEY ("output_ingredient_id") REFERENCES "inventory_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_production_batches" ADD CONSTRAINT "inventory_production_batches_posted_by_membership_id_fkey" FOREIGN KEY ("posted_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_production_inputs" ADD CONSTRAINT "inventory_production_inputs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_production_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_production_inputs" ADD CONSTRAINT "inventory_production_inputs_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "inventory_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
