-- Remaining Step H tables: support access + change/cancel/cannot-prepare

CREATE TABLE "platform_support_sessions" (
    "id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "scope_json" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_support_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_platform_support_sessions__status"
      CHECK ("status" IN ('ACTIVE', 'EXPIRED', 'CLOSED', 'REVOKED')),
    CONSTRAINT "platform_support_sessions_platform_user_id_fkey"
      FOREIGN KEY ("platform_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "platform_support_sessions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_platform_support_sessions__tenant_active"
ON "platform_support_sessions"("tenant_id", "status", "started_at" DESC);

CREATE TABLE "order_change_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "requested_by_membership_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "requested_change_json" JSONB NOT NULL,
    "state_at_request" VARCHAR(40) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "decided_by_membership_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_reason" TEXT,

    CONSTRAINT "order_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_order_change_requests__status"
      CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED')),
    CONSTRAINT "order_change_requests_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_change_requests_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_change_requests_order_item_id_fkey"
      FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_change_requests_requested_by_membership_id_fkey"
      FOREIGN KEY ("requested_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_change_requests_decided_by_membership_id_fkey"
      FOREIGN KEY ("decided_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_order_change_requests__one_pending"
ON "order_change_requests"("order_item_id")
WHERE "status" = 'PENDING';

CREATE TABLE "cancellation_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "requested_by_membership_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "state_at_request" VARCHAR(40) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_membership_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_reason" TEXT,

    CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_cancellation_requests__status"
      CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
    CONSTRAINT "cancellation_requests_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cancellation_requests_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cancellation_requests_order_item_id_fkey"
      FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cancellation_requests_requested_by_membership_id_fkey"
      FOREIGN KEY ("requested_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cancellation_requests_decided_by_membership_id_fkey"
      FOREIGN KEY ("decided_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_cancellation_requests__one_pending"
ON "cancellation_requests"("order_item_id")
WHERE "status" = 'PENDING';

CREATE TABLE "production_exceptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "reported_by_membership_id" UUID NOT NULL,
    "reason_code" VARCHAR(60) NOT NULL,
    "reason_detail" TEXT,
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "resolution_type" VARCHAR(32),
    "resolved_by_membership_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_exceptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_production_exceptions__status"
      CHECK ("status" IN ('OPEN', 'RESOLVED')),
    CONSTRAINT "ck_production_exceptions__resolution_type"
      CHECK (
        "resolution_type" IS NULL
        OR "resolution_type" IN ('CANCEL', 'REPLACE', 'REROUTE', 'CONTINUE')
      ),
    CONSTRAINT "production_exceptions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "production_exceptions_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "production_exceptions_order_item_id_fkey"
      FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "production_exceptions_station_id_fkey"
      FOREIGN KEY ("station_id") REFERENCES "preparation_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "production_exceptions_reported_by_membership_id_fkey"
      FOREIGN KEY ("reported_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "production_exceptions_resolved_by_membership_id_fkey"
      FOREIGN KEY ("resolved_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_production_exceptions__one_open"
ON "production_exceptions"("order_item_id")
WHERE "status" = 'OPEN';
