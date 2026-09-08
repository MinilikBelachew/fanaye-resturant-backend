import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class BillLineDto {
  @ApiProperty()
  @Expose()
  billLineId: string;

  @ApiPropertyOptional()
  @Expose()
  orderItemId: string | null;

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
  lineTotal: string;

  @ApiProperty()
  @Expose()
  chargeStatus: string;
}

export class BillDto {
  @ApiProperty()
  @Expose()
  billId: string;

  @ApiProperty()
  @Expose()
  tableSessionId: string;

  @ApiProperty()
  @Expose()
  billNumber: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  currencyCode: string;

  @ApiProperty()
  @Expose()
  subtotal: string;

  @ApiProperty()
  @Expose()
  total: string;

  @ApiProperty()
  @Expose()
  amountPaid: string;

  @ApiProperty()
  @Expose()
  generatedAt: Date;

  @ApiPropertyOptional()
  @Expose()
  paidAt: Date | null;

  @ApiProperty()
  @Expose()
  version: number;

  @ApiProperty({ type: () => [BillLineDto] })
  @Expose()
  @Type(() => BillLineDto)
  lines: BillLineDto[];
}

export class BillRequestCreatedDto {
  @ApiProperty()
  @Expose()
  billRequestId: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  requestedAt: Date;

  @ApiProperty()
  @Expose()
  tableSession: { status: string; version: number };
}

export class CashierBillRequestDto {
  @ApiProperty()
  @Expose()
  billRequestId: string;

  @ApiProperty()
  @Expose()
  tableSessionId: string;

  @ApiProperty()
  @Expose()
  tableDisplayName: string;

  @ApiProperty()
  @Expose()
  waiter: { membershipId: string; displayName: string };

  @ApiProperty()
  @Expose()
  requestedAt: Date;

  @ApiProperty()
  @Expose()
  requestAgeSeconds: number;

  @ApiProperty()
  @Expose()
  estimatedAmount: string;

  @ApiProperty()
  @Expose()
  currencyCode: string;

  @ApiProperty()
  @Expose()
  expectedTableSessionVersion: number;

  @ApiProperty({ type: [String] })
  @Expose()
  warnings: string[];
}

export class CashierBillRequestsResponseDto {
  @ApiProperty({ type: () => [CashierBillRequestDto] })
  @Expose()
  @Type(() => CashierBillRequestDto)
  data: CashierBillRequestDto[];
}

export class PaymentDto {
  @ApiProperty()
  @Expose()
  paymentId: string;

  @ApiProperty()
  @Expose()
  method: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  amount: string;

  @ApiProperty()
  @Expose()
  currencyCode: string;

  @ApiPropertyOptional()
  @Expose()
  transferChannel: string | null;

  @ApiProperty()
  @Expose()
  collectorMembershipId: string;

  @ApiPropertyOptional()
  @Expose()
  collectedAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  verifiedAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  settledAt: Date | null;
}

export class CashPaymentResponseDto {
  @ApiProperty({ type: () => PaymentDto })
  @Expose()
  @Type(() => PaymentDto)
  payment: PaymentDto;

  @ApiProperty()
  @Expose()
  change: string;

  @ApiProperty()
  @Expose()
  bill: {
    billId: string;
    status: string;
    amountPaid: string;
    version: number;
  };

  @ApiProperty()
  @Expose()
  tableSession: { status: string; version: number };
}

export class TransferPaymentResponseDto {
  @ApiProperty({ type: () => PaymentDto })
  @Expose()
  @Type(() => PaymentDto)
  payment: PaymentDto;

  @ApiProperty()
  @Expose()
  bill: {
    billId: string;
    status: string;
    amountPaid: string;
    version: number;
  };

  @ApiProperty()
  @Expose()
  tableSession: { status: string; version: number };
}

export class VerifyTransferResponseDto {
  @ApiProperty()
  @Expose()
  paymentId: string;

  @ApiProperty()
  @Expose()
  paymentStatus: string;

  @ApiProperty()
  @Expose()
  fanayeDecision: string;

  @ApiProperty()
  @Expose()
  expectedAmount: string;

  @ApiProperty()
  @Expose()
  billStatus: string;

  @ApiProperty()
  @Expose()
  tableSessionStatus: string;
}

export class SessionBillResponseDto {
  @ApiPropertyOptional({ type: () => BillDto })
  @Expose()
  @Type(() => BillDto)
  bill: BillDto | null;

  @ApiPropertyOptional()
  @Expose()
  billRequest: {
    billRequestId: string;
    status: string;
    requestedAt: Date;
  } | null;

  @ApiProperty()
  @Expose()
  tableSession: {
    tableSessionId: string;
    status: string;
    version: number;
  };

  @ApiProperty({ type: () => [PaymentDto] })
  @Expose()
  @Type(() => PaymentDto)
  payments: PaymentDto[];
}
