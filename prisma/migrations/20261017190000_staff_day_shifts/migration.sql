-- Per-day shift windows (e.g. Mon morning, Thu afternoon)
CREATE TABLE "staff_day_shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_membership_id" UUID NOT NULL,
    "day_code" VARCHAR(3) NOT NULL,
    "shift_definition_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_day_shifts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_staff_day_shifts__membership_day"
  ON "staff_day_shifts"("staff_membership_id", "day_code");

CREATE INDEX "ix_staff_day_shifts__tenant_shift"
  ON "staff_day_shifts"("tenant_id", "shift_definition_id");

ALTER TABLE "staff_day_shifts"
  ADD CONSTRAINT "staff_day_shifts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_day_shifts"
  ADD CONSTRAINT "staff_day_shifts_staff_membership_id_fkey"
  FOREIGN KEY ("staff_membership_id") REFERENCES "tenant_staff_memberships"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_day_shifts"
  ADD CONSTRAINT "staff_day_shifts_shift_definition_id_fkey"
  FOREIGN KEY ("shift_definition_id") REFERENCES "shift_definitions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: expand working_days + primary scheduled shift (else first table coverage)
INSERT INTO "staff_day_shifts" (
  "id",
  "tenant_id",
  "staff_membership_id",
  "day_code",
  "shift_definition_id",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  m."tenant_id",
  m."id",
  d."day_code",
  COALESCE(sa."shift_definition_id", cov."shift_definition_id"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenant_staff_memberships" m
CROSS JOIN LATERAL unnest(m."working_days") AS d("day_code")
LEFT JOIN LATERAL (
  SELECT s."shift_definition_id"
  FROM "shift_assignments" s
  WHERE s."staff_membership_id" = m."id"
    AND s."status" = 'SCHEDULED'
    AND s."shift_definition_id" IS NOT NULL
  ORDER BY s."created_at" DESC
  LIMIT 1
) sa ON true
LEFT JOIN LATERAL (
  SELECT c."shift_definition_id"
  FROM "dining_table_shift_coverages" c
  WHERE c."waiter_membership_id" = m."id"
  ORDER BY c."created_at" ASC
  LIMIT 1
) cov ON true
WHERE cardinality(m."working_days") > 0
  AND COALESCE(sa."shift_definition_id", cov."shift_definition_id") IS NOT NULL
ON CONFLICT DO NOTHING;
