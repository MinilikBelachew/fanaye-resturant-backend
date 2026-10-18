-- HR profile fields on staff membership
ALTER TABLE "tenant_staff_memberships"
  ADD COLUMN IF NOT EXISTS "employee_code" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "job_title" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "employment_type" VARCHAR(24),
  ADD COLUMN IF NOT EXISTS "pay_type" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "base_pay" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "hire_date" DATE,
  ADD COLUMN IF NOT EXISTS "probation_end_date" DATE,
  ADD COLUMN IF NOT EXISTS "emergency_contact_name" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "emergency_contact_phone" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "hr_notes" VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS "annual_leave_balance_days" DECIMAL(6, 2) NOT NULL DEFAULT 0;

-- Leave requests
CREATE TABLE IF NOT EXISTS "staff_leave_requests" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "staff_membership_id" UUID NOT NULL,
  "leave_type" VARCHAR(24) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "days" DECIMAL(6, 2) NOT NULL,
  "reason" VARCHAR(500),
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "decided_by_membership_id" UUID,
  "decided_at" TIMESTAMPTZ(6),
  "decision_note" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_staff_leave_requests__branch_status"
  ON "staff_leave_requests" ("tenant_id", "branch_id", "status");

CREATE INDEX IF NOT EXISTS "ix_staff_leave_requests__member_start"
  ON "staff_leave_requests" ("staff_membership_id", "start_date");

ALTER TABLE "staff_leave_requests"
  ADD CONSTRAINT "staff_leave_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_leave_requests"
  ADD CONSTRAINT "staff_leave_requests_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_leave_requests"
  ADD CONSTRAINT "staff_leave_requests_staff_membership_id_fkey"
  FOREIGN KEY ("staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_leave_requests"
  ADD CONSTRAINT "staff_leave_requests_decided_by_membership_id_fkey"
  FOREIGN KEY ("decided_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
