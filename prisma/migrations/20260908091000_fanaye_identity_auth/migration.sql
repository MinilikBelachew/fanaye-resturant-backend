-- Fanaye identity: login is not restaurant access

CREATE TABLE "app_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "display_name" VARCHAR(160) NOT NULL,
    "account_status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "auth_provider" VARCHAR(40),
    "photo_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_app_users__email" UNIQUE ("email"),
    CONSTRAINT "uq_app_users__phone" UNIQUE ("phone"),
    CONSTRAINT "uq_app_users__photo" UNIQUE ("photo_id"),
    CONSTRAINT "ck_app_users__account_status"
      CHECK ("account_status" IN ('ACTIVE', 'DISABLED', 'LOCKED')),
    CONSTRAINT "app_users_photo_id_fkey"
      FOREIGN KEY ("photo_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_app_users__account_status" ON "app_users"("account_status");

CREATE TABLE "user_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255),
    "auth_provider" VARCHAR(40) NOT NULL DEFAULT 'email',
    "social_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_credentials_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "user_credentials_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ix_user_credentials__social"
ON "user_credentials"("social_id", "auth_provider");

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_sessions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ix_auth_sessions__user" ON "auth_sessions"("user_id");

CREATE TABLE "platform_user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_code" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_user_id" UUID,

    CONSTRAINT "platform_user_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_platform_user_roles__user_role" UNIQUE ("user_id", "role_code"),
    CONSTRAINT "ck_platform_user_roles__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "ck_platform_user_roles__role_code"
      CHECK ("role_code" IN ('PLATFORM_SUPER_ADMIN')),
    CONSTRAINT "platform_user_roles_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "platform_user_roles_granted_by_user_id_fkey"
      FOREIGN KEY ("granted_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_platform_user_roles__user_status"
ON "platform_user_roles"("user_id", "status");
