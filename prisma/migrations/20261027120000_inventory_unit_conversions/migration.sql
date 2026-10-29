-- DropIndex
ALTER TABLE "inventory_units" DROP CONSTRAINT "inventory_units_code_key";

-- AlterTable
ALTER TABLE "inventory_count_lines" ADD COLUMN     "counted_unit" VARCHAR(20);

-- AlterTable
ALTER TABLE "inventory_production_batches" ADD COLUMN     "output_unit" VARCHAR(20);

-- AlterTable
ALTER TABLE "inventory_production_inputs" ADD COLUMN     "unit" VARCHAR(20);

-- AlterTable
ALTER TABLE "inventory_supply_request_lines" ADD COLUMN     "unit" VARCHAR(20);

-- AlterTable
ALTER TABLE "inventory_transfer_lines" ADD COLUMN     "unit_sent" VARCHAR(20);

-- AlterTable
ALTER TABLE "inventory_units" ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "inventory_yield_tests" ADD COLUMN     "unit" VARCHAR(20);

-- AlterTable
ALTER TABLE "menu_item_recipe_lines" ADD COLUMN     "unit" VARCHAR(20);

-- CreateTable
CREATE TABLE "inventory_unit_conversions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_unit" VARCHAR(20) NOT NULL,
    "to_unit" VARCHAR(20) NOT NULL,
    "factor" DECIMAL(19,4) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_inventory_unit_conversions__tenant_status" ON "inventory_unit_conversions"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_unit_conversions__tenant_pair" ON "inventory_unit_conversions"("tenant_id", "from_unit", "to_unit");

-- CreateIndex
CREATE INDEX "ix_inventory_units__tenant" ON "inventory_units"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_units__tenant_code" ON "inventory_units"("tenant_id", "code");

-- Global (built-in) unit codes stay unique among themselves.
CREATE UNIQUE INDEX "uq_inventory_units__global_code" ON "inventory_units"("code") WHERE "tenant_id" IS NULL;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_unit_conversions" ADD CONSTRAINT "inventory_unit_conversions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_unit_conversions" ADD CONSTRAINT "inventory_unit_conversions_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
