import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WaiterShiftCoverageDto {
  @ApiProperty()
  shiftDefinitionId: string;

  @ApiProperty()
  shiftName: string;

  @ApiProperty()
  startLocalTime: string;

  @ApiProperty()
  endLocalTime: string;

  @ApiProperty()
  tableCount: number;
}

export class WaiterPerformanceRowDto {
  @ApiProperty()
  waiterMembershipId: string;

  @ApiProperty()
  waiterName: string;

  @ApiPropertyOptional()
  phone: string | null;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  clockedIn: boolean;

  @ApiPropertyOptional()
  clockInAt: string | null;

  @ApiPropertyOptional()
  clockOutAt: string | null;

  @ApiProperty()
  hoursWorked: number;

  @ApiProperty()
  sessionsCount: number;

  @ApiProperty({ type: [WaiterShiftCoverageDto] })
  assignedShifts: WaiterShiftCoverageDto[];

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
}

export class WaiterPerformanceSummaryDto {
  @ApiProperty()
  waiterCount: number;

  @ApiProperty()
  clockedInCount: number;

  @ApiProperty()
  totalHoursWorked: number;

  @ApiProperty()
  totalNetSales: string;

  @ApiProperty()
  totalCashCollected: string;

  @ApiProperty()
  totalUndroppedCash: string;
}

export class WaiterPerformanceResponseDto {
  @ApiProperty({ enum: ['day', 'week', 'month'] })
  period: 'day' | 'week' | 'month';

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  currencyCode: string;

  @ApiProperty({ type: WaiterPerformanceSummaryDto })
  summary: WaiterPerformanceSummaryDto;

  @ApiProperty({ type: [WaiterPerformanceRowDto] })
  data: WaiterPerformanceRowDto[];
}
