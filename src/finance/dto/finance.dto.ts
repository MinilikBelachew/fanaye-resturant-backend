import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export enum FinanceDirection {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum FinancePeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/** Tender / payment channel for a manual money line. */
export enum FinanceSettledVia {
  CASH = 'CASH',
  BANK = 'BANK',
  TELEBIRR = 'TELEBIRR',
  OTHER = 'OTHER',
}

/** Source families returned by the combined detail table. */
export enum FinanceEntrySource {
  SALE = 'SALE',
  OTHER_INCOME = 'OTHER_INCOME',
  MANUAL_EXPENSE = 'MANUAL_EXPENSE',
  PAYROLL = 'PAYROLL',
  MATERIAL_COST = 'MATERIAL_COST',
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class FinanceSummaryQueryDto {
  @ApiPropertyOptional({ enum: FinancePeriod, default: FinancePeriod.DAY })
  @IsOptional()
  @IsEnum(FinancePeriod)
  period?: FinancePeriod;

  @ApiPropertyOptional({
    example: '2026-10-29',
    description: 'Anchor date of the period',
  })
  @IsOptional()
  @Matches(YMD)
  date?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Explicit range start (overrides period)',
  })
  @IsOptional()
  @Matches(YMD)
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-29',
    description: 'Explicit range end (overrides period)',
  })
  @IsOptional()
  @Matches(YMD)
  to?: string;

  @ApiPropertyOptional({
    description: 'Owner only. Branch id, or "all" for the whole tenant.',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class FinanceEntriesQueryDto extends FinanceSummaryQueryDto {
  @ApiPropertyOptional({ enum: FinanceDirection })
  @IsOptional()
  @IsEnum(FinanceDirection)
  direction?: FinanceDirection;

  @ApiPropertyOptional({ enum: FinanceEntrySource })
  @IsOptional()
  @IsEnum(FinanceEntrySource)
  source?: FinanceEntrySource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Free-text search on label, reference and counterparty',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** Filter for the per-ingredient stock drill-down list. */
export class FinanceInventoryItemsQueryDto extends FinanceSummaryQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text filter on the ingredient name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class CreateFinanceEntryDto {
  @ApiProperty({ enum: FinanceDirection })
  @IsEnum(FinanceDirection)
  direction: FinanceDirection;

  @ApiProperty({ example: 'Floor replacement — back dining area' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  label: string;

  @ApiProperty({ example: 12000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    example: '2026-10-20',
    description: 'Defaults to today',
  })
  @IsOptional()
  @Matches(YMD)
  businessDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'When set, a new category is created with this name and used for the entry.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  newCategoryName?: string;

  @ApiPropertyOptional({
    enum: FinanceSettledVia,
    default: FinanceSettledVia.CASH,
  })
  @IsOptional()
  @IsEnum(FinanceSettledVia)
  settledVia?: FinanceSettledVia;

  @ApiPropertyOptional({ description: 'Payee (expense) or payer (income)' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  counterparty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptFileId?: string;

  @ApiPropertyOptional({
    description: 'Owner only. Branch to record the entry against.',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class UpdateFinanceEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(YMD)
  businessDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ enum: FinanceSettledVia })
  @IsOptional()
  @IsEnum(FinanceSettledVia)
  settledVia?: FinanceSettledVia;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  counterparty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptFileId?: string;

  @ApiPropertyOptional({ description: 'Optimistic concurrency guard' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  version?: number;
}

export class VoidFinanceEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  version?: number;
}

export class CreateFinanceCategoryDto {
  @ApiProperty({ enum: FinanceDirection })
  @IsEnum(FinanceDirection)
  direction: FinanceDirection;

  @ApiProperty({ example: 'Equipment repair' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'የመሳሪያ ጥገና' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  amharicName?: string;

  @ApiPropertyOptional({
    description: 'Short code; derived from the name when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateFinanceCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  amharicName?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsEnum({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const)
  status?: 'ACTIVE' | 'INACTIVE';
}
