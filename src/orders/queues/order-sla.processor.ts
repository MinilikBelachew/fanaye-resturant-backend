import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  ORDER_SLA_QUEUE_NAME,
  ORDER_SLA_JOB,
  ScheduleOrderSlaJobDto,
} from './order-sla.constants';
import { OrderSlaHandlerService } from './order-sla-handler.service';

@Processor(ORDER_SLA_QUEUE_NAME)
export class OrderSlaProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderSlaProcessor.name);

  constructor(private readonly handler: OrderSlaHandlerService) {
    super();
  }

  async process(job: Job<ScheduleOrderSlaJobDto>): Promise<void> {
    const { orderItemId } = job.data;
    this.logger.debug(
      `Processing SLA job "${job.name}" for OrderItem ${orderItemId} (job ID: ${job.id})`,
    );

    switch (job.name) {
      case ORDER_SLA_JOB.CHECK_UNACKNOWLEDGED:
        await this.handler.handleCheckUnacknowledged(job.data);
        break;

      case ORDER_SLA_JOB.CHECK_PREPARATION_DELAY:
        await this.handler.handleCheckPreparationDelay(job.data);
        break;

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
