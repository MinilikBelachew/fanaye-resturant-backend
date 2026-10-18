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
    // Background safety net fallback check (BullMQ is primary real-time driver)
    setTimeout(() => void this.runCheckSafely(), 15_000);
    this.timer = setInterval(() => void this.runCheckSafely(), 120_000);
    this.logger.log(
      'OrderSlaMonitorService initialized as fallback safety net (checking every 2m).',
    );
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

    // Query active cooking tickets that have not yet triggered alerts
    const activeItems = await this.prisma.orderItem.findMany({
      where: {
        state: { in: ['QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION'] },
        cancelledAt: null,
        servedAt: null,
        queuedAt: { not: null },
        OR: [
          { unacknowledgedAlertSentAt: null },
          { delayAlertSentAt: null },
          { staleWarnAlertSentAt: null, state: 'QUEUED' },
        ],
      },
      include: {
        tableSession: {
          include: {
            table: true,
            primaryWaiter: true,
          },
        },
        roomSession: {
          include: {
            hotelRoom: true,
            primaryWaiter: true,
          },
        },
        currentStation: true,
      },
      take: 200,
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
    let staleCount = 0;

    for (const item of activeItems) {
      const queuedTime = item.queuedAt?.getTime() ?? nowMs;
      const elapsedMs = nowMs - queuedTime;
      const elapsedMins = Math.floor(elapsedMs / 60_000);

      const branchSettings = settingsByBranch.get(item.branchId);
      const tableName = formatTableName(item.tableSession, item.roomSession);

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
            recipientMembershipId:
              item.tableSession?.primaryWaiterMembershipId ??
              item.roomSession?.primaryWaiterMembershipId ??
              undefined,
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

      // =========================================================================
      // 3. LONG QUEUED STALE WARN (default 3h) — once
      // =========================================================================
      if (item.state === 'QUEUED' && !item.staleWarnAlertSentAt) {
        const staleMins = branchSettings?.ticketStaleWarnMinutes ?? 180;
        if (elapsedMins >= staleMins) {
          await this.prisma.orderItem.update({
            where: { id: item.id },
            data: { staleWarnAlertSentAt: now },
          });

          await this.opsNotify.notify({
            type: OpsEventType.TICKET_STALE,
            tenantId: item.tenantId,
            branchId: item.branchId,
            severity: 'URGENT',
            title: `Stale ticket · ${tableName}`,
            body: `${item.quantity}× ${item.itemNameSnapshot} still New for ${elapsedMins}m — resolve before daily close.`,
            rooms: [
              managerRoom(item.branchId),
              stationRoom(item.currentPreparationStationId),
            ],
            relatedEntityType: 'OrderItem',
            relatedEntityId: item.id,
            payload: {
              orderItemId: item.id,
              tableSessionId: item.tableSessionId,
              roomSessionId: item.roomSessionId,
              stationId: item.currentPreparationStationId,
              elapsedMinutes: elapsedMins,
              staleThresholdMinutes: staleMins,
            },
          });
          staleCount += 1;
        }
      }
    }

    if (staleCount > 0) {
      this.logger.log(`Stale QUEUED ticket warnings sent: ${staleCount}`);
    }

    return { unackCount, delayCount };
  }
}

function formatTableName(
  session: {
    sessionKind?: string | null;
    customerName?: string | null;
    table?: { displayName: string; displayNumber: string | null } | null;
  } | null,
  roomSession?: { hotelRoom?: { roomNumber: string } | null } | null,
): string {
  if (roomSession?.hotelRoom) {
    return `Room ${roomSession.hotelRoom.roomNumber}`;
  }
  if (!session) return 'Seating';
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
