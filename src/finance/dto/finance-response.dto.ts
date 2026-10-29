import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinanceDirection, FinanceEntrySource } from './finance.dto';

export class FinanceRevenueDto {
  @ApiProperty() billed: string;
  @ApiProperty() cancelled: string;
  @ApiProperty() otherIncome: string;
  @ApiProperty() total: string;
  @ApiProperty() cash: string;
  @ApiProperty() transfer: string;
  @ApiProperty() billCount: number;
}

export class FinanceCostDto {
  @ApiProperty() cogs: string;
  @ApiProperty() waste: string;
  @ApiProperty() materialCost: string;
  @ApiProperty() foodCostPct: number;
}

export class FinancePayrollDto {
  @ApiProperty() amount: string;
  @ApiProperty() runsCount: number;
}

export class FinanceCategoryBreakdownDto {
  @ApiPropertyOptional({ nullable: true }) categoryId: string | null;
  @ApiPropertyOptional({ nullable: true }) code: string | null;
  @ApiProperty() name: string;
  @ApiProperty() amount: string;
  @ApiProperty({ description: 'Share of the total for this direction, 0–100' })
  share: number;
}

export class FinanceExpensesDto {
  @ApiProperty() manual: string;
  @ApiProperty() total: string;
  @ApiProperty({ type: [FinanceCategoryBreakdownDto] })
  byCategory: FinanceCategoryBreakdownDto[];
}

export class FinanceTotalsDto {
  @ApiProperty() grossProfit: string;
  @ApiProperty() grossMarginPct: number;
  @ApiProperty() primeCost: string;
  @ApiProperty() expensesTotal: string;
  @ApiProperty() netProfit: string;
  @ApiProperty() netMarginPct: number;
}

export class FinanceSeriesPointDto {
  @ApiProperty() date: string;
  @ApiProperty() revenue: string;
  @ApiProperty() materialCost: string;
  @ApiProperty() payroll: string;
  @ApiProperty() expenses: string;
  @ApiProperty() netProfit: string;
}

export class FinanceBranchRollupDto {
  @ApiProperty() branchId: string;
  @ApiProperty() branchName: string;
  @ApiProperty() revenue: string;
  @ApiProperty() materialCost: string;
  @ApiProperty() payroll: string;
  @ApiProperty() expensesTotal: string;
  @ApiProperty() netProfit: string;
}

export class FinanceInventoryPurchaseLineDto {
  @ApiPropertyOptional({ nullable: true }) id: string | null;
  @ApiProperty() name: string;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Present on location rows: MAIN_WAREHOUSE | BRANCH_STORE | SHARED_STORE',
  })
  locationType?: string | null;
  @ApiProperty() amount: string;
  @ApiProperty() count: number;
}

export class FinanceInventoryPurchaseDto {
  @ApiProperty() total: string;
  @ApiProperty() count: number;
  @ApiProperty({ type: [FinanceInventoryPurchaseLineDto] })
  byVendor: FinanceInventoryPurchaseLineDto[];
  @ApiProperty({ type: [FinanceInventoryPurchaseLineDto] })
  byLocation: FinanceInventoryPurchaseLineDto[];
}

export class FinanceStockLineDto {
  @ApiPropertyOptional({ nullable: true }) locationId: string | null;
  @ApiProperty() locationName: string;
  @ApiProperty() locationType: string;
  @ApiProperty() value: string;
}

/**
 * Ingredient stock view. Purchases are money out to suppliers; transfers are
 * internal moves that net to zero across the tenant; the bridge reconciles
 * opening stock + movement against the current on-hand value.
 */
export class FinanceInventoryDto {
  @ApiProperty({ type: FinanceInventoryPurchaseDto })
  purchases: FinanceInventoryPurchaseDto;
  @ApiProperty() transfersIn: string;
  @ApiProperty() transfersOut: string;
  @ApiProperty() transfersNet: string;
  @ApiProperty({ description: 'Ingredients consumed by sold dishes' })
  consumption: string;
  @ApiProperty() waste: string;
  @ApiProperty({ description: 'Stocktake adjustments and transfer shortages' })
  adjustments: string;
  @ApiProperty({ description: 'Current on-hand value from stock balances' })
  stockOnHandValue: string;
  @ApiProperty({ type: [FinanceStockLineDto] })
  stockByLocation: FinanceStockLineDto[];
  @ApiProperty() netMovement: string;
  @ApiProperty({ description: 'Derived: closing − movement' })
  openingStockValue: string;
  @ApiProperty() closingStockValue: string;
  @ApiProperty() currencyCode: string;
}

