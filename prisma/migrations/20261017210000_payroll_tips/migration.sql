-- Tip amounts on payroll lines + run rollup
ALTER TABLE "payroll_runs"
  ADD COLUMN IF NOT EXISTS "total_tips" DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE "payroll_lines"
  ADD COLUMN IF NOT EXISTS "tip_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;
