import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class FloorLocationDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  code: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  sortOrder: number;
}

export class FloorTableDto {
  @ApiProperty()
  @Expose()
  tableId: string;

  @ApiProperty()
  @Expose()
  displayName: string;

  @ApiPropertyOptional()
  @Expose()
  displayNumber: string | null;

  @ApiProperty()
  @Expose()
  locationId: string;

  @ApiProperty()
  @Expose()
  locationName: string;

  @ApiProperty()
  @Expose()
  locationCode: string;

  @ApiProperty()
  @Expose()
  tableStatus: string;

  @ApiPropertyOptional()
  @Expose()
  tableSessionId: string | null;

  @ApiPropertyOptional()
  @Expose()
  sessionStatus: string | null;

  @ApiPropertyOptional()
  @Expose()
  visitStartedAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  guestCount: number | null;

  @ApiPropertyOptional()
  @Expose()
  primaryWaiterMembershipId: string | null;

  @ApiPropertyOptional()
  @Expose()
  waiterName: string | null;

  @ApiPropertyOptional()
  @Expose()
  assignedWaiterMembershipId: string | null;

  @ApiPropertyOptional()
  @Expose()
  assignedWaiterName: string | null;

  @ApiProperty()
  @Expose()
  mine: boolean;

  @ApiProperty()
  @Expose()
  readyItemCount: number;

  @ApiProperty()
  @Expose()
  cookingItemCount: number;

  @ApiProperty()
  @Expose()
  delayedItemCount: number;

  @ApiProperty()
  @Expose()
  version: number;
}

export class FloorTablesResponseDto {
  @ApiProperty({ type: () => [FloorLocationDto] })
  @Expose()
  locations: FloorLocationDto[];

  @ApiProperty({ type: () => [FloorTableDto] })
  @Expose()
  data: FloorTableDto[];
}
