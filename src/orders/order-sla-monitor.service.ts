import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OpsEventType } from '../realtime/ops-events';
import { OpsNotifyService } from '../realtime/ops-notify.service';
import { managerRoom, stationRoom } from '../realtime/ops-rooms';

@Injectable()
export class OrderSlaMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderSlaMonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsNotify: OpsNotifyService,
  ) {}

  onModuleInit() {
    // Initial check after 5 seconds, then recurring every 30 seconds
    setTimeout(() => void this.runCheckSafely(), 5000);
    this.timer = setInterval(() => void this.runCheckSafely(), 30_000);
    this.logger.log('OrderSlaMonitorService initialized (checking every 30s).');
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runCheckSafely(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;
    try {
      await this.checkSlaBreaches();
    } catch (error) {
      this.logger.error('Error during Order SLA check:', error);
    } finally {
      this.isChecking = false;
    }
  }

  async checkSlaBreaches(): Promise<{
    unackCount: number;
    delayCount: number;
  }> {
    const now = new Date();
    const nowMs = now.getTime();

    // Query active cooking tickets that have not yet triggered both alerts
    const activeItems = await this.prisma.orderItem.findMany({
      where: {
        state: { in: ['QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION'] },
        cancelledAt: null,
        servedAt: null,
        queuedAt: { not: null },
        OR: [{ unacknowledgedAlertSentAt: null }, { delayAlertSentAt: null }],
      },
      include: {
        tableSession: {
          include: {
            table: true,
            primaryWaiter: true,
          },
        },
        currentStation: true,
      },
      take: 150,
    });

    if (activeItems.length === 0) {
      return { unackCount: 0, delayCount: 0 };
    }

    // Fetch branch settings in one batch for multi-tenant / multi-branch isolation
    const branchIds = [...new Set(activeItems.map((item) => item.branchId))];
    const branchSettingsList = await this.prisma.branchSettings.findMany({
      where: { branchId: { in: branchIds } },
    });
    const settingsByBranch = new Map(
      branchSettingsList.map((s) => [s.branchId, s]),
    );

    let unackCount = 0;
    let delayCount = 0;

    for (const item of activeItems) {
      const queuedTime = item.queuedAt?.getTime() ?? nowMs;
      const elapsedMs = nowMs - queuedTime;
      const elapsedMins = Math.floor(elapsedMs / 60_000);

      const branchSettings = settingsByBranch.get(item.branchId);
      const tableName = formatTableName(item.tableSession);

      // =========================================================================
      // 1. UNACKNOWLEDGED ALERT CHECK (Timer 1)
      // =========================================================================
      if (item.state === 'QUEUED' && !item.unacknowledgedAlertSentAt) {
        const unackLimitMins = branchSettings?.unacknowledgedAlertMinutes ?? 3;
        if (elapsedMins >= unackLimitMins) {
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
              unacknowledgedThresholdMinutes: unackLimitMins,
            },
          });
          unackCount += 1;
        }
      }

      // =========================================================================
      // 2. PREPARATION DELAY ALERT CHECK (Timer 2: SLA Overdue)
      // =========================================================================
      if (!item.delayAlertSentAt) {
        const targetMins = item.expectedPrepMinutesSnapshot ?? 15;
        if (elapsedMins > targetMins) {
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
          delayCount += 1;
        }
      }
    }

    return { unackCount, delayCount };
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
