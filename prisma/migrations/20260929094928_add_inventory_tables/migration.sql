-- CreateTable
CREATE TABLE "inventory_ingredients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "unit_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "par_level" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock_balances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "on_hand_qty" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_recipe_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity_per_serving" DECIMAL(19,4) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_ledger_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "entry_type" VARCHAR(40) NOT NULL,
    "quantity_delta" DECIMAL(19,4) NOT NULL,
    "unit_cost_snapshot" DECIMAL(19,4),
    "note" VARCHAR(255),
    "supplier_note" VARCHAR(180),
    "invoice_ref" VARCHAR(80),
    "order_item_id" UUID,
    "count_session_id" UUID,
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(255),
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMPTZ(6),

    CONSTRAINT "inventory_count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "count_session_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "book_qty_snapshot" DECIMAL(19,4) NOT NULL,
    "counted_qty" DECIMAL(19,4),

    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_inventory_ingredients__branch_status" ON "inventory_ingredients"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_ingredients__branch_name" ON "inventory_ingredients"("branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_balances_ingredient_id_key" ON "inventory_stock_balances"("ingredient_id");

-- CreateIndex
CREATE INDEX "ix_inventory_stock_balances__branch" ON "inventory_stock_balances"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "ix_menu_item_recipe_lines__item" ON "menu_item_recipe_lines"("tenant_id", "menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_menu_item_recipe_lines__item_ingredient" ON "menu_item_recipe_lines"("menu_item_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "ix_inventory_ledger__branch_created" ON "inventory_ledger_entries"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_inventory_ledger__ingredient_created" ON "inventory_ledger_entries"("ingredient_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_inventory_ledger__order_item" ON "inventory_ledger_entries"("order_item_id");

-- CreateIndex
CREATE INDEX "ix_inventory_ledger__type" ON "inventory_ledger_entries"("entry_type");

-- CreateIndex
CREATE INDEX "ix_inventory_count_sessions__branch_status" ON "inventory_count_sessions"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "ix_inventory_count_lines__session" ON "inventory_count_lines"("tenant_id", "count_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_count_lines__session_ingredient" ON "inventory_count_lines"("count_session_id", "ingredient_id");

-- AddForeignKey
ALTER TABLE "inventory_ingredients" ADD CONSTRAINT "inventory_ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ingredients" ADD CONSTRAINT "inventory_ingredients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_balances" ADD CONSTRAINT "inventory_stock_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_balances" ADD CONSTRAINT "inventory_stock_balances_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_balances" ADD CONSTRAINT "inventory_stock_balances_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "inventory_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_recipe_lines" ADD CONSTRAINT "menu_item_recipe_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_recipe_lines" ADD CONSTRAINT "menu_item_recipe_lines_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_recipe_lines" ADD CONSTRAINT "menu_item_recipe_lines_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "inventory_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "inventory_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_count_session_id_fkey" FOREIGN KEY ("count_session_id") REFERENCES "inventory_count_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_count_session_id_fkey" FOREIGN KEY ("count_session_id") REFERENCES "inventory_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "inventory_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
