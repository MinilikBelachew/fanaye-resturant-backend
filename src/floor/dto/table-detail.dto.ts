import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TableKpiPeriodDto {
  @ApiProperty()
  period: string;

  @ApiProperty()
  periodLabel: string;

  @ApiProperty({ description: 'Closed visits / turns' })
  turns: number;

  @ApiProperty({ description: 'Billed revenue for the table in ETB' })
  revenue: number;

  @ApiProperty({ description: 'Average ticket = revenue / turns' })
  avgTicket: number;

  @ApiProperty()
  covers: number;

  @ApiProperty()
  currencyCode: string;
}

export class TableLiveVisitDto {
  @ApiProperty()
  tableSessionId: string;

  @ApiProperty()
  sessionStatus: string;

  @ApiPropertyOptional()
  guestCount?: number | null;

  @ApiProperty()
  openedAt: string;

  @ApiPropertyOptional()
  waiterName?: string | null;

  @ApiPropertyOptional()
  waiterMembershipId?: string | null;

  @ApiProperty()
  cookingItemCount: number;

  @ApiProperty()
  readyItemCount: number;

  @ApiProperty()
  delayedItemCount: number;

  @ApiProperty()
  openItemCount: number;

  @ApiPropertyOptional()
  billTotal?: number | null;

  @ApiPropertyOptional()
  amountPaid?: number | null;

  @ApiPropertyOptional()
  billStatus?: string | null;

  @ApiPropertyOptional()
  billNumber?: string | null;
}

export class TableDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  displayNumber?: string | null;

  @ApiProperty()
  locationId: string;

  @ApiProperty()
  locationName: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  tableStatus: string;

  @ApiPropertyOptional()
  assignedWaiterMembershipId?: string | null;

  @ApiPropertyOptional()
  assignedWaiterName?: string | null;

  @ApiPropertyOptional()
  qrRelativeUrl?: string | null;

  @ApiPropertyOptional()
  qrSlug?: string | null;

  @ApiPropertyOptional({ type: () => TableLiveVisitDto })
  live?: TableLiveVisitDto | null;

  @ApiProperty({ type: () => TableKpiPeriodDto })
  kpisToday: TableKpiPeriodDto;

  @ApiProperty({ type: () => TableKpiPeriodDto })
  kpisWeek: TableKpiPeriodDto;

  @ApiProperty()
  version: number;
}

export class TableVisitHistoryItemDto {
  @ApiProperty()
  tableSessionId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  businessDate: string;

  @ApiProperty()
  openedAt: string;

  @ApiPropertyOptional()
  closedAt?: string | null;

  @ApiPropertyOptional()
  guestCount?: number | null;

  @ApiPropertyOptional()
  waiterName?: string | null;

  @ApiPropertyOptional()
  billNumber?: string | null;

  @ApiPropertyOptional()
  billStatus?: string | null;

  @ApiProperty()
  revenue: number;

  @ApiProperty()
  amountPaid: number;

  @ApiProperty()
  currencyCode: string;

  @ApiProperty()
  orderCount: number;

  @ApiProperty()
  itemCount: number;

  @ApiPropertyOptional()
  durationMinutes?: number | null;
}

export class TableVisitHistoryResponseDto {
  @ApiProperty()
  tableId: string;

  @ApiProperty()
  period: string;

  @ApiProperty()
  periodLabel: string;

  @ApiProperty({ type: () => [TableVisitHistoryItemDto] })
  data: TableVisitHistoryItemDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
