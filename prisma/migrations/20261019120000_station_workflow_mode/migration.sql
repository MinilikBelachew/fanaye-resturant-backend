-- Station workflow: FULL_PREP (kitchen) vs QUICK_SERVE (bar / soft drinks)
ALTER TABLE "preparation_stations"
ADD COLUMN IF NOT EXISTS "workflow_mode" VARCHAR(20) NOT NULL DEFAULT 'FULL_PREP';
