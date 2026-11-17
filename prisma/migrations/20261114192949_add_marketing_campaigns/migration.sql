-- CreateEnum
CREATE TYPE "CustomerVipTier" AS ENUM ('REGULAR', 'VIP', 'VVIP', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROMOTING', 'DONE', 'PAYMENT_SUBMITTED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "room_stays" ADD COLUMN     "guest_id_image_url" VARCHAR(500);

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "branch_id" UUID;

-- CreateTable
CREATE TABLE "staff_biometric_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "frontal_embedding" DOUBLE PRECISION[],
    "left_angle_embedding" DOUBLE PRECISION[],
    "right_angle_embedding" DOUBLE PRECISION[],
    "fused_embedding" DOUBLE PRECISION[],
    "frontal_photo_url" VARCHAR(255),
    "left_photo_url" VARCHAR(255),
    "right_photo_url" VARCHAR(255),
    "liveness_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_biometric_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_biometric_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "customer_code" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(160),
    "phone" VARCHAR(40),
    "email" VARCHAR(255),
    "notes" TEXT,
    "vip_tier" "CustomerVipTier" NOT NULL DEFAULT 'REGULAR',
    "embedding" DOUBLE PRECISION[],
    "avatar_url" TEXT,
    "total_visits" INTEGER NOT NULL DEFAULT 1,
    "first_visit_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_visit_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_biometric_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_visit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_score" DOUBLE PRECISION NOT NULL,
    "camera_location" VARCHAR(120),
    "table_session_id" UUID,

    CONSTRAINT "customer_visit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "menu_item_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "target_location" VARCHAR(180) NOT NULL,
    "target_age_min" INTEGER NOT NULL,
    "target_age_max" INTEGER NOT NULL,
    "target_views" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'PENDING',
    "delivered_views" INTEGER NOT NULL DEFAULT 0,
    "amount_due" DECIMAL(19,2),
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "admin_notes" TEXT,
    "payment_reference" VARCHAR(180),
    "payment_notes" TEXT,
    "confirmed_at" TIMESTAMPTZ(6),
    "promoted_at" TIMESTAMPTZ(6),
    "done_at" TIMESTAMPTZ(6),
    "payment_submitted_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_biometric_profiles_user_id_key" ON "staff_biometric_profiles"("user_id");

-- CreateIndex
CREATE INDEX "ix_staff_biometrics__tenant_branch" ON "staff_biometric_profiles"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_biometric_profiles_customer_code_key" ON "customer_biometric_profiles"("customer_code");

-- CreateIndex
CREATE INDEX "ix_customer_biometrics__tenant_branch" ON "customer_biometric_profiles"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "ix_customer_biometrics__code" ON "customer_biometric_profiles"("customer_code");

-- CreateIndex
CREATE INDEX "ix_customer_visits__tenant_branch_date" ON "customer_visit_logs"("tenant_id", "branch_id", "detected_at");

-- CreateIndex
CREATE INDEX "ix_customer_visits__customer" ON "customer_visit_logs"("customer_id");

-- CreateIndex
CREATE INDEX "ix_marketing_campaigns__tenant_status_created" ON "marketing_campaigns"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ix_marketing_campaigns__status_created" ON "marketing_campaigns"("status", "created_at");

-- CreateIndex
CREATE INDEX "ix_vendors__tenant_branch_status" ON "vendors"("tenant_id", "branch_id", "status");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_biometric_profiles" ADD CONSTRAINT "staff_biometric_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_biometric_profiles" ADD CONSTRAINT "staff_biometric_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_biometric_profiles" ADD CONSTRAINT "staff_biometric_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_biometric_profiles" ADD CONSTRAINT "customer_biometric_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_biometric_profiles" ADD CONSTRAINT "customer_biometric_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visit_logs" ADD CONSTRAINT "customer_visit_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_biometric_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visit_logs" ADD CONSTRAINT "customer_visit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visit_logs" ADD CONSTRAINT "customer_visit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
