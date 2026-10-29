import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { PLATFORM_ROLE_CODE } from '../identity/identity.constants';
import { builtInFactor } from '../inventory/units';
import {
  MenuEngineeringBucketDto,
  MenuEngineeringCategoryDto,
  MenuEngineeringContributionItemDto,
  MenuEngineeringCostDriverDto,
  MenuEngineeringCostSpikeDto,
  MenuEngineeringGranularity,
  MenuEngineeringItemDto,
  MenuEngineeringQuadrant,
  MenuEngineeringQueryDto,
  MenuEngineeringRankedItemDto,
  MenuEngineeringRecipeLineDto,
  MenuEngineeringResponseDto,
  MenuEngineeringSummaryDto,
  MenuEngineeringTargetsDto,
  MenuEngineeringTrendDirection,
  MenuEngineeringVarianceItemDto,
  UpdateMenuEngineeringTargetsDto,
} from './dto/menu-engineering.dto';

/** Roles allowed to read menu engineering analytics. */
const MENU_ENGINEERING_ROLES = ['OWNER_ADMIN', 'MANAGER', PLATFORM_ROLE_CODE];

/** Order item states that should not count as a sale. */
const NON_SALE_STATES = ['CANCELLED', 'CANNOT_PREPARE'];

/** Kasavana–Smith popularity rule: an item must beat 70% of an equal share. */
const POPULARITY_RULE = 0.7;

const DEFAULT_PERIOD_DAYS = 30;
const DEFAULT_TARGET_FOOD_COST_PERCENT = 30;
const DEFAULT_FOOD_COST_ALERT_PERCENT = 35;

/** Periods longer than this are bucketed by week instead of by day. */
const DAILY_BUCKET_MAX_DAYS = 60;

/** Ingredient cost jumps above this % are surfaced as spikes. */
const COST_SPIKE_THRESHOLD_PERCENT = 5;

/** Upper bound for the usage-variance shrink factor to avoid absurd values. */
const SHRINK_FACTOR_CAP = 3;

/** How many ranked entries each summary list carries. */
const SUMMARY_LIST_SIZE = 5;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Ledger entry types used to derive the usage-variance shrink factor. */
const THEORETICAL_USAGE_TYPE = 'SALE_DEPLETE';
const WASTE_TYPE = 'WASTE';
const COUNT_ADJUST_TYPE = 'COUNT_ADJUST';

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function money(value: number): number {
  return round(value, 2);
}

function percent(value: number): number {
  return round(value, 1);
}

