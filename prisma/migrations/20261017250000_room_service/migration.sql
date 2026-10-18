-- Room service feature flags
ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "room_service_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "breakfast_entitlement_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "breakfast_valid_from_local" VARCHAR(5) NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS "breakfast_valid_to_local" VARCHAR(5) NOT NULL DEFAULT '10:30',
  ADD COLUMN IF NOT EXISTS "breakfast_menu_item_id" UUID;

DO $$ BEGIN
  ALTER TABLE "tenant_settings"
    ADD CONSTRAINT "tenant_settings_breakfast_menu_item_id_fkey"
    FOREIGN KEY ("breakfast_menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lodging tables
CREATE TABLE IF NOT EXISTS "hotel_rooms" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "room_number" VARCHAR(40) NOT NULL,
  "floor" VARCHAR(40),
  "wing" VARCHAR(40),
  "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  "default_waiter_membership_id" UUID,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),
  CONSTRAINT "hotel_rooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hotel_rooms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hotel_rooms_default_waiter_membership_id_fkey" FOREIGN KEY ("default_waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_hotel_rooms__branch_number" ON "hotel_rooms"("branch_id", "room_number");
CREATE INDEX IF NOT EXISTS "ix_hotel_rooms__branch_status" ON "hotel_rooms"("tenant_id", "branch_id", "status", "sort_order");

CREATE TABLE IF NOT EXISTS "room_stays" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "hotel_room_id" UUID NOT NULL,
  "guest_name" VARCHAR(120) NOT NULL,
  "guest_phone" VARCHAR(40),
  "adults" INTEGER NOT NULL DEFAULT 1,
  "kids" INTEGER NOT NULL DEFAULT 0,
  "meal_plan" VARCHAR(24) NOT NULL DEFAULT 'NONE',
  "status" VARCHAR(24) NOT NULL DEFAULT 'IN_HOUSE',
  "check_in_at" TIMESTAMPTZ(6) NOT NULL,
  "planned_check_out_at" TIMESTAMPTZ(6) NOT NULL,
  "checked_out_at" TIMESTAMPTZ(6),
  "checked_in_by_membership_id" UUID NOT NULL,
  "checked_out_by_membership_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "room_stays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_stays_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_stays_hotel_room_id_fkey" FOREIGN KEY ("hotel_room_id") REFERENCES "hotel_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_stays_checked_in_by_membership_id_fkey" FOREIGN KEY ("checked_in_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_stays_checked_out_by_membership_id_fkey" FOREIGN KEY ("checked_out_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ix_room_stays__branch_status" ON "room_stays"("tenant_id", "branch_id", "status", "check_in_at");
CREATE INDEX IF NOT EXISTS "ix_room_stays__room_status" ON "room_stays"("hotel_room_id", "status");

CREATE TABLE IF NOT EXISTS "room_sessions" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "hotel_room_id" UUID NOT NULL,
  "room_stay_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "primary_waiter_membership_id" UUID NOT NULL,
  "primary_waiter_shift_session_id" UUID NOT NULL,
  "guest_count" INTEGER,
  "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bill_requested_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "closed_by_membership_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "room_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_sessions_hotel_room_id_fkey" FOREIGN KEY ("hotel_room_id") REFERENCES "hotel_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_sessions_room_stay_id_fkey" FOREIGN KEY ("room_stay_id") REFERENCES "room_stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_sessions_primary_waiter_membership_id_fkey" FOREIGN KEY ("primary_waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_sessions_primary_waiter_shift_session_id_fkey" FOREIGN KEY ("primary_waiter_shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_sessions_closed_by_membership_id_fkey" FOREIGN KEY ("closed_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ix_room_sessions__branch_business_date" ON "room_sessions"("tenant_id", "branch_id", "business_date", "opened_at");
CREATE INDEX IF NOT EXISTS "ix_room_sessions__branch_status" ON "room_sessions"("branch_id", "status");
CREATE INDEX IF NOT EXISTS "ix_room_sessions__waiter_status" ON "room_sessions"("primary_waiter_membership_id", "status");

CREATE TABLE IF NOT EXISTS "stay_meal_entitlements" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "room_stay_id" UUID NOT NULL,
  "meal_type" VARCHAR(24) NOT NULL DEFAULT 'BREAKFAST',
  "business_date" DATE NOT NULL,
  "qty_allowed" INTEGER NOT NULL,
  "qty_used" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stay_meal_entitlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stay_meal_entitlements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stay_meal_entitlements_room_stay_id_fkey" FOREIGN KEY ("room_stay_id") REFERENCES "room_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_stay_meal_entitlements__stay_meal_date" ON "stay_meal_entitlements"("room_stay_id", "meal_type", "business_date");
CREATE INDEX IF NOT EXISTS "ix_stay_meal_entitlements__branch_date" ON "stay_meal_entitlements"("tenant_id", "branch_id", "business_date");

CREATE TABLE IF NOT EXISTS "room_floor_coverages" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "floor" VARCHAR(40) NOT NULL,
  "waiter_membership_id" UUID NOT NULL,
  "shift_definition_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "room_floor_coverages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_floor_coverages_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_floor_coverages_waiter_membership_id_fkey" FOREIGN KEY ("waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_floor_coverages_shift_definition_id_fkey" FOREIGN KEY ("shift_definition_id") REFERENCES "shift_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_room_floor_coverages__branch_floor_waiter_shift"
  ON "room_floor_coverages"("branch_id", "floor", "waiter_membership_id", "shift_definition_id");
CREATE INDEX IF NOT EXISTS "ix_room_floor_coverages__waiter" ON "room_floor_coverages"("branch_id", "waiter_membership_id");

-- Orders / bills XOR room session
ALTER TABLE "orders" ALTER COLUMN "table_session_id" DROP NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "room_session_id" UUID;
DO $$ BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_room_session_id_fkey"
    FOREIGN KEY ("room_session_id") REFERENCES "room_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ix_orders__room_session" ON "orders"("tenant_id", "room_session_id", "confirmed_at");

ALTER TABLE "order_items" ALTER COLUMN "table_session_id" DROP NOT NULL;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "room_session_id" UUID;
DO $$ BEGIN
  ALTER TABLE "order_items"
    ADD CONSTRAINT "order_items_room_session_id_fkey"
    FOREIGN KEY ("room_session_id") REFERENCES "room_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ix_order_items__room_live" ON "order_items"("tenant_id", "room_session_id", "state", "confirmed_at");

ALTER TABLE "bill_requests" ALTER COLUMN "table_session_id" DROP NOT NULL;
ALTER TABLE "bill_requests" ADD COLUMN IF NOT EXISTS "room_session_id" UUID;
DO $$ BEGIN
  ALTER TABLE "bill_requests"
    ADD CONSTRAINT "bill_requests_room_session_id_fkey"
    FOREIGN KEY ("room_session_id") REFERENCES "room_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "bills" ALTER COLUMN "table_session_id" DROP NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "room_session_id" UUID;
DO $$ BEGIN
  ALTER TABLE "bills"
    ADD CONSTRAINT "bills_room_session_id_fkey"
    FOREIGN KEY ("room_session_id") REFERENCES "room_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "bills_room_session_id_key" ON "bills"("room_session_id");

-- Receptionist role
ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "ck_roles__code";
ALTER TABLE "roles" ADD CONSTRAINT "ck_roles__code"
  CHECK ("code" IN (
    'OWNER_ADMIN',
    'MANAGER',
    'WAITER',
    'CASHIER',
    'STATION_OPERATOR',
    'DISPATCHER',
    'STORE_MANAGER',
    'RECEPTIONIST'
  ));

INSERT INTO "roles" ("id", "code", "name", "is_system")
VALUES (8, 'RECEPTIONIST', 'Receptionist', true)
ON CONFLICT ("id") DO UPDATE
SET "code" = EXCLUDED."code",
    "name" = EXCLUDED."name";
