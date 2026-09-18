import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  HourlySalesPointDto,
  ManagerDashboardDataDto,
  ManagerDashboardResponseDto,
  ManagerKpiDto,
  OrderVolumePointDto,
  PaymentChannelBreakdownItemDto,
  PrepDurationBucketDto,
  RevenueVsCollectionsPointDto,
  StationThroughputPointDto,
  TopSellingDishDto,
  WeeklyCashMovementPointDto,
  BranchRevenueResponseDto,
} from './dto/manager-dashboard-response.dto';

export type BranchRevenuePeriod = 'month' | 'quarter' | 'year';

/** Local calendar day — matches floor/shifts businessDate storage. */
function startOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseBusinessDate(raw?: string): Date {
  if (!raw) return startOfLocalDay();
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return startOfLocalDay();
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatK(val: number): string {
  if (val >= 1_000_000) {
    return `ETB ${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `ETB ${(val / 1_000).toFixed(1)}k`;
  }
  return `ETB ${Math.round(val).toLocaleString()}`;
}

function pctDelta(current: number, previous: number): string {
  if (previous <= 0) {
    return current > 0 ? '+100%' : '0%';
  }
  const diff = ((current - previous) / previous) * 100;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`;
}

function prepSeconds(item: {
  readyAt: Date | null;
  preparationStartedAt: Date | null;
  queuedAt: Date | null;
}): number | null {
  if (item.readyAt && item.preparationStartedAt) {
    const sec = Math.round(
      (item.readyAt.getTime() - item.preparationStartedAt.getTime()) / 1000,
    );
    return sec > 0 && sec < 7200 ? sec : null;
  }
  if (item.readyAt && item.queuedAt) {
    const sec = Math.round(
      (item.readyAt.getTime() - item.queuedAt.getTime()) / 1000,
    );
    return sec > 0 && sec < 7200 ? sec : null;
  }
  return null;
}

function avgMinutes(seconds: number[]): number {
  if (seconds.length === 0) return 0;
  return Number(
    (seconds.reduce((a, b) => a + b, 0) / seconds.length / 60).toFixed(1),
  );
}

@Injectable()
export class ManagerDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async getDashboard(
    userId: string,
    businessDateRaw?: string,
  ): Promise<ManagerDashboardResponseDto> {
    const context = await this.identity.getByUserId(userId);
    const role = context.roleCode ?? '';
    const allowed = new Set([
      'MANAGER',
      'OWNER_ADMIN',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
      'PLATFORM_SUPER_ADMIN',
    ]);
    if (!allowed.has(role)) {
      throw new ForbiddenException(
        'Manager dashboard requires manager access.',
      );
    }
    if (!context.tenantId) {
      throw new ForbiddenException(
        'No restaurant tenant on this account. Dashboard is tenant-scoped.',
      );
    }

    let branchId = context.branchId;
    let branchName = context.branchName ?? 'Main Branch';

    if (!branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { tenantId: context.tenantId, status: 'ACTIVE' },
      });
      if (branch) {
        branchId = branch.id;
        branchName = branch.name;
      }
    }

    if (!branchId) {
      throw new NotFoundException(
        'No active branch found for this restaurant.',
      );
    }

    const businessDate = parseBusinessDate(businessDateRaw);
    const yesterdayDate = startOfLocalDay(businessDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);

    const sevenDaysAgo = startOfLocalDay(businessDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const [
      tables,
      activeSessions,
      todaySessions,
      todayBills,
      todayPayments,
      yesterdayClose,
      todayOrderItems,
      yesterdayOrderItems,
      past7Payments,
      past7CashDrops,
      past7Bills,
      past7Orders,
      past7Sessions,
      pendingBillRequests,
      pendingCashDrops,
    ] = await Promise.all([
      this.prisma.diningTable.findMany({
        where: { branchId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.prisma.tableSession.findMany({
        where: {
          branchId,
          businessDate,
          status: { not: 'CLOSED' },
        },
        select: { id: true, tableId: true },
      }),
      this.prisma.tableSession.findMany({
        where: { branchId, businessDate },
        select: { id: true, guestCount: true, status: true },
      }),
      this.prisma.bill.findMany({
        where: { branchId, businessDate },
        select: {
          totalAmount: true,
          subtotalAmount: true,
          cancelledAmount: true,
          amountPaid: true,
          generatedAt: true,
        },
      }),
      this.prisma.payment.findMany({
        where: { branchId, businessDate },
        select: {
          amount: true,
          method: true,
          status: true,
          transferChannel: true,
          initiatedAt: true,
          collectedAt: true,
          settledAt: true,
          verifiedAt: true,
        },
      }),
      this.prisma.operationalDailyClose.findUnique({
        where: {
          branchId_businessDate: {
            branchId,
            businessDate: yesterdayDate,
          },
        },
      }),
      this.prisma.orderItem.findMany({
        where: { branchId, businessDate },
        include: { currentStation: true },
      }),
      this.prisma.orderItem.findMany({
        where: { branchId, businessDate: yesterdayDate },
        select: {
          readyAt: true,
          preparationStartedAt: true,
          queuedAt: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          branchId,
          businessDate: { gte: sevenDaysAgo, lte: businessDate },
          status: { in: ['SETTLED', 'VERIFIED'] },
        },
        select: { amount: true, method: true, businessDate: true },
      }),
      this.prisma.cashDrop.findMany({
        where: {
          branchId,
          businessDate: { gte: sevenDaysAgo, lte: businessDate },
          status: { in: ['CONFIRMED', 'COLLECTED', 'RECEIVED'] },
        },
        select: {
          declaredAmount: true,
          countedAmount: true,
          businessDate: true,
        },
      }),
      this.prisma.bill.findMany({
        where: {
          branchId,
          businessDate: { gte: sevenDaysAgo, lte: businessDate },
        },
        select: {
          totalAmount: true,
          subtotalAmount: true,
          businessDate: true,
        },
      }),
      this.prisma.order.findMany({
        where: {
          branchId,
          businessDate: { gte: sevenDaysAgo, lte: businessDate },
        },
        select: { businessDate: true },
      }),
      this.prisma.tableSession.findMany({
        where: {
          branchId,
          businessDate: { gte: sevenDaysAgo, lte: businessDate },
        },
        select: { businessDate: true, guestCount: true },
      }),
      this.prisma.billRequest.count({
        where: { branchId, status: 'PENDING' },
      }),
      this.prisma.cashDrop.count({
        where: {
          branchId,
          status: { in: ['INITIATED', 'DISPUTED'] },
        },
      }),
    ]);

    let todayGross = 0;
    let todayNetRevenue = 0;
    let todayPaidOnBills = 0;
    for (const b of todayBills) {
      todayGross += Number(b.subtotalAmount);
      todayNetRevenue += Number(b.totalAmount);
      todayPaidOnBills += Number(b.amountPaid);
    }

    let todayCashSales = 0;
    let todayVerifiedTransferSales = 0;
    const channelTotals: Record<string, number> = {
      telebirr: 0,
      cbe: 0,
      transfer: 0,
      cash: 0,
      other: 0,
    };

    const settledStatuses = new Set(['SETTLED', 'VERIFIED']);
    const cashStatuses = new Set([
      'COLLECTED',
      'SETTLED',
      'VERIFIED',
      'RECORDED',
      'CAPTURED',
    ]);

    for (const p of todayPayments) {
      const amt = Number(p.amount);

      if (p.method === 'CASH') {
        if (!cashStatuses.has(p.status) && !settledStatuses.has(p.status)) {
          // Include cash unless explicitly cancelled/failed
          if (['CANCELLED', 'FAILED', 'VOID'].includes(p.status)) continue;
        }
        todayCashSales += amt;
        channelTotals.cash += amt;
        continue;
      }

      if (p.method === 'TRANSFER' && settledStatuses.has(p.status)) {
        todayVerifiedTransferSales += amt;
        const ch = (p.transferChannel ?? '').toUpperCase();
        if (ch.includes('TELEBIRR')) {
          channelTotals.telebirr += amt;
        } else if (ch.includes('CBE')) {
          channelTotals.cbe += amt;
        } else if (
          ch.includes('AWASH') ||
          ch.includes('DASHEN') ||
          ch.includes('BANK')
        ) {
          channelTotals.transfer += amt;
        } else {
          channelTotals.other += amt;
        }
      }
    }

    const totalCollections = todayCashSales + todayVerifiedTransferSales;
    const billedToday =
      todayNetRevenue > 0 ? todayNetRevenue : todayPaidOnBills;
    const finalRevenue = billedToday > 0 ? billedToday : totalCollections;
    const collectionGap = Math.max(0, billedToday - totalCollections);

    let revTrend = '0%';
    let revTrendLabel = 'vs yesterday';
    if (yesterdayClose && Number(yesterdayClose.netBilledSales) > 0) {
      revTrend = pctDelta(finalRevenue, Number(yesterdayClose.netBilledSales));
    } else if (finalRevenue > 0) {
      revTrend = '+100%';
      revTrendLabel = 'first sales of day';
    }

    const prepDurationsSec: number[] = [];
    for (const item of todayOrderItems) {
      const sec = prepSeconds(item);
      if (sec != null) prepDurationsSec.push(sec);
    }
    const avgPrepMinutes = avgMinutes(prepDurationsSec);

    const yesterdayPrepSec: number[] = [];
    for (const item of yesterdayOrderItems) {
      const sec = prepSeconds(item);
      if (sec != null) yesterdayPrepSec.push(sec);
    }
    const yesterdayAvgPrep = avgMinutes(yesterdayPrepSec);

    let prepTrend = '0%';
    let prepTrendLabel = 'no tickets completed today';
    if (prepDurationsSec.length > 0 && yesterdayAvgPrep > 0) {
      // Lower prep time is better — invert sign for "faster"
      const raw =
        ((avgPrepMinutes - yesterdayAvgPrep) / yesterdayAvgPrep) * 100;
      prepTrend = `${-raw >= 0 ? '+' : ''}${(-raw).toFixed(0)}%`;
      prepTrendLabel = raw <= 0 ? 'faster vs yesterday' : 'slower vs yesterday';
    } else if (prepDurationsSec.length > 0) {
      prepTrend = 'Live';
      prepTrendLabel = `${prepDurationsSec.length} tickets completed`;
    }

    const totalTablesCount = tables.length;
    const activeTablesCount = activeSessions.length;
    const occupancyPercent =
      totalTablesCount > 0
        ? Math.round((activeTablesCount / totalTablesCount) * 100)
        : 0;

    const tinaMixPercent =
      totalCollections > 0
        ? Number(
            ((todayVerifiedTransferSales / totalCollections) * 100).toFixed(1),
          )
        : 0;

    const yesterdayCollected = yesterdayClose
      ? Number(yesterdayClose.cashSales) +
        Number(yesterdayClose.verifiedTransferSales)
      : 0;
    const yesterdayDigitalShare =
      yesterdayCollected > 0
        ? (Number(yesterdayClose!.verifiedTransferSales) / yesterdayCollected) *
          100
        : 0;

    let tinaTrend = tinaMixPercent > 0 ? `+${tinaMixPercent}%` : '0%';
    let tinaTrendLabel =
      totalCollections > 0 ? 'digital transfer share' : 'no collections yet';
    if (yesterdayDigitalShare > 0 && totalCollections > 0) {
      tinaTrend = pctDelta(tinaMixPercent, yesterdayDigitalShare);
      tinaTrendLabel = 'vs yesterday mix';
    }

    const stationBacklogCount = todayOrderItems.filter((item) =>
      ['QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION'].includes(item.state),
    ).length;
    const readyItemCount = todayOrderItems.filter(
      (item) => item.state === 'READY',
    ).length;
    const cancelledItemsCount = todayOrderItems.filter(
      (item) => item.state === 'CANCELLED' || item.cancelledAt,
    ).length;
    const pendingActionsCount = pendingBillRequests + pendingCashDrops;

    const coversCount = todaySessions.reduce(
      (sum, s) => sum + (s.guestCount ?? 0),
      0,
    );
    const ordersCount = new Set(todayOrderItems.map((i) => i.orderId)).size;
    const closedOrBilledSessions = todaySessions.filter(
      (s) => s.status === 'CLOSED' || s.status === 'BILL_REQUESTED',
    ).length;
    const checkBase =
      todayBills.length > 0 ? todayBills.length : closedOrBilledSessions || 1;
    const avgCheckValue =
      billedToday > 0 && todayBills.length > 0
        ? billedToday / todayBills.length
        : billedToday / checkBase;

    const kpis: ManagerKpiDto = {
      dailyRevenueFormatted: formatK(finalRevenue),
      dailyRevenueValue: finalRevenue,
      dailyRevenueTrend: revTrend,
      dailyRevenueTrendLabel: revTrendLabel,
      avgPrepTimeFormatted: `${avgPrepMinutes} min`,
      avgPrepTimeMinutes: avgPrepMinutes,
      avgPrepTimeTrend: prepTrend,
      avgPrepTimeTrendLabel: prepTrendLabel,
      activeTablesFormatted: `${activeTablesCount} / ${totalTablesCount}`,
      activeTablesCount,
      totalTablesCount,
      floorCapacityPercentage: `${occupancyPercent}%`,
      tinaVerifyMixPercentage: `${tinaMixPercent}%`,
      tinaVerifyMixValue: tinaMixPercent,
      tinaVerifyTrend: tinaTrend,
      tinaVerifyTrendLabel: tinaTrendLabel,
      collectionsFormatted: formatK(totalCollections),
      collectionsValue: totalCollections,
      stationBacklogFormatted: String(stationBacklogCount),
      stationBacklogCount,
      stationBacklogHint:
        readyItemCount > 0
          ? `${readyItemCount} ready to run`
          : stationBacklogCount > 0
            ? 'in kitchen / bar'
            : 'stations clear',
      pendingActionsFormatted: String(pendingActionsCount),
      pendingBillRequests,
      pendingCashDrops,
      pendingActionsHint:
        pendingActionsCount === 0
          ? 'nothing waiting'
          : [
              pendingBillRequests > 0
                ? `${pendingBillRequests} bill req`
                : null,
              pendingCashDrops > 0 ? `${pendingCashDrops} cash drop` : null,
            ]
              .filter(Boolean)
              .join(' · '),
      billedFormatted: formatK(billedToday),
      billedValue: billedToday,
      collectionGapFormatted: formatK(collectionGap),
      collectionGapValue: collectionGap,
      avgCheckFormatted: formatK(avgCheckValue),
      avgCheckValue,
      coversFormatted: String(coversCount),
      coversCount,
      ordersFormatted: String(ordersCount),
      ordersCount,
      cancelledItemsFormatted: String(cancelledItemsCount),
      cancelledItemsCount,
    };

    const totalChannelVolume = Object.values(channelTotals).reduce(
      (a, b) => a + b,
      0,
    );
    const paymentChannels: PaymentChannelBreakdownItemDto[] = [
      {
        id: 'telebirr',
        name: 'Telebirr',
        color: '#e85d04',
        amountValue: channelTotals.telebirr,
      },
      {
        id: 'cbe',
        name: 'CBE Birr',
        color: '#ea580c',
        amountValue: channelTotals.cbe,
      },
      {
        id: 'transfer',
        name: 'Bank transfer',
        color: '#f97316',
        amountValue: channelTotals.transfer,
      },
      {
        id: 'cash',
        name: 'Cash',
        color: '#fb923c',
        amountValue: channelTotals.cash,
      },
      {
        id: 'other',
        name: 'Partner / Card',
        color: '#fdba74',
        amountValue: channelTotals.other,
      },
    ].map((ch) => ({
      ...ch,
      sharePercentage:
        totalChannelVolume > 0
          ? Math.round((ch.amountValue / totalChannelVolume) * 100)
          : 0,
      amountFormatted: formatK(ch.amountValue),
    }));

    const prepBuckets: PrepDurationBucketDto[] = [
      { bucket: '< 5m', tickets: 0, label: 'Instant & Drinks' },
      { bucket: '5–10m', tickets: 0, label: 'Fast Kitchen' },
      { bucket: '10–15m', tickets: 0, label: 'Standard Mains' },
      { bucket: '15–20m', tickets: 0, label: 'Oven & Grills' },
      { bucket: '20m+', tickets: 0, label: 'Special Orders' },
    ];
    for (const sec of prepDurationsSec) {
      const min = sec / 60;
      if (min < 5) prepBuckets[0].tickets++;
      else if (min < 10) prepBuckets[1].tickets++;
      else if (min < 15) prepBuckets[2].tickets++;
      else if (min < 20) prepBuckets[3].tickets++;
      else prepBuckets[4].tickets++;
    }

    const dishMap = new Map<
      string,
      { name: string; category: string; revenue: number; orders: number }
    >();
    for (const item of todayOrderItems) {
      if (item.state === 'CANCELLED' || item.cancelledAt) continue;
      const name = item.itemNameSnapshot || 'Dish';
      const category =
        item.currentStation?.name || item.stationNameSnapshot || 'Kitchen';
      const line =
        Number(item.unitPriceSnapshot || 0) * Math.max(1, item.quantity);
      const existing = dishMap.get(name) || {
        name,
        category,
        revenue: 0,
        orders: 0,
      };
      existing.revenue += line;
      existing.orders += Math.max(1, item.quantity);
      dishMap.set(name, existing);
    }
    const topDishes: TopSellingDishDto[] = Array.from(dishMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((d, _i, arr) => {
        const topRev = arr[0]?.revenue || 1;
        return {
          ...d,
          percent: Math.round((d.revenue / topRev) * 100),
        };
      });

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const salesTrend: RevenueVsCollectionsPointDto[] = [];
    const weeklyCashMovement: WeeklyCashMovementPointDto[] = [];
    const orderVolumeTrend: OrderVolumePointDto[] = [];

    for (let i = 6; i >= 0; i--) {
      const targetDate = startOfLocalDay(businessDate);
      targetDate.setDate(targetDate.getDate() - i);
      const targetYmd = localYmd(targetDate);
      const dayLabel = dayNames[targetDate.getDay()];

      const dayBills = past7Bills.filter(
        (b) => localYmd(b.businessDate) === targetYmd,
      );
      const dayGross = dayBills.reduce(
        (acc, b) => acc + Number(b.subtotalAmount ?? b.totalAmount),
        0,
      );
      const dayNet = dayBills.reduce(
        (acc, b) => acc + Number(b.totalAmount),
        0,
      );

      const dayPayments = past7Payments.filter(
        (p) => localYmd(p.businessDate) === targetYmd,
      );
      const dayCollections = dayPayments.reduce(
        (acc, p) => acc + Number(p.amount),
        0,
      );
      const dayDigital = dayPayments
        .filter((p) => p.method === 'TRANSFER')
        .reduce((acc, p) => acc + Number(p.amount), 0);

      const dayCashDrops = past7CashDrops.filter(
        (c) => localYmd(c.businessDate) === targetYmd,
      );
      const dayDropAmt = dayCashDrops.reduce(
        (acc, c) => acc + Number(c.countedAmount ?? c.declaredAmount),
        0,
      );

      const dayOrders = past7Orders.filter(
        (o) => localYmd(o.businessDate) === targetYmd,
      ).length;
      const dayCovers = past7Sessions
        .filter((s) => localYmd(s.businessDate) === targetYmd)
        .reduce((acc, s) => acc + (s.guestCount ?? 0), 0);
      const dayAvgCheck = dayBills.length > 0 ? dayNet / dayBills.length : 0;

      salesTrend.push({
        period: dayLabel,
        grossSales: dayGross,
        netRevenue: dayNet,
        collections: dayCollections,
      });
      weeklyCashMovement.push({
        day: dayLabel,
        digitalInflow: dayDigital / 1000,
        cashDrop: dayDropAmt / 1000,
      });
      orderVolumeTrend.push({
        period: dayLabel,
        orders: dayOrders,
        covers: dayCovers,
        avgCheck: Math.round(dayAvgCheck),
      });
    }

    // Hourly billed + collected for today (local hours)
    const hourlyMap = new Map<number, { billed: number; collected: number }>();
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { billed: 0, collected: 0 });
    }
    for (const b of todayBills) {
      const h = new Date(b.generatedAt).getHours();
      const slot = hourlyMap.get(h)!;
      slot.billed += Number(b.totalAmount);
    }
    for (const p of todayPayments) {
      const counts =
        p.method === 'CASH'
          ? !['CANCELLED', 'FAILED', 'VOID'].includes(p.status)
          : settledStatuses.has(p.status);
      if (!counts) continue;
      const when =
        p.collectedAt ?? p.settledAt ?? p.verifiedAt ?? p.initiatedAt;
      const h = new Date(when).getHours();
      const slot = hourlyMap.get(h)!;
      slot.collected += Number(p.amount);
    }
    const activeHours = [...hourlyMap.entries()].filter(
      ([, v]) => v.billed > 0 || v.collected > 0,
    );
    const hourStart =
      activeHours.length > 0 ? Math.min(...activeHours.map(([h]) => h)) : 10;
    const hourEnd =
      activeHours.length > 0 ? Math.max(...activeHours.map(([h]) => h)) : 22;
    const hourlySales: HourlySalesPointDto[] = [];
    for (let h = Math.min(hourStart, 8); h <= Math.max(hourEnd, 21); h++) {
      const slot = hourlyMap.get(h)!;
      hourlySales.push({
        hour: `${String(h).padStart(2, '0')}:00`,
        billed: Math.round(slot.billed),
        collected: Math.round(slot.collected),
      });
    }

    const stationMap = new Map<string, StationThroughputPointDto>();
    for (const item of todayOrderItems) {
      const station =
        item.currentStation?.name || item.stationNameSnapshot || 'Station';
      const row =
        stationMap.get(station) ??
        ({
          station,
          queued: 0,
          inPrep: 0,
          ready: 0,
          served: 0,
          cancelled: 0,
        } satisfies StationThroughputPointDto);
      if (item.state === 'CANCELLED' || item.cancelledAt) {
        row.cancelled += 1;
      } else if (['QUEUED', 'ACKNOWLEDGED'].includes(item.state)) {
        row.queued += 1;
      } else if (item.state === 'IN_PREPARATION') {
        row.inPrep += 1;
      } else if (item.state === 'READY') {
        row.ready += 1;
      } else if (item.state === 'SERVED' || item.servedAt) {
        row.served += 1;
      }
      stationMap.set(station, row);
    }
    const stationThroughput = Array.from(stationMap.values()).sort(
      (a, b) =>
        b.queued +
        b.inPrep +
        b.ready +
        b.served -
        (a.queued + a.inPrep + a.ready + a.served),
    );

    // Prefer gross from subtotals when available
    void todayGross;

    const data: ManagerDashboardDataDto = {
      kpis,
      salesTrend,
      paymentChannels,
      prepBuckets,
      weeklyCashMovement,
      topDishes,
      hourlySales,
      stationThroughput,
      orderVolumeTrend,
      businessDate: localYmd(businessDate),
      branchName,
    };

    return { data };
  }

  async getBranchRevenue(
    userId: string,
    periodRaw?: string,
  ): Promise<BranchRevenueResponseDto> {
    const context = await this.identity.getByUserId(userId);
    const role = context.roleCode ?? '';
    const allowed = new Set([
      'MANAGER',
      'OWNER_ADMIN',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
      'PLATFORM_SUPER_ADMIN',
    ]);
    if (!allowed.has(role)) {
      throw new ForbiddenException('Branch revenue requires manager access.');
    }
    if (!context.tenantId) {
      throw new ForbiddenException(
        'No restaurant tenant on this account. Revenue is tenant-scoped.',
      );
    }

    let branchId = context.branchId;
    let branchName = context.branchName ?? 'Main Branch';

    if (!branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { tenantId: context.tenantId, status: 'ACTIVE' },
      });
      if (branch) {
        branchId = branch.id;
        branchName = branch.name;
      }
    }

    if (!branchId) {
      throw new NotFoundException(
        'No active branch found for this restaurant.',
      );
    }

    const period = normalizePeriod(periodRaw);
    const { from, to, label, bucket } = resolvePeriodRange(period);
    const prior = resolvePriorPeriodRange(from, to);

    const [bills, payments, sessions, priorBills, priorPayments] =
      await Promise.all([
        this.prisma.bill.findMany({
          where: {
            branchId,
            businessDate: { gte: from, lte: to },
          },
          select: {
            totalAmount: true,
            subtotalAmount: true,
            cancelledAmount: true,
            amountPaid: true,
            businessDate: true,
          },
        }),
        this.prisma.payment.findMany({
          where: {
            branchId,
            businessDate: { gte: from, lte: to },
          },
          select: {
            amount: true,
            method: true,
            status: true,
            businessDate: true,
          },
        }),
        this.prisma.tableSession.findMany({
          where: {
            branchId,
            businessDate: { gte: from, lte: to },
          },
          select: { guestCount: true, id: true },
        }),
        this.prisma.bill.findMany({
          where: {
            branchId,
            businessDate: { gte: prior.from, lte: prior.to },
          },
          select: {
            totalAmount: true,
            subtotalAmount: true,
            cancelledAmount: true,
            amountPaid: true,
          },
        }),
        this.prisma.payment.findMany({
          where: {
            branchId,
            businessDate: { gte: prior.from, lte: prior.to },
          },
          select: {
            amount: true,
            method: true,
            status: true,
          },
        }),
      ]);

    const billedValue = sumBilled(bills);
    const collectionsValue = sumCollections(payments);
    const revenueValue = billedValue > 0 ? billedValue : collectionsValue;
    const priorBilled = sumBilled(priorBills);
    const priorCollections = sumCollections(priorPayments);
    const priorRevenue = priorBilled > 0 ? priorBilled : priorCollections;

    const coversCount = sessions.reduce(
      (sum, s) => sum + (s.guestCount ?? 0),
      0,
    );
    const ordersCount = bills.length;
    const avgCheckValue =
      ordersCount > 0 ? billedValue / ordersCount : revenueValue;

    const seriesMap = new Map<
      string,
      { grossSales: number; netRevenue: number; collections: number }
    >();

    for (const bill of bills) {
      const key = seriesKey(bill.businessDate, bucket);
      const row = seriesMap.get(key) ?? {
        grossSales: 0,
        netRevenue: 0,
        collections: 0,
      };
      const gross = Number(bill.subtotalAmount ?? bill.totalAmount ?? 0);
      const cancelled = Number(bill.cancelledAmount ?? 0);
      const net =
        Number(bill.totalAmount ?? 0) || Math.max(0, gross - cancelled);
      row.grossSales += gross;
      row.netRevenue += net;
      seriesMap.set(key, row);
    }

    for (const payment of payments) {
      const collected = paymentCollectionAmount(payment);
      if (collected <= 0) continue;
      const key = seriesKey(payment.businessDate, bucket);
      const row = seriesMap.get(key) ?? {
        grossSales: 0,
        netRevenue: 0,
        collections: 0,
      };
      row.collections += collected;
      seriesMap.set(key, row);
    }

    const seriesKeys = enumerateSeriesKeys(from, to, bucket);
    const series = seriesKeys.map((key) => {
      const row = seriesMap.get(key) ?? {
        grossSales: 0,
        netRevenue: 0,
        collections: 0,
      };
      return {
        period: key,
        grossSales: Math.round(row.grossSales),
        netRevenue: Math.round(row.netRevenue),
        collections: Math.round(row.collections),
      };
    });

    return {
      data: {
        branchName,
        period,
        periodLabel: label,
        fromDate: localYmd(from),
        toDate: localYmd(to),
        revenueFormatted: formatK(revenueValue),
        revenueValue: Math.round(revenueValue),
        collectionsFormatted: formatK(collectionsValue),
        collectionsValue: Math.round(collectionsValue),
        billedFormatted: formatK(billedValue),
        billedValue: Math.round(billedValue),
        revenueTrend: pctDelta(revenueValue, priorRevenue),
        revenueTrendLabel: 'vs prior period',
        coversCount,
        coversFormatted: String(coversCount),
        ordersCount,
        ordersFormatted: String(ordersCount),
        avgCheckFormatted: formatK(avgCheckValue),
        series,
      },
    };
  }
}

