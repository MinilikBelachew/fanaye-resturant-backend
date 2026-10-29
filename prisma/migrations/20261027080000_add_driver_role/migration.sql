-- Migration: add_driver_role
-- Updates check constraint on roles table to include 'DRIVER'
-- Inserts role id 9 for 'DRIVER'

ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "ck_roles__code";
ALTER TABLE "roles" ADD CONSTRAINT "ck_roles__code"
  CHECK ("code" IN (
    'OWNER_ADMIN',
    'MANAGER',
    'WAITER',
    'CASHIER',
    'STATION_OPERATOR',
    'DISPATCHER',
    'STORE_MANAGER',
    'RECEPTIONIST',
    'DRIVER'
  ));

INSERT INTO "roles" ("id", "code", "name", "is_system")
VALUES (9, 'DRIVER', 'Driver', true)
ON CONFLICT ("id") DO UPDATE
SET "code" = EXCLUDED."code",
    "name" = EXCLUDED."name";
