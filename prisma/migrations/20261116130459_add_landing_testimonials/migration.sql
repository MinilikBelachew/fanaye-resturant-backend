-- CreateTable
CREATE TABLE "landing_testimonials" (
    "id" UUID NOT NULL,
    "author_name" VARCHAR(120) NOT NULL,
    "author_role" VARCHAR(120) NOT NULL,
    "restaurant_name" VARCHAR(160) NOT NULL,
    "quote" TEXT NOT NULL,
    "photo_url" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landing_testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_landing_testimonials__published_sort" ON "landing_testimonials"("is_published", "sort_order");
