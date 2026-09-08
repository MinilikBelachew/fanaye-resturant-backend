-- Branch settings + restaurant staff / RBAC

CREATE TABLE "branch_settings" (
    "branch_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "waiter_may_close_paid_table_override" BOOLEAN,
    "cashier_may_collect_customer_payment_override" BOOLEAN,
    "station_delay_default_minutes" INTEGER,
    "shift_end_warning_minutes" INTEGER NOT NULL DEFAULT 15,
    "bill_unresolved_production_policy_override" VARCHAR(40),
    "settings_version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_membership_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_settings_pkey" PRIMARY KEY ("branch_id"),
    CONSTRAINT "branch_settings_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "branch_settings_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "roles" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "roles_code_key" UNIQUE ("code"),
    CONSTRAINT "ck_roles__code"
      CHECK ("code" IN ('OWNER_ADMIN', 'MANAGER', 'WAITER', 'CASHIER', 'STATION_OPERATOR'))
);

CREATE TABLE "permissions" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "domain" VARCHAR(40) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "permissions_code_key" UNIQUE ("code")
);

CREATE TABLE "role_permissions" (
    "role_id" SMALLINT NOT NULL,
    "permission_id" SMALLINT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id"),
    CONSTRAINT "role_permissions_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_permissions_permission_id_fkey"
      FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "tenant_staff_memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_display_name" VARCHAR(160) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(6),
    "deactivated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_staff_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_tenant_staff_memberships__tenant_user" UNIQUE ("tenant_id", "user_id"),
    CONSTRAINT "ck_tenant_staff_memberships__status"
      CHECK ("status" IN ('INVITED', 'ACTIVE', 'INACTIVE', 'SUSPENDED')),
    CONSTRAINT "tenant_staff_memberships_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tenant_staff_memberships_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_tenant_staff_memberships__tenant_status"
ON "tenant_staff_memberships"("tenant_id", "status");

CREATE TABLE "branch_staff_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "staff_membership_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),

    CONSTRAINT "branch_staff_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_branch_staff_assignments__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "branch_staff_assignments_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "branch_staff_assignments_staff_membership_id_fkey"
      FOREIGN KEY ("staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_branch_staff_assignments__branch_status"
ON "branch_staff_assignments"("branch_id", "status");

CREATE UNIQUE INDEX "uq_branch_staff_assignments__current"
ON "branch_staff_assignments"("branch_id", "staff_membership_id")
WHERE "released_at" IS NULL AND "status" = 'ACTIVE';

CREATE TABLE "staff_role_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_membership_id" UUID NOT NULL,
    "role_id" SMALLINT NOT NULL,
    "branch_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "granted_by_membership_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "staff_role_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_staff_role_assignments__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "staff_role_assignments_staff_membership_id_fkey"
      FOREIGN KEY ("staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staff_role_assignments_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staff_role_assignments_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staff_role_assignments_granted_by_membership_id_fkey"
      FOREIGN KEY ("granted_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_staff_role_assignments__membership_status"
ON "staff_role_assignments"("staff_membership_id", "status");

CREATE UNIQUE INDEX "uq_staff_role_assignments__tenant_scope"
ON "staff_role_assignments"("staff_membership_id", "role_id")
WHERE "branch_id" IS NULL AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "uq_staff_role_assignments__branch_scope"
ON "staff_role_assignments"("staff_membership_id", "role_id", "branch_id")
WHERE "branch_id" IS NOT NULL AND "status" = 'ACTIVE';

ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_updated_by_membership_id_fkey"
  FOREIGN KEY ("updated_by_membership_id") REFERENCES "tenant_staff_memberships"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_settings"
  ADD CONSTRAINT "branch_settings_updated_by_membership_id_fkey"
  FOREIGN KEY ("updated_by_membership_id") REFERENCES "tenant_staff_memberships"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
