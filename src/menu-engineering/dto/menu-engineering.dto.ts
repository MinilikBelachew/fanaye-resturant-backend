import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

function toBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

export class MenuEngineeringQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive start date (YYYY-MM-DD). Defaults to 30 days ago.',
    example: '2026-09-28',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end date (YYYY-MM-DD). Defaults to today.',
    example: '2026-10-28',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filter to a single branch.' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter to a single menu category.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Filter to a single preparation station.',
  })
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @ApiPropertyOptional({
    description: 'Include inactive / sold-out items (default false).',
  })
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({
    description: 'Hide items sold fewer than N times in the period.',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minQty?: number;
}

/** Body for updating the tenant-level menu engineering targets. */
export class UpdateMenuEngineeringTargetsDto {
  @ApiPropertyOptional({
    description: 'Target food cost % used to suggest prices (1-100).',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  targetFoodCostPercent?: number;

  @ApiPropertyOptional({
    description: 'Food cost % above which a dish is flagged (1-100).',
    example: 35,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  foodCostAlertPercent?: number;
}

export type MenuEngineeringQuadrant =
  | 'STAR'
  | 'PLOWHORSE'
  | 'PUZZLE'
  | 'DOG'
  | 'UNCLASSIFIED';

/** Direction a dish is moving between the first and second half of the period. */
export type MenuEngineeringTrendDirection = 'RISING' | 'FALLING' | 'FLAT';

export type MenuEngineeringGranularity = 'DAY' | 'WEEK';

export interface MenuEngineeringTargetsDto {
  targetFoodCostPercent: number;
  foodCostAlertPercent: number;
}

export interface MenuEngineeringBucketDto {
  /** Bucket start date (YYYY-MM-DD). */
  start: string;
  /** Short display label, e.g. "28 Oct". */
  label: string;
}

export interface MenuEngineeringRecipeLineDto {
  ingredientId: string;
  ingredientName: string;
  quantityPerServing: number;
  unit: string | null;
  baseUnit: string;
  costPerBaseUnit: number;
  costSource: 'LEDGER' | 'INGREDIENT';
  /** Previous ledger cost per base unit (null when only one cost exists). */
  previousCostPerBaseUnit: number | null;
  /** Change between the two most recent ledger costs, in %. */
  costChangePercent: number | null;
  /** Usage-variance shrink factor (>= 1). 1 = no waste / shrinkage. */
  shrinkFactor: number;
  /** Cost per base unit after applying the shrink factor. */
  adjustedCostPerBaseUnit: number;
  lineCost: number | null;
  /** Line cost after applying the shrink factor. */
  adjustedLineCost: number | null;
}

export interface MenuEngineeringCostDriverDto {
  ingredientId: string;
  ingredientName: string;
  cost: number;
  percentOfPlateCost: number;
}

export interface MenuEngineeringItemDto {
  menuItemId: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  stationName: string | null;
  isActive: boolean;
  hasRecipe: boolean;
  costComplete: boolean;
  costIssues: string[];
  price: number;
  plateCost: number | null;
  foodCostPercent: number | null;
  contributionMargin: number | null;
  contributionMarginPercent: number | null;
  quantitySold: number;
  menuMixPercent: number;
  revenue: number;
  totalContribution: number | null;
  quadrant: MenuEngineeringQuadrant;
  popularityIndex: number | null;
  marginIndex: number | null;
  previousQuantitySold: number;
  quantityTrendPercent: number | null;
  previousContributionMargin: number | null;
  marginTrendPercent: number | null;
  /** Units sold per trend bucket (aligned with meta.buckets). */
  series: number[];
  firstHalfQuantity: number;
  secondHalfQuantity: number;
  momentum: MenuEngineeringTrendDirection;
  previousYearQuantitySold: number;
  yearOverYearTrendPercent: number | null;
  /** Price needed to reach the tenant target food cost %. */
  suggestedPrice: number | null;
  /** How far the current price sits from the suggested price, in %. */
  priceGapPercent: number | null;
  imageUrl: string | null;
  imageKey: string | null;
  foodCostAlert: boolean;
  topCostDriver: MenuEngineeringCostDriverDto | null;
  /** Plate cost after applying each ingredient's usage-variance shrink factor. */
  usageAdjustedPlateCost: number | null;
  varianceAdjustedMargin: number | null;
  /** Gap between standard and variance-adjusted plate cost, in %. */
  varianceDeltaPercent: number | null;
  recipe: MenuEngineeringRecipeLineDto[];
}

export interface MenuEngineeringRankedItemDto {
  menuItemId: string;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface MenuEngineeringContributionItemDto {
  menuItemId: string;
  name: string;
  contributionMargin: number | null;
  totalContribution: number | null;
  foodCostPercent: number | null;
}

export interface MenuEngineeringCategoryDto {
  categoryId: string | null;
  categoryName: string;
  itemCount: number;
  quantitySold: number;
  revenue: number;
  totalContribution: number;
}

export interface MenuEngineeringCostSpikeDto {
  ingredientId: string;
  ingredientName: string;
  previousCost: number;
  latestCost: number;
  changePercent: number;
  affectedItemCount: number;
}

export interface MenuEngineeringVarianceItemDto {
  menuItemId: string;
  name: string;
  plateCost: number;
  adjustedPlateCost: number;
  deltaPercent: number;
}

export interface MenuEngineeringSummaryDto {
  quadrantCounts: Record<MenuEngineeringQuadrant, number>;
  fastestSellers: MenuEngineeringRankedItemDto[];
  slowestSellers: MenuEngineeringRankedItemDto[];
  topContributionItems: MenuEngineeringContributionItemDto[];
  worstContributionItems: MenuEngineeringContributionItemDto[];
  highestFoodCostItems: MenuEngineeringContributionItemDto[];
  byCategory: MenuEngineeringCategoryDto[];
  /** Ingredients whose latest ledger cost jumped the most. */
  costSpikes: MenuEngineeringCostSpikeDto[];
  /** Dishes whose true (variance-adjusted) cost is furthest above standard. */
  varianceAdjustedItems: MenuEngineeringVarianceItemDto[];
}

export interface MenuEngineeringMetaDto {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  previousYearFrom: string;
  previousYearTo: string;
  branchId: string | null;
  branchName: string | null;
  currencyCode: string;
  itemCount: number;
  costedItemCount: number;
  recipeCoveragePercent: number;
  totalQuantitySold: number;
  totalRevenue: number;
  totalContribution: number;
  expectedPopularityPercent: number;
  averageContributionMargin: number;
  minQty: number;
  includeInactive: boolean;
  targets: MenuEngineeringTargetsDto;
  /** Number of dishes whose food cost % exceeds the alert threshold. */
  foodCostAlertCount: number;
  granularity: MenuEngineeringGranularity;
  buckets: MenuEngineeringBucketDto[];
  /** Weighted usage-variance uplift on the plate cost, in %. */
  usageVariancePercent: number;
  /** Extra cost caused by waste / shrinkage over the period. */
  usageVarianceCost: number;
}

export interface MenuEngineeringResponseDto {
  meta: MenuEngineeringMetaDto;
  summary: MenuEngineeringSummaryDto;
  items: MenuEngineeringItemDto[];
}
