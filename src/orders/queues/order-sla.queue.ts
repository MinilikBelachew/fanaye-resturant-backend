import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  ORDER_SLA_QUEUE_NAME,
  ORDER_SLA_JOB,
  ScheduleOrderSlaJobDto,
  getUnackJobId,
  getDelayJobId,
} from './order-sla.constants';
import { OrderSlaHandlerService } from './order-sla-handler.service';

@Injectable()
export class OrderSlaQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(OrderSlaQueueService.name);
  private readonly localTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly handler: OrderSlaHandlerService,
    @Optional()
    @InjectQueue(ORDER_SLA_QUEUE_NAME)
    private readonly queue?: Queue,
  ) {}

  onModuleDestroy() {
    for (const timer of this.localTimers.values()) {
      clearTimeout(timer);
    }
    this.localTimers.clear();
  }

  private scheduleLocalTimer(
    jobId: string,
    delayMs: number,
    fn: () => Promise<void>,
  ) {
    const existing = this.localTimers.get(jobId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.localTimers.delete(jobId);
      fn().catch((err) => {
        this.logger.warn(`Local SLA timer ${jobId} error:`, err);
      });
    }, delayMs);
    timer.unref?.();
    this.localTimers.set(jobId, timer);
  }

  private cancelLocalTimer(jobId: string) {
    const existing = this.localTimers.get(jobId);
    if (existing) {
      clearTimeout(existing);
      this.localTimers.delete(jobId);
    }
  }

  /**
   * Schedules both Timer 1 (Unacknowledged Alert) and Timer 2 (Preparation Delay Alert).
   */
  async scheduleItemTimers(dto: ScheduleOrderSlaJobDto): Promise<void> {
    const unackMinutes = Math.max(1, dto.unacknowledgedMinutes ?? 3);
    const unackDelayMs = unackMinutes * 60_000;

    const prepMinutes = Math.max(1, dto.expectedPrepMinutes);
    const prepDelayMs = prepMinutes * 60_000;

    const unackJobId = getUnackJobId(dto.orderItemId);
    const delayJobId = getDelayJobId(dto.orderItemId);

    if (!this.queue) {
      this.scheduleLocalTimer(unackJobId, unackDelayMs, () =>
        this.handler.handleCheckUnacknowledged(dto),
      );
      this.scheduleLocalTimer(delayJobId, prepDelayMs, () =>
        this.handler.handleCheckPreparationDelay(dto),
      );
      this.logger.debug(
        `Scheduled local in-memory SLA timers for OrderItem ${dto.orderItemId} (unack: ${unackMinutes}m, prep: ${prepMinutes}m)`,
      );
      return;
    }

    // Timer 1: Unacknowledged ticket alert
    await this.queue.add(ORDER_SLA_JOB.CHECK_UNACKNOWLEDGED, dto, {
      jobId: unackJobId,
      delay: unackDelayMs,
      removeOnComplete: true,
      removeOnFail: false,
    });

    // Timer 2: Preparation delayed / SLA overdue alert
    await this.queue.add(ORDER_SLA_JOB.CHECK_PREPARATION_DELAY, dto, {
      jobId: delayJobId,
      delay: prepDelayMs,
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.debug(
      `Scheduled SLA jobs for OrderItem ${dto.orderItemId} (unack: ${unackMinutes}m, prep: ${prepMinutes}m)`,
    );
  }

  /**
   * Cancels the unacknowledged timer when ticket is acknowledged by the station.
   */
  async cancelUnacknowledgedTimer(orderItemId: string): Promise<void> {
    const jobId = getUnackJobId(orderItemId);
    if (!this.queue) {
      this.cancelLocalTimer(jobId);
      return;
    }
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove();
        this.logger.debug(
          `Cancelled unacknowledged job for OrderItem ${orderItemId}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Could not remove unacknowledged job for ${orderItemId}:`,
        err,
      );
    }
  }

  /**
   * Cancels the preparation delay timer when item is ready, served, or cancelled.
   */
  async cancelPreparationDelayTimer(orderItemId: string): Promise<void> {
    const jobId = getDelayJobId(orderItemId);
    if (!this.queue) {
      this.cancelLocalTimer(jobId);
      return;
    }
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove();
        this.logger.debug(
          `Cancelled prep delay job for OrderItem ${orderItemId}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Could not remove prep delay job for ${orderItemId}:`,
        err,
      );
    }
  }

  /**
   * Cancels both SLA timers (e.g. order item cancelled).
   */
  async cancelAllItemTimers(orderItemId: string): Promise<void> {
    await Promise.allSettled([
      this.cancelUnacknowledgedTimer(orderItemId),
      this.cancelPreparationDelayTimer(orderItemId),
    ]);
  }

  /**
   * Reschedules SLA timers (e.g. dish changed or prep time modified).
   */
  async rescheduleTimers(dto: ScheduleOrderSlaJobDto): Promise<void> {
    await this.cancelAllItemTimers(dto.orderItemId);
    await this.scheduleItemTimers(dto);
  }
}
