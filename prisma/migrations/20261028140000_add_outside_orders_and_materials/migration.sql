-- AlterTable
ALTER TABLE "bill_requests" ADD COLUMN     "outside_order_id" UUID;

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "outside_order_id" UUID;

-- AlterTable
ALTER TABLE "customer_feedback" ADD COLUMN     "outside_order_id" UUID;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "outside_order_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "outside_order_id" UUID;

-- CreateTable
CREATE TABLE "outside_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "destination_type" VARCHAR(24) NOT NULL DEFAULT 'OTHER',
    "destination_name" VARCHAR(180) NOT NULL,
    "destination_note" TEXT,
    "customer_name" VARCHAR(120),
    "customer_phone" VARCHAR(40),
    "created_by_membership_id" UUID NOT NULL,
    "waiter_shift_session_id" UUID NOT NULL,
    "requires_material_return" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_membership_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outside_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_materials" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "amharic_name" VARCHAR(160),
    "code" VARCHAR(60) NOT NULL,
    "category" VARCHAR(40) NOT NULL DEFAULT 'OTHER',
    "unit" VARCHAR(24) NOT NULL DEFAULT 'pcs',
    "is_reusable" BOOLEAN NOT NULL DEFAULT true,
    "image_url" VARCHAR(400),
    "description" VARCHAR(400),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_material_balances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "location_id" UUID,
    "material_id" UUID NOT NULL,
    "on_hand_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "issued_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "lost_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_material_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_material_issues" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "order_id" UUID NOT NULL,
    "issued_by_chef_membership_id" UUID NOT NULL,
    "waiter_membership_id" UUID NOT NULL,
    "waiter_shift_session_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),
    "approved_by_chef_membership_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "dispute_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_material_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_material_issue_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "material_name_snapshot" VARCHAR(160) NOT NULL,
    "qty_issued" DECIMAL(14,3) NOT NULL,
    "qty_returned" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_shortfall" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "condition" VARCHAR(16) NOT NULL DEFAULT 'OK',
    "note" VARCHAR(400),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_material_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_outside_orders__branch_date" ON "outside_orders"("tenant_id", "branch_id", "business_date", "opened_at");

-- CreateIndex
CREATE INDEX "ix_outside_orders__branch_status" ON "outside_orders"("branch_id", "status");

-- CreateIndex
CREATE INDEX "ix_inventory_materials__tenant_category" ON "inventory_materials"("tenant_id", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_materials__tenant_code" ON "inventory_materials"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "ix_inventory_material_balances__tenant_material" ON "inventory_material_balances"("tenant_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_material_balances__location_material" ON "inventory_material_balances"("location_id", "material_id");

-- CreateIndex
CREATE INDEX "ix_order_material_issues__order" ON "order_material_issues"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "ix_order_material_issues__branch_status" ON "order_material_issues"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "ix_order_material_issues__waiter_status" ON "order_material_issues"("tenant_id", "waiter_membership_id", "status");

-- CreateIndex
CREATE INDEX "ix_order_material_issue_lines__issue" ON "order_material_issue_lines"("issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "bills_outside_order_id_key" ON "bills"("outside_order_id");

-- CreateIndex
CREATE INDEX "ix_orders__outside_order" ON "orders"("tenant_id", "outside_order_id", "confirmed_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outside_order_id_fkey" FOREIGN KEY ("outside_order_id") REFERENCES "outside_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_outside_order_id_fkey" FOREIGN KEY ("outside_order_id") REFERENCES "outside_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_requests" ADD CONSTRAINT "bill_requests_outside_order_id_fkey" FOREIGN KEY ("outside_order_id") REFERENCES "outside_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_outside_order_id_fkey" FOREIGN KEY ("outside_order_id") REFERENCES "outside_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_outside_order_id_fkey" FOREIGN KEY ("outside_order_id") REFERENCES "outside_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_orders" ADD CONSTRAINT "outside_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_orders" ADD CONSTRAINT "outside_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_orders" ADD CONSTRAINT "outside_orders_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_orders" ADD CONSTRAINT "outside_orders_closed_by_membership_id_fkey" FOREIGN KEY ("closed_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_orders" ADD CONSTRAINT "outside_orders_waiter_shift_session_id_fkey" FOREIGN KEY ("waiter_shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_materials" ADD CONSTRAINT "inventory_materials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_material_balances" ADD CONSTRAINT "inventory_material_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_material_balances" ADD CONSTRAINT "inventory_material_balances_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_material_balances" ADD CONSTRAINT "inventory_material_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_material_balances" ADD CONSTRAINT "inventory_material_balances_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "inventory_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issues" ADD CONSTRAINT "order_material_issues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issues" ADD CONSTRAINT "order_material_issues_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issues" ADD CONSTRAINT "order_material_issues_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issues" ADD CONSTRAINT "order_material_issues_issued_by_chef_membership_id_fkey" FOREIGN KEY ("issued_by_chef_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issues" ADD CONSTRAINT "order_material_issues_waiter_membership_id_fkey" FOREIGN KEY ("waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issues" ADD CONSTRAINT "order_material_issues_waiter_shift_session_id_fkey" FOREIGN KEY ("waiter_shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issues" ADD CONSTRAINT "order_material_issues_approved_by_chef_membership_id_fkey" FOREIGN KEY ("approved_by_chef_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issue_lines" ADD CONSTRAINT "order_material_issue_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issue_lines" ADD CONSTRAINT "order_material_issue_lines_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "order_material_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_material_issue_lines" ADD CONSTRAINT "order_material_issue_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "inventory_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
