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

  @ApiProperty({ example: 'faster vs last week' })
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
}

export class RevenueVsCollectionsPointDto {
  @ApiProperty({ example: 'Jan' })
  period: string;

  @ApiProperty({ example: 41.2 })
  grossSales: number;

  @ApiProperty({ example: 39.9 })
  netRevenue: number;

  @ApiProperty({ example: 36.8 })
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

  @ApiProperty({ example: '2026-09-08' })
  businessDate: string;

  @ApiProperty({ example: 'Bole Main Branch' })
  branchName: string;
}

export class ManagerDashboardResponseDto {
  @ApiProperty({ type: () => ManagerDashboardDataDto })
  data: ManagerDashboardDataDto;
}
