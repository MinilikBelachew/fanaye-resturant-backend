import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class QueueModifierDto {
  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  priceDelta: string;
}

export class QueueWaiterDto {
  @ApiProperty()
  @Expose()
  membershipId: string;

  @ApiProperty()
  @Expose()
  displayName: string;
}

export class StationQueueItemDto {
  @ApiProperty()
  @Expose()
  orderItemId: string;

  @ApiProperty()
  @Expose()
  tableSessionId: string;

  @ApiProperty()
  @Expose()
  tableDisplayName: string;

  @ApiProperty()
  @Expose()
  itemName: string;

  @ApiProperty()
  @Expose()
  quantity: number;

  @ApiProperty()
  @Expose()
  unitPrice: string;

  @ApiProperty()
  @Expose()
  currencyCode: string;

  @ApiProperty({ type: () => [QueueModifierDto] })
  @Expose()
  @Type(() => QueueModifierDto)
  modifiers: QueueModifierDto[];

  @ApiPropertyOptional()
  @Expose()
  specialInstruction: string | null;

  @ApiProperty({ type: () => QueueWaiterDto })
  @Expose()
  @Type(() => QueueWaiterDto)
  waiter: QueueWaiterDto;

  @ApiProperty()
  @Expose()
  state: string;

  @ApiPropertyOptional()
  @Expose()
  queuedAt: Date | null;

  @ApiProperty()
  @Expose()
  expectedPrepMinutes: number;

  @ApiProperty()
  @Expose()
  elapsedSeconds: number;

  @ApiProperty()
  @Expose()
  delayed: boolean;

  @ApiProperty()
  @Expose()
  version: number;

  @ApiPropertyOptional()
  @Expose()
  exceptionReason: string | null;
}

export class StationQueueResponseDto {
  @ApiProperty()
  @Expose()
  stationId: string;

  @ApiProperty()
  @Expose()
  stationName: string;

  @ApiProperty()
  @Expose()
  stationCode: string | null;

  @ApiProperty({ type: () => [StationQueueItemDto] })
  @Expose()
  @Type(() => StationQueueItemDto)
  data: StationQueueItemDto[];
}
