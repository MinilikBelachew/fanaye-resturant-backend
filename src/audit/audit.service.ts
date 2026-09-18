import { Injectable, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  AuditEventDto,
  AuditListResponseDto,
  AuditSummaryDto,
} from './dto/audit-response.dto';

type AuditCategory = AuditEventDto['category'];

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async list(
    userId: string,
    opts?: {
      category?: string;
      q?: string;
      limit?: number;
      page?: number;
      sort?: string;
      order?: 'asc' | 'desc';
      startDate?: string;
      endDate?: string;
    },
  ): Promise<AuditListResponseDto> {
    const context = await this.identity.getByUserId(userId);
    const role = context.roleCode ?? '';
    const allowedRoles = new Set([
      'MANAGER',
      'OWNER_ADMIN',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
      'PLATFORM_SUPER_ADMIN',
    ]);
    const perms = context.permissions ?? [];
    if (
      !allowedRoles.has(role) &&
      !perms.includes('audit.view') &&
      !perms.includes('report.view')
    ) {
      throw new ForbiddenException('Audit trail requires manager access.');
    }

    if (!context.tenantId) {
      return {
        data: [],
        summary: emptySummary(),
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
    }

    // Managers/owners are always locked to their restaurant tenant.
    // Prefer their assigned branch; otherwise first active branch in that tenant.
    let branchId = context.branchId ?? null;
    if (!branchId && (role === 'MANAGER' || role === 'OWNER_ADMIN')) {
      const branch = await this.prisma.branch.findFirst({
        where: { tenantId: context.tenantId, status: 'ACTIVE' },
        select: { id: true },
      });
      branchId = branch?.id ?? null;
    }

    const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 200);
    const page = Math.max(opts?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const where: Prisma.AuditEventWhereInput = {
      tenantId: context.tenantId,
      ...(branchId ? { branchId } : {}),
    };

    if (opts?.startDate || opts?.endDate) {
      where.occurredAt = {};
      if (opts.startDate) {
        where.occurredAt.gte = new Date(opts.startDate);
      }
      if (opts.endDate) {
        where.occurredAt.lte = new Date(opts.endDate);
      }
    }

    const andConditions: Prisma.AuditEventWhereInput[] = [];

    if (opts?.q?.trim()) {
      const q = opts.q.trim();
      andConditions.push({
        OR: [
          { action: { contains: q, mode: 'insensitive' } },
          { entityType: { contains: q, mode: 'insensitive' } },
          { reason: { contains: q, mode: 'insensitive' } },
          {
            actorStaff: {
              employeeDisplayName: { contains: q, mode: 'insensitive' },
            },
          },
          {
            actorUser: {
              displayName: { contains: q, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    if (opts?.category && opts.category !== 'all') {
      const cat = opts.category.toLowerCase();
      if (cat === 'orders') {
        andConditions.push({
          OR: [
            { entityType: { contains: 'ORDER', mode: 'insensitive' } },
            { action: { contains: 'ORDER', mode: 'insensitive' } },
            { action: { contains: 'CANCEL', mode: 'insensitive' } },
            { action: { contains: 'CHANGE_REQUEST', mode: 'insensitive' } },
          ],
        });
      } else if (cat === 'fulfillment') {
        andConditions.push({
          OR: [
            { entityType: { contains: 'STATION', mode: 'insensitive' } },
            { entityType: { contains: 'FULFILL', mode: 'insensitive' } },
            { action: { contains: 'READY', mode: 'insensitive' } },
            { action: { contains: 'PREPAR', mode: 'insensitive' } },
            { action: { contains: 'ACKNOWLEDGE', mode: 'insensitive' } },
          ],
        });
      } else if (cat === 'payments') {
        andConditions.push({
          OR: [
            { entityType: { contains: 'PAYMENT', mode: 'insensitive' } },
            { entityType: { contains: 'CASH', mode: 'insensitive' } },
            { entityType: { contains: 'BILL', mode: 'insensitive' } },
            { entityType: { contains: 'RECONCIL', mode: 'insensitive' } },
            { entityType: { contains: 'TRANSFER', mode: 'insensitive' } },
            { action: { contains: 'TINA', mode: 'insensitive' } },
            { action: { contains: 'FISCAL', mode: 'insensitive' } },
            { action: { contains: 'PAYMENT', mode: 'insensitive' } },
          ],
        });
      } else if (cat === 'system') {
        andConditions.push({
          AND: [
            { entityType: { not: { contains: 'ORDER' } } },
            { entityType: { not: { contains: 'STATION' } } },
            { entityType: { not: { contains: 'PAYMENT' } } },
            { entityType: { not: { contains: 'CASH' } } },
          ],
        });
      }
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const orderDir: Prisma.SortOrder = opts?.order === 'asc' ? 'asc' : 'desc';
    let orderBy: Prisma.AuditEventOrderByWithRelationInput = {
      occurredAt: orderDir,
    };
    if (opts?.sort === 'action') {
      orderBy = { action: orderDir };
    } else if (opts?.sort === 'entityType') {
      orderBy = { entityType: orderDir };
    }

    const [
      total,
      events,
      todayCount,
      fulfillmentToday,
      paymentToday,
      orderToday,
    ] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          actorUser: { select: { displayName: true } },
          actorStaff: { select: { employeeDisplayName: true } },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          tenantId: context.tenantId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
          occurredAt: { gte: startOfDay },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          tenantId: context.tenantId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
          occurredAt: { gte: startOfDay },
          OR: [
            { entityType: { contains: 'STATION', mode: 'insensitive' } },
            { entityType: { contains: 'FULFILL', mode: 'insensitive' } },
            { action: { contains: 'READY', mode: 'insensitive' } },
            { action: { contains: 'PREPAR', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          tenantId: context.tenantId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
          occurredAt: { gte: startOfDay },
          OR: [
            { entityType: { contains: 'PAYMENT', mode: 'insensitive' } },
            { entityType: { contains: 'CASH', mode: 'insensitive' } },
            { entityType: { contains: 'TRANSFER', mode: 'insensitive' } },
            { action: { contains: 'PAYMENT', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          tenantId: context.tenantId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
          occurredAt: { gte: startOfDay },
          OR: [
            { entityType: { contains: 'ORDER', mode: 'insensitive' } },
            { action: { contains: 'ORDER', mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    const mapped = events.map((event) => this.toDto(event));
    const totalPages = Math.ceil(total / limit);

    const summary: AuditSummaryDto = {
      totalToday: todayCount,
      fulfillmentToday,
      paymentToday,
      orderToday,
      systemToday: Math.max(
        todayCount - (fulfillmentToday + paymentToday + orderToday),
        0,
      ),
    };

    return {
      data: mapped,
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  private toDto(event: {
    id: string;
    occurredAt: Date;
    action: string;
    entityType: string;
    entityId: string | null;
    reason: string | null;
    newStateJson: Prisma.JsonValue | null;
    metadataJson: Prisma.JsonValue | null;
    actorRestaurantRole: string | null;
    actorPlatformRole: string | null;
    actorUser: { displayName: string } | null;
    actorStaff: { employeeDisplayName: string } | null;
  }): AuditEventDto {
    const category = categoryFor(event.entityType, event.action);
    const presentation = presentAction(event.action, category);
    const details =
      event.reason ||
      detailsFromJson(event.newStateJson) ||
      detailsFromJson(event.metadataJson);

    return {
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      timestampLabel: formatTimestamp(event.occurredAt),
      actorName:
        event.actorStaff?.employeeDisplayName ||
        event.actorUser?.displayName ||
        'System',
      actorRole: formatRole(
        event.actorRestaurantRole || event.actorPlatformRole || 'SYSTEM',
      ),
      action: event.action,
      actionLabel: presentation.label,
      category,
      badgeLabel: presentation.badge,
      badgeVariant: presentation.variant,
      details,
      entityType: event.entityType,
      entityId: event.entityId,
    };
  }
}

function emptySummary(): AuditSummaryDto {
  return {
    totalToday: 0,
    fulfillmentToday: 0,
    paymentToday: 0,
    orderToday: 0,
    systemToday: 0,
  };
}

function categoryFor(entityType: string, action: string): AuditCategory {
  const entity = entityType.toUpperCase();
  const act = action.toUpperCase();
  if (
    entity.includes('ORDER') ||
    act.includes('ORDER') ||
    act.includes('CANCEL') ||
    act.includes('CHANGE_REQUEST')
  ) {
    return 'orders';
  }
  if (
    entity.includes('STATION') ||
    entity.includes('FULFILL') ||
    act.includes('READY') ||
    act.includes('PREPAR') ||
    act.includes('ACKNOWLEDGE')
  ) {
    return 'fulfillment';
  }
  if (
    entity.includes('PAYMENT') ||
    entity.includes('CASH') ||
    entity.includes('BILL') ||
    entity.includes('RECONCIL') ||
    entity.includes('TRANSFER') ||
    act.includes('TINA') ||
    act.includes('FISCAL') ||
    act.includes('PAYMENT')
  ) {
    return 'payments';
  }
  return 'system';
}

function presentAction(
  action: string,
  category: AuditCategory,
): {
  label: string;
  badge: string;
  variant: AuditEventDto['badgeVariant'];
} {
  const key = action.toUpperCase();
  const map: Record<
    string,
    { label: string; badge: string; variant: AuditEventDto['badgeVariant'] }
  > = {
    CONFIRM_ORDER: {
      label: 'Order confirmed and sent to stations',
      badge: 'Order Sent',
      variant: 'default',
    },
    CONFIRM_CASH_PAYMENT: {
      label: 'Cash payment confirmed',
      badge: 'Payment Confirmed',
      variant: 'success',
    },
    CONFIRM_TRANSFER_PAYMENT: {
      label: 'Transfer payment confirmed',
      badge: 'Payment Confirmed',
      variant: 'success',
    },
    CONFIRM_CASH_DROP_RECEIPT: {
      label: 'Cash drop received by cashier',
      badge: 'Cash Drop',
      variant: 'secondary',
    },
    GENERATE_DAILY_CLOSE: {
      label: 'Operational daily close generated',
      badge: 'Daily Close',
      variant: 'secondary',
    },
    APPROVE_DAILY_CLOSE: {
      label: 'Daily close approved',
      badge: 'Daily Close',
      variant: 'success',
    },
    LOCK_DAILY_CLOSE: {
      label: 'Business day locked',
      badge: 'Day Locked',
      variant: 'warning',
    },
    MARK_ITEM_READY: {
      label: 'Marked dish ready',
      badge: 'Dish Ready',
      variant: 'success',
    },
    START_PREPARATION: {
      label: 'Started preparation',
      badge: 'Prep Started',
      variant: 'default',
    },
    REQUEST_BILL: {
      label: 'Bill requested for table',
      badge: 'Bill Request',
      variant: 'warning',
    },
    ASSIGN_TABLE_COVERAGE: {
      label: 'Waiter table coverage updated',
      badge: 'Table Allocation',
      variant: 'secondary',
    },
    TINAVERIFY_SCAN: {
      label: 'TinaVerify QR scan validation initiated',
      badge: 'Fiscal Check',
      variant: 'warning',
    },
    OPEN_CASHIER_SESSION: {
      label: 'Cashier session opened',
      badge: 'Shift Open',
      variant: 'secondary',
    },
    SYSTEM_HEALTH_CHECK: {
      label: 'System health check & cloud sync completed',
      badge: 'System Sync',
      variant: 'secondary',
    },
  };

  if (map[key]) return map[key];

  const fallbackBadge =
    category === 'orders'
      ? 'Order'
      : category === 'fulfillment'
        ? 'Fulfillment'
        : category === 'payments'
          ? 'Payment'
          : 'System';

  return {
    label: action
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    badge: fallbackBadge,
    variant:
      category === 'fulfillment' || category === 'payments'
        ? 'success'
        : 'default',
  };
}

function detailsFromJson(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof obj.status === 'string') parts.push(`Status: ${obj.status}`);
  if (typeof obj.amount === 'number') {
    parts.push(`Amount: ETB ${obj.amount.toLocaleString()}`);
  }
  if (typeof obj.tableDisplayName === 'string') {
    parts.push(`Table ${obj.tableDisplayName}`);
  }
  if (typeof obj.itemName === 'string') parts.push(obj.itemName);
  if (typeof obj.stationName === 'string') parts.push(obj.stationName);
  if (typeof obj.blockingIssueCount === 'number') {
    parts.push(`${obj.blockingIssueCount} blocking issue(s)`);
  }
  if (typeof obj.summary === 'string') parts.push(obj.summary);
  return parts.length ? parts.join(' · ') : null;
}

function formatRole(role: string) {
  return role
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(date: Date) {
  const now = new Date();
  const sameDay =
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate();
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return sameDay ? `Today · ${time}` : `${ymd(date)} · ${time}`;
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}
