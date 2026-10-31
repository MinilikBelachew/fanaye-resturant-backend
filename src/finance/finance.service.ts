 import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CaslService } from '../casl/casl.service';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import {
  calendarYmd,
  businessDateUtc,
  localDayRange,
} from '../common/business-date';
import {
  CreateFinanceCategoryDto,
  CreateFinanceEntryDto,
  FinanceDirection,
  FinanceEntriesQueryDto,
  FinanceEntrySource,
  FinanceInventoryItemsQueryDto,
  FinancePeriod,
  FinanceSummaryQueryDto,
  UpdateFinanceCategoryDto,
  UpdateFinanceEntryDto,
  VoidFinanceEntryDto,
} from './dto/finance.dto';
import {
  FinanceCategoriesResponseDto,
  FinanceCategoryBreakdownDto,
  FinanceEntriesResponseDto,
  FinanceEntryResponseDto,
  FinanceEntryRowDto,
  FinanceIngredientMovementRowDto,
  FinanceIngredientMovementsDto,
  FinanceIngredientUsageDto,
  FinanceIngredientUsageResponseDto,
  FinanceSummaryDto,
  FinanceSummaryResponseDto,
} from './dto/finance-response.dto';
import {
  IngredientOrdersResponseDto,
} from './dto/ingredient-orders.dto';

/** Ledger entry types that count as cost of goods sold / waste. */
const COGS_ENTRY_TYPE = 'SALE_DEPLETE';
const WASTE_ENTRY_TYPES = ['WASTE', 'YIELD_TRIM'];
const REVERSAL_ENTRY_TYPES = [
  'REVERSAL',
  'SALE_DEPLETE_REVERSAL',
  'WASTE_REVERSAL',
];

/**
 * Inventory (ingredient) stock movement. Purchases are money paid to vendors;
 * OPENING is an initial balance, so it is deliberately not a purchase.
 */
const PURCHASE_ENTRY_TYPES = ['RECEIVE'];
const TRANSFER_IN_TYPES = ['TRANSFER_IN', 'TRANSFER_RETURN'];
const TRANSFER_OUT_TYPES = ['TRANSFER_OUT'];
const ADJUSTMENT_ENTRY_TYPES = ['COUNT_ADJUST', 'TRANSFER_SHORTAGE'];

/** Every ledger entry type the finance module needs to read. */
const INVENTORY_ENTRY_TYPES = [
  ...PURCHASE_ENTRY_TYPES,
  'OPENING',
  ...TRANSFER_IN_TYPES,
  ...TRANSFER_OUT_TYPES,
  ...ADJUSTMENT_ENTRY_TYPES,
  COGS_ENTRY_TYPE,
  ...WASTE_ENTRY_TYPES,
  ...REVERSAL_ENTRY_TYPES,
];

/** Payroll runs that count towards employer cost. */
const COUNTED_PAYROLL_STATUSES = ['APPROVED', 'PAID'];

const MATERIAL_CATEGORY_CODE = 'MATERIALS';
const PAYROLL_CATEGORY_CODE = 'PAYROLL';
const SALE_CATEGORY_CODE = 'SALES';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const ADDIS_OFFSET = '+03:00';

const MS_PER_DAY = 86400000;

interface ResolvedScope {
  tenantId: string;
  scope: 'BRANCH' | 'TENANT';
  branchIds: string[];
  branchId: string | null;
  branchName: string | null;
  includeTenantWidePayroll: boolean;
  /**
   * Tenant scope only: also read branch-less ledger rows (main-warehouse
   * purchases). Branch scope hides them so managers never see head-office buys.
   */
  includeWarehouseLedger: boolean;
}

interface EntryRow {
  row: FinanceEntryRowDto;
  sortDate: number;
}

/**
 * Signed quantity sums per ledger family. Summing every field equals the net
 * change in stock, so the per-ingredient bridge always reconciles.
 */
interface StockBuckets {
  received: number;
  consumption: number;
  waste: number;
  transfer: number;
  adjustment: number;
  other: number;
  receivedValue: number;
  consumedValue: number;
  wasteValue: number;
}

