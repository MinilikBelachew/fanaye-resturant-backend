-- CreateTable
CREATE TABLE "market_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_units" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplaces" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "city" VARCHAR(100),
    "area" VARCHAR(120),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_items" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "category_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "photo_url" TEXT,
    "description" TEXT,
    "is_featured_on_landing" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_item_prices" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "marketplace_id" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "previous_price" DECIMAL(12,2),
    "updated_by_id" UUID,
    "updated_by_name" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_item_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_price_history" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "marketplace_id" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "recorded_by_id" UUID,
    "recorded_by_name" VARCHAR(160),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_role_permissions" (
    "id" UUID NOT NULL,
    "role_code" VARCHAR(40) NOT NULL,
    "permission_code" VARCHAR(80) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "market_categories_name_key" ON "market_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "market_categories_slug_key" ON "market_categories"("slug");

-- CreateIndex
CREATE INDEX "ix_market_categories__active_sort" ON "market_categories"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "market_units_code_key" ON "market_units"("code");

-- CreateIndex
CREATE INDEX "ix_market_units__active_sort" ON "market_units"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "marketplaces_name_key" ON "marketplaces"("name");

-- CreateIndex
CREATE UNIQUE INDEX "marketplaces_slug_key" ON "marketplaces"("slug");

-- CreateIndex
CREATE INDEX "ix_marketplaces__active_name" ON "marketplaces"("is_active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "market_items_slug_key" ON "market_items"("slug");

-- CreateIndex
CREATE INDEX "ix_market_items__active_featured" ON "market_items"("is_active", "is_featured_on_landing");

-- CreateIndex
CREATE INDEX "ix_market_items__category" ON "market_items"("category_id");

-- CreateIndex
CREATE INDEX "ix_market_item_prices__market" ON "market_item_prices"("marketplace_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_market_item_prices__item_market" ON "market_item_prices"("item_id", "marketplace_id");

-- CreateIndex
CREATE INDEX "ix_market_price_history__item_recorded" ON "market_price_history"("item_id", "recorded_at");

-- CreateIndex
CREATE INDEX "ix_market_price_history__item_market_recorded" ON "market_price_history"("item_id", "marketplace_id", "recorded_at");

-- CreateIndex
CREATE INDEX "ix_platform_role_perms__role" ON "platform_role_permissions"("role_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_platform_role_perms__role_perm" ON "platform_role_permissions"("role_code", "permission_code");

-- AddForeignKey
ALTER TABLE "market_items" ADD CONSTRAINT "market_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "market_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_items" ADD CONSTRAINT "market_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "market_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_item_prices" ADD CONSTRAINT "market_item_prices_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "market_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_item_prices" ADD CONSTRAINT "market_item_prices_marketplace_id_fkey" FOREIGN KEY ("marketplace_id") REFERENCES "marketplaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_price_history" ADD CONSTRAINT "market_price_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "market_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_price_history" ADD CONSTRAINT "market_price_history_marketplace_id_fkey" FOREIGN KEY ("marketplace_id") REFERENCES "marketplaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
