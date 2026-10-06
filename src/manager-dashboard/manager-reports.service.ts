import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { WaiterPerformanceService } from '../floor/waiter-performance.service';
import { ManagerReportsResponseDto } from './dto/manager-reports-response.dto';

type Period = 'day' | 'week' | 'month';
type Section =
  | 'all'
  | 'waiters'
  | 'cancels'
  | 'inventory'
  | 'cash'
  | 'stations';

const ADMIN_ROLES = ['MANAGER', 'OWNER_ADMIN'];

@Injectable()
export class ManagerReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly waiters: WaiterPerformanceService,
  ) {}

  async getReports(
    userId: string,
    periodRaw?: string,
    sectionRaw?: string,
  ): Promise<ManagerReportsResponseDto> {
    const context = await this.requireAdmin(userId);
    const period = this.parsePeriod(periodRaw);
    const section = this.parseSection(sectionRaw);
    const { from, to } = this.rangeFor(period);
    const fromTs = new Date(from);
    const toTs = new Date(to);
    toTs.setUTCHours(23, 59, 59, 999);

    const branch = await this.prisma.branch.findUnique({
      where: { id: context.branchId! },
      select: { name: true },
    });

    const include = (key: Section) => section === 'all' || section === key;

    const [waiters, cancels, inventory, cash, stations] = await Promise.all([
      include('waiters') || include('cash')
        ? this.buildWaiters(userId, period)
        : Promise.resolve(undefined),
      include('cancels')
        ? this.buildCancels(context.branchId!, fromTs, toTs)
        : Promise.resolve(undefined),
      include('inventory')
        ? this.buildInventory(
            context.tenantId!,
            context.branchId!,
            fromTs,
            toTs,
          )
        : Promise.resolve(undefined),
      include('cash')
        ? this.buildCash(context.branchId!, from, to)
        : Promise.resolve(undefined),
      include('stations')
        ? this.buildStations(context.branchId!, from, to)
        : Promise.resolve(undefined),
    ]);

    // cash needs waiter undropped; rebuild cash.byWaiter from waiters if both loaded
    let cashOut = cash;
    if (cash && waiters) {
      cashOut = {
        ...cash,
        undroppedCashTotal: waiters.totalUndroppedCash,
        byWaiter: waiters.rows.map((w) => ({
          waiterMembershipId: w.waiterMembershipId,
          waiterName: w.waiterName,
          dropped: w.cashDropped,
          undropped: w.undroppedCash,
          collected: w.cashCollected,
        })),
      };
    }

    return {
      data: {
        period,
        from: ymd(from),
        to: ymd(to),
        currencyCode: 'ETB',
        branchName: branch?.name ?? 'Branch',
        ...(include('waiters') ? { waiters } : {}),
        ...(include('cancels') ? { cancels } : {}),
        ...(include('inventory') ? { inventory } : {}),
        ...(include('cash') ? { cash: cashOut } : {}),
        ...(include('stations') ? { stations } : {}),
      },
    };
  }

  private async buildWaiters(userId: string, period: Period) {
    const res = await this.waiters.list(userId, period);
    const rows = res.data.map((row) => {
      const sales = Number(row.netAttributedSales) || 0;
      const hours = row.hoursWorked || 0;
      const salesPerHour =
        hours > 0 ? (sales / hours).toFixed(2) : sales.toFixed(2);
      return {
        waiterMembershipId: row.waiterMembershipId,
        waiterName: row.waiterName,
        hoursWorked: Number(row.hoursWorked.toFixed(2)),
        ordersCreatedCount: row.ordersCreatedCount,
        tablesServedCount: row.tablesServedCount,
        netAttributedSales: row.netAttributedSales,
        cashCollected: row.cashCollected,
        cashDropped: row.cashDropped,
        undroppedCash: row.undroppedCash,
        salesPerHour,
      };
    });
    rows.sort(
      (a, b) => Number(b.netAttributedSales) - Number(a.netAttributedSales),
    );
    return {
      waiterCount: res.summary.waiterCount,
      totalHoursWorked: Number(res.summary.totalHoursWorked.toFixed(2)),
      totalNetSales: res.summary.totalNetSales,
      totalOrders: rows.reduce((s, r) => s + r.ordersCreatedCount, 0),
      totalUndroppedCash: res.summary.totalUndroppedCash,
      rows,
    };
  }

  private async buildCancels(branchId: string, from: Date, to: Date) {
    const [cancelledItems, cancelReqs, changeReqs] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: {
          branchId,
          state: 'CANCELLED',
          cancelledAt: { gte: from, lte: to },
        },
        select: {
          itemNameSnapshot: true,
          quantity: true,
          unitPriceSnapshot: true,
        },
      }),
      this.prisma.cancellationRequest.findMany({
        where: { branchId, requestedAt: { gte: from, lte: to } },
        select: { status: true },
      }),
      this.prisma.orderChangeRequest.findMany({
        where: { branchId, requestedAt: { gte: from, lte: to } },
        select: { status: true },
      }),
    ]);

    let cancelledValue = new Prisma.Decimal(0);
    const itemMap = new Map<string, { count: number; value: Prisma.Decimal }>();
    for (const item of cancelledItems) {
      const line = new Prisma.Decimal(item.unitPriceSnapshot).mul(
        item.quantity,
      );
      cancelledValue = cancelledValue.plus(line);
      const prev = itemMap.get(item.itemNameSnapshot) ?? {
        count: 0,
        value: new Prisma.Decimal(0),
      };
      prev.count += item.quantity;
      prev.value = prev.value.plus(line);
      itemMap.set(item.itemNameSnapshot, prev);
    }

    const countStatus = (rows: { status: string }[]) => {
      let approved = 0;
      let rejected = 0;
      let pending = 0;
      for (const r of rows) {
        if (r.status === 'PENDING') pending += 1;
        else if (r.status === 'REJECTED') rejected += 1;
        else approved += 1; // APPROVED | APPLIED
      }
      return { approved, rejected, pending };
    };

    const cancelStats = countStatus(cancelReqs);
    const changeStats = countStatus(changeReqs);
    const approvedCount = cancelStats.approved + changeStats.approved;
    const rejectedCount = cancelStats.rejected + changeStats.rejected;
    const pendingCount = cancelStats.pending + changeStats.pending;
    const decided = approvedCount + rejectedCount;

    return {
      cancelledItemsCount: cancelledItems.reduce((s, i) => s + i.quantity, 0),
      cancelledItemsValue: cancelledValue.toFixed(2),
      cancellationRequests: cancelReqs.length,
      changeRequests: changeReqs.length,
      approvedCount,
      rejectedCount,
      pendingCount,
      approveRate: decided ? Math.round((approvedCount / decided) * 100) : 0,
      rejectRate: decided ? Math.round((rejectedCount / decided) * 100) : 0,
      byType: [
        {
          type: 'CANCELLATION' as const,
          approved: cancelStats.approved,
          rejected: cancelStats.rejected,
          pending: cancelStats.pending,
        },
        {
          type: 'CHANGE' as const,
          approved: changeStats.approved,
          rejected: changeStats.rejected,
          pending: changeStats.pending,
        },
      ],
      topCancelledItems: Array.from(itemMap.entries())
        .map(([itemName, v]) => ({
          itemName,
          count: v.count,
          value: v.value.toFixed(2),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    };
  }

  private async buildInventory(
    tenantId: string,
    branchId: string,
    from: Date,
    to: Date,
  ) {
    const [ingredients, wasteEntries, receiveEntries] = await Promise.all([
      this.prisma.inventoryIngredient.findMany({
        where: { tenantId, branchId, status: 'ACTIVE' },
        include: { balance: true },
      }),
      this.prisma.inventoryLedgerEntry.findMany({
        where: {
          tenantId,
          branchId,
          entryType: 'WASTE',
          createdAt: { gte: from, lte: to },
        },
        include: {
          ingredient: { select: { id: true, name: true, unit: true } },
        },
      }),
      this.prisma.inventoryLedgerEntry.findMany({
        where: {
          tenantId,
          branchId,
          entryType: 'RECEIVE',
          createdAt: { gte: from, lte: to },
        },
        select: { quantityDelta: true, unitCostSnapshot: true },
      }),
    ]);

    let totalStockValue = 0;
    let lowStockCount = 0;
    for (const ing of ingredients) {
      const onHand = Number(ing.balance?.onHandQty ?? 0);
      const unitCost = Number(ing.unitCost ?? 0);
      totalStockValue += onHand * unitCost;
      if (onHand <= Number(ing.parLevel ?? 0)) lowStockCount += 1;
    }

    let wasteQty = 0;
    let wasteValue = 0;
    const wasteMap = new Map<
      string,
      { name: string; unit: string; qty: number; value: number }
    >();
    for (const entry of wasteEntries) {
      const qty = Math.abs(Number(entry.quantityDelta));
      const cost = Number(entry.unitCostSnapshot ?? 0);
      const value = qty * cost;
      wasteQty += qty;
      wasteValue += value;
      const prev = wasteMap.get(entry.ingredientId) ?? {
        name: entry.ingredient.name,
        unit: entry.ingredient.unit,
        qty: 0,
        value: 0,
      };
      prev.qty += qty;
      prev.value += value;
      wasteMap.set(entry.ingredientId, prev);
    }

    let receiveValue = 0;
    for (const entry of receiveEntries) {
      receiveValue +=
        Math.abs(Number(entry.quantityDelta)) *
        Number(entry.unitCostSnapshot ?? 0);
    }

    return {
      totalStockValue: totalStockValue.toFixed(2),
      skuCount: ingredients.length,
      lowStockCount,
      wasteQty: Number(wasteQty.toFixed(3)),
      wasteValue: wasteValue.toFixed(2),
      receiveValue: receiveValue.toFixed(2),
      topWaste: Array.from(wasteMap.entries())
        .map(([ingredientId, v]) => ({
          ingredientId,
          name: v.name,
          unit: v.unit,
          qty: Number(v.qty.toFixed(3)),
          value: v.value.toFixed(2),
        }))
        .sort((a, b) => Number(b.value) - Number(a.value))
        .slice(0, 8),
    };
  }

  private async buildCash(branchId: string, from: Date, to: Date) {
    const drops = await this.prisma.cashDrop.findMany({
      where: {
        branchId,
        businessDate: { gte: from, lte: to },
      },
      include: {
        dispute: true,
        waiter: { select: { id: true, employeeDisplayName: true } },
      },
    });

    let cashDropped = new Prisma.Decimal(0);
    let cashReceived = new Prisma.Decimal(0);
    let pendingDropAmount = new Prisma.Decimal(0);
    let disputedAmount = new Prisma.Decimal(0);
    let varianceTotal = new Prisma.Decimal(0);

    for (const drop of drops) {
      const declared = new Prisma.Decimal(drop.declaredAmount);
      cashDropped = cashDropped.plus(declared);
      if (drop.status === 'RECEIVED' || drop.status === 'RESOLVED') {
        const counted = new Prisma.Decimal(
          drop.countedAmount ?? drop.resolutionAmount ?? drop.declaredAmount,
        );
        cashReceived = cashReceived.plus(counted);
        if (drop.countedAmount != null) {
          varianceTotal = varianceTotal.plus(
            new Prisma.Decimal(drop.countedAmount).minus(declared),
          );
        }
      } else if (drop.status === 'INITIATED') {
        pendingDropAmount = pendingDropAmount.plus(declared);
      } else if (drop.status === 'DISPUTED') {
        disputedAmount = disputedAmount.plus(declared);
        if (drop.dispute) {
          varianceTotal = varianceTotal.plus(drop.dispute.variance);
        }
      }
    }

    return {
      dropCount: drops.length,
      cashDropped: cashDropped.toFixed(2),
      cashReceived: cashReceived.toFixed(2),
      pendingDropAmount: pendingDropAmount.toFixed(2),
      disputedAmount: disputedAmount.toFixed(2),
      varianceTotal: varianceTotal.toFixed(2),
      undroppedCashTotal: '0.00',
      byWaiter: [] as Array<{
        waiterMembershipId: string;
        waiterName: string;
        dropped: string;
        undropped: string;
        collected: string;
      }>,
    };
  }

  private async buildStations(branchId: string, from: Date, to: Date) {
    const stations = await this.prisma.preparationStation.findMany({
      where: { branchId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        defaultDelayThresholdMinutes: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const items = await this.prisma.orderItem.findMany({
      where: {
        branchId,
        businessDate: { gte: from, lte: to },
        currentPreparationStationId: { in: stations.map((s) => s.id) },
        OR: [
          { readyAt: { not: null } },
          { state: { in: ['READY', 'SERVED', 'CANNOT_PREPARE'] } },
        ],
      },
      select: {
        currentPreparationStationId: true,
        state: true,
        queuedAt: true,
        preparationStartedAt: true,
        readyAt: true,
        confirmedAt: true,
      },
    });

    const rows = stations.map((station) => {
      const stationItems = items.filter(
        (i) => i.currentPreparationStationId === station.id,
      );
      const threshold = station.defaultDelayThresholdMinutes ?? 15;
      let prepSum = 0;
      let prepCount = 0;
      let delayedCount = 0;
      let cannotPrepareCount = 0;
      let ticketsCompleted = 0;

      for (const item of stationItems) {
        if (item.state === 'CANNOT_PREPARE') {
          cannotPrepareCount += 1;
          continue;
        }
        const start =
          item.preparationStartedAt ?? item.queuedAt ?? item.confirmedAt;
        const end = item.readyAt;
        if (!end || !start) continue;
        ticketsCompleted += 1;
        const minutes = (end.getTime() - start.getTime()) / 60_000;
        if (minutes >= 0) {
          prepSum += minutes;
          prepCount += 1;
          if (minutes > threshold) delayedCount += 1;
        }
      }

      const avgPrepMinutes =
        prepCount > 0 ? Number((prepSum / prepCount).toFixed(1)) : 0;
      const delayedRate =
        ticketsCompleted > 0
          ? Math.round((delayedCount / ticketsCompleted) * 100)
          : 0;

      return {
        stationId: station.id,
        stationName: station.name,
        ticketsCompleted,
        avgPrepMinutes,
        delayedCount,
        delayedRate,
        cannotPrepareCount,
      };
    });

    const ticketsCompleted = rows.reduce((s, r) => s + r.ticketsCompleted, 0);
    const delayedCount = rows.reduce((s, r) => s + r.delayedCount, 0);
    const cannotPrepareCount = rows.reduce(
      (s, r) => s + r.cannotPrepareCount,
      0,
    );
    const weightedPrep = rows.reduce(
      (s, r) => s + r.avgPrepMinutes * r.ticketsCompleted,
      0,
    );

    return {
      avgPrepMinutes:
        ticketsCompleted > 0
          ? Number((weightedPrep / ticketsCompleted).toFixed(1))
          : 0,
      ticketsCompleted,
      delayedCount,
      delayedRate:
        ticketsCompleted > 0
          ? Math.round((delayedCount / ticketsCompleted) * 100)
          : 0,
      cannotPrepareCount,
      rows: rows.sort((a, b) => b.ticketsCompleted - a.ticketsCompleted),
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

  private parseSection(raw?: string): Section {
    const value = (raw || 'all').toLowerCase();
    if (
      value === 'all' ||
      value === 'waiters' ||
      value === 'cancels' ||
      value === 'inventory' ||
      value === 'cash' ||
      value === 'stations'
    ) {
      return value;
    }
    throw new UnprocessableEntityException({
      status: 422,
      errors: { section: 'invalid' },
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

  private async requireAdmin(userId: string) {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId || !context.staffMembershipId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    if (!ADMIN_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Reports are for managers.');
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