/**
 * Per-ingredient stock movement for a period. Quantities are stock units.
 * `openingQty + receivedQty + otherQty + transfersNetQty + adjustedQty
 *  − consumedQty − wasteQty = closingQty` always holds.
 */
export class FinanceIngredientMovementRowDto {
  @ApiProperty() ingredientId: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
  @ApiProperty() itemKind: string;
  @ApiProperty() unitCost: string;
  @ApiProperty() openingQty: number;
  @ApiProperty() receivedQty: number;
  @ApiProperty() consumedQty: number;
  @ApiProperty() wasteQty: number;
  @ApiProperty() adjustedQty: number;
  @ApiProperty() transfersNetQty: number;
  @ApiProperty({ description: 'Opening entries and other untracked types' })
  otherQty: number;
  @ApiProperty() closingQty: number;
  @ApiProperty({ description: 'Cost of the quantity consumed by sold dishes' })
  consumedValue: string;
  @ApiProperty() closingValue: string;
}

export class FinanceIngredientMovementsDto {
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiPropertyOptional({ nullable: true }) branchId: string | null;
  @ApiPropertyOptional({ nullable: true }) branchName: string | null;
  @ApiProperty() scope: 'BRANCH' | 'TENANT';
  @ApiProperty() currencyCode: string;
  @ApiProperty({ type: [FinanceIngredientMovementRowDto] })
  data: FinanceIngredientMovementRowDto[];
}

export class FinanceIngredientMenuUsageDto {
  @ApiPropertyOptional({ nullable: true }) menuItemId: string | null;
  @ApiProperty() menuItemName: string;
  @ApiProperty() qtyConsumed: number;
  @ApiProperty() plateCount: number;
  @ApiProperty() cost: string;
  @ApiProperty({ description: 'Share of this ingredient consumed, 0–100' })
  share: number;
}

export class FinanceIngredientVendorLineDto {
  @ApiPropertyOptional({ nullable: true }) vendorId: string | null;
  @ApiProperty() vendorName: string;
  @ApiProperty() qty: number;
  @ApiProperty() amount: string;
  @ApiProperty() count: number;
}

export class FinanceIngredientSeriesPointDto {
  @ApiProperty() date: string;
  @ApiProperty() receivedQty: number;
  @ApiProperty() consumedQty: number;
  @ApiProperty() wasteQty: number;
  @ApiProperty() closingQty: number;
}

export class FinanceIngredientUsageDto {
  @ApiProperty() ingredientId: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
  @ApiProperty() itemKind: string;
  @ApiProperty() unitCost: string;
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiProperty() openingQty: number;
  @ApiProperty() receivedQty: number;
  @ApiProperty() consumedQty: number;
  @ApiProperty() wasteQty: number;
  @ApiProperty() adjustedQty: number;
  @ApiProperty() transfersNetQty: number;
  @ApiProperty() otherQty: number;
  @ApiProperty() closingQty: number;
  @ApiProperty() openingValue: string;
  @ApiProperty() receivedValue: string;
  @ApiProperty() consumedValue: string;
  @ApiProperty() wasteValue: string;
  @ApiProperty() closingValue: string;
  @ApiProperty({ type: [FinanceIngredientMenuUsageDto] })
  byMenu: FinanceIngredientMenuUsageDto[];
  @ApiProperty({ type: [FinanceIngredientVendorLineDto] })
  receivedByVendor: FinanceIngredientVendorLineDto[];
  @ApiProperty({ type: [FinanceIngredientSeriesPointDto] })
  series: FinanceIngredientSeriesPointDto[];
}

