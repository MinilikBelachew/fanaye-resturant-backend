-- AlterTable
ALTER TABLE "dining_tables" ADD COLUMN     "qr_code_url" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "badge" VARCHAR(40),
ADD COLUMN     "show_on_qr_menu" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tenant_sites" ADD COLUMN     "qr_menu_config_json" JSONB;
