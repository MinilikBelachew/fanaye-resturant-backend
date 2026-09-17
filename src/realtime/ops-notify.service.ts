import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OPS_NOTIFY_EVENT, OpsNotifyPayload } from './ops-events';
import { managerRoom, staffRoom } from './ops-rooms';

@Injectable()
export class OpsNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Persist (optional) + broadcast an ops notification over sockets.
   */
  async notify(
    input: OpsNotifyPayload,
  ): Promise<{ notificationId: string | null }> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    let notificationId = input.notificationId ?? null;

    if (!notificationId && input.recipientMembershipId) {
      const row = await this.prisma.notification.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          recipientStaffMembershipId: input.recipientMembershipId,
          type: input.type,
          severity: input.severity,
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
          title: input.title,
          body: input.body ?? null,
          payloadJson: (input.payload ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });
      notificationId = row.id;
    }

    const rooms = new Set<string>(input.rooms ?? []);
    if (input.recipientMembershipId) {
      rooms.add(staffRoom(input.recipientMembershipId));
    }

    this.events.emit(OPS_NOTIFY_EVENT, {
      ...input,
      notificationId,
      createdAt,
      rooms: [...rooms],
    } satisfies OpsNotifyPayload);

    return { notificationId };
  }

  /** Broadcast without creating a Notification row (queue/board refresh). */
  broadcast(input: Omit<OpsNotifyPayload, 'recipientMembershipId'>): void {
    const createdAt = input.createdAt ?? new Date().toISOString();
    this.events.emit(OPS_NOTIFY_EVENT, {
      ...input,
      recipientMembershipId: null,
      notificationId: null,
      createdAt,
      rooms: input.rooms ?? [],
    } satisfies OpsNotifyPayload);
  }

  /**
   * Fan-out to every active cashier (DB inbox + staff socket).
   * Also pings manager room once for live oversight (no duplicate cashier toast).
   */
  async notifyCashiers(
    input: Omit<OpsNotifyPayload, 'recipientMembershipId' | 'rooms'>,
  ): Promise<void> {
    const cashiers = await this.prisma.tenantStaffMembership.findMany({
      where: {
        tenantId: input.tenantId,
        status: 'ACTIVE',
        roleAssignments: {
          some: {
            status: 'ACTIVE',
            revokedAt: null,
            role: { code: 'CASHIER' },
          },
        },
      },
      select: { id: true },
      take: 40,
    });

    if (cashiers.length === 0) {
      // No cashier memberships — still alert managers / anyone on manager room.
      this.broadcast({
        ...input,
        rooms: [managerRoom(input.branchId)],
      });
      return;
    }

    for (const cashier of cashiers) {
      await this.notify({
        ...input,
        recipientMembershipId: cashier.id,
      });
    }

    this.broadcast({
      ...input,
      severity: 'INFO',
      rooms: [managerRoom(input.branchId)],
    });
  }
}
