-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "preferred_branch_id" UUID;

-- AddForeignKey
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_preferred_branch_id_fkey" FOREIGN KEY ("preferred_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
