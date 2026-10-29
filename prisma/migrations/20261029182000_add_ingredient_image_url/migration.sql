-- AlterTable: add image_url to inventory_ingredients
ALTER TABLE "inventory_ingredients"
    ADD COLUMN IF NOT EXISTS "image_url" VARCHAR(512);

