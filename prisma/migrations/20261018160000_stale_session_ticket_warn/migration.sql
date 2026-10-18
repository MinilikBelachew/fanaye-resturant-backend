-- Idle / stale warn thresholds + one-shot alert timestamps

ALTER TABLE "branch_settings"
  ADD COLUMN IF NOT EXISTS "session_idle_warn_minutes" INTEGER NOT NULL DEFAULT 240,
  ADD COLUMN IF NOT EXISTS "ticket_stale_warn_minutes" INTEGER NOT NULL DEFAULT 180;

ALTER TABLE "table_sessions"
  ADD COLUMN IF NOT EXISTS "idle_alert_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "close_reason" TEXT;

ALTER TABLE "room_sessions"
  ADD COLUMN IF NOT EXISTS "idle_alert_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "close_reason" TEXT;

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "stale_warn_alert_sent_at" TIMESTAMPTZ(6);
