import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemMutationResultDto {
  @ApiProperty()
  orderItemId: string;

  @ApiProperty()
  state: string;

  @ApiProperty()
  version: number;

  @ApiPropertyOptional()
  itemName?: string;

  @ApiPropertyOptional()
  specialInstruction?: string | null;

  @ApiPropertyOptional()
  cancelledAt?: Date | null;

  @ApiPropertyOptional()
  applied?: boolean;

  @ApiPropertyOptional()
  changeRequestId?: string | null;

  @ApiPropertyOptional()
  cancellationRequestId?: string | null;

  @ApiPropertyOptional()
  status?: string;
}

export class MutationDataResponseDto {
  @ApiProperty({ type: OrderItemMutationResultDto })
  data: OrderItemMutationResultDto;
}

export class ApprovalQueueItemDto {
  @ApiProperty()
  type: 'CANCELLATION' | 'CHANGE';

  @ApiProperty()
  requestId: string;

  @ApiProperty()
  orderItemId: string;

  @ApiProperty()
  itemName: string;

  @ApiProperty()
  tableDisplayName: string;

  @ApiProperty()
  stationName: string;

  @ApiProperty()
  itemState: string;

  @ApiProperty()
  itemVersion: number;

  @ApiProperty()
  reason: string | null;

  @ApiPropertyOptional()
  requestedChange?: Record<string, unknown> | null;

  @ApiProperty()
  requestedByName: string;

  @ApiProperty()
  requestedAt: Date;
}

export class ApprovalQueueResponseDto {
  @ApiProperty({ type: [ApprovalQueueItemDto] })
  data: ApprovalQueueItemDto[];
}
