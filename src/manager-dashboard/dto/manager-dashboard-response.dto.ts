import { ApiProperty } from '@nestjs/swagger';

export class ManagerKpiDto {
  @ApiProperty({ example: 'ETB 48.2k' })
  dailyRevenueFormatted: string;

  @ApiProperty({ example: 48200 })
  dailyRevenueValue: number;

  @ApiProperty({ example: '+23%' })
  dailyRevenueTrend: string;

  @ApiProperty({ example: 'vs yesterday' })
  dailyRevenueTrendLabel: string;

  @ApiProperty({ example: '7.4 min' })
  avgPrepTimeFormatted: string;

  @ApiProperty({ example: 7.4 })
  avgPrepTimeMinutes: number;

  @ApiProperty({ example: '-12%' })
  avgPrepTimeTrend: string;

  @ApiProperty({ example: 'faster vs yesterday' })
  avgPrepTimeTrendLabel: string;

  @ApiProperty({ example: '8 / 14' })
  activeTablesFormatted: string;

  @ApiProperty({ example: 8 })
  activeTablesCount: number;

  @ApiProperty({ example: 14 })
  totalTablesCount: number;

  @ApiProperty({ example: '57%' })
  floorCapacityPercentage: string;

  @ApiProperty({ example: '89.2%' })
  tinaVerifyMixPercentage: string;

  @ApiProperty({ example: 89.2 })
  tinaVerifyMixValue: number;

  @ApiProperty({ example: '+14%' })
  tinaVerifyTrend: string;

  @ApiProperty({ example: 'digital verified' })
  tinaVerifyTrendLabel: string;

  @ApiProperty({ example: 'ETB 36.8k' })
  collectionsFormatted: string;

  @ApiProperty({ example: 36800 })
  collectionsValue: number;

  @ApiProperty({ example: '12' })
  stationBacklogFormatted: string;

  @ApiProperty({ example: 12 })
  stationBacklogCount: number;

  @ApiProperty({ example: '3 ready' })
  stationBacklogHint: string;

  @ApiProperty({ example: '2' })
  pendingActionsFormatted: string;

  @ApiProperty({ example: 2 })
  pendingBillRequests: number;

  @ApiProperty({ example: 1 })
  pendingCashDrops: number;

  @ApiProperty({ example: '1 bill · 1 cash drop' })
  pendingActionsHint: string;

  @ApiProperty({ example: 'ETB 48.2k' })
  billedFormatted: string;

  @ApiProperty({ example: 48200 })
  billedValue: number;

  @ApiProperty({ example: 'ETB 4.2k' })
  collectionGapFormatted: string;

  @ApiProperty({ example: 4200 })
  collectionGapValue: number;

  @ApiProperty({ example: 'ETB 1.2k' })
  avgCheckFormatted: string;

  @ApiProperty({ example: 1200 })
  avgCheckValue: number;

  @ApiProperty({ example: '42' })
  coversFormatted: string;

  @ApiProperty({ example: 42 })
  coversCount: number;

  @ApiProperty({ example: '28' })
  ordersFormatted: string;

  @ApiProperty({ example: 28 })
  ordersCount: number;

  @ApiProperty({ example: '3' })
  cancelledItemsFormatted: string;

  @ApiProperty({ example: 3 })
  cancelledItemsCount: number;
}

export class RevenueVsCollectionsPointDto {
  @ApiProperty({ example: 'Mon' })
  period: string;

  @ApiProperty({ example: 41200 })
  grossSales: number;

  @ApiProperty({ example: 39900 })
  netRevenue: number;

  @ApiProperty({ example: 36800 })
  collections: number;
}

export class PaymentChannelBreakdownItemDto {
  @ApiProperty({ example: 'telebirr' })
  id: string;

  @ApiProperty({ example: 'Telebirr' })
  name: string;

  @ApiProperty({ example: 38 })
  sharePercentage: number;

  @ApiProperty({ example: 'ETB 18.8k' })
  amountFormatted: string;

  @ApiProperty({ example: 18800 })
  amountValue: number;

  @ApiProperty({ example: '#e85d04' })
  color: string;
}

export class PrepDurationBucketDto {
  @ApiProperty({ example: '< 5m' })
  bucket: string;

  @ApiProperty({ example: 68 })
  tickets: number;

  @ApiProperty({ example: 'Instant & Drinks' })
  label: string;
}

export class WeeklyCashMovementPointDto {
  @ApiProperty({ example: 'Mon' })
  day: string;

  @ApiProperty({ example: 6.2 })
  digitalInflow: number;

  @ApiProperty({ example: 4.8 })
  cashDrop: number;
}

export class TopSellingDishDto {
  @ApiProperty({ example: 'Special Kitfo' })
  name: string;

  @ApiProperty({ example: 'Kitchen' })
  category: string;

  @ApiProperty({ example: 18400 })
  revenue: number;

