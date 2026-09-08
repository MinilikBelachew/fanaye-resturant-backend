import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DailyCloseBlockerDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  entityId?: string | null;
}

export class DailyCloseSummaryDto {
  @ApiProperty()
  grossOrderValue: string;

  @ApiProperty()
  cancelledValue: string;

  @ApiProperty()
  netBilledSales: string;

  @ApiProperty()
  cashSales: string;

  @ApiProperty()
  verifiedTransferSales: string;

  @ApiProperty()
  pendingTransferAmount: string;

  @ApiProperty()
  suspiciousTransferAmount: string;

  @ApiProperty()
  cashierExpectedCash: string;

  @ApiProperty()
  cashierCountedCash: string;

  @ApiProperty()
  cashierVariance: string;

  @ApiProperty()
  undroppedWaiterCash: string;
}

export class DailyCloseWaiterLineDto {
  @ApiProperty()
  waiterMembershipId: string;

  @ApiProperty()
  waiterName: string;

  @ApiProperty()
  shiftSessionId: string;

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

export class DailyCloseStationLineDto {
  @ApiProperty()
  stationId: string;

  @ApiProperty()
  stationName: string;

  @ApiProperty()
  itemsHandledCount: number;

  @ApiProperty()
  delayedItemCount: number;

  @ApiProperty()
  cannotPrepareCount: number;
}

export class DailyClosePreviewDto {
  @ApiProperty()
  businessDate: string;

  @ApiProperty()
  currencyCode: string;

  @ApiProperty()
  readiness: {
    ready: boolean;
    blockers: DailyCloseBlockerDto[];
  };

  @ApiProperty({ type: DailyCloseSummaryDto })
  summary: DailyCloseSummaryDto;

  @ApiProperty({ type: [DailyCloseWaiterLineDto] })
  waiters: DailyCloseWaiterLineDto[];

  @ApiProperty({ type: [DailyCloseStationLineDto] })
  stations: DailyCloseStationLineDto[];

  @ApiPropertyOptional()
  existingDailyCloseId?: string | null;

  @ApiPropertyOptional()
  existingStatus?: string | null;

  @ApiPropertyOptional()
  existingVersion?: number | null;
}

export class DailyClosePreviewResponseDto {
  @ApiProperty({ type: DailyClosePreviewDto })
  data: DailyClosePreviewDto;
}

export class DailyCloseDto {
  @ApiProperty()
  dailyCloseId: string;

  @ApiProperty()
  businessDate: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  currencyCode: string;

  @ApiProperty({ type: DailyCloseSummaryDto })
  summary: DailyCloseSummaryDto;

  @ApiProperty({ type: [DailyCloseWaiterLineDto] })
  waiters: DailyCloseWaiterLineDto[];

  @ApiProperty({ type: [DailyCloseStationLineDto] })
  stations: DailyCloseStationLineDto[];

  @ApiProperty()
  readiness: {
    ready: boolean;
    blockers: DailyCloseBlockerDto[];
  };

  @ApiPropertyOptional()
  approvedAt: Date | null;

  @ApiPropertyOptional()
  lockedAt: Date | null;

  @ApiProperty()
  version: number;
}

export class DailyCloseResponseDto {
  @ApiProperty({ type: DailyCloseDto })
  data: DailyCloseDto;
}

export class DailyCloseListResponseDto {
  @ApiProperty({ type: [DailyCloseDto] })
  data: DailyCloseDto[];
}

export class DailyCloseLockResponseDto {
  @ApiProperty()
  data: {
    dailyCloseId: string;
    status: string;
    businessDate: string;
    lockedAt: Date | null;
    lockedByMembershipId: string | null;
    version: number;
  };
}
