-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "image_file_id" UUID;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "image_key" VARCHAR(40);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_image_file_id_fkey'
  ) THEN
    ALTER TABLE "menu_items"
      ADD CONSTRAINT "menu_items_image_file_id_fkey"
      FOREIGN KEY ("image_file_id") REFERENCES "file"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