function num(value: unknown): number {
  if (value == null) return 0;
  return Number(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface SaleRow {
  menuItemId: string;
  quantity: number;
  revenue: number;
  businessDate: Date;
}

interface IngredientCostHistory {
  latest: number | null;
  previous: number | null;
}

interface TrendBuckets {
  buckets: MenuEngineeringBucketDto[];
  granularity: MenuEngineeringGranularity;
  bucketCount: number;
  indexOf: (date: Date) => number;
}

@Injectable()
export class MenuEngineeringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  // ---------------------------------------------------------------------------
  // Targets (tenant settings)
  // ---------------------------------------------------------------------------

  async getTargets(userId: string): Promise<MenuEngineeringTargetsDto> {
    const scope = await this.resolveScope(userId);
    return this.loadTargets(scope.tenantId);
  }

  async updateTargets(
    userId: string,
    dto: UpdateMenuEngineeringTargetsDto,
  ): Promise<MenuEngineeringTargetsDto> {
    const scope = await this.resolveScope(userId);
    const current = await this.loadTargets(scope.tenantId);

    const data = {
      targetFoodCostPercent:
        dto.targetFoodCostPercent ?? current.targetFoodCostPercent,
      foodCostAlertPercent:
        dto.foodCostAlertPercent ?? current.foodCostAlertPercent,
    };

    await this.prisma.tenantSettings.upsert({
      where: { tenantId: scope.tenantId },
      create: { tenantId: scope.tenantId, ...data },
      update: data,
    });

    return data;
  }

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------

  async getAnalytics(
    userId: string,
    query: MenuEngineeringQueryDto,
  ): Promise<MenuEngineeringResponseDto> {
    const scope = await this.resolveScope(userId);
    const branchId = scope.scopedBranchId ?? query.branchId ?? null;
    const { from, to, previousFrom, previousTo } = this.resolvePeriod(
      query.from,
      query.to,
    );
    const previousYearFrom = this.shiftYear(from, -1);
    const previousYearTo = this.shiftYear(to, -1);

    const minQty = query.minQty && query.minQty > 0 ? query.minQty : 0;

    // ---- Menu items + recipes ------------------------------------------------
    const itemWhere: Prisma.MenuItemWhereInput = { tenantId: scope.tenantId };
    if (!query.includeInactive) {
      itemWhere.status = 'ACTIVE';
    }
    if (query.categoryId) {
      itemWhere.menuCategoryId = query.categoryId;
    }
    if (query.stationId) {
      itemWhere.preparationStationId = query.stationId;
    }

    const menuItems = await this.prisma.menuItem.findMany({
      where: itemWhere,
      include: {
        category: { select: { id: true, name: true } },
        station: { select: { name: true } },
        imageFile: { select: { path: true } },
        recipeLines: {
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                unit: true,
                unitCost: true,
                standardYieldPercent: true,
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const ingredientIds = [
      ...new Set(
        menuItems.flatMap((item) =>
          item.recipeLines.map((line) => line.ingredientId),
        ),
      ),
    ];

    const toExclusive = new Date(to.getTime() + 86400000);

    const [
      costHistory,
      conversions,
      targets,
      currentRows,
      previousRows,
      previousYearRows,
      shrinkFactors,
    ] = await Promise.all([
      this.loadIngredientCostHistory(scope.tenantId, ingredientIds),
      this.prisma.inventoryUnitConversion.findMany({
        where: { tenantId: scope.tenantId, status: 'ACTIVE' },
        select: { fromUnit: true, toUnit: true, factor: true },
      }),
      this.loadTargets(scope.tenantId),
      this.loadSalesRows(scope.tenantId, branchId, from, to),
      this.loadSalesRows(scope.tenantId, branchId, previousFrom, previousTo),
      this.loadSalesRows(
        scope.tenantId,
        branchId,
        previousYearFrom,
        previousYearTo,
      ),
      this.loadUsageShrinkFactors(
        scope.tenantId,
        branchId,
        from,
        toExclusive,
        ingredientIds,
      ),
    ]);

    const conversionMap = new Map<string, number>();
    for (const row of conversions) {
      conversionMap.set(`${row.fromUnit}|${row.toUnit}`, num(row.factor));
    }

    // ---- Sales aggregation ---------------------------------------------------
    const currentSales = this.aggregateSales(currentRows);
    const previousSales = this.aggregateSales(previousRows);
    const previousYearSales = this.aggregateSales(previousYearRows);

    const trend = this.buildBuckets(from, to, query.to != null);
    const seriesByItem = this.bucketSeries(currentRows, trend);
    const halfSplit = this.halfQuantities(currentRows, from, to);

    const totalQuantitySold = [...currentSales.values()].reduce(
      (sum, sale) => sum + sale.quantity,
      0,
    );

    const expectedPopularityPercent =
      menuItems.length > 0 ? POPULARITY_RULE * (100 / menuItems.length) : 0;

    const currencyCode =
      menuItems.find((item) => item.currencyCode)?.currencyCode ?? 'ETB';

    const drafts = menuItems.map((item) => {
      const sale = currentSales.get(item.id);
      const previousSale = previousSales.get(item.id);
      const previousYearSale = previousYearSales.get(item.id);
      const quantitySold = sale?.quantity ?? 0;
      const revenue = sale?.revenue ?? 0;

      const {
        plateCost,
        adjustedPlateCost,
        previousPlateCost,
        costComplete,
        costIssues,
        recipe,
      } = this.computePlateCost(
        item.recipeLines,
        costHistory,
        shrinkFactors,
        conversionMap,
      );

      const price = num(item.currentPrice);
      const contributionMargin = costComplete ? price - plateCost : null;
      const previousContributionMargin = costComplete
        ? price - previousPlateCost
        : null;

      const halves = halfSplit.get(item.id) ?? { first: 0, second: 0 };

      return {
        item,
        quantitySold,
        revenue,
        previousQuantitySold: previousSale?.quantity ?? 0,
        previousYearQuantitySold: previousYearSale?.quantity ?? 0,
        plateCost,
        adjustedPlateCost,
        previousContributionMargin,
        costComplete,
        costIssues,
        recipe,
        price,
        contributionMargin,
        series:
          seriesByItem.get(item.id) ?? new Array(trend.bucketCount).fill(0),
        firstHalfQuantity: halves.first,
        secondHalfQuantity: halves.second,
      };
    });

    // Weighted average contribution margin across costed items only.
    let costedQty = 0;
    let costedContribution = 0;
    for (const draft of drafts) {
      if (draft.costComplete && draft.contributionMargin != null) {
        costedQty += draft.quantitySold;
        costedContribution += draft.contributionMargin * draft.quantitySold;
      }
    }
    const averageContributionMargin =
      costedQty > 0 ? costedContribution / costedQty : 0;

    const target = targets.targetFoodCostPercent;

    const items: MenuEngineeringItemDto[] = drafts.map((draft) => {
      const menuMixPercent =
        totalQuantitySold > 0
          ? (draft.quantitySold / totalQuantitySold) * 100
          : 0;

      let quadrant: MenuEngineeringQuadrant = 'UNCLASSIFIED';
      let popularityIndex: number | null = null;
      let marginIndex: number | null = null;

      if (draft.costComplete && draft.contributionMargin != null) {
        const abovePopularity = menuMixPercent >= expectedPopularityPercent;
        const aboveMargin =
          draft.contributionMargin >= averageContributionMargin;
        if (abovePopularity && aboveMargin) quadrant = 'STAR';
        else if (abovePopularity && !aboveMargin) quadrant = 'PLOWHORSE';
        else if (!abovePopularity && aboveMargin) quadrant = 'PUZZLE';
        else quadrant = 'DOG';

        popularityIndex =
          expectedPopularityPercent > 0
            ? round(menuMixPercent / expectedPopularityPercent, 2)
            : null;
        marginIndex =
          averageContributionMargin !== 0
            ? round(draft.contributionMargin / averageContributionMargin, 2)
            : null;
      }

      const foodCostPercent =
        draft.costComplete && draft.price > 0
          ? percent((draft.plateCost / draft.price) * 100)
          : null;

      const plateCost = draft.costComplete ? money(draft.plateCost) : null;
      const adjustedPlateCost = draft.costComplete
        ? money(draft.adjustedPlateCost)
        : null;

      const suggestedPrice =
        draft.costComplete && target > 0
          ? money(draft.plateCost / (target / 100))
          : null;

      const varianceDeltaPercent =
        draft.costComplete && draft.plateCost > 0
          ? percent(
              ((draft.adjustedPlateCost - draft.plateCost) / draft.plateCost) *
                100,
            )
          : null;

      return {
        menuItemId: draft.item.id,
        name: draft.item.name,
        categoryId: draft.item.category?.id ?? null,
        categoryName: draft.item.category?.name ?? null,
        stationName: draft.item.station?.name ?? null,
        isActive: draft.item.status === 'ACTIVE' && !draft.item.soldOut,
        hasRecipe: draft.recipe.length > 0,
        costComplete: draft.costComplete,
        costIssues: draft.costIssues,
        price: money(draft.price),
        plateCost,
        foodCostPercent,
        contributionMargin:
          draft.contributionMargin != null
            ? money(draft.contributionMargin)
            : null,
        contributionMarginPercent:
          draft.contributionMargin != null && draft.price > 0
            ? percent((draft.contributionMargin / draft.price) * 100)
            : null,
        quantitySold: draft.quantitySold,
        menuMixPercent: percent(menuMixPercent),
        revenue: money(draft.revenue),
        totalContribution: draft.costComplete
          ? money(draft.contributionMargin! * draft.quantitySold)
          : null,
        quadrant,
        popularityIndex,
        marginIndex,
        previousQuantitySold: draft.previousQuantitySold,
        quantityTrendPercent: this.trendPercent(
          draft.quantitySold,
          draft.previousQuantitySold,
        ),
        previousContributionMargin: draft.costComplete
          ? draft.previousContributionMargin != null
            ? money(draft.previousContributionMargin)
            : null
          : null,
        marginTrendPercent:
          draft.costComplete &&
          draft.contributionMargin != null &&
          draft.previousContributionMargin != null
            ? this.trendPercent(
                draft.contributionMargin,
                draft.previousContributionMargin,
                true,
              )
            : null,
        series: draft.series,
        firstHalfQuantity: draft.firstHalfQuantity,
        secondHalfQuantity: draft.secondHalfQuantity,
        momentum: this.momentum(
          draft.firstHalfQuantity,
          draft.secondHalfQuantity,
        ),
        previousYearQuantitySold: draft.previousYearQuantitySold,
        yearOverYearTrendPercent: this.trendPercent(
          draft.quantitySold,
          draft.previousYearQuantitySold,
        ),
        suggestedPrice,
        priceGapPercent:
          suggestedPrice != null && suggestedPrice > 0
            ? percent(((draft.price - suggestedPrice) / suggestedPrice) * 100)
            : null,
        imageUrl: draft.item.imageFile?.path
          ? draft.item.imageFile.path.replace(/\\/g, '/')
          : null,
        imageKey: draft.item.imageKey,
        foodCostAlert:
          foodCostPercent != null &&
          foodCostPercent > targets.foodCostAlertPercent,
        topCostDriver: this.topCostDriver(draft.recipe, plateCost),
        usageAdjustedPlateCost: adjustedPlateCost,
        varianceAdjustedMargin:
          adjustedPlateCost != null
            ? money(draft.price - adjustedPlateCost)
            : null,
        varianceDeltaPercent,
        recipe: draft.recipe,
      };
    });

    // ---- Filter + totals ----------------------------------------------------
    const visibleItems = items
      .filter((item) => item.quantitySold >= minQty)
      .sort((a, b) => {
        const aContribution = a.totalContribution ?? -Infinity;
        const bContribution = b.totalContribution ?? -Infinity;
        if (bContribution !== aContribution) {
          return bContribution - aContribution;
        }
        return b.quantitySold - a.quantitySold;
      });

    const totalRevenue = visibleItems.reduce(
      (sum, item) => sum + item.revenue,
      0,
    );
    const visibleContribution = visibleItems.reduce(
      (sum, item) => sum + (item.totalContribution ?? 0),
      0,
    );
    const visibleQuantity = visibleItems.reduce(
      (sum, item) => sum + item.quantitySold,
      0,
    );
    const costedItemCount = visibleItems.filter(
      (item) => item.costComplete,
    ).length;
    const foodCostAlertCount = visibleItems.filter(
      (item) => item.foodCostAlert,
    ).length;

    // Usage variance weighted by units sold.
    let varianceBaseCost = 0;
    let varianceAdjustedCost = 0;
    let varianceCost = 0;
    for (const item of visibleItems) {
      if (!item.costComplete || item.quantitySold <= 0) continue;
      varianceBaseCost += (item.plateCost ?? 0) * item.quantitySold;
      varianceAdjustedCost +=
        (item.usageAdjustedPlateCost ?? 0) * item.quantitySold;
      varianceCost +=
        ((item.usageAdjustedPlateCost ?? 0) - (item.plateCost ?? 0)) *
        item.quantitySold;
    }

    const branch = branchId
      ? await this.prisma.branch.findFirst({
          where: { id: branchId, tenantId: scope.tenantId },
          select: { name: true },
        })
      : null;

    return {
      meta: {
        from: this.formatDate(from),
        to: this.formatDate(to),
        previousFrom: this.formatDate(previousFrom),
        previousTo: this.formatDate(previousTo),
        previousYearFrom: this.formatDate(previousYearFrom),
        previousYearTo: this.formatDate(previousYearTo),
        branchId,
        branchName: branch?.name ?? null,
        currencyCode,
        itemCount: visibleItems.length,
        costedItemCount,
        recipeCoveragePercent: visibleItems.length
          ? percent((costedItemCount / visibleItems.length) * 100)
          : 0,
        totalQuantitySold: visibleQuantity,
        totalRevenue: money(totalRevenue),
        totalContribution: money(visibleContribution),
        expectedPopularityPercent: percent(expectedPopularityPercent),
        averageContributionMargin: money(averageContributionMargin),
        minQty,
        includeInactive: query.includeInactive ?? false,
        targets,
        foodCostAlertCount,
        granularity: trend.granularity,
        buckets: trend.buckets,
        usageVariancePercent:
          varianceBaseCost > 0
            ? percent(
                ((varianceAdjustedCost - varianceBaseCost) / varianceBaseCost) *
                  100,
              )
            : 0,
        usageVarianceCost: money(varianceCost),
      },
      summary: this.buildSummary(visibleItems, costHistory),
      items: visibleItems,
    };
  }

  // ---------------------------------------------------------------------------
  // Computation helpers
  // ---------------------------------------------------------------------------

  private computePlateCost(
    recipeLines: Array<{
      quantityPerServing: Prisma.Decimal;
      unit: string | null;
      ingredient: {
        id: string;
        name: string;
        unit: string;
        unitCost: Prisma.Decimal;
        standardYieldPercent: Prisma.Decimal | null;
      };
    }>,
    costHistory: Map<string, IngredientCostHistory>,
    shrinkFactors: Map<string, number>,
    conversionMap: Map<string, number>,
  ): {
    plateCost: number;
    adjustedPlateCost: number;
    previousPlateCost: number;
    costComplete: boolean;
    costIssues: string[];
    recipe: MenuEngineeringRecipeLineDto[];
  } {
    const costIssues: string[] = [];
    const recipe: MenuEngineeringRecipeLineDto[] = [];

    if (recipeLines.length === 0) {
      return {
        plateCost: 0,
        adjustedPlateCost: 0,
        previousPlateCost: 0,
        costComplete: false,
        costIssues: ['NO_RECIPE'],
        recipe: [],
      };
    }

    let total = 0;
    let adjustedTotal = 0;
    let previousTotal = 0;
    let complete = true;

    for (const line of recipeLines) {
      const ingredient = line.ingredient;
      const baseUnit = ingredient.unit;
      const typedUnit = line.unit ?? baseUnit;
      const qty = num(line.quantityPerServing);

      const history = costHistory.get(ingredient.id);
      const ledgerCost = history?.latest ?? null;
      const previousCost = history?.previous ?? null;
      const fallbackCost = num(ingredient.unitCost);
      const costSource: 'LEDGER' | 'INGREDIENT' =
        ledgerCost != null ? 'LEDGER' : 'INGREDIENT';
      const baseCost = ledgerCost != null ? ledgerCost : fallbackCost;

      const converted = this.convertQty(
        qty,
        typedUnit,
        baseUnit,
        conversionMap,
      );

      if (converted == null) {
        complete = false;
        if (!costIssues.includes('UNCONVERTIBLE_UNIT')) {
          costIssues.push('UNCONVERTIBLE_UNIT');
        }
      }

      // Ingredient cost is an AP (as-purchased) cost; convert to usable cost.
      const yieldPercent =
        ingredient.standardYieldPercent != null
          ? num(ingredient.standardYieldPercent)
          : null;
      const usableCost =
        yieldPercent != null && yieldPercent > 0
          ? baseCost / (yieldPercent / 100)
          : baseCost;

      const shrinkFactor = shrinkFactors.get(ingredient.id) ?? 1;
      const adjustedUsableCost = usableCost * shrinkFactor;

      const lineCost = converted != null ? converted * usableCost : null;
      const adjustedLineCost =
        converted != null ? converted * adjustedUsableCost : null;

      // Previous-period cost uses the prior ledger cost (falls back to current).
      const previousBaseCost = previousCost != null ? previousCost : baseCost;
      const previousUsableCost =
        yieldPercent != null && yieldPercent > 0
          ? previousBaseCost / (yieldPercent / 100)
          : previousBaseCost;
      if (converted != null) {
        previousTotal += converted * previousUsableCost;
      }

      if (baseCost <= 0) {
        complete = false;
        if (!costIssues.includes('MISSING_COST')) {
          costIssues.push('MISSING_COST');
        }
      }

      if (lineCost != null) {
        total += lineCost;
      }
      if (adjustedLineCost != null) {
        adjustedTotal += adjustedLineCost;
      }

      recipe.push({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        quantityPerServing: qty,
        unit: typedUnit,
        baseUnit,
        costPerBaseUnit: round(usableCost, 4),
        costSource,
        previousCostPerBaseUnit:
          previousCost != null ? round(previousCost, 4) : null,
        costChangePercent:
          previousCost != null && previousCost > 0
            ? percent(((baseCost - previousCost) / previousCost) * 100)
            : null,
        shrinkFactor: round(shrinkFactor, 3),
        adjustedCostPerBaseUnit: round(adjustedUsableCost, 4),
        lineCost: lineCost != null ? money(lineCost) : null,
        adjustedLineCost:
          adjustedLineCost != null ? money(adjustedLineCost) : null,
      });
    }

    return {
      plateCost: total,
      adjustedPlateCost: adjustedTotal,
      previousPlateCost: previousTotal,
      costComplete: complete,
      costIssues,
      recipe,
    };
  }

  private topCostDriver(
    recipe: MenuEngineeringRecipeLineDto[],
    plateCost: number | null,
  ): MenuEngineeringCostDriverDto | null {
    if (recipe.length === 0 || plateCost == null || plateCost <= 0) return null;

    let best: MenuEngineeringRecipeLineDto | null = null;
    let bestCost = -1;
    for (const line of recipe) {
      const cost = line.adjustedLineCost ?? line.lineCost ?? 0;
      if (cost > bestCost) {
        bestCost = cost;
        best = line;
      }
    }
    if (!best || bestCost <= 0) return null;

    return {
      ingredientId: best.ingredientId,
      ingredientName: best.ingredientName,
      cost: money(bestCost),
      percentOfPlateCost: percent((bestCost / plateCost) * 100),
    };
  }

  private convertQty(
    qty: number,
    fromUnit: string | null | undefined,
    toUnit: string,
    conversionMap: Map<string, number>,
  ): number | null {
    if (fromUnit == null || fromUnit === '') return qty;
    if (fromUnit === toUnit) return qty;

    const direct = conversionMap.get(`${fromUnit}|${toUnit}`);
    if (direct != null && direct !== 0) return qty / direct;

    const reverse = conversionMap.get(`${toUnit}|${fromUnit}`);
    if (reverse != null) return qty * reverse;

    const builtIn = builtInFactor(fromUnit, toUnit);
    if (builtIn != null) return qty * builtIn;

    return null;
  }

  private async loadIngredientCostHistory(
    tenantId: string,
    ingredientIds: string[],
  ): Promise<Map<string, IngredientCostHistory>> {
    const map = new Map<string, IngredientCostHistory>();
    if (ingredientIds.length === 0) return map;

    const rows = await this.prisma.inventoryLedgerEntry.findMany({
      where: {
        tenantId,
        ingredientId: { in: ingredientIds },
        unitCostSnapshot: { not: null },
      },
      orderBy: [{ ingredientId: 'asc' }, { createdAt: 'desc' }],
      select: { ingredientId: true, unitCostSnapshot: true },
    });

    for (const row of rows) {
      if (row.unitCostSnapshot == null) continue;
      const entry = map.get(row.ingredientId) ?? {
        latest: null,
        previous: null,
      };
      if (entry.latest == null) {
        entry.latest = num(row.unitCostSnapshot);
      } else if (entry.previous == null) {
        entry.previous = num(row.unitCostSnapshot);
      }
      map.set(row.ingredientId, entry);
    }

    return map;
  }

  /**
   * Usage-variance shrink factor per ingredient.
   * Compares theoretical depletion (sales) against recorded waste and count losses.
   */
  private async loadUsageShrinkFactors(
    tenantId: string,
    branchId: string | null,
    from: Date,
    toExclusive: Date,
    ingredientIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (ingredientIds.length === 0) return map;

    const rows = await this.prisma.inventoryLedgerEntry.groupBy({
      by: ['ingredientId', 'entryType'],
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ingredientId: { in: ingredientIds },
        entryType: {
          in: [THEORETICAL_USAGE_TYPE, WASTE_TYPE, COUNT_ADJUST_TYPE],
        },
        createdAt: { gte: from, lt: toExclusive },
      },
      _sum: { quantityDelta: true },
    });

    const usage = new Map<string, { theoretical: number; extra: number }>();
    for (const row of rows) {
      const delta = num(row._sum.quantityDelta);
      const entry = usage.get(row.ingredientId) ?? {
        theoretical: 0,
        extra: 0,
      };
      if (row.entryType === THEORETICAL_USAGE_TYPE) {
        entry.theoretical += -delta;
      } else {
        entry.extra += -delta;
      }
      usage.set(row.ingredientId, entry);
    }

    for (const [ingredientId, entry] of usage) {
      if (entry.theoretical <= 0) continue;
      const factor = (entry.theoretical + entry.extra) / entry.theoretical;
      map.set(ingredientId, round(clamp(factor, 1, SHRINK_FACTOR_CAP), 4));
    }

    return map;
  }

  private async loadSalesRows(
    tenantId: string,
    branchId: string | null,
    from: Date,
    to: Date,
  ): Promise<SaleRow[]> {
    const rows = await this.prisma.orderItem.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        businessDate: { gte: from, lte: to },
        menuItemId: { not: null },
        state: { notIn: NON_SALE_STATES },
      },
      select: {
        menuItemId: true,
        quantity: true,
        unitPriceSnapshot: true,
        businessDate: true,
      },
    });

    return rows.map((row) => ({
      menuItemId: row.menuItemId as string,
      quantity: row.quantity,
      revenue: row.quantity * num(row.unitPriceSnapshot),
      businessDate: row.businessDate,
    }));
  }

  private aggregateSales(
    rows: SaleRow[],
  ): Map<string, { quantity: number; revenue: number }> {
    const map = new Map<string, { quantity: number; revenue: number }>();
    for (const row of rows) {
      const entry = map.get(row.menuItemId) ?? { quantity: 0, revenue: 0 };
      entry.quantity += row.quantity;
      entry.revenue += row.revenue;
      map.set(row.menuItemId, entry);
    }
    return map;
  }

  private bucketSeries(
    rows: SaleRow[],
    trend: TrendBuckets,
  ): Map<string, number[]> {
    const map = new Map<string, number[]>();
    for (const row of rows) {
      const series =
        map.get(row.menuItemId) ?? new Array(trend.bucketCount).fill(0);
      const index = trend.indexOf(row.businessDate);
      series[index] += row.quantity;
      map.set(row.menuItemId, series);
    }
    return map;
  }

  private halfQuantities(
    rows: SaleRow[],
    from: Date,
    to: Date,
  ): Map<string, { first: number; second: number }> {
    const dayCount = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
    const firstHalfDays = Math.max(1, Math.floor(dayCount / 2));
    const boundary = from.getTime() + (firstHalfDays - 1) * 86400000 + 86399999;

    const map = new Map<string, { first: number; second: number }>();
    for (const row of rows) {
      const entry = map.get(row.menuItemId) ?? { first: 0, second: 0 };
      if (row.businessDate.getTime() <= boundary) {
        entry.first += row.quantity;
      } else {
        entry.second += row.quantity;
      }
      map.set(row.menuItemId, entry);
    }
    return map;
  }

  private buildBuckets(
    from: Date,
    to: Date,
    hasExplicitRange: boolean,
  ): TrendBuckets {
    const dayCount = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
    const granularity: MenuEngineeringGranularity =
      dayCount <= DAILY_BUCKET_MAX_DAYS ? 'DAY' : 'WEEK';
    const stepDays = granularity === 'DAY' ? 1 : 7;
    const bucketCount = Math.max(1, Math.ceil(dayCount / stepDays));

    const buckets: MenuEngineeringBucketDto[] = [];
    for (let i = 0; i < bucketCount; i += 1) {
      const start = new Date(from.getTime() + i * stepDays * 86400000);
      buckets.push({
        start: this.formatDate(start),
        label: this.formatBucketLabel(start),
      });
    }

    const indexOf = (date: Date): number => {
      const diffDays = Math.floor((date.getTime() - from.getTime()) / 86400000);
      return clamp(Math.floor(diffDays / stepDays), 0, bucketCount - 1);
    };

    // hasExplicitRange currently unused but kept for future granularity tuning.
    void hasExplicitRange;

    return { buckets, granularity, bucketCount, indexOf };
  }

  private momentum(
    first: number,
    second: number,
  ): MenuEngineeringTrendDirection {
    if (first + second === 0) return 'FLAT';
    const change = (second - first) / Math.max(first, 1);
    if (change > 0.1) return 'RISING';
    if (change < -0.1) return 'FALLING';
    return 'FLAT';
  }

  private buildSummary(
    items: MenuEngineeringItemDto[],
    costHistory: Map<string, IngredientCostHistory>,
  ): MenuEngineeringSummaryDto {
    const quadrantCounts: Record<MenuEngineeringQuadrant, number> = {
      STAR: 0,
      PLOWHORSE: 0,
      PUZZLE: 0,
      DOG: 0,
      UNCLASSIFIED: 0,
    };
    for (const item of items) {
      quadrantCounts[item.quadrant] += 1;
    }

    const sold = items.filter((item) => item.quantitySold > 0);

    const fastestSellers: MenuEngineeringRankedItemDto[] = [...sold]
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, SUMMARY_LIST_SIZE)
      .map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        quantitySold: item.quantitySold,
        revenue: item.revenue,
      }));

    const slowestSellers: MenuEngineeringRankedItemDto[] = [...sold]
      .sort((a, b) => a.quantitySold - b.quantitySold)
      .slice(0, SUMMARY_LIST_SIZE)
      .map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        quantitySold: item.quantitySold,
        revenue: item.revenue,
      }));

    const costed = items.filter(
      (item) => item.costComplete && item.contributionMargin != null,
    );

    const toContribution = (
      item: MenuEngineeringItemDto,
    ): MenuEngineeringContributionItemDto => ({
      menuItemId: item.menuItemId,
      name: item.name,
      contributionMargin: item.contributionMargin,
      totalContribution: item.totalContribution,
      foodCostPercent: item.foodCostPercent,
    });

    const topContributionItems = [...costed]
      .sort((a, b) => (b.totalContribution ?? 0) - (a.totalContribution ?? 0))
      .slice(0, SUMMARY_LIST_SIZE)
      .map(toContribution);

    const worstContributionItems = [...costed]
      .sort((a, b) => (a.totalContribution ?? 0) - (b.totalContribution ?? 0))
      .slice(0, SUMMARY_LIST_SIZE)
      .map(toContribution);

    const highestFoodCostItems = [...costed]
      .sort((a, b) => (b.foodCostPercent ?? 0) - (a.foodCostPercent ?? 0))
      .slice(0, SUMMARY_LIST_SIZE)
      .map(toContribution);

    const categoryMap = new Map<string, MenuEngineeringCategoryDto>();
    for (const item of items) {
      const key = item.categoryId ?? '__uncategorized__';
      const entry = categoryMap.get(key) ?? {
        categoryId: item.categoryId,
        categoryName: item.categoryName ?? 'Uncategorized',
        itemCount: 0,
        quantitySold: 0,
        revenue: 0,
        totalContribution: 0,
      };
      entry.itemCount += 1;
      entry.quantitySold += item.quantitySold;
      entry.revenue += item.revenue;
      entry.totalContribution += item.totalContribution ?? 0;
      categoryMap.set(key, entry);
    }

    const byCategory = [...categoryMap.values()]
      .map((entry) => ({
        ...entry,
        revenue: money(entry.revenue),
        totalContribution: money(entry.totalContribution),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Ingredient cost spikes (latest ledger cost vs previous).
    const affectedCounts = new Map<string, number>();
    for (const item of items) {
      for (const line of item.recipe) {
        affectedCounts.set(
          line.ingredientId,
          (affectedCounts.get(line.ingredientId) ?? 0) + 1,
        );
      }
    }

    const nameByIngredient = new Map<string, string>();
    for (const item of items) {
      for (const line of item.recipe) {
        nameByIngredient.set(line.ingredientId, line.ingredientName);
      }
    }

    const costSpikes: MenuEngineeringCostSpikeDto[] = [];
    for (const [ingredientId, history] of costHistory) {
      if (history.latest == null || history.previous == null) continue;
      if (history.previous <= 0) continue;
      const changePercent = percent(
        ((history.latest - history.previous) / history.previous) * 100,
      );
      if (changePercent < COST_SPIKE_THRESHOLD_PERCENT) continue;
      costSpikes.push({
        ingredientId,
        ingredientName: nameByIngredient.get(ingredientId) ?? 'Ingredient',
        previousCost: money(history.previous),
        latestCost: money(history.latest),
        changePercent,
        affectedItemCount: affectedCounts.get(ingredientId) ?? 0,
      });
    }
    costSpikes.sort((a, b) => b.changePercent - a.changePercent);

    const varianceAdjustedItems: MenuEngineeringVarianceItemDto[] = costed
      .filter(
        (item) =>
          item.plateCost != null &&
          item.usageAdjustedPlateCost != null &&
          (item.varianceDeltaPercent ?? 0) > 0,
      )
      .sort(
        (a, b) => (b.varianceDeltaPercent ?? 0) - (a.varianceDeltaPercent ?? 0),
      )
      .slice(0, SUMMARY_LIST_SIZE)
      .map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        plateCost: item.plateCost!,
        adjustedPlateCost: item.usageAdjustedPlateCost!,
        deltaPercent: item.varianceDeltaPercent ?? 0,
      }));

    return {
      quadrantCounts,
      fastestSellers,
      slowestSellers,
      topContributionItems,
      worstContributionItems,
      highestFoodCostItems,
      byCategory,
      costSpikes: costSpikes.slice(0, SUMMARY_LIST_SIZE),
      varianceAdjustedItems,
    };
  }

  private trendPercent(
    current: number,
    previous: number,
    relativeToMargin = false,
  ): number | null {
    if (previous === 0) {
      if (current === 0) return 0;
      return null;
    }
    if (relativeToMargin) {
      // Margin trend compares absolute margin values.
      return percent(((current - previous) / Math.abs(previous)) * 100);
    }
    return percent(((current - previous) / previous) * 100);
  }

  private async loadTargets(
    tenantId: string,
  ): Promise<MenuEngineeringTargetsDto> {
    const row = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        targetFoodCostPercent: true,
        foodCostAlertPercent: true,
      },
    });

    return {
      targetFoodCostPercent: row
        ? num(row.targetFoodCostPercent)
        : DEFAULT_TARGET_FOOD_COST_PERCENT,
      foodCostAlertPercent: row
        ? num(row.foodCostAlertPercent)
        : DEFAULT_FOOD_COST_ALERT_PERCENT,
    };
  }

  // ---------------------------------------------------------------------------
  // Scope + date helpers
  // ---------------------------------------------------------------------------

  private async resolveScope(userId: string): Promise<{
    tenantId: string;
    scopedBranchId: string | null;
    roleCode: string;
  }> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('Tenant context required.');
    }
    if (!MENU_ENGINEERING_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException(
        'Only managers and owners can access menu engineering.',
      );
    }

    const membership = context.staffMembershipId
      ? await this.prisma.tenantStaffMembership.findUnique({
          where: { id: context.staffMembershipId },
          include: {
            branchAssignments: {
              where: { status: 'ACTIVE', releasedAt: null },
              select: { branchId: true },
            },
          },
        })
      : null;

    const assignedBranchIds =
      membership?.branchAssignments.map((a) => a.branchId) ?? [];

    const managesAllBranches =
      context.roleCode === 'OWNER_ADMIN' ||
      context.roleCode === PLATFORM_ROLE_CODE ||
      assignedBranchIds.length !== 1;

    return {
      tenantId: context.tenantId,
      scopedBranchId: managesAllBranches
        ? null
        : (assignedBranchIds[0] ?? context.branchId),
      roleCode: context.roleCode,
    };
  }

  private resolvePeriod(
    fromRaw?: string,
    toRaw?: string,
  ): { from: Date; to: Date; previousFrom: Date; previousTo: Date } {
    const to = toRaw ? this.parseDateOnly(toRaw, true) : this.todayUtc();
    let from = fromRaw
      ? this.parseDateOnly(fromRaw, false)
      : new Date(to.getTime() - (DEFAULT_PERIOD_DAYS - 1) * 86400000);

    if (from.getTime() > to.getTime()) {
      from = to;
    }

    const dayCount = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
    const previousTo = new Date(from.getTime() - 86400000);
    const previousFrom = new Date(
      previousTo.getTime() - (dayCount - 1) * 86400000,
    );

    return { from, to, previousFrom, previousTo };
  }

  private shiftYear(date: Date, delta: number): Date {
    const shifted = new Date(date.getTime());
    shifted.setUTCFullYear(shifted.getUTCFullYear() + delta);
    return shifted;
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private parseDateOnly(raw: string, endOfDay: boolean): Date {
    void endOfDay;
    const value = raw.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new BadRequestException(
        `Invalid date "${raw}". Expected format YYYY-MM-DD.`,
      );
    }
    const [, y, m, d] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatBucketLabel(date: Date): string {
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  }
}