export class FinanceIngredientUsageResponseDto {
  @ApiProperty({ type: FinanceIngredientUsageDto })
  data: FinanceIngredientUsageDto;
}

export class FinanceSummaryDto {
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiPropertyOptional({ nullable: true }) branchId: string | null;
  @ApiPropertyOptional({ nullable: true }) branchName: string | null;
  @ApiProperty() scope: 'BRANCH' | 'TENANT';
  @ApiProperty() currencyCode: string;
  @ApiProperty({ type: FinanceRevenueDto }) revenue: FinanceRevenueDto;
  @ApiProperty({ type: FinanceCostDto }) cost: FinanceCostDto;
  @ApiProperty({ type: FinancePayrollDto }) payroll: FinancePayrollDto;
  @ApiProperty({ type: FinanceExpensesDto }) expenses: FinanceExpensesDto;
  @ApiProperty({ type: FinanceInventoryDto }) inventory: FinanceInventoryDto;
  @ApiProperty({ type: FinanceTotalsDto }) totals: FinanceTotalsDto;
  @ApiProperty({ type: [FinanceSeriesPointDto] })
  series: FinanceSeriesPointDto[];
  @ApiPropertyOptional({ type: [FinanceBranchRollupDto] })
  branches?: FinanceBranchRollupDto[];
}

export class FinanceSummaryResponseDto {
  @ApiProperty({ type: FinanceSummaryDto })
  data: FinanceSummaryDto;
}

export class FinanceEntryRowDto {
  @ApiProperty() id: string;
  @ApiProperty() date: string;
  @ApiProperty({ enum: ['IN', 'OUT'] }) direction: 'IN' | 'OUT';
  @ApiProperty({ enum: FinanceEntrySource }) source: FinanceEntrySource;
  @ApiPropertyOptional({ nullable: true }) categoryCode: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryName: string | null;
  @ApiProperty() label: string;
  @ApiProperty() branchId: string;
  @ApiProperty() branchName: string;
  @ApiProperty() amount: string;
  @ApiProperty({ description: 'Negative for OUT rows' }) signedAmount: string;
  @ApiProperty() currencyCode: string;
  @ApiPropertyOptional({ nullable: true }) recordedBy: string | null;
  @ApiPropertyOptional({ nullable: true }) counterparty: string | null;
  @ApiPropertyOptional({ nullable: true }) reference: string | null;
  @ApiPropertyOptional({ nullable: true }) status: string | null;
  @ApiPropertyOptional({ nullable: true }) receiptFileId: string | null;
  @ApiProperty({ description: 'Only manual entries can be edited/voided' })
  editable: boolean;
}

export class FinanceEntryTotalsDto {
  @ApiProperty() income: string;
  @ApiProperty() expense: string;
  @ApiProperty() net: string;
}

export class FinanceEntriesResponseDto {
  @ApiProperty({ type: [FinanceEntryRowDto] }) data: FinanceEntryRowDto[];
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
  @ApiProperty() total: number;
  @ApiProperty({ type: FinanceEntryTotalsDto })
  totals: FinanceEntryTotalsDto;
}

export class FinanceCategoryDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: FinanceDirection }) direction: FinanceDirection;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) amharicName: string | null;
  @ApiProperty() isSystem: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty() status: string;
}

export class FinanceCategoriesResponseDto {
  @ApiProperty({ type: [FinanceCategoryDto] }) data: FinanceCategoryDto[];
}

export class FinanceEntryDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: FinanceDirection }) direction: FinanceDirection;
  @ApiProperty() branchId: string;
  @ApiProperty() businessDate: string;
  @ApiPropertyOptional({ nullable: true }) categoryId: string | null;
  @ApiProperty() label: string;
  @ApiProperty() amount: string;
  @ApiProperty() currencyCode: string;
  @ApiProperty() settledVia: string;
  @ApiPropertyOptional({ nullable: true }) counterparty: string | null;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiPropertyOptional({ nullable: true }) receiptFileId: string | null;
  @ApiProperty() status: string;
  @ApiProperty() version: number;
}

export class FinanceEntryResponseDto {
  @ApiProperty({ type: FinanceEntryDto }) data: FinanceEntryDto;
}
