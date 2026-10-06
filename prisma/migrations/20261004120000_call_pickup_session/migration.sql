-- AlterTable
ALTER TABLE "table_sessions" ADD COLUMN IF NOT EXISTS "session_kind" VARCHAR(32) NOT NULL DEFAULT 'DINE_IN';
ALTER TABLE "table_sessions" ADD COLUMN IF NOT EXISTS "customer_name" VARCHAR(120);
ALTER TABLE "table_sessions" ADD COLUMN IF NOT EXISTS "customer_phone" VARCHAR(40);

CREATE INDEX IF NOT EXISTS "ix_table_sessions__branch_session_kind"
  ON "table_sessions" ("branch_id", "session_kind", "status");
