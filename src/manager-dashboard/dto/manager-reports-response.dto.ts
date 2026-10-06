import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ManagerReportsWaiterRowDto {
  @ApiProperty()
  waiterMembershipId: string;

  @ApiProperty()
  waiterName: string;

  @ApiProperty()
  hoursWorked: number;

  @ApiProperty()
  ordersCreatedCount: number;

  @ApiProperty()
  tablesServedCount: number;

  @ApiProperty()
  netAttributedSales: string;

  @ApiProperty()
  cashCollected: string;

  @ApiProperty()
  cashDropped: string;

  @ApiProperty()
  undroppedCash: string;

  @ApiProperty()
  salesPerHour: string;
}

export class ManagerReportsWaitersDto {
  @ApiProperty()
  waiterCount: number;

  @ApiProperty()
  totalHoursWorked: number;

  @ApiProperty()
  totalNetSales: string;

  @ApiProperty()
  totalOrders: number;

  @ApiProperty()
  totalUndroppedCash: string;

  @ApiProperty({ type: [ManagerReportsWaiterRowDto] })
  rows: ManagerReportsWaiterRowDto[];
}

export class ManagerReportsCancelsDto {
  @ApiProperty()
  cancelledItemsCount: number;

  @ApiProperty()
  cancelledItemsValue: string;

  @ApiProperty()
  cancellationRequests: number;

  @ApiProperty()
  changeRequests: number;

  @ApiProperty()
  approvedCount: number;

  @ApiProperty()
  rejectedCount: number;

  @ApiProperty()
  pendingCount: number;

  @ApiProperty()
  approveRate: number;

  @ApiProperty()
  rejectRate: number;

  @ApiProperty({ type: [Object] })
  byType: Array<{
    type: 'CANCELLATION' | 'CHANGE';
    approved: number;
    rejected: number;
    pending: number;
  }>;

  @ApiProperty({ type: [Object] })
  topCancelledItems: Array<{
    itemName: string;
    count: number;
    value: string;
  }>;
}

export class ManagerReportsInventoryDto {
  @ApiProperty()
  totalStockValue: string;

  @ApiProperty()
  skuCount: number;

  @ApiProperty()
  lowStockCount: number;

  @ApiProperty()
  wasteQty: number;

  @ApiProperty()
  wasteValue: string;

  @ApiProperty()
  receiveValue: string;

  @ApiProperty({ type: [Object] })
  topWaste: Array<{
    ingredientId: string;
    name: string;
    qty: number;
    value: string;
    unit: string;
  }>;
}

export class ManagerReportsCashDto {
  @ApiProperty()
  dropCount: number;

  @ApiProperty()
  cashDropped: string;

  @ApiProperty()
  cashReceived: string;

  @ApiProperty()
  pendingDropAmount: string;

  @ApiProperty()
  disputedAmount: string;

  @ApiProperty()
  varianceTotal: string;

  @ApiProperty()
  undroppedCashTotal: string;

  @ApiProperty({ type: [Object] })
  byWaiter: Array<{
    waiterMembershipId: string;
    waiterName: string;
    dropped: string;
    undropped: string;
    collected: string;
  }>;
}

export class ManagerReportsStationRowDto {
  @ApiProperty()
  stationId: string;

  @ApiProperty()
  stationName: string;

  @ApiProperty()
  ticketsCompleted: number;

  @ApiProperty()
  avgPrepMinutes: number;

  @ApiProperty()
  delayedCount: number;

  @ApiProperty()
  delayedRate: number;

  @ApiProperty()
  cannotPrepareCount: number;
}

export class ManagerReportsStationsDto {
  @ApiProperty()
  avgPrepMinutes: number;

  @ApiProperty()
  ticketsCompleted: number;

  @ApiProperty()
  delayedCount: number;

  @ApiProperty()
  delayedRate: number;

  @ApiProperty()
  cannotPrepareCount: number;

  @ApiProperty({ type: [ManagerReportsStationRowDto] })
  rows: ManagerReportsStationRowDto[];
}

export class ManagerReportsDataDto {
  @ApiProperty({ enum: ['day', 'week', 'month'] })
  period: string;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  currencyCode: string;

  @ApiProperty()
  branchName: string;

  @ApiPropertyOptional({ type: ManagerReportsWaitersDto })
  waiters?: ManagerReportsWaitersDto;

  @ApiPropertyOptional({ type: ManagerReportsCancelsDto })
  cancels?: ManagerReportsCancelsDto;

  @ApiPropertyOptional({ type: ManagerReportsInventoryDto })
  inventory?: ManagerReportsInventoryDto;

  @ApiPropertyOptional({ type: ManagerReportsCashDto })
  cash?: ManagerReportsCashDto;

  @ApiPropertyOptional({ type: ManagerReportsStationsDto })
  stations?: ManagerReportsStationsDto;
}

export class ManagerReportsResponseDto {
  @ApiProperty({ type: ManagerReportsDataDto })
  data: ManagerReportsDataDto;
}
