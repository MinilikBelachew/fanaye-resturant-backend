ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "ck_roles__code";
ALTER TABLE "roles" ADD CONSTRAINT "ck_roles__code"
  CHECK ("code" IN (
    'OWNER_ADMIN',
    'MANAGER',
    'WAITER',
    'CASHIER',
    'STATION_OPERATOR',
    'DISPATCHER',
    'STORE_MANAGER'
  ));

INSERT INTO "roles" ("id", "code", "name", "is_system")
VALUES (7, 'STORE_MANAGER', 'Store manager', true)
ON CONFLICT ("id") DO UPDATE
SET "code" = EXCLUDED."code",
    "name" = EXCLUDED."name";
