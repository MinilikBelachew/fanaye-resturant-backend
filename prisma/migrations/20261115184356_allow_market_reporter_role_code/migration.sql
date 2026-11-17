ALTER TABLE "platform_user_roles" DROP CONSTRAINT IF EXISTS "ck_platform_user_roles__role_code";
ALTER TABLE "platform_user_roles"
  ADD CONSTRAINT "ck_platform_user_roles__role_code"
  CHECK ("role_code" IN ('PLATFORM_SUPER_ADMIN', 'MARKET_REPORTER'));
