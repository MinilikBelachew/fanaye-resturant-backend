-- Live floor: one party per table, confirmed orders only

CREATE TABLE "table_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
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

    CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_table_sessions__guest_count" CHECK ("guest_count" IS NULL OR "guest_count" > 0),
    CONSTRAINT "ck_table_sessions__status"
      CHECK ("status" IN ('OPEN', 'ACTIVE_ORDER', 'ATTENTION_REQUIRED', 'BILL_REQUESTED', 'BILL_READY', 'PAYMENT_PENDING', 'PAID', 'CLOSED')),
    CONSTRAINT "table_sessions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_sessions_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_sessions_table_id_fkey"
      FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_sessions_primary_waiter_membership_id_fkey"
      FOREIGN KEY ("primary_waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_sessions_primary_waiter_shift_session_id_fkey"
      FOREIGN KEY ("primary_waiter_shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_sessions_closed_by_membership_id_fkey"
      FOREIGN KEY ("closed_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_table_sessions__one_active_per_table"
ON "table_sessions"("table_id")
WHERE "closed_at" IS NULL AND "status" <> 'CLOSED';

CREATE INDEX "ix_table_sessions__waiter_active"
ON "table_sessions"("tenant_id", "branch_id", "primary_waiter_membership_id", "status")
WHERE "closed_at" IS NULL;

CREATE INDEX "ix_table_sessions__branch_business_date"
ON "table_sessions"("tenant_id", "branch_id", "business_date", "opened_at");

CREATE TABLE "table_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_session_id" UUID NOT NULL,
    "waiter_membership_id" UUID NOT NULL,
    "shift_session_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),
    "assigned_by_membership_id" UUID,
    "reason" TEXT,

    CONSTRAINT "table_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "table_assignments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_assignments_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_assignments_table_session_id_fkey"
      FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_assignments_waiter_membership_id_fkey"
      FOREIGN KEY ("waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_assignments_shift_session_id_fkey"
      FOREIGN KEY ("shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "table_assignments_assigned_by_membership_id_fkey"
      FOREIGN KEY ("assigned_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_table_assignments__one_current"
ON "table_assignments"("table_session_id")
WHERE "released_at" IS NULL;

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "table_session_id" UUID NOT NULL,
    "created_by_waiter_membership_id" UUID NOT NULL,
    "waiter_shift_session_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_orders__status"
      CHECK ("status" IN ('CONFIRMED', 'IN_FULFILLMENT', 'PARTIALLY_SERVED', 'SERVED', 'CANCELLED', 'CLOSED')),
    CONSTRAINT "orders_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orders_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orders_table_session_id_fkey"
      FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orders_created_by_waiter_membership_id_fkey"
      FOREIGN KEY ("created_by_waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orders_waiter_shift_session_id_fkey"
      FOREIGN KEY ("waiter_shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_orders__table_session"
ON "orders"("tenant_id", "table_session_id", "confirmed_at");

CREATE INDEX "ix_orders__waiter_business_date"
ON "orders"("tenant_id", "branch_id", "business_date", "created_by_waiter_membership_id");

CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "order_id" UUID NOT NULL,
    "table_session_id" UUID NOT NULL,
    "menu_item_id" UUID,
    "item_name_snapshot" VARCHAR(180) NOT NULL,
    "unit_price_snapshot" NUMERIC(19, 2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "quantity" INTEGER NOT NULL,
    "original_preparation_station_id" UUID NOT NULL,
    "current_preparation_station_id" UUID NOT NULL,
    "station_name_snapshot" VARCHAR(120) NOT NULL,
    "expected_prep_minutes_snapshot" INTEGER,
    "special_instruction" TEXT,
    "state" VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queued_at" TIMESTAMPTZ(6),
    "acknowledged_at" TIMESTAMPTZ(6),
    "preparation_started_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "served_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_membership_id" UUID,
    "cancellation_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_order_items__quantity" CHECK ("quantity" > 0),
    CONSTRAINT "ck_order_items__price" CHECK ("unit_price_snapshot" >= 0),
    CONSTRAINT "ck_order_items__state"
      CHECK ("state" IN (
        'CONFIRMED', 'QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION', 'READY', 'SERVED',
        'CANCELLATION_REQUESTED', 'CANCELLED', 'CHANGE_REQUESTED', 'BLOCKED', 'REJECTED_BY_STATION'
      )),
    CONSTRAINT "order_items_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_items_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_items_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_items_table_session_id_fkey"
      FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_items_menu_item_id_fkey"
      FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "order_items_original_preparation_station_id_fkey"
      FOREIGN KEY ("original_preparation_station_id") REFERENCES "preparation_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_items_current_preparation_station_id_fkey"
      FOREIGN KEY ("current_preparation_station_id") REFERENCES "preparation_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_items_cancelled_by_membership_id_fkey"
      FOREIGN KEY ("cancelled_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_order_items__station_queue"
ON "order_items"("tenant_id", "branch_id", "current_preparation_station_id", "state", "queued_at")
WHERE "state" IN (
  'QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION', 'READY',
  'CANCELLATION_REQUESTED', 'BLOCKED', 'REJECTED_BY_STATION'
);

CREATE INDEX "ix_order_items__table_live"
ON "order_items"("tenant_id", "table_session_id", "state", "confirmed_at");

CREATE TABLE "order_item_modifiers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "modifier_group_id" UUID,
    "modifier_option_id" UUID,
    "group_name_snapshot" VARCHAR(120) NOT NULL,
    "option_name_snapshot" VARCHAR(120) NOT NULL,
    "price_delta_snapshot" NUMERIC(19, 2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_item_modifiers_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_item_modifiers_order_item_id_fkey"
      FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ix_order_item_modifiers__item" ON "order_item_modifiers"("order_item_id");
