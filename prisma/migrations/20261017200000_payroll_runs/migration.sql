-- Payroll runs + lines (with OT fields)
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "label" VARCHAR(120),
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "total_gross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_ot" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_net" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by_membership_id" UUID,
    "paid_at" TIMESTAMPTZ(6),
    "paid_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ix_payroll_runs__tenant_period" ON "payroll_runs"("tenant_id", "period_start");
CREATE INDEX "ix_payroll_runs__tenant_status" ON "payroll_runs"("tenant_id", "status");

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_approved_by_membership_id_fkey"
  FOREIGN KEY ("approved_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_paid_by_membership_id_fkey"
  FOREIGN KEY ("paid_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payroll_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "staff_membership_id" UUID NOT NULL,
    "staff_name" VARCHAR(160) NOT NULL,
    "role_code" VARCHAR(40),
    "pay_type" VARCHAR(16),
    "base_pay" DECIMAL(14,2),
    "regular_hours" DECIMAL(8,2),
    "ot_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "ot_rate" DECIMAL(14,2),
    "ot_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "base_gross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pay_method" VARCHAR(16),
    "paid_at" TIMESTAMPTZ(6),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_payroll_lines__run_member" ON "payroll_lines"("run_id", "staff_membership_id");
CREATE INDEX "ix_payroll_lines__tenant_member" ON "payroll_lines"("tenant_id", "staff_membership_id");

ALTER TABLE "payroll_lines"
  ADD CONSTRAINT "payroll_lines_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_lines"
  ADD CONSTRAINT "payroll_lines_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_lines"
  ADD CONSTRAINT "payroll_lines_staff_membership_id_fkey"
  FOREIGN KEY ("staff_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
