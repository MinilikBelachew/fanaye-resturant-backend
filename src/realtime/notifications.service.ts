import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async listForUser(
    userId: string,
    opts: {
      unreadOnly?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const context = await this.identity.getByUserId(userId);
    if (!context.staffMembershipId) {
      throw new ForbiddenException('No staff membership on this account.');
    }

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
    const unreadOnly = Boolean(opts.unreadOnly);

    const where = {
      recipientStaffMembershipId: context.staffMembershipId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [total, unreadCount, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          recipientStaffMembershipId: context.staffMembershipId,
          readAt: null,
        },
      }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        body: row.body,
        relatedEntityType: row.relatedEntityType,
        relatedEntityId: row.relatedEntityId,
        payload: (row.payloadJson as Record<string, unknown> | null) ?? null,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      unreadCount,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const context = await this.identity.getByUserId(userId);
    if (!context.staffMembershipId) {
      throw new ForbiddenException('No staff membership on this account.');
    }

    const row = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientStaffMembershipId: context.staffMembershipId,
      },
    });
    if (!row) throw new NotFoundException('Notification not found.');

    if (!row.readAt) {
      await this.prisma.notification.update({
        where: { id: row.id },
        data: { readAt: new Date() },
      });
    }

    return { success: true };
  }

  async markAllRead(userId: string) {
    const context = await this.identity.getByUserId(userId);
    if (!context.staffMembershipId) {
      throw new ForbiddenException('No staff membership on this account.');
    }

    const result = await this.prisma.notification.updateMany({
      where: {
        recipientStaffMembershipId: context.staffMembershipId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { success: true, count: result.count };
  }
}
