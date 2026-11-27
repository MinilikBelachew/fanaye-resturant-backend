-- CreateTable
CREATE TABLE "sync_outbox" (
    "seq" BIGSERIAL NOT NULL,
    "tenant_id" UUID,
    "table_name" VARCHAR(80) NOT NULL,
    "record_id" VARCHAR(255) NOT NULL,
    "operation" VARCHAR(16) NOT NULL,
    "payload" JSONB,
    "key_data" JSONB,
    "origin" VARCHAR(16) NOT NULL DEFAULT 'LOCAL',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_outbox_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "ix_sync_outbox__pending" ON "sync_outbox"("synced_at", "seq");

-- CreateIndex
CREATE INDEX "ix_sync_outbox__tenant_seq" ON "sync_outbox"("tenant_id", "seq");

-- CreateIndex
CREATE INDEX "ix_sync_outbox__target" ON "sync_outbox"("table_name", "record_id");
