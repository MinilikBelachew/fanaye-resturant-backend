-- CreateTable
CREATE TABLE "finance_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "amharic_name" VARCHAR(120),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_finance_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "category_id" UUID,
    "label" VARCHAR(180) NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "settled_via" VARCHAR(16) NOT NULL DEFAULT 'CASH',
    "counterparty" VARCHAR(160),
    "note" VARCHAR(500),
    "receipt_file_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'POSTED',
    "created_by_membership_id" UUID NOT NULL,
    "voided_by_membership_id" UUID,
    "voided_at" TIMESTAMPTZ(6),
    "void_reason" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_finance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_finance_categories__tenant_direction" ON "finance_categories"("tenant_id", "direction", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_finance_categories__tenant_direction_code" ON "finance_categories"("tenant_id", "direction", "code");

-- CreateIndex
CREATE INDEX "ix_manual_finance_entries__branch_date" ON "manual_finance_entries"("tenant_id", "branch_id", "business_date");

-- CreateIndex
CREATE INDEX "ix_manual_finance_entries__tenant_direction_date" ON "manual_finance_entries"("tenant_id", "direction", "business_date");

-- CreateIndex
CREATE INDEX "ix_manual_finance_entries__category" ON "manual_finance_entries"("tenant_id", "category_id");

-- CreateIndex
CREATE INDEX "ix_bills__branch_date" ON "bills"("tenant_id", "branch_id", "business_date");

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_finance_entries" ADD CONSTRAINT "manual_finance_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_finance_entries" ADD CONSTRAINT "manual_finance_entries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_finance_entries" ADD CONSTRAINT "manual_finance_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_finance_entries" ADD CONSTRAINT "manual_finance_entries_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
