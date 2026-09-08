import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import {
  DailyCloseController,
  DailyClosePreviewController,
} from './daily-close.controller';
import { DailyCloseService } from './daily-close.service';

@Module({
  imports: [IdentityModule],
  controllers: [DailyClosePreviewController, DailyCloseController],
  providers: [DailyCloseService],
  exports: [DailyCloseService],
})
export class DailyCloseModule {}
