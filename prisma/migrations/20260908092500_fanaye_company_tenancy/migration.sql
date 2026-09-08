-- Fanaye company / tenancy

CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_subscription_plans__code_version" UNIQUE ("code", "version"),
    CONSTRAINT "ck_subscription_plans__status" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE "plan_entitlements" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "entitlement_key" VARCHAR(120) NOT NULL,
    "value_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_plan_entitlements__plan_key" UNIQUE ("plan_id", "entitlement_key"),
    CONSTRAINT "plan_entitlements_plan_id_fkey"
      FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "default_shift_grace_minutes" INTEGER NOT NULL DEFAULT 15,
    "waiter_may_close_paid_table" BOOLEAN NOT NULL DEFAULT TRUE,
    "cashier_may_collect_customer_payment" BOOLEAN NOT NULL DEFAULT FALSE,
    "protected_cancellation_policy" VARCHAR(40) NOT NULL DEFAULT 'MANAGER_APPROVAL',
    "unresolved_production_bill_policy" VARCHAR(40) NOT NULL DEFAULT 'BLOCK',
    "settings_version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_membership_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "ck_tenant_settings__grace" CHECK ("default_shift_grace_minutes" >= 0),
    CONSTRAINT "ck_tenant_settings__bill_policy"
      CHECK ("unresolved_production_bill_policy" IN ('BLOCK', 'ALLOW_WITH_WARNING')),
    CONSTRAINT "tenant_settings_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "tenant_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "subscription_status" VARCHAR(24) NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_tenant_subscriptions__status"
      CHECK ("subscription_status" IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED')),
    CONSTRAINT "tenant_subscriptions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tenant_subscriptions_plan_id_fkey"
      FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_tenant_subscriptions__tenant_status"
ON "tenant_subscriptions"("tenant_id", "subscription_status");

CREATE UNIQUE INDEX "uq_tenant_subscriptions__one_current"
ON "tenant_subscriptions"("tenant_id")
WHERE "effective_to" IS NULL;

CREATE TABLE "tenant_entitlements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entitlement_key" VARCHAR(120) NOT NULL,
    "value_json" JSONB NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_entitlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_entitlements_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tenant_entitlements_changed_by_user_id_fkey"
      FOREIGN KEY ("changed_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_tenant_entitlements__tenant_key"
ON "tenant_entitlements"("tenant_id", "entitlement_key");

CREATE UNIQUE INDEX "uq_tenant_entitlements__current"
ON "tenant_entitlements"("tenant_id", "entitlement_key")
WHERE "effective_to" IS NULL;
