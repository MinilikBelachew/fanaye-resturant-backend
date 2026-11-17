import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class ShiftHandoverDto {
  @ApiProperty({ description: 'Expected version of the current shift session' })
  @IsInt()
  @Type(() => Number)
  expectedVersion: number;

  @ApiProperty({
    example: 15200.0,
    description: 'Total physical cash counted in the drawer',
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  countedAmount: number;

  @ApiProperty({
    example: 2000.0,
    description:
      'Amount to leave in the drawer as opening float for the incoming cashier',
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  floatForNextCashier: number;

  @ApiProperty({ description: 'Staff membership ID of the incoming cashier' })
  @IsUUID()
  incomingCashierMembershipId: string;

  @ApiProperty({
    example: '1234',
    description: 'Exactly 4 numeric digit PIN of the incoming cashier',
  })
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'Incoming cashier PIN must be exactly 4 numeric digits.',
  })
  incomingCashierPin: string;

  @ApiPropertyOptional({
    description: 'Optional handover comments or handover note',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class HandoverCandidateDto {
  @ApiProperty()
  @Expose()
  membershipId: string;

  @ApiProperty()
  @Expose()
  displayName: string;

  @ApiProperty()
  @Expose()
  roleCode: string;

  @ApiPropertyOptional()
  @Expose()
  photoUrl?: string | null;
}

export class ShiftHandoverResponseDto {
  @ApiProperty()
  @Expose()
  outgoingCashierName: string;

  @ApiProperty()
  @Expose()
  incomingCashierName: string;

  @ApiProperty()
  @Expose()
  countedAmountFormatted: string;

  @ApiProperty()
  @Expose()
  expectedAmountFormatted: string;

  @ApiProperty()
  @Expose()
  varianceAmountFormatted: string;

  @ApiProperty()
  @Expose()
  floatTransferredFormatted: string;

  @ApiProperty()
  @Expose()
  safeDropAmountFormatted: string;

  @ApiProperty()
  @Expose()
  handedOverAt: Date;

  @ApiProperty()
  @Expose()
  status: string;
}

export class WaiterShiftHandoverDto {
  @ApiProperty({ description: 'Expected version of the current shift session' })
  @IsInt()
  @Type(() => Number)
  expectedVersion: number;

  @ApiProperty({
    example: 500.0,
    description: 'Physical cash amount handed over to incoming waiter',
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  transferredCashAmount: number;

  @ApiProperty({ description: 'Staff membership ID of the incoming waiter' })
  @IsUUID()
  incomingWaiterMembershipId: string;

  @ApiProperty({
    example: '1234',
    description: 'Exactly 4 numeric digit PIN of incoming waiter',
  })
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'Incoming waiter PIN must be exactly 4 numeric digits.',
  })
  incomingWaiterPin: string;

  @ApiPropertyOptional({
    description: 'Optional handover comments or handover note',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class WaiterShiftHandoverResponseDto {
  @ApiProperty()
  @Expose()
  outgoingWaiterName: string;

  @ApiProperty()
  @Expose()
  incomingWaiterName: string;

  @ApiProperty()
  @Expose()
  tablesTransferredCount: number;

  @ApiProperty({ type: [String] })
  @Expose()
  tablesTransferredNames: string[];

  @ApiProperty()
  @Expose()
  cashTransferredFormatted: string;

  @ApiProperty()
  @Expose()
  handedOverAt: Date;

  @ApiProperty()
  @Expose()
  status: string;
}

export class ShiftHandoverHistoryItemDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: ['CASHIER', 'WAITER'] })
  @Expose()
  kind: 'CASHIER' | 'WAITER';

  @ApiProperty()
  @Expose()
  handedOverAt: Date;

  @ApiProperty()
  @Expose()
  outgoingName: string;

  @ApiProperty()
  @Expose()
  incomingName: string;

  @ApiProperty({ required: false })
  @Expose()
  countedAmount?: string;

  @ApiProperty({ required: false })
  @Expose()
  floatForNextCashier?: string;

  @ApiProperty({ required: false })
  @Expose()
  safeDropAmount?: string;

  @ApiProperty({ required: false })
  @Expose()
  varianceAmount?: string;

  @ApiProperty({ required: false })
  @Expose()
  transferredCashAmount?: string;

  @ApiProperty({ required: false })
  @Expose()
  tablesTransferredCount?: number;

  @ApiProperty({ type: [String], required: false })
  @Expose()
  tablesTransferredNames?: string[];

  @ApiProperty({ required: false })
  @Expose()
  notes?: string;
}

export class ShiftHandoverSummaryDto {
  @ApiProperty()
  @Expose()
  totalCount: number;

  @ApiProperty()
  @Expose()
  cashierCount: number;

  @ApiProperty()
  @Expose()
  waiterCount: number;

  @ApiProperty()
  @Expose()
  varianceCount: number;
}

export class ShiftHandoversResponseDto {
  @ApiProperty({ type: [ShiftHandoverHistoryItemDto] })
  @Expose()
  items: ShiftHandoverHistoryItemDto[];

  @ApiProperty()
  @Expose()
  total: number;

  @ApiProperty()
  @Expose()
  page: number;

  @ApiProperty()
  @Expose()
  limit: number;

  @ApiProperty()
  @Expose()
  totalPages: number;

  @ApiProperty({ type: ShiftHandoverSummaryDto })
  @Expose()
  summary: ShiftHandoverSummaryDto;
}

export class HandoverStationBreakdownDto {
  @ApiProperty()
  @Expose()
  stationName: string;

  @ApiProperty()
  @Expose()
  itemCount: number;

  @ApiProperty()
  @Expose()
  totalAmount: string;
}

export class HandoverTableItemDto {
  @ApiProperty()
  @Expose()
  id: string;

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
  totalPrice: string;

  @ApiProperty()
  @Expose()
  stationName: string;

  @ApiProperty()
  @Expose()
  state: string;
}

export class HandoverTableDetailDto {
  @ApiProperty()
  @Expose()
  tableSessionId: string;

  @ApiProperty()
  @Expose()
  tableName: string;

  @ApiProperty({ required: false })
  @Expose()
  locationName?: string;

  @ApiProperty({ required: false })
  @Expose()
  guestCount?: number | null;

  @ApiProperty()
  @Expose()
  openedAt: Date;

  @ApiProperty()
  @Expose()
  ordersCount: number;

  @ApiProperty()
  @Expose()
  itemsCount: number;

  @ApiProperty()
  @Expose()
  totalAmount: string;

  @ApiProperty({ type: [HandoverTableItemDto] })
  @Expose()
  items: HandoverTableItemDto[];
}

export class HandoverPaymentMethodDto {
  @ApiProperty()
  @Expose()
  method: string;

  @ApiProperty()
  @Expose()
  count: number;

  @ApiProperty()
  @Expose()
  totalAmount: string;
}

export class HandoverCashDropItemDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  waiterName: string;

  @ApiProperty()
  @Expose()
  amount: string;

  @ApiProperty({ required: false })
  @Expose()
  receivedAt?: Date | null;
}

export class HandoverMoneyDetailDto {
  @ApiProperty({ required: false })
  @Expose()
  openingFloat?: string;

  @ApiProperty()
  @Expose()
  cashCollected: string;

  @ApiProperty()
  @Expose()
  nonCashCollected: string;

  @ApiProperty({ required: false })
  @Expose()
  cashDropsReceived?: string;

  @ApiProperty({ required: false })
  @Expose()
  cashDropsGiven?: string;

  @ApiProperty({ required: false })
  @Expose()
  expectedCash?: string;

  @ApiProperty({ required: false })
  @Expose()
  countedAmount?: string;

  @ApiProperty({ required: false })
  @Expose()
  floatForNextCashier?: string;

  @ApiProperty({ required: false })
  @Expose()
  safeDropAmount?: string;

  @ApiProperty({ required: false })
  @Expose()
  varianceAmount?: string;

  @ApiProperty({ required: false })
  @Expose()
  transferredCashAmount?: string;

  @ApiProperty({ required: false })
  @Expose()
  openTablesTotalValue?: string;
}

export class ShiftHandoverDetailDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: ['CASHIER', 'WAITER'] })
  @Expose()
  kind: 'CASHIER' | 'WAITER';

  @ApiProperty()
  @Expose()
  handedOverAt: Date;

  @ApiProperty()
  @Expose()
  outgoingName: string;

  @ApiProperty()
  @Expose()
  incomingName: string;

  @ApiProperty({ required: false })
  @Expose()
  notes?: string;

  @ApiProperty({ type: HandoverMoneyDetailDto })
  @Expose()
  money: HandoverMoneyDetailDto;

  @ApiProperty({ type: [HandoverStationBreakdownDto] })
  @Expose()
  stationBreakdown: HandoverStationBreakdownDto[];

  @ApiProperty({ type: [HandoverTableDetailDto] })
  @Expose()
  tables: HandoverTableDetailDto[];

  @ApiProperty({ type: [HandoverPaymentMethodDto] })
  @Expose()
  paymentMethods: HandoverPaymentMethodDto[];

  @ApiProperty({ type: [HandoverCashDropItemDto] })
  @Expose()
  cashDrops: HandoverCashDropItemDto[];
}
