import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OrderSlaQueueModule } from '../orders/queues/order-sla-queue.module';
import { OrderItemsController } from './order-items.controller';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';

@Module({
  imports: [IdentityModule, RealtimeModule, OrderSlaQueueModule],
  controllers: [StationsController, OrderItemsController],
  providers: [StationsService],
  exports: [StationsService],
})
export class StationsModule {}
