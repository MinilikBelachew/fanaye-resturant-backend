import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { OpsEventType } from '../../realtime/ops-events';
import { OpsNotifyService } from '../../realtime/ops-notify.service';
import { managerRoom, stationRoom } from '../../realtime/ops-rooms';
import {
  ORDER_SLA_QUEUE_NAME,
  ORDER_SLA_JOB,
  ScheduleOrderSlaJobDto,
} from './order-sla.constants';

@Processor(ORDER_SLA_QUEUE_NAME)
export class OrderSlaProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderSlaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsNotify: OpsNotifyService,
  ) {
    super();
  }

  async process(job: Job<ScheduleOrderSlaJobDto>): Promise<void> {
    const { orderItemId } = job.data;
    this.logger.debug(
      `Processing SLA job "${job.name}" for OrderItem ${orderItemId} (job ID: ${job.id})`,
    );

    switch (job.name) {
      case ORDER_SLA_JOB.CHECK_UNACKNOWLEDGED:
        await this.handleCheckUnacknowledged(job);
        break;

      case ORDER_SLA_JOB.CHECK_PREPARATION_DELAY:
        await this.handleCheckPreparationDelay(job);
        break;

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleCheckUnacknowledged(
    job: Job<ScheduleOrderSlaJobDto>,
  ): Promise<void> {
    const { orderItemId } = job.data;
    const now = new Date();

    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        tableSession: {
          include: {
            table: true,
            primaryWaiter: true,
          },
        },
        currentStation: true,
      },
    });

    // If cancelled, already acknowledged, ready, or alert already sent, skip
    if (
      !item ||
      item.cancelledAt ||
      item.servedAt ||
      item.readyAt ||
      item.state !== 'QUEUED' ||
      item.unacknowledgedAlertSentAt
    ) {
      this.logger.debug(
        `OrderItem ${orderItemId} is no longer in unacknowledged QUEUED state. Skipping alert.`,
      );
      return;
    }

    const elapsedMs =
      now.getTime() - (item.queuedAt?.getTime() ?? now.getTime());
    const elapsedMins = Math.floor(elapsedMs / 60_000);
    const tableName = formatTableName(item.tableSession);

    await this.prisma.orderItem.update({
      where: { id: item.id },
      data: { unacknowledgedAlertSentAt: now },
    });

    await this.opsNotify.notify({
      type: OpsEventType.TICKET_UNACKNOWLEDGED,
      tenantId: item.tenantId,
      branchId: item.branchId,
      severity: 'URGENT',
      title: `Unacknowledged Ticket · Table ${tableName}`,
      body: `${item.quantity}× ${item.itemNameSnapshot} at ${item.stationNameSnapshot} waiting for ${elapsedMins}m`,
      rooms: [
        managerRoom(item.branchId),
        stationRoom(item.currentPreparationStationId),
      ],
      relatedEntityType: 'OrderItem',
      relatedEntityId: item.id,
      payload: {
        orderItemId: item.id,
        tableSessionId: item.tableSessionId,
        stationId: item.currentPreparationStationId,
        elapsedMinutes: elapsedMins,
        thresholdMinutes: job.data.unacknowledgedMinutes ?? 3,
      },
    });

    this.logger.log(
      `Dispatched TICKET_UNACKNOWLEDGED alert for item ${item.id} (Table: ${tableName})`,
    );
  }

  private async handleCheckPreparationDelay(
    job: Job<ScheduleOrderSlaJobDto>,
  ): Promise<void> {
    const { orderItemId } = job.data;
    const now = new Date();

    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        tableSession: {
          include: {
            table: true,
            primaryWaiter: true,
          },
        },
        currentStation: true,
      },
    });

    // If item completed, cancelled, or already alerted, skip
    if (
      !item ||
      item.cancelledAt ||
      item.servedAt ||
      item.readyAt ||
      !['QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION'].includes(item.state) ||
      item.delayAlertSentAt
    ) {
      this.logger.debug(
        `OrderItem ${orderItemId} is not overdue or already handled. Skipping delay alert.`,
      );
      return;
    }

    const elapsedMs =
      now.getTime() - (item.queuedAt?.getTime() ?? now.getTime());
    const elapsedMins = Math.floor(elapsedMs / 60_000);
    const targetMins =
      item.expectedPrepMinutesSnapshot ?? job.data.expectedPrepMinutes ?? 15;
    const tableName = formatTableName(item.tableSession);

    await this.prisma.orderItem.update({
      where: { id: item.id },
      data: { delayAlertSentAt: now },
    });

    await this.opsNotify.notify({
      type: OpsEventType.ITEM_DELAYED,
      tenantId: item.tenantId,
      branchId: item.branchId,
      severity: 'ATTENTION',
      title: `Preparation Delay · Table ${tableName}`,
      body: `${item.quantity}× ${item.itemNameSnapshot} is overdue (${elapsedMins}m elapsed, target was ${targetMins}m)`,
      recipientMembershipId: item.tableSession.primaryWaiterMembershipId,
      rooms: [
        managerRoom(item.branchId),
        stationRoom(item.currentPreparationStationId),
      ],
      relatedEntityType: 'OrderItem',
      relatedEntityId: item.id,
      payload: {
        orderItemId: item.id,
        tableSessionId: item.tableSessionId,
        stationId: item.currentPreparationStationId,
        targetMinutes: targetMins,
        elapsedMinutes: elapsedMins,
      },
    });

    this.logger.log(
      `Dispatched ITEM_DELAYED alert for item ${item.id} (Table: ${tableName})`,
    );
  }
}

function formatTableName(session: {
  sessionKind?: string | null;
  customerName?: string | null;
  table?: { displayName: string; displayNumber: string | null } | null;
}): string {
  if (session.sessionKind === 'CALL_PICKUP') {
    const name = session.customerName?.trim();
    return name ? `Call · ${name}` : 'Call pickup';
  }
  if (!session.table) return 'Counter';
  return (
    session.table.displayNumber ??
    session.table.displayName.replace(/^Table\s+/i, '')
  );
}
