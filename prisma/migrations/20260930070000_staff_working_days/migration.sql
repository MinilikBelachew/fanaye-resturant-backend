-- AlterTable
ALTER TABLE "tenant_staff_memberships" ADD COLUMN "working_days" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
