import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [SiteController],
  providers: [SiteService],
  exports: [SiteService],
})
export class SiteModule {}
