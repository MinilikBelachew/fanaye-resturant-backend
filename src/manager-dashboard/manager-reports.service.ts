import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CaslService } from '../casl/casl.service';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { WaiterPerformanceService } from '../floor/waiter-performance.service';
import { FbReportResponseDto } from './dto/fb-report.dto';
import { ManagerReportsResponseDto } from './dto/manager-reports-response.dto';

type Period = 'day' | 'week' | 'month';
type Section =
  | 'all'
  | 'waiters'
  | 'cancels'
  | 'inventory'
  | 'cash'
  | 'stations';

@Injectable()
export class ManagerReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly waiters: WaiterPerformanceService,
    private readonly casl: CaslService,
  ) {}

  async getReports(
    userId: string,
    periodRaw?: string,
    sectionRaw?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<ManagerReportsResponseDto> {
    const context = await this.requireAdmin(userId);
    const period = this.parsePeriod(periodRaw);
    const section = this.parseSection(sectionRaw);
    const { from, to } = this.rangeFor(period, fromDate, toDate);
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
        include: {
          balances: { where: { branchId } },
        },
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
      const onHand = (ing.balances ?? []).reduce(
        (sum, row) => sum + Number(row.onHandQty ?? 0),
        0,
      );
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

  async getFbReport(
    userId: string,
    periodRaw?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<FbReportResponseDto> {
    const context = await this.requireAdmin(userId);
    const period = this.parsePeriod(periodRaw);
    const { from, to } = this.rangeFor(period, fromDate, toDate);
    const fromTs = new Date(from);
    const toTs = new Date(to);
    toTs.setUTCHours(23, 59, 59, 999);

    const branch = await this.prisma.branch.findUnique({
      where: { id: context.branchId! },
      select: { name: true },
    });

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        confirmedAt: { gte: fromTs, lte: toTs },
        state: { notIn: ['CANCELLED', 'CANNOT_PREPARE'] },
      },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
            station: {
              select: { id: true, name: true, code: true, workflowMode: true },
            },
            recipeLines: {
              include: {
                ingredient: {
                  select: { id: true, name: true, unit: true, unitCost: true },
                },
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            createdBy: {
              select: {
                employeeDisplayName: true,
              },
            },
          },
        },
        tableSession: {
          select: {
            sessionKind: true,
            table: {
              select: {
                displayName: true,
                displayNumber: true,
              },
            },
            bill: {
              select: {
                billNumber: true,
                status: true,
                totalAmount: true,
                amountPaid: true,
                payments: {
                  select: {
                    method: true,
                    amount: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
        roomSession: {
          select: {
            hotelRoom: {
              select: {
                roomNumber: true,
              },
            },
            bill: {
              select: {
                billNumber: true,
                status: true,
                totalAmount: true,
                amountPaid: true,
                payments: {
                  select: {
                    method: true,
                    amount: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
        outsideOrder: {
          select: {
            customerName: true,
            destinationName: true,
            bills: {
              select: {
                billNumber: true,
                status: true,
                totalAmount: true,
                amountPaid: true,
                payments: {
                  select: {
                    method: true,
                    amount: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
        modifiers: {
          select: {
            optionNameSnapshot: true,
          },
        },
      },
      orderBy: { confirmedAt: 'desc' },
    });

    const wasteEntries = await this.prisma.inventoryLedgerEntry.findMany({
      where: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        entryType: { in: ['WASTE', 'YIELD_TRIM'] },
        createdAt: { gte: fromTs, lte: toTs },
      },
      include: {
        ingredient: { select: { id: true, name: true, unit: true } },
      },
    });

    let totalWasteCost = 0;
    const wasteMap = new Map<
      string,
      { name: string; unit: string; qty: number; cost: number; reason: string }
    >();
    for (const w of wasteEntries) {
      const qty = Math.abs(Number(w.quantityDelta));
      const unitCost = Number(w.unitCostSnapshot ?? 0);
      const cost = qty * unitCost;
      totalWasteCost += cost;
      const prev = wasteMap.get(w.ingredientId) ?? {
        name: w.ingredient?.name ?? 'Unknown',
        unit: w.ingredient?.unit ?? 'units',
        qty: 0,
        cost: 0,
        reason: w.entryType,
      };
      prev.qty += qty;
      prev.cost += cost;
      wasteMap.set(w.ingredientId, prev);
    }

    const topWasteItems = Array.from(wasteMap.values())
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
      .map((item) => ({
        name: item.name,
        unit: item.unit,
        quantityWasted: Math.round(item.qty * 100) / 100,
        wasteCost: item.cost.toFixed(2),
        reason: item.reason,
      }));

    let totalRevenue = 0;
    let totalCost = 0;
    let foodRevenue = 0;
    let foodCost = 0;
    let bevRevenue = 0;
    let bevCost = 0;

    const categoryMap = new Map<
      string,
      { name: string; qty: number; rev: number; cost: number }
    >();
    const stationMap = new Map<
      string,
      { name: string; mode: string; count: number; rev: number; cost: number }
    >();
    const itemMap = new Map<
      string,
      { name: string; station: string; qty: number; rev: number; cost: number }
    >();
    const costDriverMap = new Map<
      string,
      {
        name: string;
        unit: string;
        qty: number;
        cost: number;
        unitCost: number;
      }
    >();
    const dailyVolumeMap = new Map<
      string,
      {
        date: string;
        displayDate: string;
        totalItems: number;
        foodCount: number;
        beverageCount: number;
        totalRevenue: number;
      }
    >();
    const soldItemMap = new Map<
      string,
      {
        id: string;
        name: string;
        categoryName: string;
        station: string;
        qty: number;
        unitPrice: number;
        rev: number;
        cost: number;
        orderCount: number;
        ingredientsMap: Map<
          string,
          {
            name: string;
            unit: string;
            qtyPerServing: number;
            unitCost: number;
          }
        >;
      }
    >();
    const orderInstances: Array<{
      id: string;
      orderId: string;
      menuItemId?: string;
      itemName: string;
      categoryName: string;
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      tableLabel: string;
      waiterName: string;
      confirmedAt: string;
      state: string;
      specialInstruction?: string;
      modifiers: string[];
      billNumber?: string;
      paymentStatus: string;
      billTotal?: string;
      amountPaid?: string;
      paymentMethods: string[];
    }> = [];

    for (const item of orderItems) {
      const qty = item.quantity;
      const rev = Number(item.unitPriceSnapshot) * qty;
      totalRevenue += rev;

      let plateCost = 0;
      if (item.menuItem?.recipeLines && item.menuItem.recipeLines.length > 0) {
        for (const line of item.menuItem.recipeLines) {
          const ingQty = Number(line.quantityPerServing) * qty;
          const unitCost = Number(line.ingredient?.unitCost ?? 0);
          const lineCost = ingQty * unitCost;
          plateCost += lineCost;

          if (line.ingredient) {
            const prevIng = costDriverMap.get(line.ingredient.id) ?? {
              name: line.ingredient.name,
              unit: line.ingredient.unit,
              qty: 0,
              cost: 0,
              unitCost,
            };
            prevIng.qty += ingQty;
            prevIng.cost += lineCost;
            costDriverMap.set(line.ingredient.id, prevIng);
          }
        }
      }

      totalCost += plateCost;

      const stationName =
        item.menuItem?.station?.name ?? item.stationNameSnapshot ?? 'Kitchen';
      const stationMode = item.menuItem?.station?.workflowMode ?? 'FULL_PREP';
      const isBeverage =
        /bar|drink|beverage|coffee|juice|water|tea/i.test(stationName) ||
        (item.menuItem?.category?.name &&
          /drink|beverage|juice|cocktail|smoothie|coffee|tea|wine|beer/i.test(
            item.menuItem.category.name,
          ));

      if (isBeverage) {
        bevRevenue += rev;
        bevCost += plateCost;
      } else {
        foodRevenue += rev;
        foodCost += plateCost;
      }

      const catName = item.menuItem?.category?.name ?? 'Other';
      const prevCat = categoryMap.get(catName) ?? {
        name: catName,
        qty: 0,
        rev: 0,
        cost: 0,
      };
      prevCat.qty += qty;
      prevCat.rev += rev;
      prevCat.cost += plateCost;
      categoryMap.set(catName, prevCat);

      const prevStation = stationMap.get(stationName) ?? {
        name: stationName,
        mode: stationMode,
        count: 0,
        rev: 0,
        cost: 0,
      };
      prevStation.count += qty;
      prevStation.rev += rev;
      prevStation.cost += plateCost;
      stationMap.set(stationName, prevStation);

      const itemName = item.itemNameSnapshot;
      const prevItem = itemMap.get(itemName) ?? {
        name: itemName,
        station: stationName,
        qty: 0,
        rev: 0,
        cost: 0,
      };
      prevItem.qty += qty;
      prevItem.rev += rev;
      prevItem.cost += plateCost;
      itemMap.set(itemName, prevItem);

      // Resolve table / location label
      let tableLabel = 'Takeaway';
      if (item.tableSession) {
        if (item.tableSession.table?.displayName) {
          tableLabel = item.tableSession.table.displayName;
        } else if (item.tableSession.table?.displayNumber != null) {
          tableLabel = `Table ${item.tableSession.table.displayNumber}`;
        } else if (item.tableSession.sessionKind === 'CALL_PICKUP') {
          tableLabel = 'Call Pickup';
        } else {
          tableLabel = 'Dine-In';
        }
      } else if (item.roomSession?.hotelRoom?.roomNumber) {
        tableLabel = `Room ${item.roomSession.hotelRoom.roomNumber}`;
      } else if (item.outsideOrder) {
        tableLabel = item.outsideOrder.destinationName || item.outsideOrder.customerName || 'Outside Order';
      }

      const waiterName = item.order?.createdBy?.employeeDisplayName ?? 'Staff';

      // Date key: YYYY-MM-DD
      const dateKey = item.confirmedAt.toISOString().slice(0, 10);
      const displayDate = new Date(item.confirmedAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      const prevDaily = dailyVolumeMap.get(dateKey) ?? {
        date: dateKey,
        displayDate,
        totalItems: 0,
        foodCount: 0,
        beverageCount: 0,
        totalRevenue: 0,
      };
      prevDaily.totalItems += qty;
      if (isBeverage) {
        prevDaily.beverageCount += qty;
      } else {
        prevDaily.foodCount += qty;
      }
      prevDaily.totalRevenue += rev;
      dailyVolumeMap.set(dateKey, prevDaily);

      // Sold item map
      const itemKey = item.itemNameSnapshot;
      const prevSoldItem = soldItemMap.get(itemKey) ?? {
        id: item.menuItemId ?? item.id,
        name: item.itemNameSnapshot,
        categoryName: catName,
        station: stationName,
        qty: 0,
        unitPrice: Number(item.unitPriceSnapshot),
        rev: 0,
        cost: 0,
        orderCount: 0,
        ingredientsMap: new Map(),
      };
      prevSoldItem.qty += qty;
      prevSoldItem.rev += rev;
      prevSoldItem.cost += plateCost;
      prevSoldItem.orderCount += 1;

      if (item.menuItem?.recipeLines) {
        for (const line of item.menuItem.recipeLines) {
          if (line.ingredient) {
            prevSoldItem.ingredientsMap.set(line.ingredient.id, {
              name: line.ingredient.name,
              unit: line.ingredient.unit,
              qtyPerServing: Number(line.quantityPerServing),
              unitCost: Number(line.ingredient.unitCost ?? 0),
            });
          }
        }
      }
      soldItemMap.set(itemKey, prevSoldItem);

      // Receipt & Payment resolution
      const bill =
        item.tableSession?.bill ??
        item.roomSession?.bill ??
        item.outsideOrder?.bills?.[0];

      let paymentStatus = 'PENDING';
      let billNumber: string | undefined = undefined;
      let billTotal: string | undefined = undefined;
      let amountPaid: string | undefined = undefined;
      const paymentMethods: string[] = [];

      if (bill) {
        billNumber = bill.billNumber;
        billTotal = Number(bill.totalAmount).toFixed(2);
        amountPaid = Number(bill.amountPaid).toFixed(2);
        const paidNum = Number(bill.amountPaid);
        const totalNum = Number(bill.totalAmount);
        if (
          bill.status === 'PAID' ||
          bill.status === 'CLOSED' ||
          (totalNum > 0 && paidNum >= totalNum)
        ) {
          paymentStatus = 'PAID';
        } else if (paidNum > 0) {
          paymentStatus = 'PARTIAL';
        } else {
          paymentStatus = 'UNPAID';
        }

        if (bill.payments && bill.payments.length > 0) {
          for (const p of bill.payments) {
            if (p.method && !paymentMethods.includes(p.method)) {
              paymentMethods.push(p.method);
            }
          }
        }
      }

      // Order instance for drill-down
      orderInstances.push({
        id: item.id,
        orderId: item.orderId,
        menuItemId: item.menuItemId ?? undefined,
        itemName: item.itemNameSnapshot,
        categoryName: catName,
        quantity: qty,
        unitPrice: Number(item.unitPriceSnapshot).toFixed(2),
        totalPrice: rev.toFixed(2),
        tableLabel,
        waiterName,
        confirmedAt: item.confirmedAt.toISOString(),
        state: item.state,
        specialInstruction: item.specialInstruction ?? undefined,
        modifiers: item.modifiers?.map(m => m.optionNameSnapshot) ?? [],
        billNumber,
        paymentStatus,
        billTotal,
        amountPaid,
        paymentMethods,
      });
    }

    const grossProfit = totalRevenue - totalCost;
    const overallCostPct =
      totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
    const overallMarginPct =
      totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    const foodMargin = foodRevenue - foodCost;
    const foodCostPct = foodRevenue > 0 ? (foodCost / foodRevenue) * 100 : 0;
    const foodMarginPct =
      foodRevenue > 0 ? (foodMargin / foodRevenue) * 100 : 0;
    const foodSharePct =
      totalRevenue > 0 ? (foodRevenue / totalRevenue) * 100 : 0;

    const bevMargin = bevRevenue - bevCost;
    const bevCostPct = bevRevenue > 0 ? (bevCost / bevRevenue) * 100 : 0;
    const bevMarginPct = bevRevenue > 0 ? (bevMargin / bevRevenue) * 100 : 0;
    const bevSharePct =
      totalRevenue > 0 ? (bevRevenue / totalRevenue) * 100 : 0;

    const categories = Array.from(categoryMap.values())
      .sort((a, b) => b.rev - a.rev)
      .map((c) => {
        const margin = c.rev - c.cost;
        return {
          categoryName: c.name,
          quantitySold: c.qty,
          revenue: c.rev.toFixed(2),
          cost: c.cost.toFixed(2),
          grossMargin: margin.toFixed(2),
          marginPct: c.rev > 0 ? Math.round((margin / c.rev) * 1000) / 10 : 0,
          costPct: c.rev > 0 ? Math.round((c.cost / c.rev) * 1000) / 10 : 0,
        };
      });

    const stations = Array.from(stationMap.values())
      .sort((a, b) => b.rev - a.rev)
      .map((s) => ({
        stationName: s.name,
        workflowMode: s.mode,
        itemsPrepared: s.count,
        revenue: s.rev.toFixed(2),
        cost: s.cost.toFixed(2),
        costPct: s.rev > 0 ? Math.round((s.cost / s.rev) * 1000) / 10 : 0,
      }));

    const topCostDrivers = Array.from(costDriverMap.values())
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
      .map((ing) => ({
        name: ing.name,
        unit: ing.unit,
        quantityConsumed: Math.round(ing.qty * 100) / 100,
        totalCost: ing.cost.toFixed(2),
        unitCost: ing.unitCost.toFixed(2),
        costSharePct:
          totalCost > 0 ? Math.round((ing.cost / totalCost) * 1000) / 10 : 0,
      }));

    const allItems = Array.from(itemMap.values()).map((i) => {
      const profit = i.rev - i.cost;
      return {
        name: i.name,
        station: i.station,
        quantitySold: i.qty,
        revenue: i.rev.toFixed(2),
        cost: i.cost.toFixed(2),
        profit: profit.toFixed(2),
        marginPct: i.rev > 0 ? Math.round((profit / i.rev) * 1000) / 10 : 0,
      };
    });

    const topSellingItems = [...allItems]
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5);
    const topProfitableItems = [...allItems]
      .sort((a, b) => Number(b.profit) - Number(a.profit))
      .slice(0, 5);

    const dailyVolumes = Array.from(dailyVolumeMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => ({
        date: d.date,
        displayDate: d.displayDate,
        totalItems: d.totalItems,
        foodCount: d.foodCount,
        beverageCount: d.beverageCount,
        totalRevenue: d.totalRevenue.toFixed(2),
      }));

    const soldItems = Array.from(soldItemMap.values())
      .sort((a, b) => b.qty - a.qty)
      .map((item) => {
        const profit = item.rev - item.cost;
        const ingredients = Array.from(item.ingredientsMap.values()).map(
          (ing) => {
            const costPerServing = ing.qtyPerServing * ing.unitCost;
            const totalQtyUsed =
              Math.round(ing.qtyPerServing * item.qty * 100) / 100;
            const totalCostUsed = totalQtyUsed * ing.unitCost;
            return {
              name: ing.name,
              unit: ing.unit,
              quantityPerServing: ing.qtyPerServing,
              unitCost: ing.unitCost.toFixed(2),
              costPerServing: costPerServing.toFixed(2),
              totalQuantityUsed: totalQtyUsed,
              totalCostUsed: totalCostUsed.toFixed(2),
            };
          },
        );

        return {
          id: item.id,
          name: item.name,
          categoryName: item.categoryName,
          station: item.station,
          quantitySold: item.qty,
          unitPrice: item.unitPrice.toFixed(2),
          revenue: item.rev.toFixed(2),
          cost: item.cost.toFixed(2),
          profit: profit.toFixed(2),
          marginPct:
            item.rev > 0 ? Math.round((profit / item.rev) * 1000) / 10 : 0,
          orderCount: item.orderCount,
          ingredients,
        };
      });

    return {
      data: {
        period,
        from: ymd(from),
        to: ymd(to),
        currencyCode: 'ETB',
        branchName: branch?.name ?? 'Main Branch',
        totalRevenue: totalRevenue.toFixed(2),
        totalCost: totalCost.toFixed(2),
        grossProfit: grossProfit.toFixed(2),
        overallCostPct: Math.round(overallCostPct * 10) / 10,
        overallMarginPct: Math.round(overallMarginPct * 10) / 10,
        food: {
          revenue: foodRevenue.toFixed(2),
          cost: foodCost.toFixed(2),
          margin: foodMargin.toFixed(2),
          costPct: Math.round(foodCostPct * 10) / 10,
          marginPct: Math.round(foodMarginPct * 10) / 10,
          sharePct: Math.round(foodSharePct * 10) / 10,
        },
        beverage: {
          revenue: bevRevenue.toFixed(2),
          cost: bevCost.toFixed(2),
          margin: bevMargin.toFixed(2),
          costPct: Math.round(bevCostPct * 10) / 10,
          marginPct: Math.round(bevMarginPct * 10) / 10,
          sharePct: Math.round(bevSharePct * 10) / 10,
        },
        totalWasteCost: totalWasteCost.toFixed(2),
        topWasteItems,
        topCostDrivers,
        categories,
        stations,
        topSellingItems,
        topProfitableItems,
        dailyVolumes,
        soldItems,
        orderInstances,
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

  private rangeFor(
    period: Period,
    fromDate?: string,
    toDate?: string,
  ): { from: Date; to: Date } {
    if (fromDate && toDate) {
      const f = new Date(`${fromDate}T00:00:00.000Z`);
      const t = new Date(`${toDate}T00:00:00.000Z`);
      if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime())) {
        return f.getTime() <= t.getTime() ? { from: f, to: t } : { from: t, to: f };
      }
    }
    const now = new Date();
    const to = utcDay(now);
    if (period === "day") return { from: to, to };
    if (period === "week") {
      const from = new Date(to);
      from.setUTCDate(from.getUTCDate() - 6);
      return { from, to };
    }
    // Rolling last 30 days (aligned with manager dashboard "Last month").
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 29);
    return { from, to };
  }

  private async requireAdmin(userId: string) {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId || !context.staffMembershipId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    this.casl.assertCan(
      context,
      'manage',
      'Report',
      'Reports are for managers.',
    );
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