function normalizePeriod(raw?: string): BranchRevenuePeriod {
  const value = (raw ?? 'month').toLowerCase();
  if (value === 'quarter' || value === 'year') return value;
  return 'month';
}

function resolvePeriodRange(period: BranchRevenuePeriod): {
  from: Date;
  to: Date;
  label: string;
  bucket: 'day' | 'week' | 'month';
} {
  const today = startOfLocalDay();
  if (period === 'year') {
    const from = new Date(today.getFullYear(), 0, 1);
    return {
      from,
      to: today,
      label: `${today.getFullYear()} year to date`,
      bucket: 'month',
    };
  }
  if (period === 'quarter') {
    const q = Math.floor(today.getMonth() / 3);
    const from = new Date(today.getFullYear(), q * 3, 1);
    return {
      from,
      to: today,
      label: `Q${q + 1} ${today.getFullYear()} to date`,
      bucket: 'week',
    };
  }
  // Last calendar month
  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const to = new Date(today.getFullYear(), today.getMonth(), 0);
  to.setHours(0, 0, 0, 0);
  return {
    from,
    to,
    label: from.toLocaleString('en', { month: 'long', year: 'numeric' }),
    bucket: 'day',
  };
}

function resolvePriorPeriodRange(
  from: Date,
  to: Date,
): { from: Date; to: Date } {
  const lengthMs = to.getTime() - from.getTime();
  const priorTo = startOfLocalDay(from);
  priorTo.setDate(priorTo.getDate() - 1);
  const priorFrom = startOfLocalDay(priorTo);
  priorFrom.setTime(priorFrom.getTime() - lengthMs);
  return { from: priorFrom, to: priorTo };
}

