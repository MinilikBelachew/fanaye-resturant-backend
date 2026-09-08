-- Fanaye sprint 1: Tenant → Branch → table_locations → dining_tables

CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(180) NOT NULL,
    "legal_name" VARCHAR(220),
    "status" VARCHAR(24) NOT NULL,
    "default_timezone" VARCHAR(80) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "settings_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_tenants__status" CHECK ("status" IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'CLOSED'))
);

CREATE INDEX "ix_tenants__status" ON "tenants"("status");

CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "display_code" VARCHAR(40),
    "timezone" VARCHAR(80) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "opening_time" TIME(0),
    "closing_time" TIME(0),
    "business_day_cutoff" TIME(0) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_branches__tenant_display_code" UNIQUE ("tenant_id", "display_code"),
    CONSTRAINT "ck_branches__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_branches__tenant_status" ON "branches"("tenant_id", "status");

CREATE TABLE "table_locations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "table_locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_table_locations__branch_code" UNIQUE ("branch_id", "code"),
    CONSTRAINT "uq_table_locations__branch_name" UNIQUE ("branch_id", "name"),
    CONSTRAINT "ck_table_locations__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "table_locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_locations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_table_locations__branch_sort"
ON "table_locations"("tenant_id", "branch_id", "sort_order");

CREATE UNIQUE INDEX "uq_table_locations__active_name"
ON "table_locations"("branch_id", lower("name"))
WHERE "archived_at" IS NULL;

CREATE TABLE "dining_tables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "display_number" VARCHAR(40),
    "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_dining_tables__status" CHECK ("status" IN ('AVAILABLE', 'OCCUPIED', 'INACTIVE')),
    CONSTRAINT "dining_tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "dining_tables_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "dining_tables_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "table_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_dining_tables__location"
ON "dining_tables"("tenant_id", "branch_id", "location_id");

CREATE INDEX "ix_dining_tables__branch_status"
ON "dining_tables"("branch_id", "status");

CREATE UNIQUE INDEX "uq_dining_tables__display_name"
ON "dining_tables"("branch_id", lower("display_name"))
WHERE "archived_at" IS NULL;
