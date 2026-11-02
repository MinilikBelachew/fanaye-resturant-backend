/*
  Warnings:

  - A unique constraint covering the columns `[branch_id]` on the table `tenant_sites` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenant_id,branch_id]` on the table `tenant_sites` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "tenant_sites_tenant_id_key";

-- AlterTable
ALTER TABLE "tenant_sites" ADD COLUMN     "branch_id" UUID,
ADD COLUMN     "template_id" VARCHAR(60);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_sites_branch_id_key" ON "tenant_sites"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tenant_sites__tenant_branch" ON "tenant_sites"("tenant_id", "branch_id");

-- AddForeignKey
ALTER TABLE "tenant_sites" ADD CONSTRAINT "tenant_sites_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
