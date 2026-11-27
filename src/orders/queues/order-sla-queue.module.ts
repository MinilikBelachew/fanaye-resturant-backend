import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../database/prisma.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import {
  isRedisQueueEnabled,
  ORDER_SLA_QUEUE_NAME,
} from './order-sla.constants';
import { OrderSlaHandlerService } from './order-sla-handler.service';
import { OrderSlaProcessor } from './order-sla.processor';
import { OrderSlaQueueService } from './order-sla.queue';

const redisEnabled = isRedisQueueEnabled();

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    ...(redisEnabled
      ? [
          BullModule.registerQueue({
            name: ORDER_SLA_QUEUE_NAME,
          }),
        ]
      : []),
  ],
  providers: [
    OrderSlaHandlerService,
    OrderSlaQueueService,
    ...(redisEnabled ? [OrderSlaProcessor] : []),
  ],
  exports: [OrderSlaQueueService],
})
export class OrderSlaQueueModule {}
