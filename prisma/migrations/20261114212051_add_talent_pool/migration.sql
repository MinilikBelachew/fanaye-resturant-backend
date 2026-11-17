-- CreateEnum
CREATE TYPE "TalentRoleCategory" AS ENUM ('CHEF', 'WAITER', 'BARISTA', 'CASHIER', 'BAKER', 'STORE_MANAGER', 'RECEPTIONIST', 'DRIVER', 'CLEANER', 'OTHER');

-- CreateEnum
CREATE TYPE "TalentAvailability" AS ENUM ('IMMEDIATE', 'FULL_TIME', 'PART_TIME', 'CONTRACT');

-- CreateEnum
CREATE TYPE "TalentProfileStatus" AS ENUM ('AVAILABLE', 'IN_PROCESS', 'HIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TalentRequestStatus" AS ENUM ('CONTACTED', 'INTERVIEWING', 'HIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "talent_profiles" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "email" VARCHAR(255),
    "photo_url" TEXT,
    "role_category" "TalentRoleCategory" NOT NULL,
    "role_title" VARCHAR(120) NOT NULL,
    "location" VARCHAR(180) NOT NULL,
    "years_experience" INTEGER NOT NULL DEFAULT 0,
    "availability" "TalentAvailability" NOT NULL DEFAULT 'FULL_TIME',
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bio" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT true,
    "status" "TalentProfileStatus" NOT NULL DEFAULT 'AVAILABLE',
    "hired_by_tenant_id" UUID,
    "hired_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_hire_requests" (
    "id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "status" "TalentRequestStatus" NOT NULL DEFAULT 'CONTACTED',
    "notes" TEXT,
    "admin_notes" TEXT,
    "onboarded_membership_id" UUID,
    "contacted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interviewing_at" TIMESTAMPTZ(6),
    "hired_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_hire_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_talent_profiles__filter" ON "talent_profiles"("status", "role_category", "location");

-- CreateIndex
CREATE INDEX "ix_talent_profiles__phone" ON "talent_profiles"("phone");

-- CreateIndex
CREATE INDEX "ix_talent_hire_requests__tenant_status" ON "talent_hire_requests"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ix_talent_hire_requests__status_created" ON "talent_hire_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "talent_profiles" ADD CONSTRAINT "talent_profiles_hired_by_tenant_id_fkey" FOREIGN KEY ("hired_by_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_profiles" ADD CONSTRAINT "talent_profiles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_hire_requests" ADD CONSTRAINT "talent_hire_requests_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_hire_requests" ADD CONSTRAINT "talent_hire_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_hire_requests" ADD CONSTRAINT "talent_hire_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_hire_requests" ADD CONSTRAINT "talent_hire_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
