-- Notifications, append-only audit, operational daily close, idempotency

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "recipient_staff_membership_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "related_entity_type" VARCHAR(50),
    "related_entity_id" UUID,
    "title" VARCHAR(180) NOT NULL,
    "body" TEXT,
    "payload_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    "acknowledged_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_notifications__severity"
      CHECK ("severity" IN ('INFO', 'ATTENTION', 'URGENT')),
    CONSTRAINT "notifications_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notifications_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notifications_recipient_staff_membership_id_fkey"
      FOREIGN KEY ("recipient_staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_notifications__recipient_unread"
ON "notifications"("recipient_staff_membership_id", "created_at" DESC)
WHERE "read_at" IS NULL;

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "branch_id" UUID,
    "actor_user_id" UUID,
    "actor_staff_membership_id" UUID,
    "actor_platform_role" VARCHAR(40),
    "actor_restaurant_role" VARCHAR(40),
    "actor_shift_session_id" UUID,
    "support_session_id" UUID,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "previous_state_json" JSONB,
    "new_state_json" JSONB,
    "reason" TEXT,
    "metadata_json" JSONB,
    "correlation_id" UUID,
    "idempotency_command_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_events_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audit_events_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audit_events_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_events_actor_staff_membership_id_fkey"
      FOREIGN KEY ("actor_staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_events_actor_shift_session_id_fkey"
      FOREIGN KEY ("actor_shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_audit_events__entity"
ON "audit_events"("tenant_id", "entity_type", "entity_id", "occurred_at" DESC);

CREATE INDEX "ix_audit_events__actor"
ON "audit_events"("tenant_id", "actor_staff_membership_id", "occurred_at" DESC);

CREATE INDEX "ix_audit_events__branch_time"
ON "audit_events"("tenant_id", "branch_id", "occurred_at" DESC);

CREATE TABLE "operational_daily_closes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by_membership_id" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by_membership_id" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by_membership_id" UUID,
    "gross_order_value" NUMERIC(19, 2) NOT NULL,
    "cancelled_value" NUMERIC(19, 2) NOT NULL,
    "net_billed_sales" NUMERIC(19, 2) NOT NULL,
    "cash_sales" NUMERIC(19, 2) NOT NULL,
    "verified_transfer_sales" NUMERIC(19, 2) NOT NULL,
    "pending_transfer_amount" NUMERIC(19, 2) NOT NULL,
    "suspicious_transfer_amount" NUMERIC(19, 2) NOT NULL,
    "cashier_expected_cash" NUMERIC(19, 2) NOT NULL,
    "cashier_counted_cash" NUMERIC(19, 2) NOT NULL,
    "cashier_variance" NUMERIC(19, 2) NOT NULL,
    "undropped_waiter_cash" NUMERIC(19, 2) NOT NULL,
    "table_count" INTEGER NOT NULL,
    "order_count" INTEGER NOT NULL,
    "item_count" INTEGER NOT NULL,
    "manager_override_count" INTEGER NOT NULL,
    "blocking_issues_json" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_daily_closes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_operational_daily_closes__branch_business_date" UNIQUE ("branch_id", "business_date"),
    CONSTRAINT "ck_operational_daily_closes__status"
      CHECK ("status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'LOCKED')),
    CONSTRAINT "operational_daily_closes_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operational_daily_closes_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operational_daily_closes_generated_by_membership_id_fkey"
      FOREIGN KEY ("generated_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operational_daily_closes_approved_by_membership_id_fkey"
      FOREIGN KEY ("approved_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "operational_daily_closes_locked_by_membership_id_fkey"
      FOREIGN KEY ("locked_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "daily_close_waiter_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "daily_close_id" UUID NOT NULL,
    "waiter_membership_id" UUID NOT NULL,
    "shift_session_id" UUID NOT NULL,
    "orders_created_count" INTEGER NOT NULL,
    "tables_served_count" INTEGER NOT NULL,
    "gross_attributed_sales" NUMERIC(19, 2) NOT NULL,
    "cancelled_attributed_value" NUMERIC(19, 2) NOT NULL,
    "net_attributed_sales" NUMERIC(19, 2) NOT NULL,
    "cash_collected" NUMERIC(19, 2) NOT NULL,
    "cash_dropped" NUMERIC(19, 2) NOT NULL,
    "undropped_cash" NUMERIC(19, 2) NOT NULL,
    "verified_transfer_amount" NUMERIC(19, 2) NOT NULL,
    "rejected_or_suspicious_transfer_count" INTEGER NOT NULL,
    "payment_exception_count" INTEGER NOT NULL,

    CONSTRAINT "daily_close_waiter_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_daily_close_waiter_lines__waiter_shift"
      UNIQUE ("daily_close_id", "waiter_membership_id", "shift_session_id"),
    CONSTRAINT "daily_close_waiter_lines_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "daily_close_waiter_lines_daily_close_id_fkey"
      FOREIGN KEY ("daily_close_id") REFERENCES "operational_daily_closes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "daily_close_waiter_lines_waiter_membership_id_fkey"
      FOREIGN KEY ("waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "daily_close_waiter_lines_shift_session_id_fkey"
      FOREIGN KEY ("shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "daily_close_station_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "daily_close_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "station_name_snapshot" VARCHAR(120) NOT NULL,
    "items_handled_count" INTEGER NOT NULL,
    "average_queue_seconds" INTEGER,
    "average_preparation_seconds" INTEGER,
    "average_ready_to_serve_seconds" INTEGER,
    "delayed_item_count" INTEGER NOT NULL,
    "cannot_prepare_count" INTEGER NOT NULL,

    CONSTRAINT "daily_close_station_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_daily_close_station_lines__station" UNIQUE ("daily_close_id", "station_id"),
    CONSTRAINT "daily_close_station_lines_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "daily_close_station_lines_daily_close_id_fkey"
      FOREIGN KEY ("daily_close_id") REFERENCES "operational_daily_closes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "daily_close_station_lines_station_id_fkey"
      FOREIGN KEY ("station_id") REFERENCES "preparation_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "idempotency_commands" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_staff_membership_id" UUID,
    "command_type" VARCHAR(80) NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "resource_type" VARCHAR(60),
    "resource_id" UUID,
    "response_status_code" INTEGER,
    "response_body_json" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "idempotency_commands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_idempotency_commands__actor_key"
      UNIQUE ("tenant_id", "actor_user_id", "command_type", "idempotency_key"),
    CONSTRAINT "ck_idempotency_commands__status"
      CHECK ("status" IN ('IN_PROGRESS', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT "idempotency_commands_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "idempotency_commands_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "idempotency_commands_actor_staff_membership_id_fkey"
      FOREIGN KEY ("actor_staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
