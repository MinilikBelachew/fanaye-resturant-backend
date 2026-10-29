-- Migration: add_driver_push_drop_transit_flow
-- Adds: Driver model, InventoryPushDrop model
-- Modifies: InventoryTransfer (driverId, pushDropId, IN_TRANSIT status, dispatchedAt)
-- Modifies: InventorySupplyRequest (autoApprove flag, wider status column)

-- CreateTable: drivers
CREATE TABLE "drivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(32),
    "licence_plate" VARCHAR(40),
    "vehicle_desc" VARCHAR(180),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "registered_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: drivers
CREATE INDEX "ix_drivers__tenant_status" ON "drivers"("tenant_id", "status");

-- AddForeignKey: drivers.tenant_id
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: drivers.registered_by_membership_id
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_registered_by_membership_id_fkey"
    FOREIGN KEY ("registered_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: inventory_push_drops
CREATE TABLE "inventory_push_drops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "from_location_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "label" VARCHAR(180),
    "note" VARCHAR(255),
    "scheduled_date" DATE,
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_push_drops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: inventory_push_drops
CREATE INDEX "ix_inventory_push_drops__tenant_status" ON "inventory_push_drops"("tenant_id", "status", "created_at");

-- AddForeignKey: inventory_push_drops.tenant_id
ALTER TABLE "inventory_push_drops" ADD CONSTRAINT "inventory_push_drops_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: inventory_push_drops.from_location_id
ALTER TABLE "inventory_push_drops" ADD CONSTRAINT "inventory_push_drops_from_location_id_fkey"
    FOREIGN KEY ("from_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: inventory_push_drops.created_by_membership_id
ALTER TABLE "inventory_push_drops" ADD CONSTRAINT "inventory_push_drops_created_by_membership_id_fkey"
    FOREIGN KEY ("created_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: inventory_transfers — add driver_id, push_drop_id, dispatched_at columns; widen status
ALTER TABLE "inventory_transfers"
    ADD COLUMN "driver_id" UUID,
    ADD COLUMN "push_drop_id" UUID,
    ADD COLUMN "dispatched_at" TIMESTAMPTZ(6);

-- Widen the status column to VARCHAR(24) to accommodate 'PENDING_APPROVAL' and 'IN_TRANSIT'
ALTER TABLE "inventory_transfers" ALTER COLUMN "status" TYPE VARCHAR(24);

-- CreateIndex: inventory_transfers driver
CREATE INDEX "ix_inventory_transfers__driver_status" ON "inventory_transfers"("driver_id", "status");

-- AddForeignKey: inventory_transfers.driver_id
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: inventory_transfers.push_drop_id
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_push_drop_id_fkey"
    FOREIGN KEY ("push_drop_id") REFERENCES "inventory_push_drops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: inventory_supply_requests — add auto_approve, widen status
ALTER TABLE "inventory_supply_requests"
    ADD COLUMN "auto_approve" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "inventory_supply_requests" ALTER COLUMN "status" TYPE VARCHAR(24);
