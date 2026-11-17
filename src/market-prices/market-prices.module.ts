import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MarketPricesController } from './market-prices.controller';
import { MarketPricesService } from './market-prices.service';

@Module({
  imports: [PrismaModule, IdentityModule, CaslModule, RealtimeModule],
  controllers: [MarketPricesController],
  providers: [MarketPricesService],
  exports: [MarketPricesService],
})
export class MarketPricesModule {}

