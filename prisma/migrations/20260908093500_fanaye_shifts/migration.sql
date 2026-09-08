-- Shifts: planned roster + actual clock-in

CREATE TABLE "shift_definitions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "start_local_time" TIME(0) NOT NULL,
    "end_local_time" TIME(0) NOT NULL,
    "grace_minutes" INTEGER NOT NULL DEFAULT 15,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_shift_definitions__grace" CHECK ("grace_minutes" >= 0),
    CONSTRAINT "ck_shift_definitions__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "shift_definitions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_definitions_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_shift_definitions__branch_status"
ON "shift_definitions"("tenant_id", "branch_id", "status");

CREATE TABLE "shift_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "staff_membership_id" UUID NOT NULL,
    "shift_definition_id" UUID,
    "scheduled_start_at" TIMESTAMPTZ(6) NOT NULL,
    "scheduled_end_at" TIMESTAMPTZ(6) NOT NULL,
    "grace_minutes" INTEGER NOT NULL DEFAULT 15,
    "role_id" SMALLINT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_shift_assignments__status"
      CHECK ("status" IN ('SCHEDULED', 'CANCELLED', 'COMPLETED')),
    CONSTRAINT "shift_assignments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_assignments_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_assignments_staff_membership_id_fkey"
      FOREIGN KEY ("staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_assignments_shift_definition_id_fkey"
      FOREIGN KEY ("shift_definition_id") REFERENCES "shift_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shift_assignments_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_shift_assignments__branch_start"
ON "shift_assignments"("tenant_id", "branch_id", "scheduled_start_at");

CREATE TABLE "shift_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "shift_assignment_id" UUID,
    "staff_membership_id" UUID NOT NULL,
    "role_id" SMALLINT,
    "scheduled_start_at_snapshot" TIMESTAMPTZ(6),
    "scheduled_end_at_snapshot" TIMESTAMPTZ(6),
    "grace_minutes_snapshot" INTEGER NOT NULL DEFAULT 15,
    "clock_in_at" TIMESTAMPTZ(6) NOT NULL,
    "clock_out_at" TIMESTAMPTZ(6),
    "late_by_minutes" INTEGER NOT NULL DEFAULT 0,
    "state" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "business_date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_shift_sessions__state"
      CHECK ("state" IN ('OPEN', 'GRACE', 'SAFE_LOCK_PENDING', 'CLOSING', 'CLOSED')),
    CONSTRAINT "shift_sessions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_sessions_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_sessions_shift_assignment_id_fkey"
      FOREIGN KEY ("shift_assignment_id") REFERENCES "shift_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shift_sessions_staff_membership_id_fkey"
      FOREIGN KEY ("staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_sessions_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_shift_sessions__branch_business_date"
ON "shift_sessions"("tenant_id", "branch_id", "business_date", "state");

CREATE UNIQUE INDEX "uq_shift_sessions__one_open_per_staff_branch"
ON "shift_sessions"("staff_membership_id", "branch_id")
WHERE "clock_out_at" IS NULL AND "state" <> 'CLOSED';
