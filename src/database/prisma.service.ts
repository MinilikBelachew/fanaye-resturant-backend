import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.ensureSchemaCompatibility();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async ensureSchemaCompatibility() {
    try {
      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "inventory_categories" (
            "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
            "tenant_id"     UUID NOT NULL,
            "branch_id"     UUID,
            "name"          VARCHAR(120) NOT NULL,
            "amharic_name"  VARCHAR(120),
            "code"          VARCHAR(50) NOT NULL,
            "description"   VARCHAR(255),
            "sort_order"    INTEGER NOT NULL DEFAULT 0,
            "status"        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
        )
      `);

      await this.$executeRawUnsafe(`
        ALTER TABLE "inventory_ingredients"
            ADD COLUMN IF NOT EXISTS "category_id" UUID
      `);

      await this.$executeRawUnsafe(`
        ALTER TABLE "inventory_ingredients"
            ADD COLUMN IF NOT EXISTS "image_url" VARCHAR(512)
      `);

      await this.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ix_inventory_ingredients__tenant_category"
            ON "inventory_ingredients"("tenant_id", "category_id")
      `);

      this.logger.log(
        'Database schema compatibility verified (inventory_categories, category_id, image_url).',
      );
    } catch (err: any) {
      this.logger.warn(
        `Notice: Schema compatibility check warning: ${err?.message || err}`,
      );
    }
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') return;

    const models = Reflect.ownKeys(this).filter((key) => key[0] !== '_');

    return Promise.all(
      models.map((modelKey) => (this as any)[modelKey].deleteMany()),
    );
  }
}