  @ApiProperty({ example: 68 })
  orders: number;

  @ApiProperty({ example: 92 })
  percent: number;

  @ApiProperty({ example: '/images/dishes/kitfo.jpg', required: false })
  image?: string;
}

export class HourlySalesPointDto {
  @ApiProperty({ example: '11:00' })
  hour: string;

  @ApiProperty({ example: 4200 })
  billed: number;

  @ApiProperty({ example: 3800 })
  collected: number;
}

export class StationThroughputPointDto {
  @ApiProperty({ example: 'Kitchen' })
  station: string;

  @ApiProperty({ example: 4 })
  queued: number;

  @ApiProperty({ example: 6 })
  inPrep: number;

  @ApiProperty({ example: 3 })
  ready: number;

  @ApiProperty({ example: 28 })
  served: number;

  @ApiProperty({ example: 1 })
  cancelled: number;
}

export class OrderVolumePointDto {
  @ApiProperty({ example: 'Mon' })
  period: string;

  @ApiProperty({ example: 34 })
  orders: number;

  @ApiProperty({ example: 52 })
  covers: number;

  @ApiProperty({ example: 1450 })
  avgCheck: number;
}

export class ManagerDashboardDataDto {
  @ApiProperty({ type: () => ManagerKpiDto })
  kpis: ManagerKpiDto;

  @ApiProperty({ type: () => [RevenueVsCollectionsPointDto] })
  salesTrend: RevenueVsCollectionsPointDto[];

  @ApiProperty({ type: () => [PaymentChannelBreakdownItemDto] })
  paymentChannels: PaymentChannelBreakdownItemDto[];

  @ApiProperty({ type: () => [PrepDurationBucketDto] })
  prepBuckets: PrepDurationBucketDto[];

  @ApiProperty({ type: () => [WeeklyCashMovementPointDto] })
  weeklyCashMovement: WeeklyCashMovementPointDto[];

  @ApiProperty({ type: () => [TopSellingDishDto] })
  topDishes: TopSellingDishDto[];

  @ApiProperty({ type: () => [HourlySalesPointDto] })
  hourlySales: HourlySalesPointDto[];

  @ApiProperty({ type: () => [StationThroughputPointDto] })
  stationThroughput: StationThroughputPointDto[];

  @ApiProperty({ type: () => [OrderVolumePointDto] })
  orderVolumeTrend: OrderVolumePointDto[];

  @ApiProperty({ example: '2026-09-08' })
  businessDate: string;

  @ApiProperty({ example: 'Bole Main Branch' })
  branchName: string;
}

export class ManagerDashboardResponseDto {
  @ApiProperty({ type: () => ManagerDashboardDataDto })
  data: ManagerDashboardDataDto;
}

export class BranchRevenuePointDto {
  @ApiProperty({ example: 'Mar 1' })
  period: string;

  @ApiProperty({ example: 12000 })
  grossSales: number;

  @ApiProperty({ example: 11000 })
  netRevenue: number;

  @ApiProperty({ example: 9800 })
  collections: number;
}

export class BranchRevenueDataDto {
  @ApiProperty({ example: 'Bole Main Branch' })
  branchName: string;

  @ApiProperty({ example: 'month', enum: ['month', 'quarter', 'year'] })
  period: 'month' | 'quarter' | 'year';

  @ApiProperty({ example: 'Last month' })
  periodLabel: string;

  @ApiProperty({ example: '2026-08-01' })
  fromDate: string;

  @ApiProperty({ example: '2026-08-31' })
  toDate: string;

  @ApiProperty({ example: 'ETB 482.1k' })
  revenueFormatted: string;

  @ApiProperty({ example: 482100 })
  revenueValue: number;

  @ApiProperty({ example: 'ETB 410.2k' })
  collectionsFormatted: string;

  @ApiProperty({ example: 410200 })
  collectionsValue: number;

  @ApiProperty({ example: 'ETB 71.9k' })
  billedFormatted: string;

  @ApiProperty({ example: 71900 })
  billedValue: number;

  @ApiProperty({ example: '+12%' })
  revenueTrend: string;

  @ApiProperty({ example: 'vs prior period' })
  revenueTrendLabel: string;

  @ApiProperty({ example: 184 })
  coversCount: number;

  @ApiProperty({ example: '184' })
  coversFormatted: string;

  @ApiProperty({ example: 96 })
  ordersCount: number;

  @ApiProperty({ example: '96' })
  ordersFormatted: string;

  @ApiProperty({ example: 'ETB 5.0k' })
  avgCheckFormatted: string;

  @ApiProperty({ type: () => [BranchRevenuePointDto] })
  series: BranchRevenuePointDto[];
}

export class BranchRevenueResponseDto {
  @ApiProperty({ type: () => BranchRevenueDataDto })
  data: BranchRevenueDataDto;
}