function sumBilled(
  bills: Array<{
    totalAmount: unknown;
    subtotalAmount: unknown;
    cancelledAmount: unknown;
    amountPaid: unknown;
  }>,
): number {
  return bills.reduce((sum, bill) => {
    const total = Number(bill.totalAmount ?? 0);
    if (total > 0) return sum + total;
    const gross = Number(bill.subtotalAmount ?? 0);
    const cancelled = Number(bill.cancelledAmount ?? 0);
    const paid = Number(bill.amountPaid ?? 0);
    return sum + (gross > 0 ? Math.max(0, gross - cancelled) : paid);
  }, 0);
}

function paymentCollectionAmount(payment: {
  amount: unknown;
  method: string | null;
  status: string | null;
}): number {
  const amt = Number(payment.amount ?? 0);
  if (!amt || amt <= 0) return 0;
  const status = (payment.status ?? '').toUpperCase();
  if (['CANCELLED', 'FAILED', 'VOID'].includes(status)) return 0;
  if (payment.method === 'CASH') return amt;
  if (
    payment.method === 'TRANSFER' &&
    ['VERIFIED', 'RECORDED', 'CAPTURED', 'SETTLED'].includes(status)
  ) {
    return amt;
  }
  return 0;
}

function sumCollections(
  payments: Array<{
    amount: unknown;
    method: string | null;
    status: string | null;
  }>,
): number {
  return payments.reduce(
    (sum, payment) => sum + paymentCollectionAmount(payment),
    0,
  );
}

function seriesKey(date: Date, bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'month') {
    return date.toLocaleString('en', { month: 'short', year: '2-digit' });
  }
  if (bucket === 'week') {
    const start = startOfLocalDay(date);
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    return `W ${start.toLocaleString('en', { month: 'short', day: 'numeric' })}`;
  }
  return date.toLocaleString('en', { month: 'short', day: 'numeric' });
}

function enumerateSeriesKeys(
  from: Date,
  to: Date,
  bucket: 'day' | 'week' | 'month',
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const cursor = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  while (cursor.getTime() <= end.getTime()) {
    const key = seriesKey(cursor, bucket);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    if (bucket === 'month') {
      cursor.setMonth(cursor.getMonth() + 1, 1);
    } else if (bucket === 'week') {
      cursor.setDate(cursor.getDate() + 7);
    } else {
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return keys;
}
