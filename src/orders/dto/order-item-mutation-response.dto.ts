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
  orderId: string;

  @ApiProperty()
  tableId: string;

  @ApiProperty()
  itemName: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  unitPrice: string;

  @ApiProperty()
  lineTotal: string;

  @ApiProperty()
  currencyCode: string;

  @ApiProperty()
  tableDisplayName: string;

  @ApiPropertyOptional()
  tableDisplayNumber?: string | null;

  @ApiProperty()
  stationName: string;

  @ApiPropertyOptional()
  stationId?: string | null;

  @ApiProperty()
  itemState: string;

  @ApiProperty()
  stateAtRequest: string;

  @ApiProperty()
  itemVersion: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  reason: string | null;

  @ApiPropertyOptional()
  specialInstruction?: string | null;

  @ApiPropertyOptional()
  requestedChange?: Record<string, unknown> | null;

  @ApiProperty()
  requestedByName: string;

  @ApiProperty()
  requestedAt: Date;

  @ApiPropertyOptional()
  decidedByName?: string | null;

  @ApiPropertyOptional()
  decidedAt?: Date | null;

  @ApiPropertyOptional()
  decisionReason?: string | null;
}

export class ApprovalQueueResponseDto {
  @ApiProperty({ type: [ApprovalQueueItemDto] })
  data: ApprovalQueueItemDto[];

  @ApiPropertyOptional()
  summary?: {
    pendingCount: number;
    cancellationCount: number;
    changeCount: number;
  };
}

export class ApprovalDetailResponseDto {
  @ApiProperty({ type: ApprovalQueueItemDto })
  data: ApprovalQueueItemDto;
}

export class ApprovalHistoryResponseDto {
  @ApiProperty()
  period: string;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty({ type: [ApprovalQueueItemDto] })
  data: ApprovalQueueItemDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
