-- AlterTable
ALTER TABLE "branch_settings" ADD COLUMN     "rush_mode_buffer_minutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "rush_mode_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unacknowledged_alert_minutes" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "delay_alert_sent_at" TIMESTAMPTZ(6),
ADD COLUMN     "unacknowledged_alert_sent_at" TIMESTAMPTZ(6);
