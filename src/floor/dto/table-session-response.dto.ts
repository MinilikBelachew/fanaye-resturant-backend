import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class TableSessionResponseDto {
  @ApiProperty()
  @Expose()
  tableSessionId: string;

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
  locationName: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty({ enum: ['DINE_IN', 'CALL_PICKUP'] })
  @Expose()
  sessionKind: string;

  @ApiPropertyOptional()
  @Expose()
  customerName: string | null;

  @ApiPropertyOptional()
  @Expose()
  customerPhone: string | null;

  @ApiProperty()
  @Expose()
  primaryWaiterMembershipId: string;

  @ApiProperty()
  @Expose()
  waiterName: string;

  @ApiPropertyOptional()
  @Expose()
  guestCount: number | null;

  @ApiProperty()
  @Expose()
  openedAt: Date;

  @ApiPropertyOptional()
  @Expose()
  closedAt: Date | null;

  @ApiProperty()
  @Expose()
  businessDate: string;

  @ApiProperty()
  @Expose()
  version: number;

  @ApiProperty()
  @Expose()
  mine: boolean;
}
