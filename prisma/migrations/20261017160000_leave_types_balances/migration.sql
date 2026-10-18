-- Custom leave types + per-staff balances (default type: Manual)

CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "tracks_balance" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_leave_types__tenant_name" ON "leave_types"("tenant_id", "name");
CREATE INDEX "ix_leave_types__tenant_active" ON "leave_types"("tenant_id", "is_active");

ALTER TABLE "leave_types"
  ADD CONSTRAINT "leave_types_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "staff_leave_balances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_membership_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "balance_days" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_leave_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_staff_leave_balances__member_type"
  ON "staff_leave_balances"("staff_membership_id", "leave_type_id");
CREATE INDEX "ix_staff_leave_balances__tenant_type"
  ON "staff_leave_balances"("tenant_id", "leave_type_id");

ALTER TABLE "staff_leave_balances"
  ADD CONSTRAINT "staff_leave_balances_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_leave_balances"
  ADD CONSTRAINT "staff_leave_balances_staff_membership_id_fkey"
  FOREIGN KEY ("staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_leave_balances"
  ADD CONSTRAINT "staff_leave_balances_leave_type_id_fkey"
  FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_leave_requests"
  ADD COLUMN "leave_type_id" UUID,
  ALTER COLUMN "leave_type" TYPE VARCHAR(80);

CREATE INDEX "ix_staff_leave_requests__leave_type" ON "staff_leave_requests"("leave_type_id");

ALTER TABLE "staff_leave_requests"
  ADD CONSTRAINT "staff_leave_requests_leave_type_id_fkey"
  FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed Manual leave type per tenant + migrate legacy balances / request links
INSERT INTO "leave_types" ("id", "tenant_id", "name", "tracks_balance", "is_default", "is_active", "sort_order")
SELECT gen_random_uuid(), t."id", 'Manual', true, true, true, 0
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "leave_types" lt WHERE lt."tenant_id" = t."id" AND lt."name" = 'Manual'
);

-- Copy annual leave balance onto Manual for each staff member
INSERT INTO "staff_leave_balances" ("id", "tenant_id", "staff_membership_id", "leave_type_id", "balance_days")
SELECT gen_random_uuid(), m."tenant_id", m."id", lt."id", COALESCE(m."annual_leave_balance_days", 0)
FROM "tenant_staff_memberships" m
JOIN "leave_types" lt ON lt."tenant_id" = m."tenant_id" AND lt."is_default" = true
WHERE NOT EXISTS (
  SELECT 1 FROM "staff_leave_balances" b
  WHERE b."staff_membership_id" = m."id" AND b."leave_type_id" = lt."id"
);

-- Attach existing requests to matching type by name (case-insensitive), else Manual
UPDATE "staff_leave_requests" r
SET "leave_type_id" = COALESCE(
  (
    SELECT lt."id" FROM "leave_types" lt
    WHERE lt."tenant_id" = r."tenant_id"
      AND lower(lt."name") = lower(r."leave_type")
    LIMIT 1
  ),
  (
    SELECT lt."id" FROM "leave_types" lt
    WHERE lt."tenant_id" = r."tenant_id" AND lt."is_default" = true
    LIMIT 1
  )
)
WHERE r."leave_type_id" IS NULL;
