import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OpsEventType } from '../realtime/ops-events';
import { OpsNotifyService } from '../realtime/ops-notify.service';
import { managerRoom, staffRoom } from '../realtime/ops-rooms';

@Injectable()
export class SessionIdleMonitorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SessionIdleMonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsNotify: OpsNotifyService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.runCheckSafely(), 30_000);
    this.timer = setInterval(() => void this.runCheckSafely(), 600_000);
    this.logger.log(
      'SessionIdleMonitorService initialized (checking every 10m for 4h idle).',
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
      await this.checkIdleSessions();
    } catch (error) {
      this.logger.error('Error during session idle check:', error);
    } finally {
      this.isChecking = false;
    }
  }

  async checkIdleSessions(): Promise<{ warned: number }> {
    const now = new Date();
    const settings = await this.prisma.branchSettings.findMany({
      select: {
        branchId: true,
        tenantId: true,
        sessionIdleWarnMinutes: true,
      },
    });
    const settingsByBranch = new Map(
      settings.map((row) => [row.branchId, row]),
    );

    const openTables = await this.prisma.tableSession.findMany({
      where: {
        status: { not: 'CLOSED' },
        closedAt: null,
        idleAlertSentAt: null,
        sessionKind: { notIn: ['CALL_PICKUP', 'COUNTER'] },
      },
      include: {
        table: { select: { displayName: true, displayNumber: true } },
        orders: {
          select: { confirmedAt: true },
          orderBy: { confirmedAt: 'desc' },
          take: 1,
        },
      },
      take: 200,
    });

    const openRooms = await this.prisma.roomSession.findMany({
      where: {
        status: { not: 'CLOSED' },
        closedAt: null,
        idleAlertSentAt: null,
      },
      include: {
        hotelRoom: { select: { roomNumber: true } },
        orders: {
          select: { confirmedAt: true },
          orderBy: { confirmedAt: 'desc' },
          take: 1,
        },
      },
      take: 200,
    });

    let warned = 0;

    for (const session of openTables) {
      const branch = settingsByBranch.get(session.branchId);
      const thresholdMins = branch?.sessionIdleWarnMinutes ?? 240;
      const lastActivity =
        session.orders[0]?.confirmedAt?.getTime() ?? session.openedAt.getTime();
      const idleMins = Math.floor((now.getTime() - lastActivity) / 60_000);
      if (idleMins < thresholdMins) continue;

      await this.prisma.tableSession.update({
        where: { id: session.id },
        data: { idleAlertSentAt: now },
      });

      const label =
        session.table.displayNumber ??
        session.table.displayName.replace(/^Table\s+/i, '');
      await this.opsNotify.notify({
        type: OpsEventType.SESSION_IDLE,
        tenantId: session.tenantId,
        branchId: session.branchId,
        severity: 'ATTENTION',
        title: `Idle table · ${label}`,
        body: `No activity for ${idleMins}m. Close or settle before daily close.`,
        recipientMembershipId: session.primaryWaiterMembershipId,
        rooms: [
          managerRoom(session.branchId),
          staffRoom(session.primaryWaiterMembershipId),
        ],
        relatedEntityType: 'TableSession',
        relatedEntityId: session.id,
        payload: {
          tableSessionId: session.id,
          tableId: session.tableId,
          idleMinutes: idleMins,
          thresholdMinutes: thresholdMins,
        },
      });
      warned += 1;
    }

    for (const session of openRooms) {
      const branch = settingsByBranch.get(session.branchId);
      const thresholdMins = branch?.sessionIdleWarnMinutes ?? 240;
      const lastActivity =
        session.orders[0]?.confirmedAt?.getTime() ?? session.openedAt.getTime();
      const idleMins = Math.floor((now.getTime() - lastActivity) / 60_000);
      if (idleMins < thresholdMins) continue;

      await this.prisma.roomSession.update({
        where: { id: session.id },
        data: { idleAlertSentAt: now },
      });

      const label = `Room ${session.hotelRoom.roomNumber}`;
      await this.opsNotify.notify({
        type: OpsEventType.SESSION_IDLE,
        tenantId: session.tenantId,
        branchId: session.branchId,
        severity: 'ATTENTION',
        title: `Idle room · ${label}`,
        body: `No activity for ${idleMins}m. Close or settle before daily close.`,
        recipientMembershipId: session.primaryWaiterMembershipId,
        rooms: [
          managerRoom(session.branchId),
          staffRoom(session.primaryWaiterMembershipId),
        ],
        relatedEntityType: 'RoomSession',
        relatedEntityId: session.id,
        payload: {
          roomSessionId: session.id,
          hotelRoomId: session.hotelRoomId,
          idleMinutes: idleMins,
          thresholdMinutes: thresholdMins,
        },
      });
      warned += 1;
    }

    if (warned > 0) {
      this.logger.log(`Session idle warnings sent: ${warned}`);
    }
    return { warned };
  }
}
