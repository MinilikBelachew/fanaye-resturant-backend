import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class WaiterCashSummaryDto {
  @ApiProperty()
  @Expose()
  shiftSessionId: string;

  @ApiProperty()
  @Expose()
  currencyCode: string;

  @ApiProperty()
  @Expose()
  cashCollected: string;

  @ApiProperty()
  @Expose()
  cashDropped: string;

  @ApiProperty()
  @Expose()
  undroppedCash: string;

  @ApiProperty()
  @Expose()
  pendingCashDropAmount: string;

  @ApiProperty()
  @Expose()
  disputedCashDropAmount: string;
}

export class CashDropDto {
  @ApiProperty()
  @Expose()
  cashDropId: string;

  @ApiProperty()
  @Expose()
  declaredAmount: string;

  @ApiProperty()
  @Expose()
  currencyCode: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  initiatedAt: Date;

  @ApiPropertyOptional()
  @Expose()
  countedAmount: string | null;

  @ApiPropertyOptional()
  @Expose()
  receivedAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  resolutionAmount: string | null;

  @ApiProperty()
  @Expose()
  version: number;

  @ApiPropertyOptional()
  @Expose()
  waiterName?: string;

  @ApiPropertyOptional()
  @Expose()
  variance?: string | null;

  @ApiPropertyOptional()
  @Expose()
  disputeId?: string | null;

  @ApiPropertyOptional()
  @Expose()
  disputeStatus?: string | null;
}

export class CashDropQueueResponseDto {
  @ApiProperty({ type: () => [CashDropDto] })
  @Expose()
  @Type(() => CashDropDto)
  data: CashDropDto[];
}

export class ReceiveCashDropResponseDto {
  @ApiProperty()
  @Expose()
  cashDropId: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  declaredAmount: string;

  @ApiProperty()
  @Expose()
  countedAmount: string;

  @ApiPropertyOptional()
  @Expose()
  acceptedCustodyAmount: string | null;

  @ApiPropertyOptional()
  @Expose()
  variance: string | null;

  @ApiPropertyOptional()
  @Expose()
  disputeId: string | null;

  @ApiPropertyOptional()
  @Expose()
  receivedAt: Date | null;

  @ApiProperty()
  @Expose()
  version: number;
}
