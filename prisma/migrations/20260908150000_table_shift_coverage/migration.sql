-- CreateTable
CREATE TABLE IF NOT EXISTS "dining_table_shift_coverages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "dining_table_id" UUID NOT NULL,
    "shift_definition_id" UUID NOT NULL,
    "waiter_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dining_table_shift_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_dining_table_shift_coverages__table_shift"
  ON "dining_table_shift_coverages"("dining_table_id", "shift_definition_id");

CREATE INDEX IF NOT EXISTS "ix_dining_table_shift_coverages__waiter_shift"
  ON "dining_table_shift_coverages"("waiter_membership_id", "shift_definition_id");

CREATE INDEX IF NOT EXISTS "ix_dining_table_shift_coverages__branch_shift"
  ON "dining_table_shift_coverages"("branch_id", "shift_definition_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dining_table_shift_coverages_tenant_id_fkey') THEN
    ALTER TABLE "dining_table_shift_coverages"
      ADD CONSTRAINT "dining_table_shift_coverages_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dining_table_shift_coverages_branch_id_fkey') THEN
    ALTER TABLE "dining_table_shift_coverages"
      ADD CONSTRAINT "dining_table_shift_coverages_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dining_table_shift_coverages_dining_table_id_fkey') THEN
    ALTER TABLE "dining_table_shift_coverages"
      ADD CONSTRAINT "dining_table_shift_coverages_dining_table_id_fkey"
      FOREIGN KEY ("dining_table_id") REFERENCES "dining_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dining_table_shift_coverages_shift_definition_id_fkey') THEN
    ALTER TABLE "dining_table_shift_coverages"
      ADD CONSTRAINT "dining_table_shift_coverages_shift_definition_id_fkey"
      FOREIGN KEY ("shift_definition_id") REFERENCES "shift_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dining_table_shift_coverages_waiter_membership_id_fkey') THEN
    ALTER TABLE "dining_table_shift_coverages"
      ADD CONSTRAINT "dining_table_shift_coverages_waiter_membership_id_fkey"
      FOREIGN KEY ("waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Seed coverage: copy permanent table assignment onto every active shift for that branch
INSERT INTO "dining_table_shift_coverages" (
  "id", "tenant_id", "branch_id", "dining_table_id", "shift_definition_id", "waiter_membership_id"
)
SELECT
  gen_random_uuid(),
  t."tenant_id",
  t."branch_id",
  t."id",
  s."id",
  t."assigned_waiter_membership_id"
FROM "dining_tables" t
JOIN "shift_definitions" s
  ON s."branch_id" = t."branch_id"
 AND s."status" = 'ACTIVE'
WHERE t."assigned_waiter_membership_id" IS NOT NULL
  AND t."archived_at" IS NULL
ON CONFLICT ("dining_table_id", "shift_definition_id") DO NOTHING;
