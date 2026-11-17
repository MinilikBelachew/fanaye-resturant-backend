import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { SuperAdminMarketingController } from './super-admin-marketing.controller';
import {
  SuperAdminTestimonialsController,
  TestimonialsPublicController,
} from './testimonials.controller';
import { TestimonialsService } from './testimonials.service';

@Module({
  imports: [PrismaModule, IdentityModule, CaslModule, RealtimeModule],
  controllers: [
    MarketingController,
    SuperAdminMarketingController,
    TestimonialsPublicController,
    SuperAdminTestimonialsController,
  ],
  providers: [MarketingService, TestimonialsService],
  exports: [MarketingService, TestimonialsService],
})
export class MarketingModule {}

