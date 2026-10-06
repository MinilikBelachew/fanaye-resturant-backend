import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StationOwnerDto {
  @ApiProperty()
  membershipId: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  assignedAt?: Date;
}

export class StationDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  code?: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  enabled: boolean;

  @ApiPropertyOptional()
  defaultDelayThresholdMinutes?: number | null;

  @ApiPropertyOptional()
  avgPrepMin?: number;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: () => [StationOwnerDto] })
  owners: StationOwnerDto[];

  @ApiProperty({ description: 'Active cooking tickets right now' })
  openTickets: number;

  @ApiProperty({ description: 'Order items confirmed today for this station' })
  ticketsToday: number;

  @ApiProperty()
  menuItemCount: number;

  @ApiProperty()
  servedToday: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class StationHistoryItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  itemName: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  state: string;

  @ApiProperty()
  tableDisplayName: string;

  @ApiPropertyOptional()
  waiterName?: string | null;

  @ApiPropertyOptional()
  specialInstruction?: string | null;

  @ApiProperty()
  businessDate: string;

  @ApiProperty()
  confirmedAt: Date;

  @ApiPropertyOptional()
  queuedAt?: Date | null;

  @ApiPropertyOptional()
  readyAt?: Date | null;

  @ApiPropertyOptional()
  servedAt?: Date | null;

  @ApiPropertyOptional()
  prepMinutes?: number | null;
}

export class StationHistoryPaginationDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class StationHistoryResponseDto {
  @ApiProperty()
  stationId: string;

  @ApiProperty()
  period: string;

  @ApiProperty()
  periodLabel: string;

  @ApiProperty({ type: () => [StationHistoryItemDto] })
  data: StationHistoryItemDto[];

  @ApiProperty({ type: () => StationHistoryPaginationDto })
  pagination: StationHistoryPaginationDto;
}
