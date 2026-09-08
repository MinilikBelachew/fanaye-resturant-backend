import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OrderItemsController } from './order-items.controller';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';

@Module({
  imports: [IdentityModule],
  controllers: [StationsController, OrderItemsController],
  providers: [StationsService],
  exports: [StationsService],
})
export class StationsModule {}