function emptyBuckets(): StockBuckets {
  return {
    received: 0,
    consumption: 0,
    waste: 0,
    transfer: 0,
    adjustment: 0,
    other: 0,
    receivedValue: 0,
    consumedValue: 0,
    wasteValue: 0,
  };
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly casl: CaslService,
  ) { }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async getSummary(
    userId: string,
    query: FinanceSummaryQueryDto,
  ): Promise<FinanceSummaryResponseDto> {
    const context = await this.requireRead(userId);
    const scope = await this.resolveScope(context, query.branchId);
    const { from, to } = this.resolveRange(query);

    const summary = await this.buildSummary(scope, from, to);

    if (scope.scope === 'TENANT') {
      const branches = await this.prisma.branch.findMany({
        where: { tenantId: scope.tenantId, id: { in: scope.branchIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      const rollups = await Promise.all(
        branches.map(async (branch) => {
          const core = await this.computeCore(
            {
              ...scope,
              scope: 'BRANCH',
              branchIds: [branch.id],
              branchId: branch.id,
              includeTenantWidePayroll: false,
              includeWarehouseLedger: false,
            },
            from,
            to,
            false,
          );
          return {
            branchId: branch.id,
            branchName: branch.name,
            revenue: core.revenue.total,
            materialCost: core.materialCost,
            payroll: core.payroll,
            expensesTotal: core.expensesTotal,
            netProfit: core.netProfit,
          };
        }),
      );
      summary.branches = rollups;
    }

    return { data: summary };
  }

  async listEntries(
    userId: string,
    query: FinanceEntriesQueryDto,
  ): Promise<FinanceEntriesResponseDto> {
    const context = await this.requireRead(userId);
    const scope = await this.resolveScope(context, query.branchId);
    const { from, to } = this.resolveRange(query);

    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = Math.min(
      query.pageSize && query.pageSize > 0 ? query.pageSize : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    const rows = await this.collectEntryRows(scope, from, to, query);
    rows.sort(
      (a, b) =>
        b.sortDate - a.sortDate || a.row.source.localeCompare(b.row.source),
    );

    let income = 0;
    let expense = 0;
    for (const entry of rows) {
      if (entry.row.direction === 'IN') income += Number(entry.row.amount);
      else expense += Number(entry.row.amount);
    }

    const start = (page - 1) * pageSize;
    const pageRows = rows
      .slice(start, start + pageSize)
      .map((entry) => entry.row);

    return {
      data: pageRows,
      page,
      pageSize,
      total: rows.length,
      totals: {
        income: money(income),
        expense: money(expense),
        net: money(income - expense),
      },
    };
  }

  /**
   * Per-ingredient stock movement for the period: opening on-hand, received,
   * consumed by sold dishes, wasted, transfers, adjustments and closing.
   */
  async getInventoryItems(
    userId: string,
    query: FinanceInventoryItemsQueryDto,
  ): Promise<FinanceIngredientMovementsDto> {
    const context = await this.requireRead(userId);
    const scope = await this.resolveScope(context, query.branchId);
    const { from, to } = this.resolveRange(query);

    return {
      from: ymd(from),
      to: ymd(to),
      branchId: scope.branchId,
      branchName: scope.branchName,
      scope: scope.scope,
      currencyCode: 'ETB',
      data: await this.computeIngredientMovements(scope, from, to, query.q),
    };
  }

  /** Drill-down for a single ingredient: how it was spent, per menu item. */
  async getInventoryItemUsage(
    userId: string,
    ingredientId: string,
    query: FinanceSummaryQueryDto,
  ): Promise<FinanceIngredientUsageResponseDto> {
    const context = await this.requireRead(userId);
    const scope = await this.resolveScope(context, query.branchId);
    const { from, to } = this.resolveRange(query);

    return {
      data: await this.computeIngredientUsage(scope, from, to, ingredientId),
    };
  }

  /** Per-order breakdown: every individual order-item that consumed this ingredient. */
  async getInventoryItemOrders(
    userId: string,
    ingredientId: string,
    query: FinanceSummaryQueryDto,
  ): Promise<IngredientOrdersResponseDto> {
    const context = await this.requireRead(userId);
    const scope = await this.resolveScope(context, query.branchId);
    const { from, to } = this.resolveRange(query);
    const { tenantId, branchIds, includeWarehouseLedger } = scope;

    const fromYmd = ymd(from);
    const toYmd = ymd(to);
    const ledgerFrom = localDayRange(fromYmd, ADDIS_OFFSET).start;
    const ledgerTo = localDayRange(toYmd, ADDIS_OFFSET).end;
    const ledgerBranchFilter = includeWarehouseLedger
      ? { OR: [{ branchId: { in: branchIds } }, { branchId: null }] }
      : { branchId: { in: branchIds } };

    const ingredient = await this.prisma.inventoryIngredient.findFirst({
      where: { id: ingredientId, tenantId },
      select: { id: true, name: true, unit: true, unitCost: true },
    });
    if (!ingredient) {
      throw new NotFoundException('Ingredient not found for this restaurant.');
    }

    const entries = await this.prisma.inventoryLedgerEntry.findMany({
      where: {
        tenantId,
        ...ledgerBranchFilter,
        ingredientId,
        createdAt: { gte: ledgerFrom, lte: ledgerTo },
        entryType: 'SALE_DEPLETE',
      },
      select: {
        id: true,
        createdAt: true,
        quantityDelta: true,
        unitCostSnapshot: true,
        orderItemId: true,
        orderItem: {
          select: {
            id: true,
            menuItemId: true,
            itemNameSnapshot: true,
            quantity: true,
            menuItem: { select: { name: true } },
            tableSession: {
              select: {
                table: { select: { id: true, displayName: true } },
              },
            },
            order: {
              select: {
                id: true,
                createdBy: {
                  select: {
                    employeeDisplayName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const unitCost = Number(ingredient.unitCost ?? 0);
    const lines = entries
      .filter((e) => e.orderItem != null)
      .map((e) => {
        const oi = e.orderItem!;
        const order = oi.order;
        const delta = Number(e.quantityDelta);
        const ingredientQtyUsed = Math.abs(delta);
        const costEach = e.unitCostSnapshot
          ? Number(e.unitCostSnapshot)
          : unitCost;
        const dt = e.createdAt;
        const dateStr = ymd(dt);
        const hours = String(dt.getUTCHours()).padStart(2, '0');
        const mins = String(dt.getUTCMinutes()).padStart(2, '0');
        const waiterName = order?.createdBy?.employeeDisplayName ?? null;
        const tableId = oi.tableSession?.table?.id ?? null;
        const tableDisplayName = oi.tableSession?.table?.displayName ?? null;
        return {
          ledgerId: e.id,
          date: dateStr,
          time: `${hours}:${mins}`,
          menuItemId: oi.menuItemId ?? null,
          menuItemName:
            oi.menuItem?.name ?? oi.itemNameSnapshot ?? 'Unknown item',
          orderedQty: oi.quantity ?? 1,
          ingredientQtyUsed: roundQty4(ingredientQtyUsed),
          ingredientUnit: ingredient.unit,
          costAtTime: money(ingredientQtyUsed * costEach),
          tableId,
          tableDisplayName,
          waiterName,
          orderId: order?.id ?? null,
        };
      });

    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      from: fromYmd,
      to: toYmd,
      data: lines,
    };
  }

  async listCategories(
    userId: string,
    directionRaw?: string,
  ): Promise<FinanceCategoriesResponseDto> {
    const context = await this.requireRead(userId);
    const direction = this.parseDirectionOptional(directionRaw);

    const categories = await this.prisma.financeCategory.findMany({
      where: {
        tenantId: context.tenantId!,
        ...(direction ? { direction } : {}),
      },
      orderBy: [{ direction: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      data: categories.map((category) => ({
        id: category.id,
        direction: category.direction as FinanceDirection,
        code: category.code,
        name: category.name,
        amharicName: category.amharicName,
        isSystem: category.isSystem,
        sortOrder: category.sortOrder,
        status: category.status,
      })),
    };
  }

  async createEntry(
    userId: string,
    dto: CreateFinanceEntryDto,
  ): Promise<FinanceEntryResponseDto> {
    const context = await this.requireManage(userId);
    const scope = await this.resolveScope(context, dto.branchId);
    if (scope.scope !== 'BRANCH' || !scope.branchId) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { branchId: 'branch_required' },
      });
    }

    const categoryId = await this.resolveCategoryId(
      context.tenantId!,
      dto.direction,
      dto.categoryId,
      dto.newCategoryName,
    );

    const entry = await this.prisma.manualFinanceEntry.create({
      data: {
        tenantId: context.tenantId!,
        branchId: scope.branchId,
        businessDate: dto.businessDate
          ? new Date(`${dto.businessDate}T00:00:00.000Z`)
          : businessDateUtc(),
        direction: dto.direction,
        categoryId,
        label: dto.label.trim(),
        amount: new Prisma.Decimal(dto.amount),
        settledVia: dto.settledVia ?? 'CASH',
        counterparty: dto.counterparty?.trim() || null,
        note: dto.note?.trim() || null,
        receiptFileId: dto.receiptFileId || null,
        status: 'POSTED',
        createdByMembershipId: context.staffMembershipId!,
      },
    });

    return { data: this.toEntryDto(entry) };
  }

  async updateEntry(
    userId: string,
    entryId: string,
    dto: UpdateFinanceEntryDto,
  ): Promise<FinanceEntryResponseDto> {
    const context = await this.requireManage(userId);
    const entry = await this.loadEntry(context, entryId);

    if (entry.status !== 'POSTED') {
      throw new ConflictException('Only posted entries can be edited.');
    }
    if (dto.version != null && dto.version !== entry.version) {
      throw new ConflictException(
        'This entry was changed elsewhere. Reload and retry.',
      );
    }

    let categoryId: string | null | undefined;
    if (dto.categoryId !== undefined) {
      categoryId = dto.categoryId
        ? await this.resolveCategoryId(
          context.tenantId!,
          entry.direction as FinanceDirection,
          dto.categoryId,
        )
        : null;
    }

    const updated = await this.prisma.manualFinanceEntry.update({
      where: { id: entry.id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.amount != null
          ? { amount: new Prisma.Decimal(dto.amount) }
          : {}),
        ...(dto.businessDate
          ? { businessDate: new Date(`${dto.businessDate}T00:00:00.000Z`) }
          : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(dto.settledVia ? { settledVia: dto.settledVia } : {}),
        ...(dto.counterparty !== undefined
          ? { counterparty: dto.counterparty?.trim() || null }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.receiptFileId !== undefined
          ? { receiptFileId: dto.receiptFileId || null }
          : {}),
        version: { increment: 1 },
      },
    });

    return { data: this.toEntryDto(updated) };
  }

  async voidEntry(
    userId: string,
    entryId: string,
    dto: VoidFinanceEntryDto,
  ): Promise<FinanceEntryResponseDto> {
    const context = await this.requireManage(userId);
    const entry = await this.loadEntry(context, entryId);

    if (entry.status === 'VOID') {
      return { data: this.toEntryDto(entry) };
    }
    if (dto.version != null && dto.version !== entry.version) {
      throw new ConflictException(
        'This entry was changed elsewhere. Reload and retry.',
      );
    }

    const voided = await this.prisma.manualFinanceEntry.update({
      where: { id: entry.id },
      data: {
        status: 'VOID',
        voidedAt: new Date(),
        voidedByMembershipId: context.staffMembershipId!,
        voidReason: dto.reason?.trim() || null,
        version: { increment: 1 },
      },
    });

    return { data: this.toEntryDto(voided) };
  }

  async createCategory(
    userId: string,
    dto: CreateFinanceCategoryDto,
  ): Promise<FinanceCategoriesResponseDto> {
    const context = await this.requireManage(userId);
    const code = (
      dto.code?.trim() || this.codeFromName(dto.name)
    ).toUpperCase();

    const existing = await this.prisma.financeCategory.findUnique({
      where: {
        tenantId_direction_code: {
          tenantId: context.tenantId!,
          direction: dto.direction,
          code,
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Category "${code}" already exists.`);
    }

    await this.prisma.financeCategory.create({
      data: {
        tenantId: context.tenantId!,
        direction: dto.direction,
        code,
        name: dto.name.trim(),
        amharicName: dto.amharicName?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        isSystem: false,
        status: 'ACTIVE',
      },
    });

    return this.listCategories(userId, dto.direction);
  }

  async updateCategory(
    userId: string,
    categoryId: string,
    dto: UpdateFinanceCategoryDto,
  ): Promise<FinanceCategoriesResponseDto> {
    const context = await this.requireManage(userId);
    const category = await this.prisma.financeCategory.findFirst({
      where: { id: categoryId, tenantId: context.tenantId! },
    });
    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    await this.prisma.financeCategory.update({
      where: { id: category.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.amharicName !== undefined
          ? { amharicName: dto.amharicName?.trim() || null }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    return this.listCategories(userId, category.direction);
  }

  // ---------------------------------------------------------------------------
  // Per-ingredient stock drill-down
  // ---------------------------------------------------------------------------

  private async computeIngredientMovements(
    scope: ResolvedScope,
    from: Date,
    to: Date,
    q?: string,
  ): Promise<FinanceIngredientMovementRowDto[]> {
    const { tenantId, branchIds, includeWarehouseLedger } = scope;
    const ledgerFrom = localDayRange(ymd(from), ADDIS_OFFSET).start;
    const ledgerTo = localDayRange(ymd(to), ADDIS_OFFSET).end;
    const ledgerBranchFilter = includeWarehouseLedger
      ? { OR: [{ branchId: { in: branchIds } }, { branchId: null }] }
      : { branchId: { in: branchIds } };
    const search = q?.trim();

    const [ingredients, openingGroups, rangeEntries] = await Promise.all([
      this.prisma.inventoryIngredient.findMany({
        where: {
          tenantId,
          ...(search
            ? { name: { contains: search, mode: 'insensitive' } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          unit: true,
          itemKind: true,
          unitCost: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.inventoryLedgerEntry.groupBy({
        by: ['ingredientId'],
        where: {
          tenantId,
          ...ledgerBranchFilter,
          createdAt: { lt: ledgerFrom },
        },
        _sum: { quantityDelta: true },
      }),
      this.prisma.inventoryLedgerEntry.findMany({
        where: {
          tenantId,
          ...ledgerBranchFilter,
          createdAt: { gte: ledgerFrom, lte: ledgerTo },
        },
        select: {
          ingredientId: true,
          entryType: true,
          quantityDelta: true,
          unitCostSnapshot: true,
          ingredient: { select: { unitCost: true } },
        },
      }),
    ]);

    const openingByIngredient = new Map<string, number>();
    for (const group of openingGroups) {
      openingByIngredient.set(
        group.ingredientId,
        Number(group._sum.quantityDelta ?? 0),
      );
    }

    const bucketsByIngredient = new Map<string, StockBuckets>();
    for (const entry of rangeEntries) {
      const bucket =
        bucketsByIngredient.get(entry.ingredientId) ?? emptyBuckets();
      bucketsByIngredient.set(entry.ingredientId, bucket);
      this.accumulateStock(bucket, entry);
    }

    const rows: FinanceIngredientMovementRowDto[] = [];
    for (const ingredient of ingredients) {
      const openingQty = openingByIngredient.get(ingredient.id) ?? 0;
      const bucket = bucketsByIngredient.get(ingredient.id) ?? emptyBuckets();
      const net = this.stockBucketsNet(bucket);
      if (openingQty === 0 && net === 0) continue;

      const closingQty = openingQty + net;
      const unitCost = Number(ingredient.unitCost ?? 0);
      rows.push({
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        itemKind: ingredient.itemKind ?? 'RAW',
        unitCost: money(unitCost),
        openingQty: roundQty4(openingQty),
        receivedQty: roundQty4(bucket.received),
        consumedQty: roundQty4(-bucket.consumption),
        wasteQty: roundQty4(-bucket.waste),
        adjustedQty: roundQty4(bucket.adjustment),
        transfersNetQty: roundQty4(bucket.transfer),
        otherQty: roundQty4(bucket.other),
        closingQty: roundQty4(closingQty),
        consumedValue: money(bucket.consumedValue),
        closingValue: money(closingQty * unitCost),
      });
    }

    return rows;
  }

  private async computeIngredientUsage(
    scope: ResolvedScope,
    from: Date,
    to: Date,
    ingredientId: string,
  ): Promise<FinanceIngredientUsageDto> {
    const { tenantId, branchIds, includeWarehouseLedger } = scope;
    const fromYmd = ymd(from);
    const toYmd = ymd(to);
    const ledgerFrom = localDayRange(fromYmd, ADDIS_OFFSET).start;
    const ledgerTo = localDayRange(toYmd, ADDIS_OFFSET).end;
    const ledgerBranchFilter = includeWarehouseLedger
      ? { OR: [{ branchId: { in: branchIds } }, { branchId: null }] }
      : { branchId: { in: branchIds } };

    const ingredient = await this.prisma.inventoryIngredient.findFirst({
      where: { id: ingredientId, tenantId },
      select: {
        id: true,
        name: true,
        unit: true,
        itemKind: true,
        unitCost: true,
      },
    });
    if (!ingredient) {
      throw new NotFoundException('Ingredient not found for this restaurant.');
    }

    const [openingAggregate, entries] = await Promise.all([
      this.prisma.inventoryLedgerEntry.aggregate({
        where: {
          tenantId,
          ...ledgerBranchFilter,
          ingredientId,
          createdAt: { lt: ledgerFrom },
        },
        _sum: { quantityDelta: true },
      }),
      this.prisma.inventoryLedgerEntry.findMany({
        where: {
          tenantId,
          ...ledgerBranchFilter,
          ingredientId,
          createdAt: { gte: ledgerFrom, lte: ledgerTo },
        },
        select: {
          createdAt: true,
          entryType: true,
          quantityDelta: true,
          unitCostSnapshot: true,
          vendorId: true,
          orderItemId: true,
          vendor: { select: { name: true } },
          ingredient: { select: { unitCost: true } },
          orderItem: {
            select: {
              menuItemId: true,
              itemNameSnapshot: true,
              quantity: true,
              menuItem: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const openingQty = Number(openingAggregate._sum.quantityDelta ?? 0);
    const buckets = emptyBuckets();

    const menuMap = new Map<
      string,
      {
        menuItemId: string | null;
        menuItemName: string;
        qty: number;
        plateCount: number;
        cost: number;
      }
    >();
    const vendorMap = new Map<
      string,
      {
        vendorId: string | null;
        vendorName: string;
        qty: number;
        amount: number;
        count: number;
      }
    >();
    const dayMap = new Map<
      string,
      { received: number; consumed: number; waste: number; net: number }
    >();

    let cursor = new Date(`${fromYmd}T00:00:00.000Z`);
    const end = new Date(`${toYmd}T00:00:00.000Z`);
    while (cursor.getTime() <= end.getTime()) {
      dayMap.set(ymd(cursor), { received: 0, consumed: 0, waste: 0, net: 0 });
      cursor = new Date(cursor.getTime() + MS_PER_DAY);
    }

    for (const entry of entries) {
      const kind = this.classifyStockEntryType(entry.entryType);
      const delta = Number(entry.quantityDelta);
      const unitCost =
        entry.unitCostSnapshot != null
          ? Number(entry.unitCostSnapshot)
          : Number(entry.ingredient?.unitCost ?? 0);

      buckets[kind] += delta;
      if (kind === 'received') buckets.receivedValue += delta * unitCost;
      else if (kind === 'consumption')
        buckets.consumedValue += -delta * unitCost;
      else if (kind === 'waste') buckets.wasteValue += -delta * unitCost;

      const day = dayMap.get(calendarYmd(entry.createdAt));
      if (day) {
        day.net += delta;
        if (kind === 'received') day.received += delta;
        else if (kind === 'consumption') day.consumed += -delta;
        else if (kind === 'waste') day.waste += -delta;
      }

      if (kind === 'consumption' && entry.orderItemId) {
        const orderItem = entry.orderItem;
        const menuItemId = orderItem?.menuItemId ?? null;
        const menuItemName =
          orderItem?.menuItem?.name ??
          orderItem?.itemNameSnapshot ??
          'Unknown item';
        const key = menuItemId ?? `snapshot:${menuItemName}`;
        const row = menuMap.get(key) ?? {
          menuItemId,
          menuItemName,
          qty: 0,
          plateCount: 0,
          cost: 0,
        };
        row.qty += -delta;
        row.plateCount +=
          delta < 0 ? (orderItem?.quantity ?? 0) : -(orderItem?.quantity ?? 0);
        row.cost += -delta * unitCost;
        menuMap.set(key, row);
      }

      if (kind === 'received') {
        const key = entry.vendorId ?? '__none__';
        const row = vendorMap.get(key) ?? {
          vendorId: entry.vendorId ?? null,
          vendorName: entry.vendor?.name ?? 'No vendor',
          qty: 0,
          amount: 0,
          count: 0,
        };
        row.qty += delta;
        row.amount += delta * unitCost;
        row.count += 1;
        vendorMap.set(key, row);
      }
    }

    const net = this.stockBucketsNet(buckets);
    const closingQty = openingQty + net;
    const consumedQty = -buckets.consumption;
    const unitCost = Number(ingredient.unitCost ?? 0);

    const series: FinanceIngredientUsageDto['series'] = [];
    let running = openingQty;
    for (const [date, day] of dayMap) {
      running += day.net;
      series.push({
        date,
        receivedQty: roundQty4(day.received),
        consumedQty: roundQty4(day.consumed),
        wasteQty: roundQty4(day.waste),
        closingQty: roundQty4(running),
      });
    }

    return {
      ingredientId: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      itemKind: ingredient.itemKind ?? 'RAW',
      unitCost: money(unitCost),
      from: fromYmd,
      to: toYmd,
      openingQty: roundQty4(openingQty),
      receivedQty: roundQty4(buckets.received),
      consumedQty: roundQty4(consumedQty),
      wasteQty: roundQty4(-buckets.waste),
      adjustedQty: roundQty4(buckets.adjustment),
      transfersNetQty: roundQty4(buckets.transfer),
      otherQty: roundQty4(buckets.other),
      closingQty: roundQty4(closingQty),
      openingValue: money(openingQty * unitCost),
      receivedValue: money(buckets.receivedValue),
      consumedValue: money(buckets.consumedValue),
      wasteValue: money(buckets.wasteValue),
      closingValue: money(closingQty * unitCost),
      byMenu: Array.from(menuMap.values())
        .map((row) => ({
          menuItemId: row.menuItemId,
          menuItemName: row.menuItemName,
          qtyConsumed: roundQty4(row.qty),
          plateCount: Math.max(0, row.plateCount),
          cost: money(row.cost),
          share: consumedQty > 0 ? percent((row.qty / consumedQty) * 100) : 0,
        }))
        .filter((row) => row.qtyConsumed > 0)
        .sort((a, b) => b.qtyConsumed - a.qtyConsumed),
      receivedByVendor: Array.from(vendorMap.values())
        .map((row) => ({
          vendorId: row.vendorId,
          vendorName: row.vendorName,
          qty: roundQty4(row.qty),
          amount: money(row.amount),
          count: row.count,
        }))
        .sort((a, b) => b.qty - a.qty),
      series,
    };
  }

  private accumulateStock(
    bucket: StockBuckets,
    entry: {
      entryType: string;
      quantityDelta: Prisma.Decimal;
      unitCostSnapshot: Prisma.Decimal | null;
      ingredient?: { unitCost: Prisma.Decimal | null } | null;
    },
  ): void {
    const kind = this.classifyStockEntryType(entry.entryType);
    const delta = Number(entry.quantityDelta);
    bucket[kind] += delta;

    const unitCost =
      entry.unitCostSnapshot != null
        ? Number(entry.unitCostSnapshot)
        : Number(entry.ingredient?.unitCost ?? 0);
    if (kind === 'received') bucket.receivedValue += delta * unitCost;
    else if (kind === 'consumption') bucket.consumedValue += -delta * unitCost;
    else if (kind === 'waste') bucket.wasteValue += -delta * unitCost;
  }

  private classifyStockEntryType(
    entryType: string,
  ):
    | 'received'
    | 'consumption'
    | 'waste'
    | 'transfer'
    | 'adjustment'
    | 'other' {
    if (PURCHASE_ENTRY_TYPES.includes(entryType)) return 'received';
    if (entryType === COGS_ENTRY_TYPE || entryType === 'SALE_DEPLETE_REVERSAL')
      return 'consumption';
    if (entryType === 'REVERSAL') return 'consumption';
    if (WASTE_ENTRY_TYPES.includes(entryType) || entryType === 'WASTE_REVERSAL')
      return 'waste';
    if (
      TRANSFER_IN_TYPES.includes(entryType) ||
      TRANSFER_OUT_TYPES.includes(entryType)
    )
      return 'transfer';
    if (ADJUSTMENT_ENTRY_TYPES.includes(entryType)) return 'adjustment';
    return 'other';
  }

  private stockBucketsNet(bucket: StockBuckets): number {
    return (
      bucket.received +
      bucket.consumption +
      bucket.waste +
      bucket.transfer +
      bucket.adjustment +
      bucket.other
    );
  }

  private async buildSummary(
    scope: ResolvedScope,
    from: Date,
    to: Date,
  ): Promise<FinanceSummaryDto> {
    const core = await this.computeCore(scope, from, to, true);

    return {
      from: ymd(from),
      to: ymd(to),
      branchId: scope.branchId,
      branchName: scope.branchName,
      scope: scope.scope,
      currencyCode: 'ETB',
      revenue: {
        billed: core.billedRevenue,
        cancelled: core.cancelledRevenue,
        otherIncome: core.otherIncome,
        total: core.revenue.total,
        cash: core.revenue.cash,
        transfer: core.revenue.transfer,
        billCount: core.revenue.billCount,
      },
      cost: {
        cogs: core.cogs,
        waste: core.waste,
        materialCost: core.materialCost,
        foodCostPct: percent(core.foodCostPct),
      },
      payroll: {
        amount: core.payroll,
        runsCount: core.payrollRunsCount,
      },
      expenses: {
        manual: core.manualExpenses,
        total: core.expensesTotal,
        byCategory: core.expenseByCategory,
      },
      inventory: core.inventory,
      totals: {
        grossProfit: core.grossProfit,
        grossMarginPct: percent(core.grossMarginPct),
        primeCost: core.primeCost,
        expensesTotal: core.expensesTotal,
        netProfit: core.netProfit,
        netMarginPct: percent(core.netMarginPct),
      },
      series: core.series,
    };
  }

  private async computeCore(
    scope: ResolvedScope,
    from: Date,
    to: Date,
    withSeries: boolean,
  ) {
    const {
      tenantId,
      branchIds,
      includeTenantWidePayroll,
      includeWarehouseLedger,
    } = scope;
    const fromYmd = ymd(from);
    const toYmd = ymd(to);
    const ledgerFrom = localDayRange(fromYmd, ADDIS_OFFSET).start;
    const ledgerTo = localDayRange(toYmd, ADDIS_OFFSET).end;

    const payrollBranchFilter = includeTenantWidePayroll
      ? { OR: [{ branchId: { in: branchIds } }, { branchId: null }] }
      : { branchId: { in: branchIds } };

    // Tenant scope also sees branch-less ledger rows (main-warehouse buys).
    const ledgerBranchFilter = includeWarehouseLedger
      ? { OR: [{ branchId: { in: branchIds } }, { branchId: null }] }
      : { branchId: { in: branchIds } };

    const [
      bills,
      payments,
      payrollRuns,
      manualEntries,
      ledgerEntries,
      stockBalances,
    ] = await Promise.all([
      this.prisma.bill.findMany({
        where: {
          tenantId,
          branchId: { in: branchIds },
          businessDate: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          businessDate: true,
          totalAmount: true,
          cancelledAmount: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          tenantId,
          branchId: { in: branchIds },
          businessDate: { gte: from, lte: to },
        },
        select: {
          method: true,
          status: true,
          amount: true,
          businessDate: true,
        },
      }),
      this.prisma.payrollRun.findMany({
        where: {
          tenantId,
          status: { in: COUNTED_PAYROLL_STATUSES },
          periodEnd: { gte: from, lte: to },
          ...payrollBranchFilter,
        },
        select: {
          totalGross: true,
          totalTips: true,
          periodEnd: true,
        },
      }),
      this.prisma.manualFinanceEntry.findMany({
        where: {
          tenantId,
          branchId: { in: branchIds },
          businessDate: { gte: from, lte: to },
          status: 'POSTED',
        },
        select: {
          direction: true,
          amount: true,
          businessDate: true,
          category: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.inventoryLedgerEntry.findMany({
        where: {
          tenantId,
          ...ledgerBranchFilter,
          createdAt: { gte: ledgerFrom, lte: ledgerTo },
          entryType: { in: INVENTORY_ENTRY_TYPES },
        },
        select: {
          createdAt: true,
          entryType: true,
          quantityDelta: true,
          unitCostSnapshot: true,
          locationId: true,
          vendorId: true,
          branchId: true,
          ingredient: { select: { unitCost: true } },
          location: { select: { name: true, type: true } },
          vendor: { select: { name: true } },
        },
      }),
      this.prisma.inventoryStockBalance.findMany({
        where: {
          tenantId,
          ...(includeWarehouseLedger ? {} : { branchId: { in: branchIds } }),
        },
        select: {
          branchId: true,
          locationId: true,
          onHandQty: true,
          location: { select: { name: true, type: true } },
          ingredient: { select: { unitCost: true } },
        },
      }),
    ]);

    // ── Revenue ────────────────────────────────────────────────────────────
    const revenueByDay = new Map<string, number>();
    const costByDay = new Map<string, number>();
    const payrollByDay = new Map<string, number>();
    const expenseByDay = new Map<string, number>();

    let billedRevenue = 0;
    let cancelledRevenue = 0;
    for (const bill of bills) {
      billedRevenue += Number(bill.totalAmount);
      cancelledRevenue += Number(bill.cancelledAmount);
      const key = ymd(bill.businessDate);
      revenueByDay.set(
        key,
        (revenueByDay.get(key) ?? 0) + Number(bill.totalAmount),
      );
    }

    let cash = 0;
    let transfer = 0;
    for (const payment of payments) {
      const amount = Number(payment.amount);
      if (payment.method === 'CASH' && payment.status === 'SETTLED') {
        cash += amount;
      } else if (
        payment.method === 'TRANSFER' &&
        ['SETTLED', 'VERIFIED'].includes(payment.status)
      ) {
        transfer += amount;
      }
    }

    let otherIncome = 0;
    const expenseCategoryTotals = new Map<
      string,
      { id: string | null; code: string | null; name: string; amount: number }
    >();
    const incomeCategoryTotals = new Map<
      string,
      { id: string | null; code: string | null; name: string; amount: number }
    >();
    let manualExpenses = 0;

    for (const entry of manualEntries) {
      const amount = Number(entry.amount);
      const key = ymd(entry.businessDate);
      if (entry.direction === 'INCOME') {
        otherIncome += amount;
        revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + amount);
        const bucket = entry.category;
        const mapKey = bucket?.id ?? '__uncategorised__';
        const current = incomeCategoryTotals.get(mapKey) ?? {
          id: bucket?.id ?? null,
          code: bucket?.code ?? null,
          name: bucket?.name ?? 'Uncategorised',
          amount: 0,
        };
        current.amount += amount;
        incomeCategoryTotals.set(mapKey, current);
      } else {
        manualExpenses += amount;
        expenseByDay.set(key, (expenseByDay.get(key) ?? 0) + amount);
        const bucket = entry.category;
        const mapKey = bucket?.id ?? '__uncategorised__';
        const current = expenseCategoryTotals.get(mapKey) ?? {
          id: bucket?.id ?? null,
          code: bucket?.code ?? null,
          name: bucket?.name ?? 'Uncategorised',
          amount: 0,
        };
        current.amount += amount;
        expenseCategoryTotals.set(mapKey, current);
      }
    }

    const revenueTotal = billedRevenue + otherIncome;

    // ── Material cost ──────────────────────────────────────────────────────
    let cogs = 0;
    let waste = 0;
    for (const entry of ledgerEntries) {
      const qty = Math.abs(Number(entry.quantityDelta));
      const unitCost =
        entry.unitCostSnapshot != null
          ? Number(entry.unitCostSnapshot)
          : Number(entry.ingredient?.unitCost ?? 0);
      const value = qty * unitCost;
      const key = calendarYmd(entry.createdAt);
      if (entry.entryType === COGS_ENTRY_TYPE) {
        cogs += value;
        costByDay.set(key, (costByDay.get(key) ?? 0) + value);
      } else if (WASTE_ENTRY_TYPES.includes(entry.entryType)) {
        waste += value;
        costByDay.set(key, (costByDay.get(key) ?? 0) + value);
      } else if (REVERSAL_ENTRY_TYPES.includes(entry.entryType)) {
        cogs -= value;
        costByDay.set(key, (costByDay.get(key) ?? 0) - value);
      }
    }
    const materialCost = cogs + waste;

    // ── Inventory (ingredient stock) ───────────────────────────────────────
    const purchaseByVendor = new Map<
      string,
      { id: string | null; name: string; amount: number; count: number }
    >();
    const purchaseByLocation = new Map<
      string,
      {
        id: string | null;
        name: string;
        locationType: string;
        amount: number;
        count: number;
      }
    >();
    let purchasesTotal = 0;
    let purchasesCount = 0;
    let transfersIn = 0;
    let transfersOut = 0;
    let adjustments = 0;

    for (const entry of ledgerEntries) {
      const qty = Math.abs(Number(entry.quantityDelta));
      const unitCost =
        entry.unitCostSnapshot != null
          ? Number(entry.unitCostSnapshot)
          : Number(entry.ingredient?.unitCost ?? 0);
      const value = qty * unitCost;

      if (PURCHASE_ENTRY_TYPES.includes(entry.entryType)) {
        purchasesTotal += value;
        purchasesCount += 1;

        const vendorKey = entry.vendorId ?? '__none__';
        const vendorRow = purchaseByVendor.get(vendorKey) ?? {
          id: entry.vendorId ?? null,
          name: entry.vendor?.name ?? 'No vendor',
          amount: 0,
          count: 0,
        };
        vendorRow.amount += value;
        vendorRow.count += 1;
        purchaseByVendor.set(vendorKey, vendorRow);

        const locationKey = entry.locationId ?? '__none__';
        const locationRow = purchaseByLocation.get(locationKey) ?? {
          id: entry.locationId ?? null,
          name: entry.location?.name ?? 'Unknown location',
          locationType: entry.location?.type ?? 'UNKNOWN',
          amount: 0,
          count: 0,
        };
        locationRow.amount += value;
        locationRow.count += 1;
        purchaseByLocation.set(locationKey, locationRow);
      } else if (TRANSFER_IN_TYPES.includes(entry.entryType)) {
        transfersIn += value;
      } else if (TRANSFER_OUT_TYPES.includes(entry.entryType)) {
        transfersOut += value;
      } else if (ADJUSTMENT_ENTRY_TYPES.includes(entry.entryType)) {
        adjustments += Number(entry.quantityDelta) * unitCost;
      }
    }

    const stockByLocationMap = new Map<
      string,
      {
        locationId: string | null;
        locationName: string;
        locationType: string;
        value: number;
      }
    >();
    let stockOnHandValue = 0;
    for (const balance of stockBalances) {
      const value =
        Number(balance.onHandQty) * Number(balance.ingredient?.unitCost ?? 0);
      stockOnHandValue += value;
      const key = balance.locationId ?? '__none__';
      const row = stockByLocationMap.get(key) ?? {
        locationId: balance.locationId ?? null,
        locationName: balance.location?.name ?? 'Unassigned',
        locationType: balance.location?.type ?? 'UNKNOWN',
        value: 0,
      };
      row.value += value;
      stockByLocationMap.set(key, row);
    }

    const netMovement =
      purchasesTotal + transfersIn - transfersOut - cogs - waste + adjustments;
    const openingStockValue = stockOnHandValue - netMovement;

    const inventory = {
      purchases: {
        total: money(purchasesTotal),
        count: purchasesCount,
        byVendor: Array.from(purchaseByVendor.values())
          .map((row) => ({
            id: row.id,
            name: row.name,
            amount: money(row.amount),
            count: row.count,
          }))
          .sort((a, b) => Number(b.amount) - Number(a.amount)),
        byLocation: Array.from(purchaseByLocation.values())
          .map((row) => ({
            id: row.id,
            name: row.name,
            locationType: row.locationType,
            amount: money(row.amount),
            count: row.count,
          }))
          .sort((a, b) => Number(b.amount) - Number(a.amount)),
      },
      transfersIn: money(transfersIn),
      transfersOut: money(transfersOut),
      transfersNet: money(transfersIn - transfersOut),
      consumption: money(cogs),
      waste: money(waste),
      adjustments: money(adjustments),
      stockOnHandValue: money(stockOnHandValue),
      stockByLocation: Array.from(stockByLocationMap.values())
        .map((row) => ({
          locationId: row.locationId,
          locationName: row.locationName,
          locationType: row.locationType,
          value: money(row.value),
        }))
        .sort((a, b) => Number(b.value) - Number(a.value)),
      netMovement: money(netMovement),
      openingStockValue: money(openingStockValue),
      closingStockValue: money(stockOnHandValue),
      currencyCode: 'ETB',
    };

    // ── Payroll ────────────────────────────────────────────────────────────
    let payroll = 0;
    for (const run of payrollRuns) {
      const amount = Number(run.totalGross) - Number(run.totalTips);
      payroll += amount;
      const key = ymd(run.periodEnd);
      payrollByDay.set(key, (payrollByDay.get(key) ?? 0) + amount);
    }

    // ── Totals ─────────────────────────────────────────────────────────────
    const grossProfit = revenueTotal - materialCost;
    const expensesTotal = payroll + manualExpenses;
    const netProfit = grossProfit - expensesTotal;
    const primeCost = materialCost + payroll;
    const foodCostPct =
      billedRevenue > 0 ? (materialCost / billedRevenue) * 100 : 0;
    const grossMarginPct =
      revenueTotal > 0 ? (grossProfit / revenueTotal) * 100 : 0;
    const netMarginPct =
      revenueTotal > 0 ? (netProfit / revenueTotal) * 100 : 0;

    // ── Series ─────────────────────────────────────────────────────────────
    const series: FinanceSummaryDto['series'] = [];
    if (withSeries) {
      let cursor = new Date(`${fromYmd}T00:00:00.000Z`);
      const end = new Date(`${toYmd}T00:00:00.000Z`);
      while (cursor.getTime() <= end.getTime()) {
        const key = ymd(cursor);
        const dayRevenue = revenueByDay.get(key) ?? 0;
        const dayMaterial = costByDay.get(key) ?? 0;
        const dayPayroll = payrollByDay.get(key) ?? 0;
        const dayExpenses = expenseByDay.get(key) ?? 0;
        series.push({
          date: key,
          revenue: money(dayRevenue),
          materialCost: money(dayMaterial),
          payroll: money(dayPayroll),
          expenses: money(dayExpenses + dayPayroll),
          netProfit: money(dayRevenue - dayMaterial - dayExpenses - dayPayroll),
        });
        cursor = new Date(cursor.getTime() + MS_PER_DAY);
      }
    }

    const byCategory: FinanceCategoryBreakdownDto[] = Array.from(
      expenseCategoryTotals.values(),
    )
      .map((row) => ({
        categoryId: row.id,
        code: row.code,
        name: row.name,
        amount: money(row.amount),
        share:
          manualExpenses > 0 ? percent((row.amount / manualExpenses) * 100) : 0,
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    return {
      billedRevenue: money(billedRevenue),
      cancelledRevenue: money(cancelledRevenue),
      otherIncome: money(otherIncome),
      revenue: {
        total: money(revenueTotal),
        cash: money(cash),
        transfer: money(transfer),
        billCount: bills.length,
      },
      cogs: money(cogs),
      waste: money(waste),
      materialCost: money(materialCost),
      foodCostPct,
      payroll: money(payroll),
      payrollRunsCount: payrollRuns.length,
      manualExpenses: money(manualExpenses),
      expensesTotal: money(expensesTotal),
      expenseByCategory: byCategory,
      incomeByCategory: Array.from(incomeCategoryTotals.values()),
      inventory,
      grossProfit: money(grossProfit),
      grossMarginPct,
      primeCost: money(primeCost),
      netProfit: money(netProfit),
      netMarginPct,
      series,
    };
  }

  // ---------------------------------------------------------------------------
  // Combined detail table (five-source union)
  // ---------------------------------------------------------------------------

  private async collectEntryRows(
    scope: ResolvedScope,
    from: Date,
    to: Date,
    query: FinanceEntriesQueryDto,
  ): Promise<EntryRow[]> {
    const { tenantId, branchIds, includeTenantWidePayroll } = scope;
    const fromYmd = ymd(from);
    const toYmd = ymd(to);
    const ledgerFrom = localDayRange(fromYmd, ADDIS_OFFSET).start;
    const ledgerTo = localDayRange(toYmd, ADDIS_OFFSET).end;
    const search = query.q?.trim().toLowerCase() || null;

    const branches = await this.prisma.branch.findMany({
      where: { tenantId, id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const branchName = new Map(branches.map((b) => [b.id, b.name]));

    const rows: EntryRow[] = [];
    const wantsSource = (source: FinanceEntrySource) =>
      !query.source || query.source === source;

    // 1. Bills → SALE / IN
    if (
      wantsSource(FinanceEntrySource.SALE) &&
      query.direction !== 'EXPENSE' &&
      !query.categoryId
    ) {
      const bills = await this.prisma.bill.findMany({
        where: {
          tenantId,
          branchId: { in: branchIds },
          businessDate: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
          ...(search
            ? { billNumber: { contains: search, mode: 'insensitive' } }
            : {}),
        },
        select: {
          id: true,
          billNumber: true,
          businessDate: true,
          totalAmount: true,
          cancelledAmount: true,
          branchId: true,
          currencyCode: true,
          status: true,
        },
      });
      for (const bill of bills) {
        const amount = Number(bill.totalAmount) - Number(bill.cancelledAmount);
        rows.push(
          this.makeRow({
            id: `sale:${bill.id}`,
            date: ymd(bill.businessDate),
            direction: 'IN',
            source: FinanceEntrySource.SALE,
            categoryCode: SALE_CATEGORY_CODE,
            categoryName: 'Sales',
            label: `Bill ${bill.billNumber}`,
            branchId: bill.branchId,
            branchName: branchName.get(bill.branchId) ?? 'Branch',
            amount,
            currencyCode: bill.currencyCode,
            recordedBy: null,
            counterparty: null,
            reference: bill.billNumber,
            status: bill.status,
            receiptFileId: null,
            editable: false,
            sortTs: bill.businessDate.getTime(),
          }),
        );
      }
    }

    // 2 & 3. Manual entries → OTHER_INCOME / MANUAL_EXPENSE
    if (
      !query.source ||
      wantsSource(FinanceEntrySource.OTHER_INCOME) ||
      wantsSource(FinanceEntrySource.MANUAL_EXPENSE)
    ) {
      const manual = await this.prisma.manualFinanceEntry.findMany({
        where: {
          tenantId,
          branchId: { in: branchIds },
          businessDate: { gte: from, lte: to },
          status: 'POSTED',
          ...(query.direction ? { direction: query.direction } : {}),
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(search
            ? {
              OR: [
                { label: { contains: search, mode: 'insensitive' } },
                { counterparty: { contains: search, mode: 'insensitive' } },
              ],
            }
            : {}),
        },
        select: {
          id: true,
          direction: true,
          label: true,
          amount: true,
          businessDate: true,
          branchId: true,
          currencyCode: true,
          counterparty: true,
          receiptFileId: true,
          status: true,
          category: { select: { code: true, name: true } },
          createdBy: { select: { employeeDisplayName: true } },
        },
        orderBy: { businessDate: 'desc' },
        take: 2000,
      });
      for (const entry of manual) {
        const isIncome = entry.direction === 'INCOME';
        const source = isIncome
          ? FinanceEntrySource.OTHER_INCOME
          : FinanceEntrySource.MANUAL_EXPENSE;
        if (!wantsSource(source)) continue;
        rows.push(
          this.makeRow({
            id: `manual:${entry.id}`,
            date: ymd(entry.businessDate),
            direction: isIncome ? 'IN' : 'OUT',
            source,
            categoryCode: entry.category?.code ?? null,
            categoryName: entry.category?.name ?? null,
            label: entry.label,
            branchId: entry.branchId,
            branchName: branchName.get(entry.branchId) ?? 'Branch',
            amount: Number(entry.amount),
            currencyCode: entry.currencyCode,
            recordedBy: entry.createdBy?.employeeDisplayName ?? null,
            counterparty: entry.counterparty,
            reference: null,
            status: entry.status,
            receiptFileId: entry.receiptFileId,
            editable: true,
            sortTs: entry.businessDate.getTime(),
          }),
        );
      }
    }

    // 4. Payroll lines → PAYROLL / OUT
    if (
      wantsSource(FinanceEntrySource.PAYROLL) &&
      query.direction !== 'INCOME' &&
      !query.categoryId
    ) {
      const lines = await this.prisma.payrollLine.findMany({
        where: {
          tenantId,
          run: {
            status: { in: COUNTED_PAYROLL_STATUSES },
            periodEnd: { gte: from, lte: to },
            ...(includeTenantWidePayroll
              ? { OR: [{ branchId: { in: branchIds } }, { branchId: null }] }
              : { branchId: { in: branchIds } }),
            ...(search
              ? { label: { contains: search, mode: 'insensitive' } }
              : {}),
          },
          ...(search
            ? { staffName: { contains: search, mode: 'insensitive' } }
            : {}),
        },
        select: {
          id: true,
          staffName: true,
          gross: true,
          run: {
            select: {
              periodEnd: true,
              label: true,
              branchId: true,
              currencyCode: true,
            },
          },
        },
        take: 3000,
      });
      for (const line of lines) {
        const runBranchId = line.run.branchId;
        const resolvedBranchId = runBranchId ?? scope.branchId ?? branchIds[0];
        rows.push(
          this.makeRow({
            id: `payroll:${line.id}`,
            date: ymd(line.run.periodEnd),
            direction: 'OUT',
            source: FinanceEntrySource.PAYROLL,
            categoryCode: PAYROLL_CATEGORY_CODE,
            categoryName: 'Payroll',
            label: `Payroll — ${line.staffName}`,
            branchId: resolvedBranchId,
            branchName: runBranchId
              ? (branchName.get(runBranchId) ?? 'Branch')
              : 'All branches',
            amount: Number(line.gross),
            currencyCode: line.run.currencyCode,
            recordedBy: null,
            counterparty: line.staffName,
            reference: line.run.label,
            status: 'PAID',
            receiptFileId: null,
            editable: false,
            sortTs: line.run.periodEnd.getTime(),
          }),
        );
      }
    }

    // 5. Inventory ledger cost → MATERIAL_COST / OUT
    if (
      wantsSource(FinanceEntrySource.MATERIAL_COST) &&
      query.direction !== 'INCOME' &&
      !query.categoryId
    ) {
      const ledger = await this.prisma.inventoryLedgerEntry.findMany({
        where: {
          tenantId,
          branchId: { in: branchIds },
          createdAt: { gte: ledgerFrom, lte: ledgerTo },
          entryType: {
            in: [
              COGS_ENTRY_TYPE,
              ...WASTE_ENTRY_TYPES,
              ...REVERSAL_ENTRY_TYPES,
            ],
          },
          ...(search
            ? {
              ingredient: { name: { contains: search, mode: 'insensitive' } },
            }
            : {}),
        },
        select: {
          id: true,
          entryType: true,
          quantityDelta: true,
          unitCostSnapshot: true,
          createdAt: true,
          branchId: true,
          ingredient: { select: { name: true, unitCost: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 3000,
      });
      for (const entry of ledger) {
        const qty = Math.abs(Number(entry.quantityDelta));
        const unitCost =
          entry.unitCostSnapshot != null
            ? Number(entry.unitCostSnapshot)
            : Number(entry.ingredient?.unitCost ?? 0);
        const rawValue = qty * unitCost;
        const amount = REVERSAL_ENTRY_TYPES.includes(entry.entryType)
          ? -rawValue
          : rawValue;
        const entryBranchId = entry.branchId ?? scope.branchId ?? branchIds[0];
        rows.push(
          this.makeRow({
            id: `material:${entry.id}`,
            date: calendarYmd(entry.createdAt),
            direction: 'OUT',
            source: FinanceEntrySource.MATERIAL_COST,
            categoryCode: MATERIAL_CATEGORY_CODE,
            categoryName: 'Materials',
            label: `${entry.ingredient?.name ?? 'Ingredient'} — ${this.humaniseEntryType(entry.entryType)}`,
            branchId: entryBranchId,
            branchName: entry.branchId
              ? (branchName.get(entry.branchId) ?? 'Branch')
              : 'All branches',
            amount,
            currencyCode: 'ETB',
            recordedBy: null,
            counterparty: null,
            reference: entry.entryType,
            status: null,
            receiptFileId: null,
            editable: false,
            sortTs: entry.createdAt.getTime(),
          }),
        );
      }
    }

    return rows;
  }

  private makeRow(input: {
    id: string;
    date: string;
    direction: 'IN' | 'OUT';
    source: FinanceEntrySource;
    categoryCode: string | null;
    categoryName: string | null;
    label: string;
    branchId: string;
    branchName: string;
    amount: number;
    currencyCode: string;
    recordedBy: string | null;
    counterparty: string | null;
    reference: string | null;
    status: string | null;
    receiptFileId: string | null;
    editable: boolean;
    sortTs: number;
  }): EntryRow {
    return {
      sortDate: input.sortTs,
      row: {
        id: input.id,
        date: input.date,
        direction: input.direction,
        source: input.source,
        categoryCode: input.categoryCode,
        categoryName: input.categoryName,
        label: input.label,
        branchId: input.branchId,
        branchName: input.branchName,
        amount: money(input.amount),
        signedAmount: money(
          input.direction === 'IN' ? input.amount : -input.amount,
        ),
        currencyCode: input.currencyCode,
        recordedBy: input.recordedBy,
        counterparty: input.counterparty,
        reference: input.reference,
        status: input.status,
        receiptFileId: input.receiptFileId,
        editable: input.editable,
      },
    };
  }

  private humaniseEntryType(entryType: string): string {
    switch (entryType) {
      case COGS_ENTRY_TYPE:
        return 'sold';
      case 'WASTE':
        return 'waste';
      case 'YIELD_TRIM':
        return 'trim loss';
      default:
        return 'reversal';
    }
  }

  // ---------------------------------------------------------------------------
  // Scope + access
  // ---------------------------------------------------------------------------

  private async requireRead(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant account on this user.');
    }
    this.casl.assertCan(
      context,
      'read',
      'Finance',
      'Finance reports are for managers and owners.',
    );
    return context;
  }

  private async requireManage(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant account on this user.');
    }
    if (!context.staffMembershipId) {
      throw new ForbiddenException(
        'Staff membership required to record finance entries.',
      );
    }
    this.casl.assertCan(
      context,
      'manage',
      'Finance',
      'Only managers and owners can record finance entries.',
    );
    return context;
  }

  /**
   * Managers are locked to their session branch — any client-supplied branch
   * id is ignored. Owners / platform admins may pick any branch of their tenant
   * or the whole tenant.
   */
  private async resolveScope(
    context: AuthContextDto,
    requestedBranchId?: string,
  ): Promise<ResolvedScope> {
    const tenantId = context.tenantId!;
    const elevated = this.casl.isElevated(context);

    if (!elevated) {
      if (!context.branchId) {
        throw new ForbiddenException('No branch assigned to this account.');
      }
      const branch = await this.prisma.branch.findUnique({
        where: { id: context.branchId },
        select: { name: true },
      });
      return {
        tenantId,
        scope: 'BRANCH',
        branchIds: [context.branchId],
        branchId: context.branchId,
        branchName: branch?.name ?? context.branchName ?? null,
        includeTenantWidePayroll: false,
        includeWarehouseLedger: false,
      };
    }

    const wantsAll =
      !requestedBranchId ||
      requestedBranchId === 'all' ||
      requestedBranchId === '';

    if (wantsAll) {
      const branches = await this.prisma.branch.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: { id: true },
        orderBy: { name: 'asc' },
      });
      return {
        tenantId,
        scope: 'TENANT',
        branchIds: branches.map((b) => b.id),
        branchId: null,
        branchName: null,
        includeTenantWidePayroll: true,
        includeWarehouseLedger: true,
      };
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: requestedBranchId, tenantId },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found for this restaurant.');
    }
    return {
      tenantId,
      scope: 'BRANCH',
      branchIds: [branch.id],
      branchId: branch.id,
      branchName: branch.name,
      includeTenantWidePayroll: false,
      includeWarehouseLedger: false,
    };
  }

  private async loadEntry(context: AuthContextDto, entryId: string) {
    const entry = await this.prisma.manualFinanceEntry.findFirst({
      where: { id: entryId, tenantId: context.tenantId! },
    });
    if (!entry) {
      throw new NotFoundException('Finance entry not found.');
    }
    const elevated = this.casl.isElevated(context);
    if (!elevated && entry.branchId !== context.branchId) {
      throw new ForbiddenException('This entry belongs to another branch.');
    }
    return entry;
  }

  private async resolveCategoryId(
    tenantId: string,
    direction: FinanceDirection,
    categoryId?: string,
    newCategoryName?: string,
  ): Promise<string | null> {
    if (newCategoryName?.trim()) {
      const name = newCategoryName.trim();
      const code = this.codeFromName(name);
      const existing = await this.prisma.financeCategory.findUnique({
        where: { tenantId_direction_code: { tenantId, direction, code } },
        select: { id: true },
      });
      if (existing) return existing.id;
      const created = await this.prisma.financeCategory.create({
        data: {
          tenantId,
          direction,
          code,
          name,
          isSystem: false,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      return created.id;
    }

    if (!categoryId) return null;

    const category = await this.prisma.financeCategory.findFirst({
      where: { id: categoryId, tenantId },
      select: { id: true, direction: true },
    });
    if (!category) {
      throw new NotFoundException('Finance category not found.');
    }
    if (category.direction !== direction) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { categoryId: 'direction_mismatch' },
      });
    }
    return category.id;
  }

  private toEntryDto(entry: {
    id: string;
    direction: string;
    branchId: string;
    businessDate: Date;
    categoryId: string | null;
    label: string;
    amount: Prisma.Decimal;
    currencyCode: string;
    settledVia: string;
    counterparty: string | null;
    note: string | null;
    receiptFileId: string | null;
    status: string;
    version: number;
  }) {
    return {
      id: entry.id,
      direction: entry.direction as FinanceDirection,
      branchId: entry.branchId,
      businessDate: ymd(entry.businessDate),
      categoryId: entry.categoryId,
      label: entry.label,
      amount: money(Number(entry.amount)),
      currencyCode: entry.currencyCode,
      settledVia: entry.settledVia,
      counterparty: entry.counterparty,
      note: entry.note,
      receiptFileId: entry.receiptFileId,
      status: entry.status,
      version: entry.version,
    };
  }

  // ---------------------------------------------------------------------------
  // Date + value helpers
  // ---------------------------------------------------------------------------

  private resolveRange(query: {
    period?: FinancePeriod;
    date?: string;
    from?: string;
    to?: string;
  }): { from: Date; to: Date } {
    if (query.from && query.to) {
      const from = this.parseYmd(query.from);
      const to = this.parseYmd(query.to);
      if (from.getTime() > to.getTime()) {
        return { from: to, to: from };
      }
      return { from, to };
    }

    const anchorYmd = query.date ?? calendarYmd();
    const to = this.parseYmd(anchorYmd);
    const period = query.period ?? FinancePeriod.DAY;

    if (period === FinancePeriod.DAY) {
      return { from: to, to };
    }
    if (period === FinancePeriod.WEEK) {
      return { from: new Date(to.getTime() - 6 * MS_PER_DAY), to };
    }
    return { from: new Date(to.getTime() - 29 * MS_PER_DAY), to };
  }

  private parseYmd(value: string): Date {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return parsed;
  }

  private parseDirectionOptional(raw?: string): FinanceDirection | undefined {
    if (!raw) return undefined;
    const value = raw.toUpperCase();
    if (value === 'INCOME' || value === 'EXPENSE') {
      return value as FinanceDirection;
    }
    throw new UnprocessableEntityException({
      status: 422,
      errors: { direction: 'invalid' },
    });
  }

  private codeFromName(name: string): string {
    const base = name
      .normalize('NFKD')
      .replace(/[^\w\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase()
      .slice(0, 36);
    return base || 'CUSTOM';
  }
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function roundQty4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function percent(value: number): number {
  return Math.round(value * 10) / 10;
}

function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}
