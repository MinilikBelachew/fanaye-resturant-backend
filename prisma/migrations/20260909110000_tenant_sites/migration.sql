-- CreateTable
CREATE TABLE "tenant_sites" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "theme_json" JSONB NOT NULL,
    "draft_data_json" JSONB NOT NULL,
    "published_data_json" JSONB,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_sites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_sites_tenant_id_key" ON "tenant_sites"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_sites_slug_key" ON "tenant_sites"("slug");

-- CreateIndex
CREATE INDEX "ix_tenant_sites__status" ON "tenant_sites"("status");

-- AddForeignKey
ALTER TABLE "tenant_sites" ADD CONSTRAINT "tenant_sites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
