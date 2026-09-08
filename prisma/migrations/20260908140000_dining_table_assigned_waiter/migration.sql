-- AlterTable
ALTER TABLE "dining_tables" ADD COLUMN IF NOT EXISTS "assigned_waiter_membership_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_dining_tables__assigned_waiter" ON "dining_tables"("assigned_waiter_membership_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dining_tables_assigned_waiter_membership_id_fkey'
  ) THEN
    ALTER TABLE "dining_tables"
      ADD CONSTRAINT "dining_tables_assigned_waiter_membership_id_fkey"
      FOREIGN KEY ("assigned_waiter_membership_id")
      REFERENCES "tenant_staff_memberships"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
