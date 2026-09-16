import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  ManagerDashboardDataDto,
  ManagerDashboardResponseDto,
  ManagerKpiDto,
  PaymentChannelBreakdownItemDto,
  PrepDurationBucketDto,
  RevenueVsCollectionsPointDto,
  TopSellingDishDto,
  WeeklyCashMovementPointDto,
} from './dto/manager-dashboard-response.dto';

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatK(val: number): string {
  if (val >= 1_000_000) {
    return `ETB ${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `ETB ${(val / 1_000).toFixed(1)}k`;
  }
  return `ETB ${val.toLocaleString()}`;
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
    let branchId = context.branchId;
    let branchName = context.branchName ?? 'Main Branch';

    if (!branchId) {
      if (context.tenantId) {
        const branch = await this.prisma.branch.findFirst({
          where: { tenantId: context.tenantId, status: 'ACTIVE' },
        });
        if (branch) {
          branchId = branch.id;
          branchName = branch.name;
        }
      }
      if (!branchId) {
        const branch = await this.prisma.branch.findFirst({
          where: { status: 'ACTIVE' },
        });
        if (branch) {
          branchId = branch.id;
          branchName = branch.name;
        } else {
          throw new NotFoundException('No active branch found.');
        }
      }
    }

    const businessDate = businessDateRaw
      ? new Date(`${businessDateRaw}T00:00:00.000Z`)
      : new Date(new Date().setUTCHours(0, 0, 0, 0));

    const yesterdayDate = new Date(businessDate);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);

    const sevenDaysAgo = new Date(businessDate);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

    const [
      tables,
      activeSessions,
      todayBills,
      todayPayments,
      yesterdayClose,
      todayOrderItems,
      past7Payments,
      past7CashDrops,
      past7Bills,
    ] = await Promise.all([
      // 1. Total Dining Tables in branch
      this.prisma.diningTable.findMany({
        where: { branchId, status: 'ACTIVE' },
        select: { id: true },
      }),

      // 2. Active Table Sessions
      this.prisma.tableSession.findMany({
        where: {
          branchId,
          businessDate,
          status: { not: 'CLOSED' },
        },
        select: { id: true, tableId: true },
      }),

      // 3. Today's Bills
      this.prisma.bill.findMany({
        where: { branchId, businessDate },
      }),

      // 4. Today's Payments
      this.prisma.payment.findMany({
        where: { branchId, businessDate },
        include: { receipt: true },
      }),

      // 5. Yesterday's Operational Daily Close
      this.prisma.operationalDailyClose.findUnique({
        where: {
          branchId_businessDate: {
            branchId,
            businessDate: yesterdayDate,
          },
        },
      }),

      // 6. Today's Order Items (for prep times & top dishes)
      this.prisma.orderItem.findMany({
        where: { branchId, businessDate },
        include: { currentStation: true },
      }),

      // 7. Trailing 7 days payments
      this.prisma.payment.findMany({
        where: {
          branchId,
          businessDate: { gte: sevenDaysAgo, lte: businessDate },
          status: { in: ['SETTLED', 'VERIFIED'] },
        },
        select: { amount: true, method: true, businessDate: true },
      }),

      // 8. Trailing 7 days cash drops
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

      // 9. Trailing 7 days bills
      this.prisma.bill.findMany({
        where: {
          branchId,
          businessDate: { gte: sevenDaysAgo, lte: businessDate },
        },
        select: { totalAmount: true, businessDate: true },
      }),
    ]);

    // Calculate Today's Revenue & Collections
    let todayNetRevenue = 0;
    for (const b of todayBills) {
      todayNetRevenue += Number(b.totalAmount);
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

    for (const p of todayPayments) {
      const amt = Number(p.amount);
      if (p.method === 'CASH') {
        todayCashSales += amt;
        channelTotals.cash += amt;
      } else if (p.method === 'TRANSFER') {
        if (['SETTLED', 'VERIFIED'].includes(p.status)) {
          todayVerifiedTransferSales += amt;
        }

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
    const finalRevenue =
      todayNetRevenue > 0 ? todayNetRevenue : totalCollections;

    // Yesterday Trend Comparison
    let revTrend = '0%';
    let revTrendLabel = 'vs yesterday';
    if (yesterdayClose && Number(yesterdayClose.netBilledSales) > 0) {
      const yestNet = Number(yesterdayClose.netBilledSales);
      const diff = ((finalRevenue - yestNet) / yestNet) * 100;
      revTrend = `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`;
    } else if (finalRevenue > 0) {
      revTrend = '+100%';
      revTrendLabel = 'first sales of day';
    }

    // Prep time calculation
    const prepDurationsSec: number[] = [];
    for (const item of todayOrderItems) {
      if (item.readyAt && item.preparationStartedAt) {
        const sec = Math.round(
          (item.readyAt.getTime() - item.preparationStartedAt.getTime()) / 1000,
        );
        if (sec > 0 && sec < 7200) prepDurationsSec.push(sec);
      } else if (item.readyAt && item.queuedAt) {
        const sec = Math.round(
          (item.readyAt.getTime() - item.queuedAt.getTime()) / 1000,
        );
        if (sec > 0 && sec < 7200) prepDurationsSec.push(sec);
      }
    }

    const avgPrepMinutes =
      prepDurationsSec.length > 0
        ? Number(
            (
              prepDurationsSec.reduce((a, b) => a + b, 0) /
              prepDurationsSec.length /
              60
            ).toFixed(1),
          )
        : 0;

    // Tables Occupancy
    const totalTablesCount = tables.length;
    const activeTablesCount = activeSessions.length;
    const occupancyPercent =
      totalTablesCount > 0
        ? Math.round((activeTablesCount / totalTablesCount) * 100)
        : 0;

    // TinaVerify Mix
    const tinaMixPercent =
      totalCollections > 0
        ? Number(
            ((todayVerifiedTransferSales / totalCollections) * 100).toFixed(1),
          )
        : 0;

    const kpis: ManagerKpiDto = {
      dailyRevenueFormatted: formatK(finalRevenue),
      dailyRevenueValue: finalRevenue,
      dailyRevenueTrend: revTrend,
      dailyRevenueTrendLabel: revTrendLabel,
      avgPrepTimeFormatted: `${avgPrepMinutes} min`,
      avgPrepTimeMinutes: avgPrepMinutes,
      avgPrepTimeTrend: prepDurationsSec.length > 0 ? 'Live' : '0%',
      avgPrepTimeTrendLabel:
        prepDurationsSec.length > 0
          ? `${prepDurationsSec.length} tickets completed`
          : 'no tickets completed today',
      activeTablesFormatted: `${activeTablesCount} / ${totalTablesCount}`,
      activeTablesCount,
      totalTablesCount,
      floorCapacityPercentage: `${occupancyPercent}%`,
      tinaVerifyMixPercentage: `${tinaMixPercent}%`,
      tinaVerifyMixValue: tinaMixPercent,
      tinaVerifyTrend: tinaMixPercent > 0 ? `+${tinaMixPercent}%` : '0%',
      tinaVerifyTrendLabel:
        totalCollections > 0 ? 'digital transfer share' : 'no collections yet',
    };

    // Payment channels breakdown
    const totalChannelVolume = Object.values(channelTotals).reduce(
      (a, b) => a + b,
      0,
    );
    const paymentChannels: PaymentChannelBreakdownItemDto[] = [
      {
        id: 'telebirr',
        name: 'Telebirr',
        sharePercentage:
          totalChannelVolume > 0
            ? Math.round((channelTotals.telebirr / totalChannelVolume) * 100)
            : 0,
        amountFormatted: formatK(channelTotals.telebirr),
        amountValue: channelTotals.telebirr,
        color: '#e85d04',
      },
      {
        id: 'cbe',
        name: 'CBE Birr',
        sharePercentage:
          totalChannelVolume > 0
            ? Math.round((channelTotals.cbe / totalChannelVolume) * 100)
            : 0,
        amountFormatted: formatK(channelTotals.cbe),
        amountValue: channelTotals.cbe,
        color: '#ea580c',
      },
      {
        id: 'transfer',
        name: 'Bank transfer (Awash/Dashen)',
        sharePercentage:
          totalChannelVolume > 0
            ? Math.round((channelTotals.transfer / totalChannelVolume) * 100)
            : 0,
        amountFormatted: formatK(channelTotals.transfer),
        amountValue: channelTotals.transfer,
        color: '#f97316',
      },
      {
        id: 'cash',
        name: 'Cash',
        sharePercentage:
          totalChannelVolume > 0
            ? Math.round((channelTotals.cash / totalChannelVolume) * 100)
            : 0,
        amountFormatted: formatK(channelTotals.cash),
        amountValue: channelTotals.cash,
        color: '#fb923c',
      },
      {
        id: 'other',
        name: 'Partner / Card',
        sharePercentage:
          totalChannelVolume > 0
            ? Math.round((channelTotals.other / totalChannelVolume) * 100)
            : 0,
        amountFormatted: formatK(channelTotals.other),
        amountValue: channelTotals.other,
        color: '#fdba74',
      },
    ];

    // Prep Buckets
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

    // Top Selling Dishes from real items
    const dishMap = new Map<
      string,
      { name: string; category: string; revenue: number; orders: number }
    >();

    for (const item of todayOrderItems) {
      const name = item.itemNameSnapshot || 'Dish';
      const category =
        item.currentStation?.name || item.stationNameSnapshot || 'Kitchen';
      const price = Number(item.unitPriceSnapshot || 0);
      const existing = dishMap.get(name) || {
        name,
        category,
        revenue: 0,
        orders: 0,
      };
      existing.revenue += price;
      existing.orders += 1;
      dishMap.set(name, existing);
    }

    const topDishes: TopSellingDishDto[] = Array.from(dishMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((d, _i, arr) => {
        const topRev = arr[0]?.revenue || 1;
        return {
          ...d,
          percent: Math.round((d.revenue / topRev) * 100),
        };
      });

    // Sales Trend (7-Day Real Trailing History)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const salesTrend: RevenueVsCollectionsPointDto[] = [];
    const weeklyCashMovement: WeeklyCashMovementPointDto[] = [];

    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(businessDate);
      targetDate.setUTCDate(targetDate.getUTCDate() - i);
      const targetYmd = ymd(targetDate);
      const dayLabel = dayNames[targetDate.getUTCDay()];

      // Daily bills
      const dayBills = past7Bills.filter(
        (b) => ymd(b.businessDate) === targetYmd,
      );
      const dayGross = dayBills.reduce(
        (acc, b) => acc + Number(b.totalAmount),
        0,
      );

      // Daily payments
      const dayPayments = past7Payments.filter(
        (p) => ymd(p.businessDate) === targetYmd,
      );
      const dayCollections = dayPayments.reduce(
        (acc, p) => acc + Number(p.amount),
        0,
      );
      const dayDigital = dayPayments
        .filter((p) => p.method === 'TRANSFER')
        .reduce((acc, p) => acc + Number(p.amount), 0);

      // Daily cash drops
      const dayCashDrops = past7CashDrops.filter(
        (c) => ymd(c.businessDate) === targetYmd,
      );
      const dayDropAmt = dayCashDrops.reduce(
        (acc, c) => acc + Number(c.countedAmount ?? c.declaredAmount),
        0,
      );

      salesTrend.push({
        period: dayLabel,
        grossSales: dayGross,
        netRevenue: dayGross,
        collections: dayCollections,
      });

      weeklyCashMovement.push({
        day: dayLabel,
        digitalInflow: dayDigital / 1000,
        cashDrop: dayDropAmt / 1000,
      });
    }

    const data: ManagerDashboardDataDto = {
      kpis,
      salesTrend,
      paymentChannels,
      prepBuckets,
      weeklyCashMovement,
      topDishes,
      businessDate: ymd(businessDate),
      branchName,
    };

    return { data };
  }
}
