import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import {
  CreateIngredientDto,
  InventoryListQueryDto,
  ReceiveStockDto,
  StartCountDto,
  UpdateCountLinesDto,
  UpdateIngredientDto,
  WasteStockDto,
} from './dto/inventory.dto';

function dec(n: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function num(d: Prisma.Decimal | number | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  // ─── Ingredients ───────────────────────────────────────────────────────────

  async listUnits() {
    const units = await this.prisma.inventoryUnit.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return {
      data: units.map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        category: u.category,
        sortOrder: u.sortOrder,
      })),
    };
  }

  private async assertKnownUnit(code: string) {
    const unit = await this.prisma.inventoryUnit.findFirst({
      where: { code, status: 'ACTIVE' },
    });
    if (!unit) {
      throw new BadRequestException(
        `Unknown unit "${code}". Pick a unit from the inventory unit catalog.`,
      );
    }
    return unit.code;
  }

  async listIngredients(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireManager(userId);
    const { page, limit, skip } = this.pageOf(query);
    const where: Prisma.InventoryIngredientWhereInput = {
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q?.trim()
        ? { name: { contains: query.q.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.inventoryIngredient.count({ where }),
      this.prisma.inventoryIngredient.findMany({
        where,
        include: { balance: true },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((r) => this.toIngredientDto(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async createIngredient(userId: string, dto: CreateIngredientDto) {
    const ctx = await this.requireManager(userId);
    const name = dto.name.trim();
    const unit = await this.assertKnownUnit(dto.unit.trim());
    const existing = await this.prisma.inventoryIngredient.findFirst({
      where: {
        branchId: ctx.branchId!,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw new ConflictException(
        'An ingredient with that name already exists.',
      );
    }

    const initialQty = dto.initialQty ?? 0;
    const created = await this.prisma.$transaction(async (tx) => {
      const ingredient = await tx.inventoryIngredient.create({
        data: {
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          name,
          unit,
          unitCost: dec(dto.unitCost ?? 0),
          parLevel: dec(dto.parLevel ?? 0),
          status: 'ACTIVE',
        },
      });
      await tx.inventoryStockBalance.create({
        data: {
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          ingredientId: ingredient.id,
          onHandQty: dec(initialQty),
        },
      });
      if (initialQty > 0) {
        await tx.inventoryLedgerEntry.create({
          data: {
            tenantId: ctx.tenantId!,
            branchId: ctx.branchId!,
            ingredientId: ingredient.id,
            entryType: 'OPENING',
            quantityDelta: dec(initialQty),
            unitCostSnapshot: dec(dto.unitCost ?? 0),
            note: 'Opening stock',
            createdByMembershipId: ctx.staffMembershipId,
          },
        });
      }
      return tx.inventoryIngredient.findUniqueOrThrow({
        where: { id: ingredient.id },
        include: { balance: true },
      });
    });
    return { data: this.toIngredientDto(created) };
  }

  async updateIngredient(userId: string, id: string, dto: UpdateIngredientDto) {
    const ctx = await this.requireManager(userId);
    const ingredient = await this.findIngredient(ctx, id);
    if (dto.name?.trim() && dto.name.trim() !== ingredient.name) {
      const clash = await this.prisma.inventoryIngredient.findFirst({
        where: {
          branchId: ctx.branchId!,
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (clash) {
        throw new ConflictException(
          'An ingredient with that name already exists.',
        );
      }
    }
    const unit =
      dto.unit?.trim() != null && dto.unit.trim() !== ''
        ? await this.assertKnownUnit(dto.unit.trim())
        : undefined;
    const updated = await this.prisma.inventoryIngredient.update({
      where: { id },
      data: {
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
        ...(unit ? { unit } : {}),
        ...(dto.unitCost !== undefined ? { unitCost: dec(dto.unitCost) } : {}),
        ...(dto.parLevel !== undefined ? { parLevel: dec(dto.parLevel) } : {}),
        ...(dto.status?.trim() ? { status: dto.status.trim() } : {}),
      },
      include: { balance: true },
    });
    return { data: this.toIngredientDto(updated) };
  }

  // ─── Balances ──────────────────────────────────────────────────────────────

  async listBalances(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireManager(userId);
    const { page, limit, skip } = this.pageOf(query);
    const lowStock = query.lowStock === 'true' || query.lowStock === '1';

    const ingredients = await this.prisma.inventoryIngredient.findMany({
      where: {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        status: query.status || 'ACTIVE',
        ...(query.q?.trim()
          ? { name: { contains: query.q.trim(), mode: 'insensitive' } }
          : {}),
      },
      include: { balance: true },
      orderBy: { name: 'asc' },
    });

    let rows = ingredients.map((ing) => {
      const onHand = num(ing.balance?.onHandQty);
      const par = num(ing.parLevel);
      const unitCost = num(ing.unitCost);
      const stockValue = roundMoney(onHand * unitCost);
      return {
        ingredientId: ing.id,
        name: ing.name,
        unit: ing.unit,
        unitCost,
        stockValue,
        parLevel: par,
        onHandQty: onHand,
        isLowStock: onHand <= par,
        status: ing.status,
        updatedAt: ing.balance?.updatedAt ?? ing.updatedAt,
      };
    });
    if (lowStock) rows = rows.filter((r) => r.isLowStock);

    const totalStockValue = roundMoney(
      rows.reduce((sum, r) => sum + r.stockValue, 0),
    );
    const lowStockValue = roundMoney(
      rows
        .filter((r) => r.isLowStock)
        .reduce((sum, r) => sum + r.stockValue, 0),
    );
    const lowStockCount = rows.filter((r) => r.isLowStock).length;

    const total = rows.length;
    const data = rows.slice(skip, skip + limit);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
      summary: {
        currencyCode: 'ETB',
        skuCount: total,
        lowStockCount,
        totalStockValue,
        lowStockValue,
      },
    };
  }

  // ─── Receive / Waste ───────────────────────────────────────────────────────

  async receive(userId: string, dto: ReceiveStockDto) {
    const ctx = await this.requireManager(userId);
    const ingredient = await this.findIngredient(ctx, dto.ingredientId);
    const qty = dec(dto.quantity);
    await this.prisma.$transaction(async (tx) => {
      await this.applyDelta(
        tx,
        {
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          staffMembershipId: ctx.staffMembershipId,
        },
        ingredient.id,
        qty,
        {
          entryType: 'RECEIVE',
          unitCost: dto.unitCost,
          note: dto.note,
          supplierNote: dto.supplierNote,
          invoiceRef: dto.invoiceRef,
        },
      );
      if (dto.unitCost !== undefined) {
        await tx.inventoryIngredient.update({
          where: { id: ingredient.id },
          data: { unitCost: dec(dto.unitCost) },
        });
      }
    });
    const refreshed = await this.prisma.inventoryIngredient.findUniqueOrThrow({
      where: { id: ingredient.id },
      include: { balance: true },
    });
    return { data: this.toIngredientDto(refreshed) };
  }

  async waste(userId: string, dto: WasteStockDto) {
    const ctx = await this.requireManager(userId);
    const ingredient = await this.findIngredient(ctx, dto.ingredientId);
    await this.applyDelta(
      this.prisma,
      {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        staffMembershipId: ctx.staffMembershipId,
      },
      ingredient.id,
      dec(dto.quantity).negated(),
      {
        entryType: 'WASTE',
        unitCost: num(ingredient.unitCost),
        note: dto.note ?? 'Waste',
      },
    );
    const refreshed = await this.prisma.inventoryIngredient.findUniqueOrThrow({
      where: { id: ingredient.id },
      include: { balance: true },
    });
    return { data: this.toIngredientDto(refreshed) };
  }

  // ─── Ledger ────────────────────────────────────────────────────────────────

  async listLedger(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireManager(userId);
    const { page, limit, skip } = this.pageOf(query);
    const where: Prisma.InventoryLedgerEntryWhereInput = {
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      ...(query.type ? { entryType: query.type } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { note: { contains: query.q.trim(), mode: 'insensitive' } },
              {
                supplierNote: {
                  contains: query.q.trim(),
                  mode: 'insensitive',
                },
              },
              {
                invoiceRef: { contains: query.q.trim(), mode: 'insensitive' },
              },
              {
                ingredient: {
                  name: { contains: query.q.trim(), mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.inventoryLedgerEntry.count({ where }),
      this.prisma.inventoryLedgerEntry.findMany({
        where,
        include: { ingredient: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((r) => {
        const quantityDelta = num(r.quantityDelta);
        const unitCost =
          r.unitCostSnapshot != null
            ? num(r.unitCostSnapshot)
            : num(r.ingredient.unitCost);
        return {
          id: r.id,
          entryType: r.entryType,
          quantityDelta,
          unitCostSnapshot:
            r.unitCostSnapshot != null ? num(r.unitCostSnapshot) : null,
          unitCost,
          lineValue: roundMoney(quantityDelta * unitCost),
          note: r.note,
          supplierNote: r.supplierNote,
          invoiceRef: r.invoiceRef,
          orderItemId: r.orderItemId,
          countSessionId: r.countSessionId,
          createdAt: r.createdAt.toISOString(),
          ingredient: {
            id: r.ingredient.id,
            name: r.ingredient.name,
            unit: r.ingredient.unit,
          },
        };
      }),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  // ─── Counts ────────────────────────────────────────────────────────────────

  async listCounts(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireManager(userId);
    const { page, limit, skip } = this.pageOf(query);
    const where: Prisma.InventoryCountSessionWhereInput = {
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.inventoryCountSession.count({ where }),
      this.prisma.inventoryCountSession.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        status: r.status,
        notes: r.notes,
        lineCount: r._count.lines,
        createdAt: r.createdAt.toISOString(),
        postedAt: r.postedAt?.toISOString() ?? null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async startCount(userId: string, dto: StartCountDto) {
    const ctx = await this.requireManager(userId);
    const open = await this.prisma.inventoryCountSession.findFirst({
      where: {
        branchId: ctx.branchId!,
        status: 'DRAFT',
      },
    });
    if (open) {
      throw new ConflictException(
        'A draft count already exists. Finish or use that session.',
      );
    }

    const ingredients = await this.prisma.inventoryIngredient.findMany({
      where: {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        status: 'ACTIVE',
      },
      include: { balance: true },
      orderBy: { name: 'asc' },
    });

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryCountSession.create({
        data: {
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          status: 'DRAFT',
          notes: dto.notes?.trim() || null,
          createdByMembershipId: ctx.staffMembershipId,
        },
      });
      if (ingredients.length > 0) {
        await tx.inventoryCountLine.createMany({
          data: ingredients.map((ing) => ({
            tenantId: ctx.tenantId!,
            countSessionId: created.id,
            ingredientId: ing.id,
            bookQtySnapshot: ing.balance?.onHandQty ?? dec(0),
          })),
        });
      }
      return created;
    });

    return this.getCount(userId, session.id);
  }

  async getCount(userId: string, sessionId: string) {
    const ctx = await this.requireManager(userId);
    const session = await this.prisma.inventoryCountSession.findFirst({
      where: {
        id: sessionId,
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
      },
      include: {
        lines: {
          include: { ingredient: true },
          orderBy: { ingredient: { name: 'asc' } },
        },
      },
    });
    if (!session) throw new NotFoundException('Count session not found.');
    return {
      data: {
        id: session.id,
        status: session.status,
        notes: session.notes,
        createdAt: session.createdAt.toISOString(),
        postedAt: session.postedAt?.toISOString() ?? null,
        lines: session.lines.map((l) => ({
          id: l.id,
          ingredientId: l.ingredientId,
          name: l.ingredient.name,
          unit: l.ingredient.unit,
          bookQty: num(l.bookQtySnapshot),
          countedQty: l.countedQty != null ? num(l.countedQty) : null,
          varianceQty:
            l.countedQty != null
              ? num(l.countedQty) - num(l.bookQtySnapshot)
              : null,
        })),
      },
    };
  }

  async updateCountLines(
    userId: string,
    sessionId: string,
    dto: UpdateCountLinesDto,
  ) {
    const ctx = await this.requireManager(userId);
    const session = await this.prisma.inventoryCountSession.findFirst({
      where: {
        id: sessionId,
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
      },
    });
    if (!session) throw new NotFoundException('Count session not found.');
    if (session.status !== 'DRAFT') {
      throw new BadRequestException('Only draft counts can be edited.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of dto.lines) {
        await tx.inventoryCountLine.updateMany({
          where: {
            countSessionId: sessionId,
            ingredientId: line.ingredientId,
          },
          data: { countedQty: dec(line.countedQty) },
        });
      }
    });
    return this.getCount(userId, sessionId);
  }

  async postCount(userId: string, sessionId: string) {
    const ctx = await this.requireManager(userId);
    const session = await this.prisma.inventoryCountSession.findFirst({
      where: {
        id: sessionId,
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
      },
      include: { lines: true },
    });
    if (!session) throw new NotFoundException('Count session not found.');
    if (session.status !== 'DRAFT') {
      throw new BadRequestException('Count already posted.');
    }
    const missing = session.lines.filter((l) => l.countedQty == null);
    if (missing.length > 0) {
      throw new BadRequestException(
        'All count lines need a counted quantity before posting.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of session.lines) {
        const counted = dec(line.countedQty!);
        const book = dec(line.bookQtySnapshot);
        const delta = counted.minus(book);
        if (delta.isZero()) continue;
        await this.applyDelta(
          tx,
          {
            tenantId: ctx.tenantId!,
            branchId: ctx.branchId!,
            staffMembershipId: ctx.staffMembershipId,
          },
          line.ingredientId,
          delta,
          {
            entryType: 'COUNT_ADJUST',
            note: 'Physical count adjustment',
            countSessionId: session.id,
            setAbsolute: counted,
          },
        );
      }
      await tx.inventoryCountSession.update({
        where: { id: session.id },
        data: { status: 'POSTED', postedAt: new Date() },
      });
    });

    return this.getCount(userId, sessionId);
  }

  // ─── Order hooks (public for OrdersModule) ─────────────────────────────────

  async depleteForOrderItem(
    tx: Prisma.TransactionClient,
    orderItem: {
      id: string;
      tenantId: string;
      branchId: string;
      menuItemId: string | null;
      quantity: number;
    },
    membershipId?: string | null,
  ): Promise<void> {
    if (!orderItem.menuItemId) return;

    const already = await tx.inventoryLedgerEntry.findFirst({
      where: {
        orderItemId: orderItem.id,
        entryType: 'SALE_DEPLETE',
      },
    });
    if (already) return;

    const recipe = await tx.menuItemRecipeLine.findMany({
      where: { menuItemId: orderItem.menuItemId },
    });
    if (recipe.length === 0) return;

    for (const line of recipe) {
      const delta = dec(line.quantityPerServing)
        .mul(orderItem.quantity)
        .negated();
      await this.applyDelta(
        tx,
        {
          tenantId: orderItem.tenantId,
          branchId: orderItem.branchId,
          staffMembershipId: membershipId ?? null,
        },
        line.ingredientId,
        delta,
        {
          entryType: 'SALE_DEPLETE',
          orderItemId: orderItem.id,
          note: 'Recipe depletion',
        },
      );
    }
  }

  async reverseForOrderItem(
    tx: Prisma.TransactionClient,
    orderItem: {
      id: string;
      tenantId: string;
      branchId: string;
    },
    membershipId?: string | null,
  ): Promise<void> {
    const depleted = await tx.inventoryLedgerEntry.findMany({
      where: {
        orderItemId: orderItem.id,
        entryType: 'SALE_DEPLETE',
      },
    });
    if (depleted.length === 0) return;

    const alreadyReversed = await tx.inventoryLedgerEntry.findFirst({
      where: {
        orderItemId: orderItem.id,
        entryType: 'REVERSAL',
      },
    });
    if (alreadyReversed) return;

    for (const entry of depleted) {
      await this.applyDelta(
        tx,
        {
          tenantId: orderItem.tenantId,
          branchId: orderItem.branchId,
          staffMembershipId: membershipId ?? null,
        },
        entry.ingredientId,
        dec(entry.quantityDelta).negated(),
        {
          entryType: 'REVERSAL',
          orderItemId: orderItem.id,
          note: 'Cancel reverse',
        },
      );
    }
  }

  async replaceRecipeLines(
    tx: Prisma.TransactionClient,
    tenantId: string,
    menuItemId: string,
    lines: { ingredientId: string; quantityPerServing: number }[],
  ): Promise<void> {
    await tx.menuItemRecipeLine.deleteMany({ where: { menuItemId } });
    if (lines.length === 0) return;
    await tx.menuItemRecipeLine.createMany({
      data: lines.map((l, index) => ({
        tenantId,
        menuItemId,
        ingredientId: l.ingredientId,
        quantityPerServing: dec(l.quantityPerServing),
        sortOrder: index,
      })),
    });
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async applyDelta(
    db: Prisma.TransactionClient | PrismaService,
    ctx: {
      tenantId: string;
      branchId: string;
      staffMembershipId?: string | null;
    },
    ingredientId: string,
    delta: Prisma.Decimal,
    meta: {
      entryType: string;
      note?: string | null;
      supplierNote?: string | null;
      invoiceRef?: string | null;
      unitCost?: number;
      orderItemId?: string;
      countSessionId?: string;
      setAbsolute?: Prisma.Decimal;
    },
  ) {
    let balance = await db.inventoryStockBalance.findUnique({
      where: { ingredientId },
    });
    if (!balance) {
      balance = await db.inventoryStockBalance.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          ingredientId,
          onHandQty: dec(0),
        },
      });
    }

    const next =
      meta.setAbsolute !== undefined
        ? meta.setAbsolute
        : dec(balance.onHandQty).plus(delta);

    await db.inventoryStockBalance.update({
      where: { ingredientId },
      data: { onHandQty: next },
    });

    await db.inventoryLedgerEntry.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        ingredientId,
        entryType: meta.entryType,
        quantityDelta: delta,
        unitCostSnapshot:
          meta.unitCost !== undefined ? dec(meta.unitCost) : null,
        note: meta.note ?? null,
        supplierNote: meta.supplierNote ?? null,
        invoiceRef: meta.invoiceRef ?? null,
        orderItemId: meta.orderItemId ?? null,
        countSessionId: meta.countSessionId ?? null,
        createdByMembershipId: ctx.staffMembershipId ?? null,
      },
    });
  }

  private async findIngredient(ctx: AuthContextDto, id: string) {
    const ingredient = await this.prisma.inventoryIngredient.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
      },
      include: { balance: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found.');
    return ingredient;
  }

  private async requireManager(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    if (context.roleCode !== 'MANAGER' && context.roleCode !== 'OWNER_ADMIN') {
      throw new ForbiddenException('Inventory is for managers and owners.');
    }
    return context;
  }

  private pageOf(query: InventoryListQueryDto) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
  }

  private toIngredientDto(row: {
    id: string;
    name: string;
    unit: string;
    unitCost: Prisma.Decimal;
    parLevel: Prisma.Decimal;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    balance?: { onHandQty: Prisma.Decimal; updatedAt: Date } | null;
  }) {
    const onHand = num(row.balance?.onHandQty);
    const par = num(row.parLevel);
    const unitCost = num(row.unitCost);
    return {
      id: row.id,
      name: row.name,
      unit: row.unit,
      unitCost,
      stockValue: roundMoney(onHand * unitCost),
      parLevel: par,
      onHandQty: onHand,
      isLowStock: onHand <= par,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
