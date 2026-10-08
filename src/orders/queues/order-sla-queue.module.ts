import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../database/prisma.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { ORDER_SLA_QUEUE_NAME } from './order-sla.constants';
import { OrderSlaProcessor } from './order-sla.processor';
import { OrderSlaQueueService } from './order-sla.queue';

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    BullModule.registerQueue({
      name: ORDER_SLA_QUEUE_NAME,
    }),
  ],
  providers: [OrderSlaQueueService, OrderSlaProcessor],
  exports: [OrderSlaQueueService],
})
export class OrderSlaQueueModule {}
