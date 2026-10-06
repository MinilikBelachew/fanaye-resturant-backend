import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class DispatcherCallDto {
  @ApiProperty()
  @Expose()
  tableSessionId: string;

  @ApiProperty()
  @Expose()
  tableId: string;

  @ApiProperty()
  @Expose()
  slotName: string;

  @ApiProperty()
  @Expose()
  customerName: string;

  @ApiPropertyOptional()
  @Expose()
  customerPhone: string | null;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty({
    description: 'OPEN | IN_KITCHEN | READY_TO_PAY | PAID',
  })
  @Expose()
  boardColumn: string;

  @ApiProperty()
  @Expose()
  openedAt: Date;

  @ApiProperty()
  @Expose()
  version: number;

  @ApiProperty()
  @Expose()
  cookingItemCount: number;

  @ApiProperty()
  @Expose()
  readyItemCount: number;

  @ApiProperty()
  @Expose()
  hasBill: boolean;

  @ApiProperty()
  @Expose()
  billStatus: string | null;

  @ApiProperty()
  @Expose()
  mine: boolean;
}

export class DispatcherBoardResponseDto {
  @ApiProperty({ type: [DispatcherCallDto] })
  @Expose()
  data: DispatcherCallDto[];
}
