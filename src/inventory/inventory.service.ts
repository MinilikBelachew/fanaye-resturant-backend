import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CaslService } from '../casl/casl.service';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { AppAction } from '../casl/casl-ability.types';
import {
  AcceptTransferDto,
  CreateIngredientDto,
  CreateMainLocationDto,
  CreateProductionBatchDto,
  CreateSupplyRequestDto,
  CreateTransferDto,
  DecideSupplyRequestDto,
  INVENTORY_ITEM_KINDS,
  InventoryItemKind,
  InventoryListQueryDto,
  PostYieldTestDto,
  ReceiveStockDto,
  RejectTransferDto,
  StartCountDto,
  UpdateCountLinesDto,
  UpdateIngredientDto,
  UpdateLocationDto,
  UpdateYieldTestDto,
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
    private readonly casl: CaslService,
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

  /** Default BRANCH_STORE for a branch; creates one if missing. */
  async ensureDefaultLocation(
    tenantId: string,
    branchId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const existing = await db.inventoryLocation.findFirst({
      where: { tenantId, branchId, isDefault: true, status: 'ACTIVE' },
    });
    if (existing) return existing;

    const branch = await db.branch.findFirst({
      where: { id: branchId, tenantId },
      select: { name: true, displayCode: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found for inventory location.');
    }

    return db.inventoryLocation.create({
      data: {
        tenantId,
        branchId,
        code: `BRANCH_${branch.displayCode}`.slice(0, 40),
        name: `${branch.name} store`.slice(0, 120),
        type: 'BRANCH_STORE',
        isDefault: true,
        status: 'ACTIVE',
      },
    });
  }

  /** Active MAIN_WAREHOUSE for the tenant, if any. */
  async findMainWarehouse(
    tenantId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return db.inventoryLocation.findFirst({
      where: { tenantId, type: 'MAIN_WAREHOUSE', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getNetworkStatus(userId: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const main = await this.findMainWarehouse(ctx.tenantId!);
    const central = this.isCentralInventoryRole(ctx.roleCode);
    let locationCount = 0;
    if (central) {
      locationCount = await this.prisma.inventoryLocation.count({
        where: { tenantId: ctx.tenantId!, status: 'ACTIVE' },
      });
    } else if (ctx.branchId) {
      locationCount = 1;
    }
    return {
      data: {
        hasMainWarehouse: Boolean(main),
        mode: main ? 'NETWORK' : 'SIMPLE',
        mainLocation: central && main ? this.toLocationDto(main) : null,
        activeLocationCount: locationCount,
        scope: central ? ('TENANT' as const) : ('BRANCH' as const),
        canManageLocations: central,
        canEnableMain: central && !main,
        canDisableMain: central && Boolean(main),
        canOperateCentral: central,
      },
    };
  }

  async listLocations(userId: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const central = this.isCentralInventoryRole(ctx.roleCode);
    const main = await this.findMainWarehouse(ctx.tenantId!);

    if (!central) {
      if (!ctx.branchId) {
        return {
          data: [],
          meta: {
            hasMainWarehouse: Boolean(main),
            mode: main ? 'NETWORK' : 'SIMPLE',
            scope: 'BRANCH' as const,
            canManageLocations: false,
          },
        };
      }
      const store = await this.ensureDefaultLocation(
        ctx.tenantId!,
        ctx.branchId,
      );
      const row = await this.prisma.inventoryLocation.findFirst({
        where: { id: store.id },
        include: {
          branch: { select: { id: true, name: true, displayCode: true } },
        },
      });
      return {
        data: row ? [this.toLocationDto(row)] : [],
        meta: {
          hasMainWarehouse: Boolean(main),
          mode: main ? 'NETWORK' : 'SIMPLE',
          scope: 'BRANCH' as const,
          canManageLocations: false,
        },
      };
    }

    const rows = await this.prisma.inventoryLocation.findMany({
      where: { tenantId: ctx.tenantId!, status: 'ACTIVE' },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        branch: { select: { id: true, name: true, displayCode: true } },
      },
    });
    return {
      data: rows.map((r) => this.toLocationDto(r)),
      meta: {
        hasMainWarehouse: Boolean(main),
        mode: main ? 'NETWORK' : 'SIMPLE',
        scope: 'TENANT' as const,
        canManageLocations: true,
      },
    };
  }

  /**
   * Opt into network inventory: create one MAIN_WAREHOUSE for the tenant.
   * Simple restaurants never need this.
   */
  async createMainWarehouse(userId: string, dto: CreateMainLocationDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'manage',
      message: 'Only owners or store managers can enable the main warehouse.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can enable the main warehouse.',
    );

    const existing = await this.findMainWarehouse(ctx.tenantId!);
    if (existing) {
      throw new ConflictException(
        'A main warehouse already exists for this restaurant group.',
      );
    }

    const code = (dto.code?.trim() || 'MAIN').toUpperCase().slice(0, 40);
    const name = (dto.name?.trim() || 'Main warehouse').slice(0, 120);

    const inactiveMain = await this.prisma.inventoryLocation.findFirst({
      where: {
        tenantId: ctx.tenantId!,
        type: 'MAIN_WAREHOUSE',
        status: { not: 'ACTIVE' },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        branch: { select: { id: true, name: true, displayCode: true } },
      },
    });
    if (inactiveMain) {
      const reactivated = await this.prisma.inventoryLocation.update({
        where: { id: inactiveMain.id },
        data: {
          status: 'ACTIVE',
          name: name || inactiveMain.name,
          code: inactiveMain.code || code,
        },
        include: {
          branch: { select: { id: true, name: true, displayCode: true } },
        },
      });
      return {
        data: this.toLocationDto(reactivated),
        meta: { hasMainWarehouse: true, mode: 'NETWORK' as const },
      };
    }

    const clash = await this.prisma.inventoryLocation.findFirst({
      where: { tenantId: ctx.tenantId!, code },
    });
    if (clash) {
      throw new ConflictException(
        `Location code "${code}" is already in use. Pick another code.`,
      );
    }

    const created = await this.prisma.inventoryLocation.create({
      data: {
        tenantId: ctx.tenantId!,
        branchId: null,
        code,
        name,
        type: 'MAIN_WAREHOUSE',
        isDefault: false,
        status: 'ACTIVE',
      },
      include: {
        branch: { select: { id: true, name: true, displayCode: true } },
      },
    });

    return {
      data: this.toLocationDto(created),
      meta: { hasMainWarehouse: true, mode: 'NETWORK' as const },
    };
  }

  /**
   * Turn off network mode: deactivate MAIN_WAREHOUSE so only restaurant stores remain.
   * Requires zero on-hand at main and no in-flight SENT transfers from main.
   */
  async disableMainWarehouse(userId: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'manage',
      message: 'Only owners or store managers can turn off the main warehouse.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can turn off the main warehouse.',
    );

    const main = await this.findMainWarehouse(ctx.tenantId!);
    if (!main) {
      throw new BadRequestException('Main warehouse is already off.');
    }

    const openTransfers = await this.prisma.inventoryTransfer.count({
      where: {
        tenantId: ctx.tenantId!,
        fromLocationId: main.id,
        status: 'SENT',
      },
    });
    if (openTransfers > 0) {
      throw new BadRequestException(
        `Cannot turn off main warehouse while ${openTransfers} transfer(s) are still waiting for restaurant accept/reject.`,
      );
    }

    const balances = await this.prisma.inventoryStockBalance.findMany({
      where: { tenantId: ctx.tenantId!, locationId: main.id },
      select: { onHandQty: true },
    });
    const remaining = balances.reduce((sum, b) => sum + num(b.onHandQty), 0);
    if (remaining > 0) {
      throw new BadRequestException(
        `Main warehouse still has stock (${remaining}). Send or waste it to restaurant stores first, then turn off.`,
      );
    }

    const openAsks = await this.prisma.inventorySupplyRequest.count({
      where: {
        tenantId: ctx.tenantId!,
        toLocationId: main.id,
        status: 'SUBMITTED',
      },
    });
    if (openAsks > 0) {
      throw new BadRequestException(
        `Cannot turn off while ${openAsks} supply request(s) are still pending. Approve or reject them first.`,
      );
    }

    const updated = await this.prisma.inventoryLocation.update({
      where: { id: main.id },
      data: { status: 'INACTIVE' },
      include: {
        branch: { select: { id: true, name: true, displayCode: true } },
      },
    });

    return {
      data: this.toLocationDto(updated),
      meta: { hasMainWarehouse: false, mode: 'SIMPLE' as const },
    };
  }

  /** Owner / store manager: rename a store (name, optional code). */
  async updateLocation(
    userId: string,
    locationId: string,
    dto: UpdateLocationDto,
  ) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'manage',
      message: 'Only owners or store managers can edit stores.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can edit stores.',
    );

    const location = await this.prisma.inventoryLocation.findFirst({
      where: {
        id: locationId,
        tenantId: ctx.tenantId!,
        status: 'ACTIVE',
      },
    });
    if (!location) {
      throw new NotFoundException('Inventory location not found.');
    }

    const name = dto.name?.trim();
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase().slice(0, 40)
      : undefined;
    if (!name && !code) {
      throw new BadRequestException('Provide a name or code to update.');
    }

    if (code && code !== location.code) {
      const clash = await this.prisma.inventoryLocation.findFirst({
        where: {
          tenantId: ctx.tenantId!,
          code,
          NOT: { id: location.id },
        },
      });
      if (clash) {
        throw new ConflictException(
          `Location code "${code}" is already in use.`,
        );
      }
    }

    const updated = await this.prisma.inventoryLocation.update({
      where: { id: location.id },
      data: {
        ...(name ? { name: name.slice(0, 120) } : {}),
        ...(code ? { code } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, displayCode: true } },
      },
    });

    return { data: this.toLocationDto(updated) };
  }

  private async resolveLocationForWrite(
    ctx: AuthContextDto,
    locationId: string | undefined,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!this.isCentralInventoryRole(ctx.roleCode)) {
      if (!ctx.branchId) {
        throw new ForbiddenException('No restaurant branch on this account.');
      }
      const branchStore = await this.ensureDefaultLocation(
        ctx.tenantId!,
        ctx.branchId,
        db,
      );
      if (locationId && locationId !== branchStore.id) {
        throw new ForbiddenException(
          'You can only stock your restaurant store.',
        );
      }
      return branchStore;
    }

    if (locationId) {
      const location = await db.inventoryLocation.findFirst({
        where: {
          id: locationId,
          tenantId: ctx.tenantId!,
          status: 'ACTIVE',
        },
      });
      if (!location) {
        throw new NotFoundException('Inventory location not found.');
      }
      return location;
    }

    if (!ctx.branchId) {
      throw new BadRequestException(
        'No branch on this account. Pass locationId or assign a branch.',
      );
    }
    return this.ensureDefaultLocation(ctx.tenantId!, ctx.branchId, db);
  }

  /** Force branch managers onto their restaurant store location. */
  private async resolveScopedLocationId(
    ctx: AuthContextDto,
    requestedLocationId?: string | null,
  ): Promise<string | null> {
    if (this.isCentralInventoryRole(ctx.roleCode)) {
      return requestedLocationId || null;
    }
    if (!ctx.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    const store = await this.ensureDefaultLocation(ctx.tenantId!, ctx.branchId);
    if (requestedLocationId && requestedLocationId !== store.id) {
      throw new ForbiddenException(
        'You can only view inventory for your restaurant store.',
      );
    }
    return store.id;
  }

  private pickBalance<
    T extends {
      locationId: string | null;
      onHandQty: Prisma.Decimal;
      updatedAt: Date;
    },
  >(balances: T[] | undefined, locationId: string | null | undefined) {
    if (!balances?.length) return null;
    if (locationId) {
      return balances.find((b) => b.locationId === locationId) ?? null;
    }
    return balances[0] ?? null;
  }

  async listIngredients(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const locationId = await this.resolveScopedLocationId(
      ctx,
      query.locationId,
    );
    const { page, limit, skip } = this.pageOf(query);
    const where: Prisma.InventoryIngredientWhereInput = {
      tenantId: ctx.tenantId!,
      status: query.status || 'ACTIVE',
      ...(query.q?.trim()
        ? { name: { contains: query.q.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.inventoryIngredient.count({ where }),
      this.prisma.inventoryIngredient.findMany({
        where,
        include: {
          balances: locationId ? { where: { locationId } } : true,
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((r) => this.toIngredientDto(r, locationId)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async createIngredient(userId: string, dto: CreateIngredientDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const name = dto.name.trim();
    const unit = await this.assertKnownUnit(dto.unit.trim());
    const itemKind = this.assertItemKind(dto.itemKind ?? 'RAW');
    const existing = await this.prisma.inventoryIngredient.findFirst({
      where: {
        tenantId: ctx.tenantId!,
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
      const location = await this.resolveLocationForWrite(
        ctx,
        dto.locationId,
        tx,
      );
      const balanceBranchId =
        location.type === 'MAIN_WAREHOUSE'
          ? null
          : (location.branchId ?? ctx.branchId ?? null);

      const ingredient = await tx.inventoryIngredient.create({
        data: {
          tenantId: ctx.tenantId!,
          // Tenant catalog; branchId kept for legacy branch-scoped rows.
          branchId: balanceBranchId,
          name,
          unit,
          itemKind,
          unitCost: dec(dto.unitCost ?? 0),
          parLevel: dec(dto.parLevel ?? 0),
          status: 'ACTIVE',
        },
      });
      await tx.inventoryStockBalance.create({
        data: {
          tenantId: ctx.tenantId!,
          branchId: balanceBranchId,
          locationId: location.id,
          ingredientId: ingredient.id,
          onHandQty: dec(initialQty),
        },
      });
      if (initialQty > 0) {
        await tx.inventoryLedgerEntry.create({
          data: {
            tenantId: ctx.tenantId!,
            branchId: balanceBranchId,
            locationId: location.id,
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
        include: { balances: true },
      });
    });
    return { data: this.toIngredientDto(created) };
  }

  async updateIngredient(userId: string, id: string, dto: UpdateIngredientDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const ingredient = await this.findIngredient(ctx, id);
    if (dto.name?.trim() && dto.name.trim() !== ingredient.name) {
      const clash = await this.prisma.inventoryIngredient.findFirst({
        where: {
          tenantId: ctx.tenantId!,
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
    const itemKind =
      dto.itemKind !== undefined
        ? this.assertItemKind(dto.itemKind)
        : undefined;
    const updated = await this.prisma.inventoryIngredient.update({
      where: { id },
      data: {
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
        ...(unit ? { unit } : {}),
        ...(itemKind ? { itemKind } : {}),
        ...(dto.unitCost !== undefined ? { unitCost: dec(dto.unitCost) } : {}),
        ...(dto.standardYieldPercent !== undefined
          ? {
              standardYieldPercent:
                dto.standardYieldPercent == null
                  ? null
                  : dec(dto.standardYieldPercent),
            }
          : {}),
        ...(dto.parLevel !== undefined ? { parLevel: dec(dto.parLevel) } : {}),
        ...(dto.status?.trim() ? { status: dto.status.trim() } : {}),
      },
      include: { balances: true },
    });
    return { data: this.toIngredientDto(updated) };
  }

  /** Soft-delete: hide from catalog. Blocks if any location still has on-hand qty. */
  async deleteIngredient(userId: string, id: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const ingredient = await this.findIngredient(ctx, id);
    const balances = await this.prisma.inventoryStockBalance.findMany({
      where: { tenantId: ctx.tenantId!, ingredientId: id },
      select: { onHandQty: true },
    });
    const remaining = balances.reduce((sum, b) => sum + num(b.onHandQty), 0);
    if (remaining > 0) {
      throw new BadRequestException(
        `Cannot delete "${ingredient.name}" while ${remaining} is still on hand somewhere. Waste or transfer it first.`,
      );
    }
    const updated = await this.prisma.inventoryIngredient.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: { balances: true },
    });
    return { data: this.toIngredientDto(updated) };
  }

  // ─── Balances ──────────────────────────────────────────────────────────────

  async listBalances(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const { page, limit, skip } = this.pageOf(query);
    const lowStock = query.lowStock === 'true' || query.lowStock === '1';
    const locationId = await this.resolveScopedLocationId(
      ctx,
      query.locationId,
    );

    const ingredients = await this.prisma.inventoryIngredient.findMany({
      where: {
        tenantId: ctx.tenantId!,
        status: query.status || 'ACTIVE',
        ...(query.q?.trim()
          ? { name: { contains: query.q.trim(), mode: 'insensitive' } }
          : {}),
      },
      include: {
        balances: locationId ? { where: { locationId } } : true,
      },
      orderBy: { name: 'asc' },
    });

    let rows = ingredients.map((ing) => {
      const bal = this.pickBalance(ing.balances, locationId);
      const onHand = num(bal?.onHandQty);
      const par = num(ing.parLevel);
      const unitCost = num(ing.unitCost);
      const stockValue = roundMoney(onHand * unitCost);
      return {
        ingredientId: ing.id,
        name: ing.name,
        unit: ing.unit,
        itemKind: ing.itemKind ?? 'RAW',
        unitCost,
        standardYieldPercent:
          ing.standardYieldPercent == null
            ? null
            : num(ing.standardYieldPercent),
        usableUnitCost: this.usableUnitCostFrom(
          unitCost,
          ing.standardYieldPercent == null
            ? null
            : num(ing.standardYieldPercent),
        ),
        stockValue,
        parLevel: par,
        onHandQty: onHand,
        isLowStock: onHand <= par,
        status: ing.status,
        locationId: bal?.locationId ?? locationId,
        updatedAt: bal?.updatedAt ?? ing.updatedAt,
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
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const ingredient = await this.findIngredient(ctx, dto.ingredientId);
    const qty = dec(dto.quantity);
    await this.prisma.$transaction(async (tx) => {
      const location = await this.resolveLocationForWrite(
        ctx,
        dto.locationId,
        tx,
      );
      const balanceBranchId =
        location.type === 'MAIN_WAREHOUSE'
          ? null
          : (location.branchId ?? ctx.branchId ?? null);
      await this.applyDelta(
        tx,
        {
          tenantId: ctx.tenantId!,
          branchId: balanceBranchId,
          locationId: location.id,
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
      include: { balances: true },
    });
    return { data: this.toIngredientDto(refreshed, dto.locationId) };
  }

  async waste(userId: string, dto: WasteStockDto) {
    const ctx = await this.requireInventoryAccess(userId);
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
      include: { balances: true },
    });
    return { data: this.toIngredientDto(refreshed) };
  }

  /**
   * Single-SKU yield test (onion/potato style).
   * Yield% = usable ÷ purchased × 100.
   * Usable (EP) unit cost = AP unit cost ÷ yield fraction
   *   e.g. 40 ETB/kg ÷ 0.8 = 50 ETB per usable kg (0.2 kg trim carries its cost into the 0.8).
   */
  async listYieldTests(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const { page, limit, skip } = this.pageOf(query);
    const where: Prisma.InventoryYieldTestWhereInput = {
      tenantId: ctx.tenantId!,
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.q?.trim()
        ? {
            ingredient: {
              name: { contains: query.q.trim(), mode: 'insensitive' },
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.inventoryYieldTest.count({ where }),
      this.prisma.inventoryYieldTest.findMany({
        where,
        include: this.yieldTestInclude(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((r) => this.toYieldTestDto(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async postYieldTest(userId: string, dto: PostYieldTestDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'create',
      message: 'Not allowed to post yield tests.',
    });

    if (dto.usableQuantity > dto.purchasedQuantity) {
      throw new BadRequestException(
        'Usable quantity cannot exceed purchased quantity.',
      );
    }

    const ingredient = await this.findIngredient(ctx, dto.ingredientId);
    const location = await this.resolveLocationForWrite(
      ctx,
      dto.locationId,
      this.prisma,
    );

    const purchased = dto.purchasedQuantity;
    const usable = dto.usableQuantity;
    const trimQty = roundMoney4(purchased - usable);
    const yieldPercent = roundMoney((usable / purchased) * 100);
    const yieldFraction = usable / purchased;
    const apUnitCost = num(ingredient.unitCost);
    const epUnitCost =
      yieldFraction > 0 ? roundMoney4(apUnitCost / yieldFraction) : apUnitCost;
    const writeOffTrim = dto.writeOffTrim !== false;
    const note = dto.note?.trim() || null;

    if (writeOffTrim) {
      const bal = await this.prisma.inventoryStockBalance.findUnique({
        where: {
          locationId_ingredientId: {
            locationId: location.id,
            ingredientId: ingredient.id,
          },
        },
      });
      const onHand = num(bal?.onHandQty);
      if (onHand < purchased) {
        throw new BadRequestException(
          `Not enough "${ingredient.name}" at ${location.name} for this yield test (have ${onHand}, purchased ${purchased}). Receive stock first, or turn off write-off.`,
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryIngredient.update({
        where: { id: ingredient.id },
        data: { standardYieldPercent: dec(yieldPercent) },
      });

      if (writeOffTrim && trimQty > 0) {
        const balanceBranchId =
          location.type === 'MAIN_WAREHOUSE'
            ? null
            : (location.branchId ?? ctx.branchId ?? null);
        await this.applyDelta(
          tx,
          {
            tenantId: ctx.tenantId!,
            branchId: balanceBranchId,
            locationId: location.id,
            staffMembershipId: ctx.staffMembershipId,
          },
          ingredient.id,
          dec(trimQty).negated(),
          {
            entryType: 'YIELD_TRIM',
            unitCost: apUnitCost,
            note:
              note ||
              `Yield test ${yieldPercent}% · trim ${trimQty} ${ingredient.unit}`,
          },
        );
      }

      return tx.inventoryYieldTest.create({
        data: {
          tenantId: ctx.tenantId!,
          locationId: location.id,
          ingredientId: ingredient.id,
          purchasedQuantity: dec(purchased),
          usableQuantity: dec(usable),
          trimQuantity: dec(trimQty),
          yieldPercent: dec(yieldPercent),
          apUnitCost: dec(apUnitCost),
          epUnitCost: dec(epUnitCost),
          wroteOffTrim: writeOffTrim && trimQty > 0,
          note,
          postedByMembershipId: ctx.staffMembershipId,
        },
        include: this.yieldTestInclude(),
      });
    });

    return { data: this.toYieldTestDto(created) };
  }

  async updateYieldTest(userId: string, id: string, dto: UpdateYieldTestDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'update',
      message: 'Not allowed to edit yield tests.',
    });

    const existing = await this.prisma.inventoryYieldTest.findFirst({
      where: { id, tenantId: ctx.tenantId! },
      include: { ingredient: true },
    });
    if (!existing) throw new NotFoundException('Yield test not found.');

    const purchased =
      dto.purchasedQuantity !== undefined
        ? dto.purchasedQuantity
        : num(existing.purchasedQuantity);
    const usable =
      dto.usableQuantity !== undefined
        ? dto.usableQuantity
        : num(existing.usableQuantity);
    if (usable > purchased) {
      throw new BadRequestException(
        'Usable quantity cannot exceed purchased quantity.',
      );
    }

    const trimQty = roundMoney4(purchased - usable);
    const yieldPercent = roundMoney((usable / purchased) * 100);
    const yieldFraction = usable / purchased;
    const apUnitCost = num(existing.ingredient.unitCost);
    const epUnitCost =
      yieldFraction > 0 ? roundMoney4(apUnitCost / yieldFraction) : apUnitCost;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.inventoryYieldTest.update({
        where: { id },
        data: {
          purchasedQuantity: dec(purchased),
          usableQuantity: dec(usable),
          trimQuantity: dec(trimQty),
          yieldPercent: dec(yieldPercent),
          apUnitCost: dec(apUnitCost),
          epUnitCost: dec(epUnitCost),
          ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        },
        include: this.yieldTestInclude(),
      });

      // Keep ingredient yield aligned to the latest test for this ingredient.
      const latest = await tx.inventoryYieldTest.findFirst({
        where: {
          tenantId: ctx.tenantId!,
          ingredientId: existing.ingredientId,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        await tx.inventoryIngredient.update({
          where: { id: existing.ingredientId },
          data: { standardYieldPercent: latest.yieldPercent },
        });
      }

      return row;
    });

    return { data: this.toYieldTestDto(updated) };
  }

  async deleteYieldTest(userId: string, id: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'delete',
      message: 'Not allowed to delete yield tests.',
    });

    const existing = await this.prisma.inventoryYieldTest.findFirst({
      where: { id, tenantId: ctx.tenantId! },
    });
    if (!existing) throw new NotFoundException('Yield test not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryYieldTest.delete({ where: { id } });
      const latest = await tx.inventoryYieldTest.findFirst({
        where: {
          tenantId: ctx.tenantId!,
          ingredientId: existing.ingredientId,
        },
        orderBy: { createdAt: 'desc' },
      });
      await tx.inventoryIngredient.update({
        where: { id: existing.ingredientId },
        data: {
          standardYieldPercent: latest ? latest.yieldPercent : null,
        },
      });
    });

    return { data: { id } };
  }

  private yieldTestInclude() {
    return {
      ingredient: {
        select: {
          id: true,
          name: true,
          unit: true,
          unitCost: true,
          itemKind: true,
        },
      },
      location: {
        select: { id: true, name: true, type: true, code: true },
      },
    } as const;
  }

  private toYieldTestDto(row: {
    id: string;
    purchasedQuantity: Prisma.Decimal;
    usableQuantity: Prisma.Decimal;
    trimQuantity: Prisma.Decimal;
    yieldPercent: Prisma.Decimal;
    apUnitCost: Prisma.Decimal;
    epUnitCost: Prisma.Decimal;
    wroteOffTrim: boolean;
    note: string | null;
    locationId: string | null;
    createdAt: Date;
    updatedAt: Date;
    ingredient: {
      id: string;
      name: string;
      unit: string;
      unitCost: Prisma.Decimal;
      itemKind: string;
    };
    location: {
      id: string;
      name: string;
      type: string;
      code: string;
    } | null;
  }) {
    return {
      id: row.id,
      purchasedQuantity: num(row.purchasedQuantity),
      usableQuantity: num(row.usableQuantity),
      trimQuantity: num(row.trimQuantity),
      yieldPercent: num(row.yieldPercent),
      apUnitCost: num(row.apUnitCost),
      epUnitCost: num(row.epUnitCost),
      wroteOffTrim: row.wroteOffTrim,
      note: row.note,
      locationId: row.locationId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ingredient: {
        id: row.ingredient.id,
        name: row.ingredient.name,
        unit: row.ingredient.unit,
        unitCost: num(row.ingredient.unitCost),
        itemKind: row.ingredient.itemKind,
      },
      location: row.location,
    };
  }

  // ─── Ledger ────────────────────────────────────────────────────────────────

  private resolveLedgerEntryTypeFilter(
    type?: string,
  ): Prisma.InventoryLedgerEntryWhereInput['entryType'] | undefined {
    if (!type?.trim()) return undefined;
    const key = type.trim().toUpperCase();
    const groups: Record<string, string[]> = {
      PRODUCTION: ['PRODUCE_CONSUME', 'PRODUCE_OUTPUT'],
      INTERNAL_PRODUCE: ['PRODUCE_CONSUME', 'PRODUCE_OUTPUT'],
      TRANSFERS: [
        'TRANSFER_OUT',
        'TRANSFER_IN',
        'TRANSFER_RETURN',
        'TRANSFER_SHORTAGE',
      ],
      PURCHASES: ['RECEIVE', 'OPENING'],
    };
    if (groups[key]) return { in: groups[key] };
    return key;
  }

  async listLedger(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const locationId = await this.resolveScopedLocationId(
      ctx,
      query.locationId,
    );
    const { page, limit, skip } = this.pageOf(query);
    const entryType = this.resolveLedgerEntryTypeFilter(query.type);
    const where: Prisma.InventoryLedgerEntryWhereInput = {
      tenantId: ctx.tenantId!,
      ...(locationId ? { locationId } : {}),
      ...(entryType ? { entryType } : {}),
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
        include: {
          ingredient: true,
          location: {
            select: {
              id: true,
              name: true,
              type: true,
              code: true,
              branch: { select: { id: true, name: true } },
            },
          },
          createdBy: {
            select: {
              id: true,
              employeeDisplayName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((r) => this.toLedgerDto(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getMovementSeries(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const locationId = await this.resolveScopedLocationId(
      ctx,
      query.locationId,
    );

    const to = query.to ? new Date(query.to) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 13 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);

    const entries = await this.prisma.inventoryLedgerEntry.findMany({
      where: {
        tenantId: ctx.tenantId!,
        ...(locationId ? { locationId } : {}),
        createdAt: { gte: from, lte: to },
      },
      select: {
        createdAt: true,
        entryType: true,
        quantityDelta: true,
        unitCostSnapshot: true,
        ingredient: { select: { unitCost: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    type DayBucket = {
      date: string;
      receive: number;
      waste: number;
      produceOut: number;
      produceUse: number;
      transferOut: number;
      transferIn: number;
      sales: number;
    };

    const buckets = new Map<string, DayBucket>();
    const cursor = new Date(from);
    while (cursor <= to) {
      const key = cursor.toISOString().slice(0, 10);
      buckets.set(key, {
        date: key,
        receive: 0,
        waste: 0,
        produceOut: 0,
        produceUse: 0,
        transferOut: 0,
        transferIn: 0,
        sales: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const entry of entries) {
      const key = entry.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const qty = Math.abs(num(entry.quantityDelta));
      const unitCost =
        entry.unitCostSnapshot != null
          ? num(entry.unitCostSnapshot)
          : num(entry.ingredient.unitCost);
      const value = roundMoney(qty * unitCost);
      switch (entry.entryType) {
        case 'RECEIVE':
        case 'OPENING':
          bucket.receive += value;
          break;
        case 'WASTE':
        case 'YIELD_TRIM':
          bucket.waste += value;
          break;
        case 'PRODUCE_OUTPUT':
          bucket.produceOut += value;
          break;
        case 'PRODUCE_CONSUME':
          bucket.produceUse += value;
          break;
        case 'TRANSFER_OUT':
          bucket.transferOut += value;
          break;
        case 'TRANSFER_IN':
        case 'TRANSFER_RETURN':
          bucket.transferIn += value;
          break;
        case 'SALE_DEPLETE':
          bucket.sales += value;
          break;
        default:
          break;
      }
    }

    const series = Array.from(buckets.values()).map((b) => ({
      date: b.date,
      receive: roundMoney(b.receive),
      waste: roundMoney(b.waste),
      produceOut: roundMoney(b.produceOut),
      produceUse: roundMoney(b.produceUse),
      transferOut: roundMoney(b.transferOut),
      transferIn: roundMoney(b.transferIn),
      sales: roundMoney(b.sales),
    }));

    const totals = series.reduce(
      (acc, row) => ({
        receive: roundMoney(acc.receive + row.receive),
        waste: roundMoney(acc.waste + row.waste),
        produceOut: roundMoney(acc.produceOut + row.produceOut),
        produceUse: roundMoney(acc.produceUse + row.produceUse),
        transferOut: roundMoney(acc.transferOut + row.transferOut),
        transferIn: roundMoney(acc.transferIn + row.transferIn),
        sales: roundMoney(acc.sales + row.sales),
      }),
      {
        receive: 0,
        waste: 0,
        produceOut: 0,
        produceUse: 0,
        transferOut: 0,
        transferIn: 0,
        sales: 0,
      },
    );

    return {
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        currencyCode: 'ETB',
        series,
        totals,
      },
    };
  }

  async getLedgerEntry(userId: string, id: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const row = await this.prisma.inventoryLedgerEntry.findFirst({
      where: { id, tenantId: ctx.tenantId! },
      include: {
        ingredient: true,
        location: {
          select: {
            id: true,
            name: true,
            type: true,
            code: true,
            branch: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: {
            id: true,
            employeeDisplayName: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Ledger entry not found.');
    }
    if (!this.isCentralInventoryRole(ctx.roleCode) && ctx.branchId) {
      const store = await this.ensureDefaultLocation(
        ctx.tenantId!,
        ctx.branchId,
      );
      if (row.locationId && row.locationId !== store.id) {
        throw new ForbiddenException(
          'You can only view ledger entries for your restaurant store.',
        );
      }
    }
    return { data: this.toLedgerDto(row) };
  }

  // ─── Counts ────────────────────────────────────────────────────────────────

  async listCounts(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId);
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
    const ctx = await this.requireInventoryAccess(userId);
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
      include: { balances: true },
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
            bookQtySnapshot:
              this.pickBalance(ing.balances, null)?.onHandQty ?? dec(0),
          })),
        });
      }
      return created;
    });

    return this.getCount(userId, session.id);
  }

  async getCount(userId: string, sessionId: string) {
    const ctx = await this.requireInventoryAccess(userId);
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
    const ctx = await this.requireInventoryAccess(userId);
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
    const ctx = await this.requireInventoryAccess(userId);
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
      include: {
        ingredient: { select: { standardYieldPercent: true, unit: true } },
      },
    });
    if (recipe.length === 0) return;

    for (const line of recipe) {
      // Recipe qty is edible (EP). Convert to purchased (AP) using yield %.
      const yieldPct = num(line.ingredient.standardYieldPercent);
      const yieldFrac = yieldPct > 0 && yieldPct <= 100 ? yieldPct / 100 : 1;
      const epPerServing = num(line.quantityPerServing);
      const apPerServing = epPerServing / yieldFrac;
      const delta = dec(apPerServing).mul(orderItem.quantity).negated();
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
          note:
            yieldFrac < 1
              ? `Recipe depletion (EP ${epPerServing} → AP ${roundMoney4(apPerServing)} @ ${yieldPct}% yield)`
              : 'Recipe depletion',
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

  // ─── Transfers (main → branch) ─────────────────────────────────────────────

  async listTransfers(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const { page, limit, skip } = this.pageOf(query);
    const direction = (query.direction || 'all').toLowerCase();
    const main = await this.findMainWarehouse(ctx.tenantId!);

    const where: Prisma.InventoryTransferWhereInput = {
      tenantId: ctx.tenantId!,
      ...(query.status ? { status: query.status } : {}),
    };

    if (direction === 'incoming') {
      where.status = query.status || 'SENT';
      if (ctx.roleCode === 'OWNER_ADMIN' || ctx.roleCode === 'STORE_MANAGER') {
        where.toLocation = { type: 'BRANCH_STORE' };
      } else if (ctx.branchId) {
        where.toLocation = {
          branchId: ctx.branchId,
          type: 'BRANCH_STORE',
        };
      } else {
        // No branch context — nothing incoming.
        where.id = '00000000-0000-0000-0000-000000000000';
      }
    } else if (direction === 'outgoing' && main) {
      where.fromLocationId = main.id;
    }

    const [total, rows] = await Promise.all([
      this.prisma.inventoryTransfer.count({ where }),
      this.prisma.inventoryTransfer.findMany({
        where,
        include: this.transferInclude(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((r) => this.toTransferDto(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * Create transfer from main (default) to a branch store and ship immediately.
   * Deducts source stock on SEND; destination stock increases only on accept.
   */
  async createAndSendTransfer(userId: string, dto: CreateTransferDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'initiate',
      message: 'Not allowed to send inventory transfers.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can send from the main warehouse.',
    );

    const main = await this.findMainWarehouse(ctx.tenantId!);
    if (!main) {
      throw new BadRequestException(
        'Enable a main warehouse before sending transfers.',
      );
    }

    const fromLocationId = dto.fromLocationId ?? main.id;
    const from = await this.prisma.inventoryLocation.findFirst({
      where: {
        id: fromLocationId,
        tenantId: ctx.tenantId!,
        status: 'ACTIVE',
      },
    });
    if (!from) {
      throw new NotFoundException('Source location not found.');
    }
    if (from.type !== 'MAIN_WAREHOUSE') {
      throw new BadRequestException(
        'Phase 2 transfers must ship from the main warehouse.',
      );
    }

    const to = await this.prisma.inventoryLocation.findFirst({
      where: {
        id: dto.toLocationId,
        tenantId: ctx.tenantId!,
        status: 'ACTIVE',
      },
    });
    if (!to) {
      throw new NotFoundException('Destination location not found.');
    }
    if (to.type !== 'BRANCH_STORE' || !to.branchId) {
      throw new BadRequestException(
        'Transfers must go to a restaurant branch store.',
      );
    }
    if (from.id === to.id) {
      throw new BadRequestException('Source and destination must differ.');
    }

    const merged = this.mergeTransferLines(dto.lines);
    const transfer = await this.prisma.$transaction(async (tx) => {
      for (const line of merged) {
        const ingredient = await tx.inventoryIngredient.findFirst({
          where: { id: line.ingredientId, tenantId: ctx.tenantId! },
        });
        if (!ingredient) {
          throw new NotFoundException(
            `Ingredient ${line.ingredientId} not found.`,
          );
        }
        const bal = await tx.inventoryStockBalance.findUnique({
          where: {
            locationId_ingredientId: {
              locationId: from.id,
              ingredientId: line.ingredientId,
            },
          },
        });
        const onHand = num(bal?.onHandQty);
        if (onHand < line.quantity) {
          throw new BadRequestException(
            `Not enough "${ingredient.name}" at main warehouse (have ${onHand}, need ${line.quantity}).`,
          );
        }
      }

      const created = await tx.inventoryTransfer.create({
        data: {
          tenantId: ctx.tenantId!,
          fromLocationId: from.id,
          toLocationId: to.id,
          status: 'SENT',
          note: dto.note?.trim() || null,
          sentByMembershipId: ctx.staffMembershipId,
          sentAt: new Date(),
          lines: {
            create: merged.map((line) => ({
              ingredientId: line.ingredientId,
              quantitySent: dec(line.quantity),
            })),
          },
        },
        include: this.transferInclude(),
      });

      for (const line of merged) {
        await this.applyDelta(
          tx,
          {
            tenantId: ctx.tenantId!,
            branchId: from.branchId,
            locationId: from.id,
            staffMembershipId: ctx.staffMembershipId,
          },
          line.ingredientId,
          dec(line.quantity).negated(),
          {
            entryType: 'TRANSFER_OUT',
            note: `Transfer ${created.id.slice(0, 8)} → branch`,
          },
        );
      }

      return created;
    });

    return { data: this.toTransferDto(transfer) };
  }

  async acceptTransfer(
    userId: string,
    transferId: string,
    dto: AcceptTransferDto,
  ) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'receive',
      message: 'Not allowed to accept inventory transfers.',
    });

    const transfer = await this.prisma.inventoryTransfer.findFirst({
      where: { id: transferId, tenantId: ctx.tenantId! },
      include: this.transferInclude(),
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found.');
    }
    if (transfer.status !== 'SENT') {
      throw new BadRequestException(
        `Only SENT transfers can be accepted (current: ${transfer.status}).`,
      );
    }

    const to = transfer.toLocation;
    if (
      ctx.roleCode !== 'OWNER_ADMIN' &&
      ctx.roleCode !== 'STORE_MANAGER' &&
      to.branchId &&
      ctx.branchId &&
      to.branchId !== ctx.branchId
    ) {
      throw new ForbiddenException(
        'You can only accept deliveries for your branch store.',
      );
    }

    const receiveByIngredient = new Map<string, number>();
    if (dto.lines?.length) {
      for (const line of dto.lines) {
        receiveByIngredient.set(
          line.ingredientId,
          (receiveByIngredient.get(line.ingredientId) ?? 0) +
            Number(line.quantityReceived),
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of transfer.lines) {
        const sent = num(line.quantitySent);
        const receivedRaw = receiveByIngredient.has(line.ingredientId)
          ? (receiveByIngredient.get(line.ingredientId) as number)
          : sent;
        if (receivedRaw < 0 || receivedRaw > sent) {
          throw new BadRequestException(
            `Received qty for a line must be between 0 and ${sent}.`,
          );
        }
        const received = dec(receivedRaw);

        await tx.inventoryTransferLine.update({
          where: { id: line.id },
          data: { quantityReceived: received },
        });

        if (receivedRaw > 0) {
          await this.applyDelta(
            tx,
            {
              tenantId: ctx.tenantId!,
              branchId: to.branchId,
              locationId: to.id,
              staffMembershipId: ctx.staffMembershipId,
            },
            line.ingredientId,
            received,
            {
              entryType: 'TRANSFER_IN',
              note:
                dto.note?.trim() ||
                `Accepted transfer ${transfer.id.slice(0, 8)}`,
            },
          );
        }

        const shortage = sent - receivedRaw;
        if (shortage > 0) {
          await tx.inventoryLedgerEntry.create({
            data: {
              tenantId: ctx.tenantId!,
              branchId: transfer.fromLocation.branchId,
              locationId: transfer.fromLocationId,
              ingredientId: line.ingredientId,
              entryType: 'TRANSFER_SHORTAGE',
              quantityDelta: dec(0),
              note: `Short ${shortage} on transfer ${transfer.id.slice(0, 8)} (already deducted from main)`,
              createdByMembershipId: ctx.staffMembershipId,
            },
          });
        }
      }

      return tx.inventoryTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'RECEIVED',
          receivedAt: new Date(),
          receivedByMembershipId: ctx.staffMembershipId,
          ...(dto.note?.trim()
            ? {
                note: [transfer.note, dto.note.trim()]
                  .filter(Boolean)
                  .join(' · ')
                  .slice(0, 255),
              }
            : {}),
        },
        include: this.transferInclude(),
      });
    });

    return { data: this.toTransferDto(updated) };
  }

  async rejectTransfer(
    userId: string,
    transferId: string,
    dto: RejectTransferDto,
  ) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'receive',
      message: 'Not allowed to reject inventory transfers.',
    });

    const transfer = await this.prisma.inventoryTransfer.findFirst({
      where: { id: transferId, tenantId: ctx.tenantId! },
      include: this.transferInclude(),
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found.');
    }
    if (transfer.status !== 'SENT') {
      throw new BadRequestException(
        `Only SENT transfers can be rejected (current: ${transfer.status}).`,
      );
    }

    const to = transfer.toLocation;
    if (
      ctx.roleCode !== 'OWNER_ADMIN' &&
      ctx.roleCode !== 'STORE_MANAGER' &&
      to.branchId &&
      ctx.branchId &&
      to.branchId !== ctx.branchId
    ) {
      throw new ForbiddenException(
        'You can only reject deliveries for your branch store.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of transfer.lines) {
        await this.applyDelta(
          tx,
          {
            tenantId: ctx.tenantId!,
            branchId: transfer.fromLocation.branchId,
            locationId: transfer.fromLocationId,
            staffMembershipId: ctx.staffMembershipId,
          },
          line.ingredientId,
          dec(line.quantitySent),
          {
            entryType: 'TRANSFER_RETURN',
            note:
              dto.note?.trim() ||
              `Rejected transfer ${transfer.id.slice(0, 8)} — stock restored to main`,
          },
        );
      }

      return tx.inventoryTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'CANCELLED',
          receivedAt: new Date(),
          receivedByMembershipId: ctx.staffMembershipId,
          note: [transfer.note, dto.note?.trim() || 'Rejected by branch']
            .filter(Boolean)
            .join(' · ')
            .slice(0, 255),
        },
        include: this.transferInclude(),
      });
    });

    return { data: this.toTransferDto(updated) };
  }

  private mergeTransferLines(
    lines: { ingredientId: string; quantity: number }[],
  ) {
    const map = new Map<string, number>();
    for (const line of lines) {
      const qty = Number(line.quantity);
      if (!(qty > 0)) {
        throw new BadRequestException('Each transfer line needs quantity > 0.');
      }
      map.set(line.ingredientId, (map.get(line.ingredientId) ?? 0) + qty);
    }
    return [...map.entries()].map(([ingredientId, quantity]) => ({
      ingredientId,
      quantity,
    }));
  }

  private transferInclude() {
    return {
      fromLocation: {
        include: {
          branch: { select: { id: true, name: true, displayCode: true } },
        },
      },
      toLocation: {
        include: {
          branch: { select: { id: true, name: true, displayCode: true } },
        },
      },
      lines: {
        include: {
          ingredient: {
            select: { id: true, name: true, unit: true, itemKind: true },
          },
        },
      },
    } as const;
  }

  private toTransferDto(row: {
    id: string;
    status: string;
    note: string | null;
    fromLocationId: string;
    toLocationId: string;
    sentAt: Date | null;
    receivedAt: Date | null;
    createdAt: Date;
    fromLocation: {
      id: string;
      code: string;
      name: string;
      type: string;
      branchId: string | null;
      branch?: {
        id: string;
        name: string;
        displayCode: string | null;
      } | null;
    };
    toLocation: {
      id: string;
      code: string;
      name: string;
      type: string;
      branchId: string | null;
      branch?: {
        id: string;
        name: string;
        displayCode: string | null;
      } | null;
    };
    lines: Array<{
      id: string;
      ingredientId: string;
      quantitySent: Prisma.Decimal;
      quantityReceived: Prisma.Decimal | null;
      ingredient: {
        id: string;
        name: string;
        unit: string;
        itemKind: string;
      };
    }>;
  }) {
    return {
      id: row.id,
      status: row.status,
      note: row.note,
      fromLocation: this.toLocationDto(row.fromLocation),
      toLocation: this.toLocationDto(row.toLocation),
      sentAt: row.sentAt?.toISOString() ?? null,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      lines: row.lines.map((line) => ({
        id: line.id,
        ingredientId: line.ingredientId,
        quantitySent: num(line.quantitySent),
        quantityReceived:
          line.quantityReceived != null ? num(line.quantityReceived) : null,
        ingredient: {
          id: line.ingredient.id,
          name: line.ingredient.name,
          unit: line.ingredient.unit,
          itemKind: line.ingredient.itemKind,
        },
      })),
    };
  }

  // ─── Supply requests (branch → main) ───────────────────────────────────────

  async listSupplyRequests(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const { page, limit, skip } = this.pageOf(query);
    const direction = (query.direction || 'all').toLowerCase();
    const main = await this.findMainWarehouse(ctx.tenantId!);

    const where: Prisma.InventorySupplyRequestWhereInput = {
      tenantId: ctx.tenantId!,
      ...(query.status ? { status: query.status } : {}),
    };

    if (direction === 'pending') {
      if (!this.isCentralInventoryRole(ctx.roleCode)) {
        where.id = '00000000-0000-0000-0000-000000000000';
      } else {
        where.status = 'SUBMITTED';
        if (main) where.toLocationId = main.id;
      }
    } else if (direction === 'mine') {
      if (ctx.branchId) {
        where.fromLocation = {
          branchId: ctx.branchId,
          type: 'BRANCH_STORE',
        };
      } else {
        where.id = '00000000-0000-0000-0000-000000000000';
      }
    }

    const [total, rows] = await Promise.all([
      this.prisma.inventorySupplyRequest.count({ where }),
      this.prisma.inventorySupplyRequest.findMany({
        where,
        include: this.supplyInclude(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((r) => this.toSupplyDto(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /** Branch asks main for stock (creates SUBMITTED request). */
  async createSupplyRequest(userId: string, dto: CreateSupplyRequestDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'request',
      message: 'Not allowed to request supply from the main warehouse.',
    });

    const main = await this.findMainWarehouse(ctx.tenantId!);
    if (!main) {
      throw new BadRequestException(
        'Enable a main warehouse before requesting supply.',
      );
    }

    let fromLocationId = dto.fromLocationId;
    if (!fromLocationId) {
      if (!ctx.branchId) {
        throw new BadRequestException(
          'Pass fromLocationId or use a branch-scoped account.',
        );
      }
      fromLocationId = (
        await this.ensureDefaultLocation(ctx.tenantId!, ctx.branchId)
      ).id;
    }

    const from = await this.prisma.inventoryLocation.findFirst({
      where: {
        id: fromLocationId,
        tenantId: ctx.tenantId!,
        status: 'ACTIVE',
      },
    });
    if (!from || from.type !== 'BRANCH_STORE') {
      throw new BadRequestException(
        'Supply requests must come from a restaurant branch store.',
      );
    }

    const merged = this.mergeTransferLines(
      dto.lines.map((l) => ({
        ingredientId: l.ingredientId,
        quantity: l.quantity,
      })),
    );

    for (const line of merged) {
      const ingredient = await this.prisma.inventoryIngredient.findFirst({
        where: { id: line.ingredientId, tenantId: ctx.tenantId! },
      });
      if (!ingredient) {
        throw new NotFoundException(
          `Ingredient ${line.ingredientId} not found.`,
        );
      }
    }

    const created = await this.prisma.inventorySupplyRequest.create({
      data: {
        tenantId: ctx.tenantId!,
        fromLocationId: from.id,
        toLocationId: main.id,
        status: 'SUBMITTED',
        note: dto.note?.trim() || null,
        requestedByMembershipId: ctx.staffMembershipId,
        submittedAt: new Date(),
        lines: {
          create: merged.map((line) => ({
            ingredientId: line.ingredientId,
            quantityRequested: dec(line.quantity),
          })),
        },
      },
      include: this.supplyInclude(),
    });

    return { data: this.toSupplyDto(created) };
  }

  /**
   * Main/owner approves a request and immediately ships a transfer.
   * Branch then accepts the transfer as usual.
   */
  async approveSupplyRequest(
    userId: string,
    requestId: string,
    dto: DecideSupplyRequestDto,
  ) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'approve',
      message: 'Not allowed to approve supply requests.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can approve supply requests.',
    );

    const request = await this.prisma.inventorySupplyRequest.findFirst({
      where: { id: requestId, tenantId: ctx.tenantId! },
      include: this.supplyInclude(),
    });
    if (!request) {
      throw new NotFoundException('Supply request not found.');
    }
    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Only SUBMITTED requests can be approved (current: ${request.status}).`,
      );
    }

    const transferResult = await this.createAndSendTransfer(userId, {
      fromLocationId: request.toLocationId,
      toLocationId: request.fromLocationId,
      note:
        dto.decisionNote?.trim() ||
        request.note ||
        `Supply request ${request.id.slice(0, 8)}`,
      lines: request.lines.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: num(line.quantityRequested),
      })),
    });

    await this.prisma.inventoryTransfer.update({
      where: { id: transferResult.data.id },
      data: { supplyRequestId: request.id },
    });

    const updated = await this.prisma.inventorySupplyRequest.update({
      where: { id: request.id },
      data: {
        status: 'FULFILLED',
        decidedAt: new Date(),
        decidedByMembershipId: ctx.staffMembershipId,
        decisionNote: dto.decisionNote?.trim() || null,
      },
      include: this.supplyInclude(),
    });

    return {
      data: this.toSupplyDto(updated),
      transfer: transferResult.data,
    };
  }

  async rejectSupplyRequest(
    userId: string,
    requestId: string,
    dto: DecideSupplyRequestDto,
  ) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'approve',
      message: 'Not allowed to reject supply requests.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can reject supply requests.',
    );

    const request = await this.prisma.inventorySupplyRequest.findFirst({
      where: { id: requestId, tenantId: ctx.tenantId! },
      include: this.supplyInclude(),
    });
    if (!request) {
      throw new NotFoundException('Supply request not found.');
    }
    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Only SUBMITTED requests can be rejected (current: ${request.status}).`,
      );
    }

    const updated = await this.prisma.inventorySupplyRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        decidedAt: new Date(),
        decidedByMembershipId: ctx.staffMembershipId,
        decisionNote: dto.decisionNote?.trim() || 'Rejected',
      },
      include: this.supplyInclude(),
    });

    return { data: this.toSupplyDto(updated) };
  }

  private supplyInclude() {
    return {
      fromLocation: {
        include: {
          branch: { select: { id: true, name: true, displayCode: true } },
        },
      },
      toLocation: {
        include: {
          branch: { select: { id: true, name: true, displayCode: true } },
        },
      },
      transfer: { select: { id: true, status: true } },
      lines: {
        include: {
          ingredient: {
            select: { id: true, name: true, unit: true, itemKind: true },
          },
        },
      },
    } as const;
  }

  private toSupplyDto(row: {
    id: string;
    status: string;
    note: string | null;
    decisionNote: string | null;
    submittedAt: Date | null;
    decidedAt: Date | null;
    createdAt: Date;
    fromLocation: {
      id: string;
      code: string;
      name: string;
      type: string;
      branchId: string | null;
      branch?: {
        id: string;
        name: string;
        displayCode: string | null;
      } | null;
    };
    toLocation: {
      id: string;
      code: string;
      name: string;
      type: string;
      branchId: string | null;
      branch?: {
        id: string;
        name: string;
        displayCode: string | null;
      } | null;
    };
    transfer?: { id: string; status: string } | null;
    lines: Array<{
      id: string;
      ingredientId: string;
      quantityRequested: Prisma.Decimal;
      ingredient: {
        id: string;
        name: string;
        unit: string;
        itemKind: string;
      };
    }>;
  }) {
    return {
      id: row.id,
      status: row.status,
      note: row.note,
      decisionNote: row.decisionNote,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      fromLocation: this.toLocationDto(row.fromLocation),
      toLocation: this.toLocationDto(row.toLocation),
      transfer: row.transfer
        ? { id: row.transfer.id, status: row.transfer.status }
        : null,
      lines: row.lines.map((line) => ({
        id: line.id,
        ingredientId: line.ingredientId,
        quantityRequested: num(line.quantityRequested),
        ingredient: {
          id: line.ingredient.id,
          name: line.ingredient.name,
          unit: line.ingredient.unit,
          itemKind: line.ingredient.itemKind,
        },
      })),
    };
  }

  // ─── Production + yield test (main or restaurant store) ───────────────────

  async listProductionBatches(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const { page, limit, skip } = this.pageOf(query);
    const where: Prisma.InventoryProductionBatchWhereInput = {
      tenantId: ctx.tenantId!,
      ...(query.locationId ? { locationId: query.locationId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.inventoryProductionBatch.count({ where }),
      this.prisma.inventoryProductionBatch.findMany({
        where,
        include: this.productionInclude(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((r) => this.toProductionDto(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * Consume inputs at a location and create output stock with a yield test.
   * Example: 10kg raw onion → 8kg peeled onion (80% yield) at restaurant store.
   * Or: flour + eggs → noodles at main. Output unit cost = input cost ÷ output qty.
   */
  async postProductionBatch(userId: string, dto: CreateProductionBatchDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'create',
      message: 'Not allowed to post production batches.',
    });

    const main = await this.findMainWarehouse(ctx.tenantId!);
    if (!main && !dto.locationId) {
      throw new BadRequestException(
        'Pick a store location, or enable a main warehouse.',
      );
    }

    const location = await this.prisma.inventoryLocation.findFirst({
      where: {
        id: dto.locationId ?? main!.id,
        tenantId: ctx.tenantId!,
        status: 'ACTIVE',
      },
    });
    if (!location) {
      throw new NotFoundException('Production location not found.');
    }
    if (
      location.type !== 'MAIN_WAREHOUSE' &&
      location.type !== 'BRANCH_STORE'
    ) {
      throw new BadRequestException(
        'Production is only allowed at main warehouse or a restaurant store.',
      );
    }
    if (location.type === 'MAIN_WAREHOUSE') {
      this.assertCentralInventoryRole(
        ctx,
        'Only owners or store managers can post production at the main warehouse.',
      );
    } else if (
      ctx.roleCode !== 'OWNER_ADMIN' &&
      ctx.branchId &&
      location.branchId &&
      location.branchId !== ctx.branchId
    ) {
      throw new ForbiddenException(
        'You can only post production at your restaurant store.',
      );
    }

    const mergedInputs = this.mergeTransferLines(dto.inputs);
    if (mergedInputs.some((i) => i.ingredientId === dto.outputIngredientId)) {
      throw new BadRequestException(
        'Output ingredient cannot also be an input in the same batch. Use a separate peeled/produced item (e.g. Raw onion → Peeled onion).',
      );
    }

    const outputKind = dto.outputItemKind ?? 'PRODUCED';
    const batch = await this.prisma.$transaction(async (tx) => {
      const output = await tx.inventoryIngredient.findFirst({
        where: { id: dto.outputIngredientId, tenantId: ctx.tenantId! },
      });
      if (!output) {
        throw new NotFoundException('Output ingredient not found.');
      }

      let inputCostTotal = 0;
      const inputRows: Array<{
        ingredientId: string;
        quantity: number;
        unitCost: number;
        name: string;
      }> = [];

      for (const line of mergedInputs) {
        const ingredient = await tx.inventoryIngredient.findFirst({
          where: { id: line.ingredientId, tenantId: ctx.tenantId! },
        });
        if (!ingredient) {
          throw new NotFoundException(
            `Input ingredient ${line.ingredientId} not found.`,
          );
        }
        const bal = await tx.inventoryStockBalance.findUnique({
          where: {
            locationId_ingredientId: {
              locationId: location.id,
              ingredientId: line.ingredientId,
            },
          },
        });
        const onHand = num(bal?.onHandQty);
        if (onHand < line.quantity) {
          throw new BadRequestException(
            `Not enough "${ingredient.name}" at ${location.name} (have ${onHand}, need ${line.quantity}).`,
          );
        }
        const unitCost = num(ingredient.unitCost);
        inputCostTotal += line.quantity * unitCost;
        inputRows.push({
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unitCost,
          name: ingredient.name,
        });
      }

      inputCostTotal = roundMoney(inputCostTotal);
      const outputQty = dto.outputQuantity;
      const outputUnitCost =
        outputQty > 0 ? roundMoney4(inputCostTotal / outputQty) : 0;

      let yieldPercent: number | null = null;
      if (
        dto.expectedOutputQuantity != null &&
        dto.expectedOutputQuantity > 0
      ) {
        yieldPercent = roundMoney(
          (outputQty / dto.expectedOutputQuantity) * 100,
        );
      } else if (mergedInputs.length === 1) {
        // Classic AP→EP: peeled onion out ÷ raw onion in
        yieldPercent = roundMoney((outputQty / mergedInputs[0].quantity) * 100);
      }

      const created = await tx.inventoryProductionBatch.create({
        data: {
          tenantId: ctx.tenantId!,
          locationId: location.id,
          outputIngredientId: dto.outputIngredientId,
          outputQuantity: dec(outputQty),
          expectedOutputQuantity:
            dto.expectedOutputQuantity != null
              ? dec(dto.expectedOutputQuantity)
              : null,
          yieldPercent: yieldPercent != null ? dec(yieldPercent) : null,
          inputCostTotal: dec(inputCostTotal),
          outputUnitCost: dec(outputUnitCost),
          note: dto.note?.trim() || null,
          postedByMembershipId: ctx.staffMembershipId,
          inputs: {
            create: mergedInputs.map((line) => ({
              ingredientId: line.ingredientId,
              quantity: dec(line.quantity),
            })),
          },
        },
        include: this.productionInclude(),
      });

      for (const line of inputRows) {
        await this.applyDelta(
          tx,
          {
            tenantId: ctx.tenantId!,
            branchId: location.branchId,
            locationId: location.id,
            staffMembershipId: ctx.staffMembershipId,
          },
          line.ingredientId,
          dec(line.quantity).negated(),
          {
            entryType: 'PRODUCE_CONSUME',
            unitCost: line.unitCost,
            note: `Production ${created.id.slice(0, 8)} · ${line.name}`,
          },
        );
      }

      await this.applyDelta(
        tx,
        {
          tenantId: ctx.tenantId!,
          branchId: location.branchId,
          locationId: location.id,
          staffMembershipId: ctx.staffMembershipId,
        },
        dto.outputIngredientId,
        dec(outputQty),
        {
          entryType: 'PRODUCE_OUTPUT',
          unitCost: outputUnitCost,
          note:
            dto.note?.trim() ||
            `Production ${created.id.slice(0, 8)} output` +
              (yieldPercent != null ? ` · yield ${yieldPercent}%` : ''),
        },
      );

      await tx.inventoryIngredient.update({
        where: { id: output.id },
        data: {
          unitCost: dec(outputUnitCost),
          ...(output.itemKind !== outputKind ? { itemKind: outputKind } : {}),
          ...(yieldPercent != null
            ? { standardYieldPercent: dec(yieldPercent) }
            : {}),
        },
      });

      return created;
    });

    return { data: this.toProductionDto(batch) };
  }

  private productionInclude() {
    return {
      location: {
        include: {
          branch: { select: { id: true, name: true, displayCode: true } },
        },
      },
      outputIngredient: {
        select: { id: true, name: true, unit: true, itemKind: true },
      },
      inputs: {
        include: {
          ingredient: {
            select: { id: true, name: true, unit: true, itemKind: true },
          },
        },
      },
    } as const;
  }

  private toProductionDto(row: {
    id: string;
    note: string | null;
    outputQuantity: Prisma.Decimal;
    expectedOutputQuantity?: Prisma.Decimal | null;
    yieldPercent?: Prisma.Decimal | null;
    inputCostTotal?: Prisma.Decimal | number;
    outputUnitCost?: Prisma.Decimal | number;
    createdAt: Date;
    location: {
      id: string;
      code: string;
      name: string;
      type: string;
      branchId: string | null;
      isDefault?: boolean;
      status?: string;
      createdAt?: Date;
      updatedAt?: Date;
      branch?: {
        id: string;
        name: string;
        displayCode: string | null;
      } | null;
    };
    outputIngredient: {
      id: string;
      name: string;
      unit: string;
      itemKind: string;
    };
    inputs: Array<{
      id: string;
      ingredientId: string;
      quantity: Prisma.Decimal;
      ingredient: {
        id: string;
        name: string;
        unit: string;
        itemKind: string;
      };
    }>;
  }) {
    return {
      id: row.id,
      note: row.note,
      outputQuantity: num(row.outputQuantity),
      expectedOutputQuantity:
        row.expectedOutputQuantity == null
          ? null
          : num(row.expectedOutputQuantity),
      yieldPercent: row.yieldPercent == null ? null : num(row.yieldPercent),
      inputCostTotal: num(row.inputCostTotal ?? 0),
      outputUnitCost: num(row.outputUnitCost ?? 0),
      createdAt: row.createdAt.toISOString(),
      location: this.toLocationDto(row.location),
      output: {
        id: row.outputIngredient.id,
        name: row.outputIngredient.name,
        unit: row.outputIngredient.unit,
        itemKind: row.outputIngredient.itemKind,
      },
      inputs: row.inputs.map((input) => ({
        id: input.id,
        ingredientId: input.ingredientId,
        quantity: num(input.quantity),
        ingredient: {
          id: input.ingredient.id,
          name: input.ingredient.name,
          unit: input.ingredient.unit,
          itemKind: input.ingredient.itemKind,
        },
      })),
    };
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async applyDelta(
    db: Prisma.TransactionClient | PrismaService,
    ctx: {
      tenantId: string;
      branchId: string | null;
      staffMembershipId?: string | null;
      locationId?: string | null;
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
    let locationId = ctx.locationId ?? null;
    if (!locationId) {
      if (!ctx.branchId) {
        throw new BadRequestException(
          'locationId is required when no branch store is available.',
        );
      }
      locationId = (
        await this.ensureDefaultLocation(ctx.tenantId, ctx.branchId, db)
      ).id;
    }

    // Atomic upsert + increment avoids lost updates under concurrent orders.
    await db.inventoryStockBalance.upsert({
      where: {
        locationId_ingredientId: { locationId, ingredientId },
      },
      create: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        locationId,
        ingredientId,
        onHandQty: meta.setAbsolute !== undefined ? meta.setAbsolute : delta,
      },
      update:
        meta.setAbsolute !== undefined
          ? { onHandQty: meta.setAbsolute }
          : { onHandQty: { increment: delta } },
    });

    await db.inventoryLedgerEntry.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        locationId,
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
      },
      include: { balances: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found.');
    return ingredient;
  }

  private isCentralInventoryRole(roleCode?: string | null): boolean {
    return roleCode === 'OWNER_ADMIN' || roleCode === 'STORE_MANAGER';
  }

  private assertCentralInventoryRole(
    ctx: AuthContextDto,
    message: string,
  ): void {
    if (!this.isCentralInventoryRole(ctx.roleCode)) {
      throw new ForbiddenException(message);
    }
  }

  /**
   * Inventory access for managers, owners, and store managers.
   * Branch is optional for network/main-warehouse operations.
   */
  private async requireInventoryAccess(
    userId: string,
    opts?: {
      requireBranch?: boolean;
      action?: AppAction;
      message?: string;
    },
  ): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant on this account.');
    }
    const requireBranch = opts?.requireBranch !== false;
    if (requireBranch && !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    const action = opts?.action ?? 'manage';
    const allowed =
      this.casl.can(context, action, 'Inventory') ||
      this.casl.can(context, 'manage', 'Inventory') ||
      this.casl.can(context, 'manage', 'all');
    if (!allowed) {
      throw new ForbiddenException(
        opts?.message ??
          'Inventory is for managers, owners, and store managers.',
      );
    }
    return context;
  }

  private assertItemKind(value: string): InventoryItemKind {
    if (!(INVENTORY_ITEM_KINDS as readonly string[]).includes(value)) {
      throw new BadRequestException(
        `itemKind must be one of: ${INVENTORY_ITEM_KINDS.join(', ')}`,
      );
    }
    return value as InventoryItemKind;
  }

  private toLedgerDto(r: {
    id: string;
    entryType: string;
    quantityDelta: Prisma.Decimal;
    unitCostSnapshot: Prisma.Decimal | null;
    note: string | null;
    supplierNote: string | null;
    invoiceRef: string | null;
    orderItemId: string | null;
    countSessionId: string | null;
    transferId: string | null;
    productionBatchId: string | null;
    locationId: string | null;
    createdAt: Date;
    ingredient: {
      id: string;
      name: string;
      unit: string;
      unitCost: Prisma.Decimal;
    };
    location?: {
      id: string;
      name: string;
      type: string;
      code: string;
      branch: { id: string; name: string } | null;
    } | null;
    createdBy?: { id: string; employeeDisplayName: string } | null;
  }) {
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
      transferId: r.transferId,
      productionBatchId: r.productionBatchId,
      locationId: r.locationId,
      createdAt: r.createdAt.toISOString(),
      ingredient: {
        id: r.ingredient.id,
        name: r.ingredient.name,
        unit: r.ingredient.unit,
      },
      location: r.location
        ? {
            id: r.location.id,
            name: r.location.name,
            type: r.location.type,
            code: r.location.code,
            branchName: r.location.branch?.name ?? null,
          }
        : null,
      createdByName: r.createdBy?.employeeDisplayName ?? null,
    };
  }

  private toLocationDto(row: {
    id: string;
    code: string;
    name: string;
    type: string;
    isDefault?: boolean;
    status?: string;
    branchId: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    branch?: {
      id: string;
      name: string;
      displayCode: string | null;
    } | null;
  }) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      isDefault: row.isDefault ?? false,
      status: row.status ?? 'ACTIVE',
      branchId: row.branchId,
      branch: row.branch
        ? {
            id: row.branch.id,
            name: row.branch.name,
            displayCode: row.branch.displayCode ?? '',
          }
        : null,
      createdAt: (row.createdAt ?? new Date(0)).toISOString(),
      updatedAt: (row.updatedAt ?? new Date(0)).toISOString(),
    };
  }

  private pageOf(query: InventoryListQueryDto) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
  }

  private toIngredientDto(
    row: {
      id: string;
      name: string;
      unit: string;
      unitCost: Prisma.Decimal;
      parLevel: Prisma.Decimal;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      itemKind?: string;
      standardYieldPercent?: Prisma.Decimal | null;
      balances?: Array<{
        locationId: string | null;
        onHandQty: Prisma.Decimal;
        updatedAt: Date;
      }>;
    },
    locationId?: string | null,
  ) {
    const bal = this.pickBalance(row.balances, locationId ?? null);
    const onHand = num(bal?.onHandQty);
    const par = num(row.parLevel);
    const unitCost = num(row.unitCost);
    const standardYieldPercent =
      row.standardYieldPercent == null ? null : num(row.standardYieldPercent);
    return {
      id: row.id,
      name: row.name,
      unit: row.unit,
      itemKind: row.itemKind ?? 'RAW',
      unitCost,
      standardYieldPercent,
      usableUnitCost: this.usableUnitCostFrom(unitCost, standardYieldPercent),
      stockValue: roundMoney(onHand * unitCost),
      parLevel: par,
      onHandQty: onHand,
      isLowStock: onHand <= par,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: (bal?.updatedAt ?? row.updatedAt).toISOString(),
    };
  }

  /** EP cost = AP cost ÷ (yield%/100). e.g. 40 ÷ 0.8 = 50. */
  private usableUnitCostFrom(
    apUnitCost: number,
    yieldPercent: number | null,
  ): number {
    if (yieldPercent == null || yieldPercent <= 0 || yieldPercent > 100) {
      return apUnitCost;
    }
    return roundMoney4(apUnitCost / (yieldPercent / 100));
  }
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function roundMoney4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}
