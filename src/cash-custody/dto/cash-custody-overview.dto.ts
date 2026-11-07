import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WaiterCustodyItemDto {
  @ApiProperty()
  membershipId: string;

  @ApiProperty()
  waiterName: string;

  @ApiPropertyOptional({ nullable: true })
  photoUrl: string | null;

  @ApiProperty()
  branchId: string;

  @ApiProperty()
  branchName: string;

  @ApiProperty()
  shiftSessionId: string;

  @ApiProperty()
  clockInAt: string;

  @ApiProperty()
  cashCollected: string;

  @ApiProperty()
  cashDropped: string;

  @ApiProperty()
  pendingDropAmount: string;

  @ApiProperty()
  undroppedCash: string;

  @ApiProperty({ enum: ['NORMAL', 'ELEVATED', 'CRITICAL'] })
  riskLevel: 'NORMAL' | 'ELEVATED' | 'CRITICAL';
}

export class CashierDrawerItemDto {
  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  cashierName: string;

  @ApiProperty()
  branchId: string;

  @ApiProperty()
  branchName: string;

  @ApiProperty()
  openedAt: string;

  @ApiProperty()
  openingFloat: string;

  @ApiProperty()
  dropsReceived: string;

  @ApiProperty()
  directCashSales: string;

  @ApiProperty()
  expectedDrawerCash: string;
}

export class CashDropOverviewItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  branchId: string;

  @ApiProperty()
  branchName: string;

  @ApiProperty()
  waiterName: string;

  @ApiPropertyOptional({ nullable: true })
  cashierName: string | null;

  @ApiProperty()
  declaredAmount: string;

  @ApiPropertyOptional({ nullable: true })
  countedAmount: string | null;

  @ApiPropertyOptional({ nullable: true })
  variance: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  initiatedAt: string;

  @ApiPropertyOptional({ nullable: true })
  receivedAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  disputeId: string | null;

  @ApiPropertyOptional({ nullable: true })
  disputeStatus: string | null;

  @ApiPropertyOptional({ nullable: true })
  disputeReason: string | null;
}

export class CashCustodySummaryDto {
  @ApiProperty()
  totalWaiterUndropped: string;

  @ApiProperty()
  totalCashierDrawer: string;

  @ApiProperty()
  totalDroppedToday: string;

  @ApiProperty()
  activeDisputesCount: number;

  @ApiProperty()
  activeWaitersCount: number;

  @ApiProperty()
  activeCashiersCount: number;
}

export class BranchOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  displayCode: string | null;
}

export class CashCustodyOverviewResponseDto {
  @ApiProperty({ type: CashCustodySummaryDto })
  summary: CashCustodySummaryDto;

  @ApiProperty({ type: [WaiterCustodyItemDto] })
  waiters: WaiterCustodyItemDto[];

  @ApiProperty({ type: [CashierDrawerItemDto] })
  cashiers: CashierDrawerItemDto[];

  @ApiProperty({ type: [CashDropOverviewItemDto] })
  recentDrops: CashDropOverviewItemDto[];

  @ApiProperty({ type: [BranchOptionDto] })
  branches: BranchOptionDto[];

  @ApiPropertyOptional({ nullable: true })
  currentBranchId: string | null;

  @ApiProperty()
  isOwner: boolean;
}

