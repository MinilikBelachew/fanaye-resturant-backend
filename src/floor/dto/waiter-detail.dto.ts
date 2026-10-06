import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WaiterShiftCoverageDto } from './waiter-performance-response.dto';

export class WaiterCoverageTableDto {
  @ApiProperty()
  tableId: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  displayNumber?: string | null;

  @ApiProperty()
  locationName: string;
}

export class WaiterShiftCoverageDetailDto extends WaiterShiftCoverageDto {
  @ApiProperty({ type: [WaiterCoverageTableDto] })
  tables: WaiterCoverageTableDto[];
}

export class WaiterDetailKpisDto {
  @ApiProperty()
  hoursWorked: number;

  @ApiProperty()
  sessionsCount: number;

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
  verifiedTransferAmount: string;

  @ApiProperty()
  itemCount: number;
}

export class WaiterDetailResponseDto {
  @ApiProperty()
  waiterMembershipId: string;

  @ApiProperty()
  waiterName: string;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  clockedIn: boolean;

  @ApiPropertyOptional()
  clockInAt?: string | null;

  @ApiPropertyOptional()
  clockOutAt?: string | null;

  @ApiProperty({ type: [String] })
  workingDays: string[];

  @ApiProperty({ enum: ['day', 'week', 'month'] })
  period: 'day' | 'week' | 'month';

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  currencyCode: string;

  @ApiProperty({ type: WaiterDetailKpisDto })
  kpis: WaiterDetailKpisDto;

  @ApiProperty({ type: [WaiterShiftCoverageDetailDto] })
  assignedShifts: WaiterShiftCoverageDetailDto[];
}

export class WaiterOrderHistoryItemDto {
  @ApiProperty()
  orderId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  confirmedAt: string;

  @ApiProperty()
  businessDate: string;

  @ApiProperty()
  tableDisplayName: string;

  @ApiPropertyOptional()
  tableDisplayNumber?: string | null;

  @ApiProperty()
  tableId: string;

  @ApiProperty()
  itemCount: number;

  @ApiProperty()
  netSales: string;

  @ApiProperty()
  currencyCode: string;
}

export class WaiterOrderHistoryResponseDto {
  @ApiProperty()
  waiterMembershipId: string;

  @ApiProperty()
  period: string;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty({ type: [WaiterOrderHistoryItemDto] })
  data: WaiterOrderHistoryItemDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
