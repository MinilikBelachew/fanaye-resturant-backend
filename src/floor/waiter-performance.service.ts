import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import {
  WaiterPerformanceResponseDto,
  WaiterPerformanceRowDto,
} from './dto/waiter-performance-response.dto';
import {
  WaiterDetailResponseDto,
  WaiterOrderHistoryResponseDto,
} from './dto/waiter-detail.dto';

const ADMIN_ROLES = ['MANAGER', 'OWNER_ADMIN'];

type Period = 'day' | 'week' | 'month';

@Injectable()
export class WaiterPerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async list(
    userId: string,
    periodRaw?: string,
  ): Promise<WaiterPerformanceResponseDto> {
    const context = await this.requireAdmin(userId);
    const period = this.parsePeriod(periodRaw);
    const { from, to } = this.rangeFor(period);

    const waiters = await this.prisma.tenantStaffMembership.findMany({
      where: {
        tenantId: context.tenantId!,
        status: 'ACTIVE',
        branchAssignments: {
          some: { branchId: context.branchId!, status: 'ACTIVE' },
        },
        roleAssignments: {
          some: { status: 'ACTIVE', role: { code: 'WAITER' } },
        },
      },
      include: {
        user: true,
        shiftTableCoverages: {
          where: { branchId: context.branchId! },
          include: { shiftDefinition: true },
        },
      },
      orderBy: { employeeDisplayName: 'asc' },
    });

    const sessions = await this.prisma.shiftSession.findMany({
      where: {
        branchId: context.branchId!,
        businessDate: { gte: from, lte: to },
        staffMembershipId: { in: waiters.map((w) => w.id) },
      },
      include: {
        assignment: { include: { definition: true } },
      },
      orderBy: { clockInAt: 'asc' },
    });

    const sessionIds = sessions.map((s) => s.id);
    const [orders, payments, drops, tables] = await Promise.all([
      this.prisma.order.findMany({
        where: { waiterShiftSessionId: { in: sessionIds } },
        include: { items: true },
      }),
      this.prisma.payment.findMany({
        where: {
          branchId: context.branchId!,
          collectorShiftSessionId: { in: sessionIds },
        },
      }),
      this.prisma.cashDrop.findMany({
        where: { waiterShiftSessionId: { in: sessionIds } },
      }),
      this.prisma.tableSession.findMany({
        where: { primaryWaiterShiftSessionId: { in: sessionIds } },
        select: {
          id: true,
          primaryWaiterShiftSessionId: true,
          primaryWaiterMembershipId: true,
        },
      }),
    ]);

    const now = new Date();
    const rows: WaiterPerformanceRowDto[] = waiters.map((waiter) => {
      const waiterSessions = sessions.filter(
        (s) => s.staffMembershipId === waiter.id,
      );
      const waiterSessionIds = new Set(waiterSessions.map((s) => s.id));

      let hoursWorked = 0;
      for (const session of waiterSessions) {
        const end = session.clockOutAt ?? now;
        hoursWorked += Math.max(
          0,
          (end.getTime() - session.clockInAt.getTime()) / 3_600_000,
        );
      }

      const openSession = waiterSessions.find(
        (s) => s.state === 'OPEN' && !s.clockOutAt,
      );

      let netAttributedSales = new Prisma.Decimal(0);
      let ordersCreatedCount = 0;
      for (const order of orders) {
        if (!waiterSessionIds.has(order.waiterShiftSessionId!)) continue;
        ordersCreatedCount += 1;
        for (const item of order.items) {
          if (['CANCELLED', 'VOIDED'].includes(item.state)) continue;
          netAttributedSales = netAttributedSales.plus(
            new Prisma.Decimal(item.unitPriceSnapshot).mul(item.quantity),
          );
        }
      }

      const cashCollected = payments
        .filter(
          (p) =>
            p.collectorShiftSessionId &&
            waiterSessionIds.has(p.collectorShiftSessionId) &&
            p.method === 'CASH' &&
            p.status === 'SETTLED',
        )
        .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));

      const verifiedTransferAmount = payments
        .filter(
          (p) =>
            p.collectorShiftSessionId &&
            waiterSessionIds.has(p.collectorShiftSessionId) &&
            p.method === 'TRANSFER' &&
            ['SETTLED', 'VERIFIED'].includes(p.status),
        )
        .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));

      const cashDropped = drops
        .filter(
          (d) =>
            waiterSessionIds.has(d.waiterShiftSessionId) &&
            (d.status === 'RECEIVED' || d.status === 'RESOLVED'),
        )
        .reduce(
          (sum, d) =>
            sum.plus(d.resolutionAmount ?? d.countedAmount ?? d.declaredAmount),
          new Prisma.Decimal(0),
        );

      const pendingDrops = drops
        .filter(
          (d) =>
            waiterSessionIds.has(d.waiterShiftSessionId) &&
            (d.status === 'INITIATED' || d.status === 'DISPUTED'),
        )
        .reduce((sum, d) => sum.plus(d.declaredAmount), new Prisma.Decimal(0));

      const undroppedCash = Prisma.Decimal.max(
        cashCollected.minus(cashDropped).minus(pendingDrops),
        0,
      );

      const tablesServedCount = new Set(
        tables
          .filter((t) => waiterSessionIds.has(t.primaryWaiterShiftSessionId))
          .map((t) => t.id),
      ).size;

      const coverageByShift = new Map<
        string,
        {
          shiftDefinitionId: string;
          shiftName: string;
          startLocalTime: string;
          endLocalTime: string;
          tableCount: number;
        }
      >();
      for (const row of waiter.shiftTableCoverages) {
        const key = row.shiftDefinitionId;
        if (!coverageByShift.has(key)) {
          coverageByShift.set(key, {
            shiftDefinitionId: row.shiftDefinition.id,
            shiftName: row.shiftDefinition.name,
            startLocalTime: formatTime(row.shiftDefinition.startLocalTime),
            endLocalTime: formatTime(row.shiftDefinition.endLocalTime),
            tableCount: 0,
          });
        }
        coverageByShift.get(key)!.tableCount += 1;
      }

      return {
        waiterMembershipId: waiter.id,
        waiterName: waiter.employeeDisplayName,
        phone: waiter.user?.phone ?? null,
        active: waiter.status === 'ACTIVE',
        clockedIn: Boolean(openSession),
        clockInAt: openSession?.clockInAt?.toISOString() ?? null,
        clockOutAt: openSession?.clockOutAt?.toISOString() ?? null,
        hoursWorked: Number(hoursWorked.toFixed(2)),
        sessionsCount: waiterSessions.length,
        assignedShifts: [...coverageByShift.values()].sort((a, b) =>
          a.startLocalTime.localeCompare(b.startLocalTime),
        ),
        ordersCreatedCount,
        tablesServedCount,
        netAttributedSales: money(netAttributedSales),
        cashCollected: money(cashCollected),
        cashDropped: money(cashDropped),
        undroppedCash: money(undroppedCash),
        verifiedTransferAmount: money(verifiedTransferAmount),
      };
    });

    const summary = {
      waiterCount: rows.length,
      clockedInCount: rows.filter((r) => r.clockedIn).length,
      totalHoursWorked: Number(
        rows.reduce((sum, r) => sum + r.hoursWorked, 0).toFixed(2),
      ),
      totalNetSales: money(
        rows.reduce(
          (sum, r) => sum.plus(r.netAttributedSales),
          new Prisma.Decimal(0),
        ),
      ),
      totalCashCollected: money(
        rows.reduce(
          (sum, r) => sum.plus(r.cashCollected),
          new Prisma.Decimal(0),
        ),
      ),
      totalUndroppedCash: money(
        rows.reduce(
          (sum, r) => sum.plus(r.undroppedCash),
          new Prisma.Decimal(0),
        ),
      ),
    };

    return {
      period,
      from: ymd(from),
      to: ymd(to),
      currencyCode: 'ETB',
      summary,
      data: rows,
    };
  }

  async getDetail(
    userId: string,
    membershipId: string,
    periodRaw?: string,
  ): Promise<WaiterDetailResponseDto> {
    const context = await this.requireAdmin(userId);
    const period = this.parsePeriod(periodRaw);
    const { from, to } = this.rangeFor(period);

    const waiter = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
        branchAssignments: {
          some: { branchId: context.branchId!, status: 'ACTIVE' },
        },
        roleAssignments: {
          some: { status: 'ACTIVE', role: { code: 'WAITER' } },
        },
      },
      include: {
        user: true,
        shiftTableCoverages: {
          where: { branchId: context.branchId! },
          include: {
            shiftDefinition: true,
            table: { include: { location: true } },
          },
        },
      },
    });
    if (!waiter) {
      throw new NotFoundException('Waiter not found.');
    }

    const sessions = await this.prisma.shiftSession.findMany({
      where: {
        branchId: context.branchId!,
        businessDate: { gte: from, lte: to },
        staffMembershipId: waiter.id,
      },
      orderBy: { clockInAt: 'asc' },
    });
    const sessionIds = sessions.map((s) => s.id);

    const [orders, payments, drops, tableSessions] = await Promise.all([
      this.prisma.order.findMany({
        where: { waiterShiftSessionId: { in: sessionIds } },
        include: { items: true },
      }),
      this.prisma.payment.findMany({
        where: {
          branchId: context.branchId!,
          collectorShiftSessionId: { in: sessionIds },
        },
      }),
      this.prisma.cashDrop.findMany({
        where: { waiterShiftSessionId: { in: sessionIds } },
      }),
      this.prisma.tableSession.findMany({
        where: { primaryWaiterShiftSessionId: { in: sessionIds } },
        select: { id: true },
      }),
    ]);

    const now = new Date();
    let hoursWorked = 0;
    for (const session of sessions) {
      const end = session.clockOutAt ?? now;
      hoursWorked += Math.max(
        0,
        (end.getTime() - session.clockInAt.getTime()) / 3_600_000,
      );
    }
    const openSession = sessions.find(
      (s) => s.state === 'OPEN' && !s.clockOutAt,
    );

    let netAttributedSales = new Prisma.Decimal(0);
    let itemCount = 0;
    for (const order of orders) {
      for (const item of order.items) {
        if (['CANCELLED', 'VOIDED'].includes(item.state)) continue;
        itemCount += item.quantity;
        netAttributedSales = netAttributedSales.plus(
          new Prisma.Decimal(item.unitPriceSnapshot).mul(item.quantity),
        );
      }
    }

    const cashCollected = payments
      .filter((p) => p.method === 'CASH' && p.status === 'SETTLED')
      .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const verifiedTransferAmount = payments
      .filter(
        (p) =>
          p.method === 'TRANSFER' && ['SETTLED', 'VERIFIED'].includes(p.status),
      )
      .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const cashDropped = drops
      .filter((d) => d.status === 'RECEIVED' || d.status === 'RESOLVED')
      .reduce(
        (sum, d) =>
          sum.plus(d.resolutionAmount ?? d.countedAmount ?? d.declaredAmount),
        new Prisma.Decimal(0),
      );
    const pendingDrops = drops
      .filter((d) => d.status === 'INITIATED' || d.status === 'DISPUTED')
      .reduce((sum, d) => sum.plus(d.declaredAmount), new Prisma.Decimal(0));
    const undroppedCash = Prisma.Decimal.max(
      cashCollected.minus(cashDropped).minus(pendingDrops),
      0,
    );

    const coverageByShift = new Map<
      string,
      WaiterDetailResponseDto['assignedShifts'][number]
    >();
    for (const row of waiter.shiftTableCoverages) {
      const key = row.shiftDefinitionId;
      if (!coverageByShift.has(key)) {
        coverageByShift.set(key, {
          shiftDefinitionId: row.shiftDefinition.id,
          shiftName: row.shiftDefinition.name,
          startLocalTime: formatTime(row.shiftDefinition.startLocalTime),
          endLocalTime: formatTime(row.shiftDefinition.endLocalTime),
          tableCount: 0,
          tables: [],
        });
      }
      const entry = coverageByShift.get(key)!;
      entry.tableCount += 1;
      entry.tables.push({
        tableId: row.table.id,
        displayName: row.table.displayName,
        displayNumber: row.table.displayNumber,
        locationName: row.table.location.name,
      });
    }

    return {
      waiterMembershipId: waiter.id,
      waiterName: waiter.employeeDisplayName,
      phone: waiter.user?.phone ?? null,
      email: waiter.user?.email ?? null,
      active: waiter.status === 'ACTIVE',
      clockedIn: Boolean(openSession),
      clockInAt: openSession?.clockInAt?.toISOString() ?? null,
      clockOutAt: openSession?.clockOutAt?.toISOString() ?? null,
      workingDays: waiter.workingDays ?? [],
      period,
      from: ymd(from),
      to: ymd(to),
      currencyCode: 'ETB',
      kpis: {
        hoursWorked: Number(hoursWorked.toFixed(2)),
        sessionsCount: sessions.length,
        ordersCreatedCount: orders.length,
        tablesServedCount: tableSessions.length,
        netAttributedSales: money(netAttributedSales),
        cashCollected: money(cashCollected),
        cashDropped: money(cashDropped),
        undroppedCash: money(undroppedCash),
        verifiedTransferAmount: money(verifiedTransferAmount),
        itemCount,
      },
      assignedShifts: [...coverageByShift.values()].sort((a, b) =>
        a.startLocalTime.localeCompare(b.startLocalTime),
      ),
    };
  }

  async listOrders(
    userId: string,
    membershipId: string,
    opts?: {
      period?: string;
      q?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<WaiterOrderHistoryResponseDto> {
    const context = await this.requireAdmin(userId);
    const period = this.parsePeriod(opts?.period);
    const { from, to } = this.rangeFor(period);

    const waiter = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
        branchAssignments: {
          some: { branchId: context.branchId!, status: 'ACTIVE' },
        },
        roleAssignments: {
          some: { status: 'ACTIVE', role: { code: 'WAITER' } },
        },
      },
      select: { id: true },
    });
    if (!waiter) {
      throw new NotFoundException('Waiter not found.');
    }

    const sessions = await this.prisma.shiftSession.findMany({
      where: {
        branchId: context.branchId!,
        businessDate: { gte: from, lte: to },
        staffMembershipId: waiter.id,
      },
      select: { id: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    const page = Math.max(1, Number(opts?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 20));
    const skip = (page - 1) * limit;
    const q = opts?.q?.trim();

    const where: Prisma.OrderWhereInput = {
      branchId: context.branchId!,
      waiterShiftSessionId: { in: sessionIds },
      ...(q
        ? {
            OR: [
              {
                tableSession: {
                  table: {
                    OR: [
                      { displayName: { contains: q, mode: 'insensitive' } },
                      { displayNumber: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              { status: { contains: q, mode: 'insensitive' } },
              {
                items: {
                  some: {
                    itemNameSnapshot: { contains: q, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { confirmedAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            select: {
              state: true,
              quantity: true,
              unitPriceSnapshot: true,
            },
          },
          tableSession: {
            include: {
              table: {
                select: {
                  id: true,
                  displayName: true,
                  displayNumber: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      waiterMembershipId: membershipId,
      period,
      from: ymd(from),
      to: ymd(to),
      data: rows.map((order) => {
        let netSales = new Prisma.Decimal(0);
        let itemCount = 0;
        for (const item of order.items) {
          if (['CANCELLED', 'VOIDED'].includes(item.state)) continue;
          itemCount += item.quantity;
          netSales = netSales.plus(
            new Prisma.Decimal(item.unitPriceSnapshot).mul(item.quantity),
          );
        }
        const table = order.tableSession.table;
        return {
          orderId: order.id,
          status: order.status,
          confirmedAt: order.confirmedAt.toISOString(),
          businessDate: ymd(order.businessDate),
          tableDisplayName: table.displayName,
          tableDisplayNumber: table.displayNumber,
          tableId: table.id,
          itemCount,
          netSales: money(netSales),
          currencyCode: 'ETB',
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private parsePeriod(raw?: string): Period {
    const value = (raw || 'day').toLowerCase();
    if (value === 'day' || value === 'week' || value === 'month') return value;
    throw new UnprocessableEntityException({
      status: 422,
      errors: { period: 'invalid' },
    });
  }

  private rangeFor(period: Period): { from: Date; to: Date } {
    const now = new Date();
    const to = utcDay(now);
    if (period === 'day') return { from: to, to };
    if (period === 'week') {
      const from = new Date(to);
      from.setUTCDate(from.getUTCDate() - 6);
      return { from, to };
    }
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    return { from, to };
  }

  private async requireAdmin(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId || !context.staffMembershipId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    if (!ADMIN_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Waiter performance is for managers.');
    }
    return context;
  }
}

function utcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatTime(value: Date): string {
  const hours = value.getUTCHours().toString().padStart(2, '0');
  const minutes = value.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function money(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}
