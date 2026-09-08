-- Stations + menu. Every orderable item must point at a station.

CREATE TABLE "preparation_stations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(60),
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "default_delay_threshold_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "preparation_stations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_preparation_stations__branch_code" UNIQUE ("branch_id", "code"),
    CONSTRAINT "ck_preparation_stations__status"
      CHECK ("status" IN ('ACTIVE', 'TEMPORARILY_UNAVAILABLE', 'INACTIVE')),
    CONSTRAINT "preparation_stations_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "preparation_stations_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_preparation_stations__branch_status"
ON "preparation_stations"("tenant_id", "branch_id", "status");

CREATE TABLE "station_staff_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "staff_membership_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),

    CONSTRAINT "station_staff_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_station_staff_assignments__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "station_staff_assignments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "station_staff_assignments_station_id_fkey"
      FOREIGN KEY ("station_id") REFERENCES "preparation_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "station_staff_assignments_staff_membership_id_fkey"
      FOREIGN KEY ("staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_station_staff_assignments__station"
ON "station_staff_assignments"("station_id", "status");

CREATE UNIQUE INDEX "uq_station_staff_assignments__current"
ON "station_staff_assignments"("station_id", "staff_membership_id")
WHERE "status" = 'ACTIVE' AND "released_at" IS NULL;

CREATE TABLE "station_fallback_configurations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "source_station_id" UUID NOT NULL,
    "fallback_station_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "station_fallback_configurations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_station_fallback__different"
      CHECK ("source_station_id" <> "fallback_station_id"),
    CONSTRAINT "station_fallback_configurations_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "station_fallback_configurations_source_station_id_fkey"
      FOREIGN KEY ("source_station_id") REFERENCES "preparation_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "station_fallback_configurations_fallback_station_id_fkey"
      FOREIGN KEY ("fallback_station_id") REFERENCES "preparation_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "station_fallback_configurations_created_by_membership_id_fkey"
      FOREIGN KEY ("created_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_station_fallback__one_active"
ON "station_fallback_configurations"("source_station_id")
WHERE "status" = 'ACTIVE';

CREATE TABLE "menus" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "name" VARCHAR(140) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_menus__status" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'INACTIVE')),
    CONSTRAINT "menus_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "menus_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_menus__tenant_status" ON "menus"("tenant_id", "status");

CREATE TABLE "menu_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "start_local_time" TIME(0) NOT NULL,
    "end_local_time" TIME(0) NOT NULL,
    "days_of_week" INTEGER[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "menu_periods_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "menu_periods_menu_id_fkey"
      FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ix_menu_periods__menu" ON "menu_periods"("menu_id", "status");

CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "menu_categories_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "menu_categories_menu_id_fkey"
      FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ix_menu_categories__menu_sort" ON "menu_categories"("menu_id", "sort_order");

CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "menu_category_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "current_price" NUMERIC(19, 2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "preparation_station_id" UUID NOT NULL,
    "expected_prep_minutes" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "sold_out" BOOLEAN NOT NULL DEFAULT FALSE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_menu_items__price" CHECK ("current_price" >= 0),
    CONSTRAINT "ck_menu_items__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "menu_items_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "menu_items_menu_id_fkey"
      FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "menu_items_menu_category_id_fkey"
      FOREIGN KEY ("menu_category_id") REFERENCES "menu_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "menu_items_preparation_station_id_fkey"
      FOREIGN KEY ("preparation_station_id") REFERENCES "preparation_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_menu_items__menu_active"
ON "menu_items"("tenant_id", "menu_id", "status", "sold_out", "sort_order");

CREATE TABLE "menu_item_period_assignments" (
    "menu_item_id" UUID NOT NULL,
    "menu_period_id" UUID NOT NULL,

    CONSTRAINT "menu_item_period_assignments_pkey" PRIMARY KEY ("menu_item_id", "menu_period_id"),
    CONSTRAINT "menu_item_period_assignments_menu_item_id_fkey"
      FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "menu_item_period_assignments_menu_period_id_fkey"
      FOREIGN KEY ("menu_period_id") REFERENCES "menu_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "item_availability_overrides" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "state" VARCHAR(32) NOT NULL,
    "reason" TEXT NOT NULL,
    "set_by_membership_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_availability_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_item_availability_overrides__state"
      CHECK ("state" IN ('SOLD_OUT', 'TEMPORARILY_DISABLED')),
    CONSTRAINT "item_availability_overrides_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "item_availability_overrides_menu_item_id_fkey"
      FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "item_availability_overrides_set_by_membership_id_fkey"
      FOREIGN KEY ("set_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_item_availability_overrides__item"
ON "item_availability_overrides"("branch_id", "menu_item_id", "ends_at");

CREATE TABLE "modifier_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "required_default" BOOLEAN NOT NULL DEFAULT FALSE,
    "min_selections" INTEGER NOT NULL DEFAULT 0,
    "max_selections" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_modifier_groups__selection"
      CHECK ("min_selections" >= 0 AND "max_selections" >= "min_selections"),
    CONSTRAINT "modifier_groups_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "modifier_groups_menu_id_fkey"
      FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_modifier_groups__tenant" ON "modifier_groups"("tenant_id", "status");

CREATE TABLE "modifier_options" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "price_delta" NUMERIC(19, 2) NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "modifier_options_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "modifier_options_modifier_group_id_fkey"
      FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ix_modifier_options__group"
ON "modifier_options"("modifier_group_id", "sort_order");

CREATE TABLE "menu_item_modifier_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "required_override" BOOLEAN,
    "min_selections_override" INTEGER,
    "max_selections_override" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_modifier_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_menu_item_modifier_assignments" UNIQUE ("menu_item_id", "modifier_group_id"),
    CONSTRAINT "menu_item_modifier_assignments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "menu_item_modifier_assignments_menu_item_id_fkey"
      FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "menu_item_modifier_assignments_modifier_group_id_fkey"
      FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
