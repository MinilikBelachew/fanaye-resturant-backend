-- AlterTable
ALTER TABLE "branch_settings" ADD COLUMN     "floor_kiosk_pin" VARCHAR(12),
ADD COLUMN     "ready_overdue_minutes" INTEGER NOT NULL DEFAULT 3;
