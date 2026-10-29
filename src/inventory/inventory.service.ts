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
import { OpsNotifyService } from '../realtime/ops-notify.service';
import { OpsEventType, OpsEventTypeName } from '../realtime/ops-events';
import { branchRoom, managerRoom, tenantRoom } from '../realtime/ops-rooms';
import {
  AcceptTransferDto,
  BranchAnalyticsQueryDto,
  CreateCategoryDto,
  CreateCustomUnitDto,
  CreateDriverDto,
  CreateIngredientDto,
  CreateMainLocationDto,
  CreateMaterialDto,
  CreateProductionBatchDto,
  CreatePushDropDto,
  CreateSupplyRequestDto,
  CreateSupplyRequestV2Dto,
  CreateTransferDto,
  CreateUnitConversionDto,
  DecideSupplyRequestDto,
  DispatchTransferDto,
  INVENTORY_ITEM_KINDS,
  InventoryItemKind,
  InventoryListQueryDto,
  MaterialListQueryDto,
  PostYieldTestDto,
  ReceiveStockBatchDto,
  ReceiveStockDto,
  RejectTransferDto,
  StartCountDto,
  UpdateCategoryDto,
  UpdateCountLinesDto,
  UpdateCustomUnitDto,
  UpdateDriverDto,
  UpdateIngredientDto,
  UpdateLocationDto,
  UpdateMaterialDto,
  UpdateUnitConversionDto,
  UpdateVendorDto,
  UpdateYieldTestDto,
  CreateVendorDto,
  UpsertMaterialBalanceDto,
  WasteStockDto,
} from './dto/inventory.dto';
import { compatibleUnitCodes, roundQty, toBaseQty } from './units';

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
    private readonly opsNotify: OpsNotifyService,
  ) {}

  private emitInventoryEvent(
    tenantId: string,
    branchId: string | null | undefined,
    type: OpsEventTypeName,
    title: string,
    body?: string | null,
    payload?: Record<string, unknown>,
  ) {
    try {
      this.opsNotify.broadcast({
        type,
        tenantId,
        branchId: branchId || '',
        severity: 'INFO',
        title,
        body,
        rooms: [
          tenantRoom(tenantId),
          ...(branchId ? [branchRoom(branchId), managerRoom(branchId)] : []),
        ],
        payload,
      });
    } catch {
      // Real-time broadcast should not block database operations
    }
  }

  // ─── Ingredients ───────────────────────────────────────────────────────────

  async listUnits(userId: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const units = await this.prisma.inventoryUnit.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ tenantId: null }, { tenantId: ctx.tenantId! }],
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return {
      data: units.map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        category: u.category,
        sortOrder: u.sortOrder,
        isBuiltIn: u.tenantId == null,
      })),
    };
  }

  /** Units that can be converted to the given base unit for this tenant. */
  async listCompatibleUnits(userId: string, baseUnit: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const codes = await compatibleUnitCodes(
      this.prisma,
      ctx.tenantId!,
      baseUnit,
    );
    const units = await this.prisma.inventoryUnit.findMany({
      where: {
        code: { in: codes },
        status: 'ACTIVE',
        OR: [{ tenantId: null }, { tenantId: ctx.tenantId! }],
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return {
      data: units.map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        category: u.category,
        sortOrder: u.sortOrder,
        isBuiltIn: u.tenantId == null,
        tenantId: u.tenantId,
      })),
    };
  }

  async createCustomUnit(userId: string, dto: CreateCustomUnitDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'create',
      message: 'Not allowed to manage units.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can manage units.',
    );
    const code = dto.code.trim().toLowerCase();
    const globalClash = await this.prisma.inventoryUnit.findFirst({
      where: { code, tenantId: null },
    });
    if (globalClash) {
      throw new ConflictException(
        `"${code}" is a built-in unit and cannot be redefined.`,
      );
    }
    try {
      const created = await this.prisma.inventoryUnit.create({
        data: {
          tenantId: ctx.tenantId!,
          code,
          name: dto.name.trim(),
          category: dto.category,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      return { data: this.toUnitDto(created) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Unit "${code}" already exists.`);
      }
      throw error;
    }
  }

  async updateCustomUnit(userId: string, id: string, dto: UpdateCustomUnitDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'update',
      message: 'Not allowed to manage units.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can manage units.',
    );
    const unit = await this.prisma.inventoryUnit.findFirst({
      where: { id, tenantId: ctx.tenantId! },
    });
    if (!unit) {
      throw new NotFoundException(
        'Custom unit not found. Built-in units cannot be edited.',
      );
    }
    const updated = await this.prisma.inventoryUnit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return { data: this.toUnitDto(updated) };
  }

  async deleteCustomUnit(userId: string, id: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'update',
      message: 'Not allowed to manage units.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can manage units.',
    );
    const unit = await this.prisma.inventoryUnit.findFirst({
      where: { id, tenantId: ctx.tenantId! },
    });
    if (!unit) {
      throw new NotFoundException(
        'Custom unit not found. Built-in units cannot be deleted.',
      );
    }
    await this.prisma.inventoryUnit.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    return { success: true };
  }

  // ─── Unit conversions (tenant pairs) ──────────────────────────────────────

  async listUnitConversions(userId: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const rows = await this.prisma.inventoryUnitConversion.findMany({
      where: { tenantId: ctx.tenantId! },
      orderBy: [{ fromUnit: 'asc' }, { toUnit: 'asc' }],
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        fromUnit: r.fromUnit,
        toUnit: r.toUnit,
        factor: num(r.factor),
        status: r.status,
      })),
    };
  }

  async createUnitConversion(userId: string, dto: CreateUnitConversionDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'create',
      message: 'Not allowed to manage unit conversions.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can manage unit conversions.',
    );
    const fromUnit = dto.fromUnit.trim();
    const toUnit = dto.toUnit.trim();
    if (fromUnit === toUnit) {
      throw new BadRequestException('fromUnit and toUnit must differ.');
    }
    await this.assertUnitCodeKnown(ctx.tenantId!, fromUnit);
    await this.assertUnitCodeKnown(ctx.tenantId!, toUnit);
    try {
      const created = await this.prisma.inventoryUnitConversion.create({
        data: {
          tenantId: ctx.tenantId!,
          fromUnit,
          toUnit,
          factor: dec(dto.factor),
          createdByMembershipId: ctx.staffMembershipId,
        },
      });
      return { data: this.toConversionDto(created) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `A conversion for ${fromUnit} → ${toUnit} already exists.`,
        );
      }
      throw error;
    }
  }

  async updateUnitConversion(
    userId: string,
    id: string,
    dto: UpdateUnitConversionDto,
  ) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'update',
      message: 'Not allowed to manage unit conversions.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can manage unit conversions.',
    );
    const existing = await this.prisma.inventoryUnitConversion.findFirst({
      where: { id, tenantId: ctx.tenantId! },
    });
    if (!existing) throw new NotFoundException('Unit conversion not found.');
    const updated = await this.prisma.inventoryUnitConversion.update({
      where: { id },
      data: {
        ...(dto.factor !== undefined ? { factor: dec(dto.factor) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return { data: this.toConversionDto(updated) };
  }

  async deleteUnitConversion(userId: string, id: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'update',
      message: 'Not allowed to manage unit conversions.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can manage unit conversions.',
    );
    const existing = await this.prisma.inventoryUnitConversion.findFirst({
      where: { id, tenantId: ctx.tenantId! },
    });
    if (!existing) throw new NotFoundException('Unit conversion not found.');
    await this.prisma.inventoryUnitConversion.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    return { success: true };
  }

  private async assertUnitCodeKnown(tenantId: string, code: string) {
    const unit = await this.prisma.inventoryUnit.findFirst({
      where: { code, OR: [{ tenantId: null }, { tenantId }] },
    });
    if (!unit) {
      throw new BadRequestException(
        `Unknown unit "${code}". Create it under Units first.`,
      );
    }
  }

  private toUnitDto(row: {
    id: string;
    code: string;
    name: string;
    category: string;
    sortOrder: number;
    status: string;
    tenantId?: string | null;
  }) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      sortOrder: row.sortOrder,
      status: row.status,
      isBuiltIn: row.tenantId == null,
    };
  }

  private toConversionDto(row: {
    id: string;
    fromUnit: string;
    toUnit: string;
    factor: Prisma.Decimal;
    status: string;
  }) {
    return {
      id: row.id,
      fromUnit: row.fromUnit,
      toUnit: row.toUnit,
      factor: num(row.factor),
      status: row.status,
    };
  }

  /** Appends "typed qty unit → base qty unit" to a ledger note when a conversion happened. */
  private withConversionNote(
    note: string | null | undefined,
    typedQty: number,
    typedUnit: string | null | undefined,
    baseQty: Prisma.Decimal,
    baseUnit: string,
  ): string | null {
    const converted =
      typedUnit != null && typedUnit !== '' && typedUnit !== baseUnit;
    if (!converted) return note?.trim() || null;
    const suffix = `${typedQty} ${typedUnit} → ${num(baseQty)} ${baseUnit}`;
    return note?.trim() ? `${note.trim()} · ${suffix}` : suffix;
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async listCategories(userId: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const rows = await this.prisma.inventoryCategory.findMany({
      where: {
        tenantId: ctx.tenantId!,
        status: 'ACTIVE',
        OR: [
          { branchId: null },
          ...(ctx.branchId ? [{ branchId: ctx.branchId }] : []),
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            items: {
              where: { status: 'ACTIVE' },
            },
          },
        },
      },
    });

    return {
      data: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        branchId: r.branchId,
        name: r.name,
        amharicName: r.amharicName ?? null,
        code: r.code,
        description: r.description ?? null,
        sortOrder: r.sortOrder,
        status: r.status,
        itemCount: r._count.items,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  async createCategory(userId: string, dto: CreateCategoryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'manage',
    });
    const name = dto.name.trim();
    const code =
      dto.code?.trim().toUpperCase().replace(/\s+/g, '_') ||
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .slice(0, 50);

    const existing = await this.prisma.inventoryCategory.findFirst({
      where: {
        tenantId: ctx.tenantId!,
        OR: [{ code }, { name: { equals: name, mode: 'insensitive' } }],
      },
    });
    if (existing) {
      throw new ConflictException(
        'A category with this name or code already exists.',
      );
    }

    const created = await this.prisma.inventoryCategory.create({
      data: {
        tenantId: ctx.tenantId!,
        branchId: dto.branchId ?? null,
        name,
        amharicName: dto.amharicName?.trim() || null,
        code,
        description: dto.description?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        status: 'ACTIVE',
      },
      include: {
        _count: { select: { items: true } },
      },
    });

    return {
      data: {
        id: created.id,
        tenantId: created.tenantId,
        branchId: created.branchId,
        name: created.name,
        amharicName: created.amharicName,
        code: created.code,
        description: created.description,
        sortOrder: created.sortOrder,
        status: created.status,
        itemCount: 0,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    };
  }

  async updateCategory(userId: string, id: string, dto: UpdateCategoryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'manage',
    });
    const category = await this.prisma.inventoryCategory.findFirst({
      where: { id, tenantId: ctx.tenantId! },
    });
    if (!category) {
      throw new NotFoundException('Inventory category not found.');
    }

    if (dto.name?.trim() && dto.name.trim() !== category.name) {
      const clash = await this.prisma.inventoryCategory.findFirst({
        where: {
          tenantId: ctx.tenantId!,
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (clash) {
        throw new ConflictException(
          'A category with that name already exists.',
        );
      }
    }

    const updated = await this.prisma.inventoryCategory.update({
      where: { id },
      data: {
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
        ...(dto.amharicName !== undefined
          ? { amharicName: dto.amharicName?.trim() || null }
          : {}),
        ...(dto.code?.trim()
          ? { code: dto.code.trim().toUpperCase().replace(/\s+/g, '_') }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.status?.trim() ? { status: dto.status.trim() } : {}),
        ...(dto.branchId !== undefined
          ? { branchId: dto.branchId || null }
          : {}),
      },
      include: {
        _count: { select: { items: true } },
      },
    });

    return {
      data: {
        id: updated.id,
        tenantId: updated.tenantId,
        branchId: updated.branchId,
        name: updated.name,
        amharicName: updated.amharicName,
        code: updated.code,
        description: updated.description,
        sortOrder: updated.sortOrder,
        status: updated.status,
        itemCount: updated._count.items,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  async deleteCategory(userId: string, id: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'manage',
    });
    const category = await this.prisma.inventoryCategory.findFirst({
      where: { id, tenantId: ctx.tenantId! },
    });
    if (!category) {
      throw new NotFoundException('Inventory category not found.');
    }

    // Unlink items from this category rather than cascade deleting items
    await this.prisma.inventoryIngredient.updateMany({
      where: { tenantId: ctx.tenantId!, categoryId: id },
      data: { categoryId: null },
    });

    await this.prisma.inventoryCategory.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    return { success: true };
  }

  private async assertKnownUnit(tenantId: string, code: string) {
    const unit = await this.prisma.inventoryUnit.findFirst({
      where: {
        code,
        status: 'ACTIVE',
        OR: [{ tenantId: null }, { tenantId }],
      },
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
      const fallbackLocation = await db.inventoryLocation.findFirst({
        where: {
          tenantId: ctx.tenantId!,
          status: 'ACTIVE',
        },
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      });
      if (fallbackLocation) {
        return fallbackLocation;
      }
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
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
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
          category: {
            select: { id: true, name: true, amharicName: true, code: true },
          },
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
    const unit = await this.assertKnownUnit(ctx.tenantId!, dto.unit.trim());
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
          categoryId: dto.categoryId || null,
          name,
          unit,
          itemKind,
          unitCost: dec(dto.unitCost ?? 0),
          parLevel: dec(dto.parLevel ?? 0),
          status: 'ACTIVE',
          imageUrl: dto.imageUrl?.trim() || null,
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
        include: {
          balances: true,
          category: {
            select: { id: true, name: true, amharicName: true, code: true },
          },
        },
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
        ? await this.assertKnownUnit(ctx.tenantId!, dto.unit.trim())
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
        ...(dto.imageUrl !== undefined
          ? { imageUrl: dto.imageUrl?.trim() || null }
          : {}),
        ...(dto.categoryId !== undefined
          ? { categoryId: dto.categoryId || null }
          : {}),
      },
      include: {
        balances: true,
        category: {
          select: { id: true, name: true, amharicName: true, code: true },
        },
      },
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
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.q?.trim()
          ? { name: { contains: query.q.trim(), mode: 'insensitive' } }
          : {}),
      },
      include: {
        balances: locationId ? { where: { locationId } } : true,
        category: {
          select: { id: true, name: true, amharicName: true, code: true },
        },
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
        imageUrl: ing.imageUrl ?? null,
        categoryId: ing.categoryId ?? null,
        category: ing.category ?? null,
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
    let vendor: any = null;
    if (dto.vendorId) {
      vendor = await this.prisma.vendor.findFirst({
        where: {
          id: dto.vendorId,
          tenantId: ctx.tenantId!,
          status: 'ACTIVE',
        },
      });
      if (!vendor) {
        throw new BadRequestException('Vendor not found or inactive.');
      }
    }
    const qty = dec(
      roundQty(
        await toBaseQty(
          this.prisma,
          ctx.tenantId!,
          dto.quantity,
          dto.unit,
          ingredient.unit,
          ingredient.name,
        ),
      ),
    );
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
          vendorId: vendor?.id ?? null,
          note: this.withConversionNote(
            dto.note,
            dto.quantity,
            dto.unit,
            qty,
            ingredient.unit,
          ),
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

  async receiveBatch(userId: string, dto: ReceiveStockBatchDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one item must be received.');
    }
    let vendor: any = null;
    if (dto.vendorId) {
      vendor = await this.prisma.vendor.findFirst({
        where: {
          id: dto.vendorId,
          tenantId: ctx.tenantId!,
          status: 'ACTIVE',
        },
      });
      if (!vendor) {
        throw new BadRequestException('Vendor not found or inactive.');
      }
    }

    // Pre-validate all ingredients and pre-calculate base quantities
    const preparedItems: {
      ingredient: any;
      qty: any;
      item: (typeof dto.items)[number];
    }[] = [];

    for (const item of dto.items) {
      const ingredient = await this.findIngredient(ctx, item.ingredientId);
      const qty = dec(
        roundQty(
          await toBaseQty(
            this.prisma,
            ctx.tenantId!,
            item.quantity,
            item.unit,
            ingredient.unit,
            ingredient.name,
          ),
        ),
      );
      preparedItems.push({ ingredient, qty, item });
    }

    // Atomic transaction for all items
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

      for (const { ingredient, qty, item } of preparedItems) {
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
            unitCost: item.unitCost,
            vendorId: vendor?.id ?? null,
            note: this.withConversionNote(
              dto.note,
              item.quantity,
              item.unit,
              qty,
              ingredient.unit,
            ),
            invoiceRef: dto.invoiceRef,
          },
        );
        if (item.unitCost !== undefined) {
          await tx.inventoryIngredient.update({
            where: { id: ingredient.id },
            data: { unitCost: dec(item.unitCost) },
          });
        }
      }
    });

    return {
      data: {
        receivedCount: preparedItems.length,
        vendorId: vendor?.id ?? null,
        vendorName: vendor?.name ?? null,
        invoiceRef: dto.invoiceRef ?? null,
      },
    };
  }

  async waste(userId: string, dto: WasteStockDto) {
    const ctx = await this.requireInventoryAccess(userId);
    const ingredient = await this.findIngredient(ctx, dto.ingredientId);
    const qty = dec(
      roundQty(
        await toBaseQty(
          this.prisma,
          ctx.tenantId!,
          dto.quantity,
          dto.unit,
          ingredient.unit,
          ingredient.name,
        ),
      ),
    );
    await this.applyDelta(
      this.prisma,
      {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        staffMembershipId: ctx.staffMembershipId,
      },
      ingredient.id,
      qty.negated(),
      {
        entryType: 'WASTE',
        unitCost: num(ingredient.unitCost),
        note: this.withConversionNote(
          dto.note ?? 'Waste',
          dto.quantity,
          dto.unit,
          qty,
          ingredient.unit,
        ),
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

    const typedUnit = dto.unit ?? ingredient.unit;
    const purchased = roundQty(
      await toBaseQty(
        this.prisma,
        ctx.tenantId!,
        dto.purchasedQuantity,
        typedUnit,
        ingredient.unit,
        ingredient.name,
      ),
    );
    const usable = roundQty(
      await toBaseQty(
        this.prisma,
        ctx.tenantId!,
        dto.usableQuantity,
        typedUnit,
        ingredient.unit,
        ingredient.name,
      ),
    );
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
          unit: typedUnit,
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

    const typedUnit = dto.unit ?? existing.unit ?? existing.ingredient.unit;
    const hasNewQuantity =
      dto.purchasedQuantity !== undefined || dto.usableQuantity !== undefined;
    const purchased =
      dto.purchasedQuantity !== undefined
        ? roundQty(
            await toBaseQty(
              this.prisma,
              ctx.tenantId!,
              dto.purchasedQuantity,
              typedUnit,
              existing.ingredient.unit,
              existing.ingredient.name,
            ),
          )
        : num(existing.purchasedQuantity);
    const usable =
      dto.usableQuantity !== undefined
        ? roundQty(
            await toBaseQty(
              this.prisma,
              ctx.tenantId!,
              dto.usableQuantity,
              typedUnit,
              existing.ingredient.unit,
              existing.ingredient.name,
            ),
          )
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
          ...(hasNewQuantity ? { unit: typedUnit } : {}),
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
    unit: string | null;
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
      unit: row.unit,
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
              {
                vendor: {
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
          vendor: {
            select: { id: true, name: true, type: true, phone: true },
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

  // ─── Analytics (restaurant view) ───────────────────────────────────────────

  async getBranchAnalytics(userId: string, query: BranchAnalyticsQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });

    const range =
      query.range === 'week' || query.range === 'month' ? query.range : 'today';
    const days = range === 'week' ? 7 : range === 'month' ? 30 : 1;
    const now = new Date();
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);

    // Restaurant managers see their own branch store; central roles see all branch stores.
    let locationIds: string[];
    if (this.isCentralInventoryRole(ctx.roleCode)) {
      const branchLocations = await this.prisma.inventoryLocation.findMany({
        where: {
          tenantId: ctx.tenantId!,
          type: 'BRANCH_STORE',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      locationIds = branchLocations.map((l) => l.id);
    } else {
      if (!ctx.branchId) {
        throw new ForbiddenException('No restaurant branch on this account.');
      }
      const store = await this.ensureDefaultLocation(
        ctx.tenantId!,
        ctx.branchId,
      );
      locationIds = [store.id];
    }

    const [entries, balances, incomingTransfers, change24h, ingredients] =
      await Promise.all([
        this.prisma.inventoryLedgerEntry.findMany({
          where: {
            tenantId: ctx.tenantId!,
            ...(locationIds.length ? { locationId: { in: locationIds } } : {}),
            createdAt: { gte: from, lte: to },
            entryType: {
              in: [
                'SALE_DEPLETE',
                'PRODUCE_CONSUME',
                'WASTE',
                'RECEIVE',
                'TRANSFER_IN',
              ],
            },
          },
          select: {
            createdAt: true,
            entryType: true,
            quantityDelta: true,
            unitCostSnapshot: true,
            ingredientId: true,
            ingredient: { select: { name: true, unit: true, unitCost: true } },
            orderItem: { select: { itemNameSnapshot: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.inventoryStockBalance.findMany({
          where: {
            tenantId: ctx.tenantId!,
            ...(locationIds.length ? { locationId: { in: locationIds } } : {}),
          },
          select: {
            ingredientId: true,
            onHandQty: true,
            ingredient: {
              select: {
                name: true,
                unit: true,
                unitCost: true,
                parLevel: true,
              },
            },
          },
        }),
        this.prisma.inventoryTransfer.findMany({
          where: {
            tenantId: ctx.tenantId!,
            toLocationId: { in: locationIds },
            status: { in: ['SENT', 'IN_TRANSIT', 'ARRIVED'] },
          },
          select: {
            id: true,
            status: true,
            sentAt: true,
            fromLocation: { select: { name: true } },
            toLocation: { select: { name: true } },
            lines: {
              select: {
                ingredientId: true,
                quantitySent: true,
                ingredient: {
                  select: { name: true, unit: true, unitCost: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.inventoryLedgerEntry.groupBy({
          by: ['ingredientId'],
          where: {
            tenantId: ctx.tenantId!,
            ...(locationIds.length ? { locationId: { in: locationIds } } : {}),
            createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
          _sum: { quantityDelta: true },
        }),
        this.prisma.inventoryIngredient.findMany({
          where: { tenantId: ctx.tenantId!, status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            unit: true,
            unitCost: true,
            parLevel: true,
          },
          orderBy: { name: 'asc' },
        }),
      ]);

    const round3 = (v: number) => Math.round(v * 1000) / 1000;

    // Local (UTC+3) calendar day keys; toISOString would shift midnight boundaries.
    const localDayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;

    type DayBucket = {
      date: string;
      used: number;
      waste: number;
      received: number;
    };
    const buckets = new Map<string, DayBucket>();
    const cursor = new Date(from);
    while (cursor <= to) {
      const key = localDayKey(cursor);
      buckets.set(key, { date: key, used: 0, waste: 0, received: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    type ItemAgg = {
      ingredientId: string;
      name: string;
      unit: string;
      unitCost: number;
      parLevel: number;
      onHandQty: number;
      incomingQty: number;
      usedQty: number;
      usedValue: number;
      wasteQty: number;
      wasteValue: number;
      change24h: number;
      dailyUsed: number[];
      dailyReceived: number[];
      usedBy: Map<string, number>;
    };
    const itemMap = new Map<string, ItemAgg>();
    const ensureItem = (
      id: string,
      name: string,
      unit: string,
      unitCost: number,
    ): ItemAgg => {
      let agg = itemMap.get(id);
      if (!agg) {
        agg = {
          ingredientId: id,
          name,
          unit,
          unitCost,
          parLevel: 0,
          onHandQty: 0,
          incomingQty: 0,
          usedQty: 0,
          usedValue: 0,
          wasteQty: 0,
          wasteValue: 0,
          change24h: 0,
          dailyUsed: new Array<number>(days).fill(0),
          dailyReceived: new Array<number>(days).fill(0),
          usedBy: new Map(),
        };
        itemMap.set(id, agg);
      }
      return agg;
    };

    const bucketDates = Array.from(buckets.keys());
    const bucketIndex = new Map(bucketDates.map((d, i) => [d, i]));
    const change24hByIngredient = new Map(
      change24h.map((r) => [r.ingredientId, num(r._sum.quantityDelta)]),
    );

    for (const ingredient of ingredients) {
      const agg = ensureItem(
        ingredient.id,
        ingredient.name,
        ingredient.unit,
        num(ingredient.unitCost),
      );
      agg.parLevel = num(ingredient.parLevel);
      agg.change24h = change24hByIngredient.get(ingredient.id) ?? 0;
    }

    type MenuIngAgg = {
      ingredientId: string;
      name: string;
      unit: string;
      totalQty: number;
      value: number;
      daily: number[];
    };
    type MenuAgg = { name: string; ingredients: Map<string, MenuIngAgg> };
    const menuMap = new Map<string, MenuAgg>();

    for (const balance of balances) {
      const agg = ensureItem(
        balance.ingredientId,
        balance.ingredient.name,
        balance.ingredient.unit,
        num(balance.ingredient.unitCost),
      );
      agg.onHandQty += num(balance.onHandQty);
    }

    for (const transfer of incomingTransfers) {
      for (const line of transfer.lines) {
        const agg = ensureItem(
          line.ingredientId,
          line.ingredient.name,
          line.ingredient.unit,
          num(line.ingredient.unitCost),
        );
        agg.incomingQty += num(line.quantitySent);
      }
    }

    for (const entry of entries) {
      const qty = Math.abs(num(entry.quantityDelta));
      const unitCost =
        entry.unitCostSnapshot != null
          ? num(entry.unitCostSnapshot)
          : num(entry.ingredient.unitCost);
      const value = roundMoney(qty * unitCost);
      const key = localDayKey(entry.createdAt);
      const bucket = buckets.get(key);

      if (entry.entryType === 'RECEIVE' || entry.entryType === 'TRANSFER_IN') {
        if (bucket) bucket.received += qty;
        const idx = bucketIndex.get(key);
        if (idx !== undefined) {
          const rAgg = ensureItem(
            entry.ingredientId,
            entry.ingredient.name,
            entry.ingredient.unit,
            num(entry.ingredient.unitCost),
          );
          rAgg.dailyReceived[idx] += qty;
        }
        continue;
      }

      const agg = ensureItem(
        entry.ingredientId,
        entry.ingredient.name,
        entry.ingredient.unit,
        num(entry.ingredient.unitCost),
      );

      if (entry.entryType === 'WASTE') {
        if (bucket) bucket.waste += qty;
        agg.wasteQty += qty;
        agg.wasteValue += value;
      } else {
        if (bucket) bucket.used += qty;
        const idx = bucketIndex.get(key);
        if (idx !== undefined) agg.dailyUsed[idx] += qty;
        agg.usedQty += qty;
        agg.usedValue += value;
        const label =
          entry.entryType === 'PRODUCE_CONSUME'
            ? 'Kitchen production'
            : entry.orderItem?.itemNameSnapshot || 'Other sales';
        agg.usedBy.set(label, (agg.usedBy.get(label) ?? 0) + qty);

        if (entry.entryType === 'SALE_DEPLETE') {
          const menuName = entry.orderItem?.itemNameSnapshot || 'Other sales';
          let menuAgg = menuMap.get(menuName);
          if (!menuAgg) {
            menuAgg = { name: menuName, ingredients: new Map() };
            menuMap.set(menuName, menuAgg);
          }
          let ingAgg = menuAgg.ingredients.get(entry.ingredientId);
          if (!ingAgg) {
            ingAgg = {
              ingredientId: entry.ingredientId,
              name: entry.ingredient.name,
              unit: entry.ingredient.unit,
              totalQty: 0,
              value: 0,
              daily: new Array<number>(days).fill(0),
            };
            menuAgg.ingredients.set(entry.ingredientId, ingAgg);
          }
          ingAgg.totalQty += qty;
          ingAgg.value += value;
          if (idx !== undefined) ingAgg.daily[idx] += qty;
        }
      }
    }

    let usedQty = 0;
    let usedValue = 0;
    let wasteQty = 0;
    let wasteValue = 0;
    let stockValue = 0;
    const lowStockIds = new Set<string>();
    for (const agg of itemMap.values()) {
      usedQty += agg.usedQty;
      usedValue += agg.usedValue;
      wasteQty += agg.wasteQty;
      wasteValue += agg.wasteValue;
      stockValue += agg.onHandQty * agg.unitCost;
      if (agg.parLevel > 0 && agg.onHandQty <= agg.parLevel) {
        lowStockIds.add(agg.ingredientId);
      }
    }

    return {
      data: {
        range,
        from: from.toISOString(),
        to: to.toISOString(),
        summary: {
          usedQty: round3(usedQty),
          usedValue: roundMoney(usedValue),
          wasteQty: round3(wasteQty),
          wasteValue: roundMoney(wasteValue),
          incomingCount: incomingTransfers.length,
          stockValue: roundMoney(stockValue),
          lowStockCount: lowStockIds.size,
        },
        trend: Array.from(buckets.values()).map((b) => ({
          date: b.date,
          used: round3(b.used),
          waste: round3(b.waste),
          received: round3(b.received),
        })),
        incomingTransfers: incomingTransfers.map((t) => ({
          id: t.id,
          status: t.status,
          fromName: t.fromLocation?.name ?? null,
          toName: t.toLocation?.name ?? null,
          sentAt: t.sentAt?.toISOString() ?? null,
        })),
        items: Array.from(itemMap.values())
          .map((a) => ({
            ingredientId: a.ingredientId,
            name: a.name,
            unit: a.unit,
            onHandQty: round3(a.onHandQty),
            incomingQty: round3(a.incomingQty),
            usedQty: round3(a.usedQty),
            usedValue: roundMoney(a.usedValue),
            wasteQty: round3(a.wasteQty),
            wasteValue: roundMoney(a.wasteValue),
            change24h: round3(a.change24h),
            dailyUsed: a.dailyUsed.map((v) => round3(v)),
            dailyReceived: a.dailyReceived.map((v) => round3(v)),
            usedBy: Array.from(a.usedBy.entries())
              .map(([label, qty]) => ({ label, qty: round3(qty) }))
              .sort((x, y) => y.qty - x.qty),
          }))
          .sort(
            (x, y) =>
              y.usedQty - x.usedQty ||
              y.onHandQty - x.onHandQty ||
              x.name.localeCompare(y.name),
          ),
        menuItems: Array.from(menuMap.values())
          .map((m) => {
            const ingredients = Array.from(m.ingredients.values())
              .map((i) => ({
                ingredientId: i.ingredientId,
                name: i.name,
                unit: i.unit,
                totalQty: round3(i.totalQty),
                value: roundMoney(i.value),
                daily: i.daily.map((v) => round3(v)),
              }))
              .sort((a, b) => b.totalQty - a.totalQty);
            const value = ingredients.reduce((sum, i) => sum + i.value, 0);
            return { name: m.name, value: roundMoney(value), ingredients };
          })
          .sort((a, b) => b.value - a.value),
      },
    };
  }

  async getCentralAnalytics(userId: string, query: BranchAnalyticsQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can view central analytics.',
    );

    const range =
      query.range === 'week' || query.range === 'month' ? query.range : 'today';
    const days = range === 'week' ? 7 : range === 'month' ? 30 : 1;
    const now = new Date();
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);

    const main = await this.findMainWarehouse(ctx.tenantId!);
    if (!main) {
      throw new BadRequestException(
        'Enable a main warehouse before viewing central analytics.',
      );
    }

    const [
      entries,
      balances,
      change24h,
      ingredients,
      transfers,
      pendingRequests,
      inTransitCount,
    ] = await Promise.all([
      this.prisma.inventoryLedgerEntry.findMany({
        where: {
          tenantId: ctx.tenantId!,
          locationId: main.id,
          createdAt: { gte: from, lte: to },
          entryType: { in: ['RECEIVE', 'TRANSFER_OUT', 'WASTE'] },
        },
        select: {
          createdAt: true,
          entryType: true,
          quantityDelta: true,
          unitCostSnapshot: true,
          ingredientId: true,
          vendorId: true,
          vendor: { select: { name: true } },
          ingredient: { select: { name: true, unit: true, unitCost: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.inventoryStockBalance.findMany({
        where: { tenantId: ctx.tenantId!, locationId: main.id },
        select: {
          ingredientId: true,
          onHandQty: true,
          ingredient: {
            select: { name: true, unit: true, unitCost: true, parLevel: true },
          },
        },
      }),
      this.prisma.inventoryLedgerEntry.groupBy({
        by: ['ingredientId'],
        where: {
          tenantId: ctx.tenantId!,
          locationId: main.id,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        _sum: { quantityDelta: true },
      }),
      this.prisma.inventoryIngredient.findMany({
        where: { tenantId: ctx.tenantId!, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          unit: true,
          unitCost: true,
          parLevel: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.inventoryTransfer.findMany({
        where: {
          tenantId: ctx.tenantId!,
          fromLocationId: main.id,
          status: { in: ['SENT', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED'] },
          sentAt: { gte: from, lte: to },
        },
        select: {
          status: true,
          sentAt: true,
          toLocation: { select: { name: true } },
          lines: {
            select: {
              ingredientId: true,
              quantitySent: true,
              ingredient: {
                select: { name: true, unit: true, unitCost: true },
              },
            },
          },
        },
        orderBy: { sentAt: 'asc' },
      }),
      this.prisma.inventorySupplyRequest.findMany({
        where: {
          tenantId: ctx.tenantId!,
          toLocationId: main.id,
          status: 'SUBMITTED',
        },
        include: this.supplyInclude(),
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.inventoryTransfer.count({
        where: {
          tenantId: ctx.tenantId!,
          fromLocationId: main.id,
          status: { in: ['SENT', 'IN_TRANSIT', 'ARRIVED'] },
        },
      }),
    ]);

    const round3 = (v: number) => Math.round(v * 1000) / 1000;

    // Local (UTC+3) calendar day keys; toISOString would shift midnight boundaries.
    const localDayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;

    type DayBucket = { date: string; received: number; sent: number };
    const buckets = new Map<string, DayBucket>();
    const cursor = new Date(from);
    while (cursor <= to) {
      const key = localDayKey(cursor);
      buckets.set(key, { date: key, received: 0, sent: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    const bucketDates = Array.from(buckets.keys());
    const bucketIndex = new Map(bucketDates.map((d, i) => [d, i]));

    type ItemAgg = {
      ingredientId: string;
      name: string;
      unit: string;
      unitCost: number;
      parLevel: number;
      onHandQty: number;
      receivedQty: number;
      receivedValue: number;
      sentQty: number;
      sentValue: number;
      wasteQty: number;
      wasteValue: number;
      change24h: number;
      dailyReceived: number[];
      dailySent: number[];
    };
    const itemMap = new Map<string, ItemAgg>();
    const ensureItem = (
      id: string,
      name: string,
      unit: string,
      unitCost: number,
    ): ItemAgg => {
      let agg = itemMap.get(id);
      if (!agg) {
        agg = {
          ingredientId: id,
          name,
          unit,
          unitCost,
          parLevel: 0,
          onHandQty: 0,
          receivedQty: 0,
          receivedValue: 0,
          sentQty: 0,
          sentValue: 0,
          wasteQty: 0,
          wasteValue: 0,
          change24h: 0,
          dailyReceived: new Array<number>(days).fill(0),
          dailySent: new Array<number>(days).fill(0),
        };
        itemMap.set(id, agg);
      }
      return agg;
    };

    const change24hByIngredient = new Map(
      change24h.map((r) => [r.ingredientId, num(r._sum.quantityDelta)]),
    );

    for (const ingredient of ingredients) {
      const agg = ensureItem(
        ingredient.id,
        ingredient.name,
        ingredient.unit,
        num(ingredient.unitCost),
      );
      agg.parLevel = num(ingredient.parLevel);
      agg.change24h = change24hByIngredient.get(ingredient.id) ?? 0;
    }

    for (const balance of balances) {
      const agg = ensureItem(
        balance.ingredientId,
        balance.ingredient.name,
        balance.ingredient.unit,
        num(balance.ingredient.unitCost),
      );
      agg.onHandQty += num(balance.onHandQty);
    }

    type VendorAgg = {
      vendorName: string;
      qty: number;
      value: number;
      daily: number[];
    };
    const vendorMap = new Map<string, VendorAgg>();

    type BranchAgg = {
      branchName: string;
      qty: number;
      value: number;
      daily: number[];
    };
    const branchMap = new Map<string, BranchAgg>();

    for (const entry of entries) {
      const qty = Math.abs(num(entry.quantityDelta));
      const unitCost =
        entry.unitCostSnapshot != null
          ? num(entry.unitCostSnapshot)
          : num(entry.ingredient.unitCost);
      const value = roundMoney(qty * unitCost);
      const key = localDayKey(entry.createdAt);
      const bucket = buckets.get(key);
      const idx = bucketIndex.get(key);

      if (entry.entryType === 'RECEIVE') {
        if (bucket) bucket.received += qty;
        const agg = ensureItem(
          entry.ingredientId,
          entry.ingredient.name,
          entry.ingredient.unit,
          num(entry.ingredient.unitCost),
        );
        agg.receivedQty += qty;
        agg.receivedValue += value;
        if (idx !== undefined) agg.dailyReceived[idx] += qty;

        const vendorKey = entry.vendorId ?? 'unknown';
        let vAgg = vendorMap.get(vendorKey);
        if (!vAgg) {
          vAgg = {
            vendorName: entry.vendor?.name ?? 'Unknown vendor',
            qty: 0,
            value: 0,
            daily: new Array<number>(days).fill(0),
          };
          vendorMap.set(vendorKey, vAgg);
        }
        vAgg.qty += qty;
        vAgg.value += value;
        if (idx !== undefined) vAgg.daily[idx] += qty;
      } else if (entry.entryType === 'TRANSFER_OUT') {
        if (bucket) bucket.sent += qty;
        const agg = ensureItem(
          entry.ingredientId,
          entry.ingredient.name,
          entry.ingredient.unit,
          num(entry.ingredient.unitCost),
        );
        agg.sentQty += qty;
        agg.sentValue += value;
        if (idx !== undefined) agg.dailySent[idx] += qty;
      } else if (entry.entryType === 'WASTE') {
        const agg = ensureItem(
          entry.ingredientId,
          entry.ingredient.name,
          entry.ingredient.unit,
          num(entry.ingredient.unitCost),
        );
        agg.wasteQty += qty;
        agg.wasteValue += value;
      }
    }

    for (const transfer of transfers) {
      const key = transfer.sentAt ? localDayKey(transfer.sentAt) : null;
      const idx = key ? bucketIndex.get(key) : undefined;
      const branchName = transfer.toLocation?.name ?? 'Unknown branch';
      let bAgg = branchMap.get(branchName);
      if (!bAgg) {
        bAgg = {
          branchName,
          qty: 0,
          value: 0,
          daily: new Array<number>(days).fill(0),
        };
        branchMap.set(branchName, bAgg);
      }
      for (const line of transfer.lines) {
        const qty = num(line.quantitySent);
        bAgg.qty += qty;
        bAgg.value += roundMoney(qty * num(line.ingredient.unitCost));
        if (idx !== undefined) bAgg.daily[idx] += qty;
      }
    }

    let receivedQty = 0;
    let receivedValue = 0;
    let sentQty = 0;
    let sentValue = 0;
    let wasteQty = 0;
    let wasteValue = 0;
    let stockValue = 0;
    const lowStockIds = new Set<string>();
    for (const agg of itemMap.values()) {
      receivedQty += agg.receivedQty;
      receivedValue += agg.receivedValue;
      sentQty += agg.sentQty;
      sentValue += agg.sentValue;
      wasteQty += agg.wasteQty;
      wasteValue += agg.wasteValue;
      stockValue += agg.onHandQty * agg.unitCost;
      if (agg.parLevel > 0 && agg.onHandQty <= agg.parLevel) {
        lowStockIds.add(agg.ingredientId);
      }
    }

    return {
      data: {
        range,
        from: from.toISOString(),
        to: to.toISOString(),
        summary: {
          receivedQty: round3(receivedQty),
          receivedValue: roundMoney(receivedValue),
          sentQty: round3(sentQty),
          sentValue: roundMoney(sentValue),
          wasteQty: round3(wasteQty),
          wasteValue: roundMoney(wasteValue),
          pendingRequests: pendingRequests.length,
          inTransit: inTransitCount,
          stockValue: roundMoney(stockValue),
          lowStockCount: lowStockIds.size,
        },
        trend: Array.from(buckets.values()).map((b) => ({
          date: b.date,
          received: round3(b.received),
          sent: round3(b.sent),
        })),
        items: Array.from(itemMap.values())
          .map((a) => ({
            ingredientId: a.ingredientId,
            name: a.name,
            unit: a.unit,
            onHandQty: round3(a.onHandQty),
            receivedQty: round3(a.receivedQty),
            receivedValue: roundMoney(a.receivedValue),
            sentQty: round3(a.sentQty),
            sentValue: roundMoney(a.sentValue),
            wasteQty: round3(a.wasteQty),
            wasteValue: roundMoney(a.wasteValue),
            change24h: round3(a.change24h),
            dailyReceived: a.dailyReceived.map((v) => round3(v)),
            dailySent: a.dailySent.map((v) => round3(v)),
          }))
          .sort(
            (x, y) =>
              y.sentQty - x.sentQty ||
              y.receivedQty - x.receivedQty ||
              y.onHandQty - x.onHandQty ||
              x.name.localeCompare(y.name),
          ),
        sentPerBranch: Array.from(branchMap.values())
          .map((b) => ({
            branchName: b.branchName,
            qty: round3(b.qty),
            value: roundMoney(b.value),
            daily: b.daily.map((v) => round3(v)),
          }))
          .sort((x, y) => y.qty - x.qty),
        receivedPerVendor: Array.from(vendorMap.values())
          .map((v) => ({
            vendorName: v.vendorName,
            qty: round3(v.qty),
            value: roundMoney(v.value),
            daily: v.daily.map((n) => round3(n)),
          }))
          .sort((x, y) => y.qty - x.qty),
        pendingRequests: pendingRequests.map((r) => ({
          id: r.id,
          status: r.status,
          fromName: r.fromLocation?.name ?? null,
          note: r.note,
          requestedAt: r.createdAt.toISOString(),
          lines: r.lines.map((l) => ({
            ingredientId: l.ingredientId,
            name: l.ingredient.name,
            unit: l.ingredient.unit,
            quantityRequested: round3(num(l.quantityRequested)),
          })),
        })),
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
        vendor: {
          select: { id: true, name: true, type: true, phone: true },
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
          countedUnit: l.countedUnit ?? l.ingredient.unit,
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
        const ingredient = await tx.inventoryIngredient.findFirst({
          where: { id: line.ingredientId, tenantId: ctx.tenantId! },
          select: { id: true, unit: true, name: true },
        });
        if (!ingredient) {
          throw new NotFoundException(
            `Ingredient ${line.ingredientId} not found.`,
          );
        }
        const baseQty = roundQty(
          await toBaseQty(
            tx,
            ctx.tenantId!,
            line.countedQty,
            line.unit ?? ingredient.unit,
            ingredient.unit,
            ingredient.name,
          ),
        );
        await tx.inventoryCountLine.updateMany({
          where: {
            countSessionId: sessionId,
            ingredientId: line.ingredientId,
          },
          data: {
            countedQty: dec(baseQty),
            countedUnit: line.unit ?? ingredient.unit,
          },
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
        ingredient: {
          select: { standardYieldPercent: true, unit: true, name: true },
        },
      },
    });
    if (recipe.length === 0) return;

    for (const line of recipe) {
      // Recipe qty is editable portion (EP) in the line's typed unit.
      const typedUnit = line.unit ?? line.ingredient.unit;
      const epPerServingBase = roundQty(
        await toBaseQty(
          tx,
          orderItem.tenantId,
          num(line.quantityPerServing),
          typedUnit,
          line.ingredient.unit,
          line.ingredient.name,
        ),
      );
      // Convert EP to purchased (AP) using yield %.
      const yieldPct = num(line.ingredient.standardYieldPercent);
      const yieldFrac = yieldPct > 0 && yieldPct <= 100 ? yieldPct / 100 : 1;
      const epPerServing = epPerServingBase;
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
    lines: {
      ingredientId: string;
      quantityPerServing: number;
      unit?: string;
    }[],
  ): Promise<void> {
    await tx.menuItemRecipeLine.deleteMany({ where: { menuItemId } });
    if (lines.length === 0) return;
    const converted = await Promise.all(
      lines.map(async (l) => {
        const ingredient = await tx.inventoryIngredient.findFirst({
          where: { id: l.ingredientId, tenantId },
          select: { id: true, unit: true, name: true },
        });
        if (!ingredient) {
          throw new NotFoundException(
            `Ingredient ${l.ingredientId} not found.`,
          );
        }
        const typedUnit = l.unit ?? ingredient.unit;
        return {
          ingredientId: l.ingredientId,
          quantityPerServing: roundQty(
            await toBaseQty(
              tx,
              tenantId,
              l.quantityPerServing,
              typedUnit,
              ingredient.unit,
              ingredient.name,
            ),
          ),
          unit: typedUnit,
        };
      }),
    );
    await tx.menuItemRecipeLine.createMany({
      data: converted.map((l, index) => ({
        tenantId,
        menuItemId,
        ingredientId: l.ingredientId,
        quantityPerServing: dec(l.quantityPerServing),
        unit: l.unit,
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
      where.status = query.status || { in: ['SENT', 'IN_TRANSIT', 'ARRIVED'] };
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
  async createAndSendTransfer(
    userId: string,
    dto: CreateTransferDto & { _driverId?: string; _pushDropId?: string },
  ) {
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

    // Convert every line to its ingredient's base unit before merging,
    // so 100 g + 0.1 kg of the same ingredient merge correctly.
    const convertedLines = await Promise.all(
      dto.lines.map(async (line) => {
        const ingredient = await this.prisma.inventoryIngredient.findFirst({
          where: { id: line.ingredientId, tenantId: ctx.tenantId! },
        });
        if (!ingredient) {
          throw new NotFoundException(
            `Ingredient ${line.ingredientId} not found.`,
          );
        }
        const quantity = roundQty(
          await toBaseQty(
            this.prisma,
            ctx.tenantId!,
            line.quantity,
            line.unit,
            ingredient.unit,
            ingredient.name,
          ),
        );
        return {
          ingredientId: line.ingredientId,
          quantity,
          unit: line.unit?.trim() || ingredient.unit,
          ingredientName: ingredient.name,
        };
      }),
    );
    const merged = this.mergeTransferLines(
      convertedLines.map((l) => ({
        ingredientId: l.ingredientId,
        quantity: l.quantity,
      })),
    );
    const unitByIngredient = new Map<string, string | null>();
    for (const line of merged) {
      const units = convertedLines
        .filter((l) => l.ingredientId === line.ingredientId)
        .map((l) => l.unit);
      const uniform = units.every((u) => u === units[0]);
      unitByIngredient.set(line.ingredientId, uniform ? units[0] : null);
    }

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
          ...(dto._driverId
            ? { driverId: dto._driverId, dispatchedAt: new Date() }
            : {}),
          ...(dto._pushDropId ? { pushDropId: dto._pushDropId } : {}),
          lines: {
            create: merged.map((line) => ({
              ingredientId: line.ingredientId,
              quantitySent: dec(line.quantity),
              unitSent: unitByIngredient.get(line.ingredientId) ?? null,
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
    if (
      transfer.status !== 'SENT' &&
      transfer.status !== 'IN_TRANSIT' &&
      transfer.status !== 'ARRIVED'
    ) {
      throw new BadRequestException(
        `Only SENT, IN_TRANSIT, or ARRIVED transfers can be accepted (current: ${transfer.status}).`,
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
    const receiveUnitByIngredient = new Map<string, string | null>();
    if (dto.lines?.length) {
      for (const line of dto.lines) {
        receiveByIngredient.set(
          line.ingredientId,
          (receiveByIngredient.get(line.ingredientId) ?? 0) +
            Number(line.quantityReceived),
        );
        receiveUnitByIngredient.set(
          line.ingredientId,
          line.unit?.trim() || null,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of transfer.lines) {
        const sent = num(line.quantitySent);
        const receivedRaw = receiveByIngredient.has(line.ingredientId)
          ? (receiveByIngredient.get(line.ingredientId) as number)
          : sent;
        const receivedBase = roundQty(
          await toBaseQty(
            tx,
            ctx.tenantId!,
            receivedRaw,
            receiveUnitByIngredient.get(line.ingredientId),
            line.ingredient.unit,
            line.ingredient.name,
          ),
        );
        if (receivedBase < 0 || receivedBase > sent) {
          throw new BadRequestException(
            `Received qty for a line must be between 0 and ${sent}.`,
          );
        }
        const received = dec(receivedBase);

        await tx.inventoryTransferLine.update({
          where: { id: line.id },
          data: { quantityReceived: received },
        });

        if (receivedBase > 0) {
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

        const shortage = roundQty(sent - receivedBase);
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

    this.emitInventoryEvent(
      ctx.tenantId!,
      to.branchId,
      OpsEventType.INVENTORY_TRANSFER_RECEIVED,
      'Transfer accepted',
      `Branch ${to.name} accepted transfer ${transfer.id.slice(0, 8)}.`,
      { transferId: transfer.id, status: 'RECEIVED' },
    );

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
    if (transfer.status !== 'SENT' && transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException(
        `Only SENT or IN_TRANSIT transfers can be rejected (current: ${transfer.status}).`,
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

    this.emitInventoryEvent(
      ctx.tenantId!,
      to.branchId,
      OpsEventType.INVENTORY_TRANSFER_REJECTED,
      'Transfer rejected',
      `Branch ${to.name} rejected transfer ${transfer.id.slice(0, 8)}. Stock restored to main warehouse.`,
      { transferId: transfer.id, status: 'CANCELLED' },
    );

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
      driver: {
        select: {
          id: true,
          displayName: true,
          phone: true,
          licencePlate: true,
          vehicleDesc: true,
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
    dispatchedAt?: Date | null;
    createdAt: Date;
    fromLocation: {
      id: string;
      code: string;
      name: string;
      type: string;
      branchId: string | null;
      branch?: { id: string; name: string; displayCode: string | null } | null;
    };
    toLocation: {
      id: string;
      code: string;
      name: string;
      type: string;
      branchId: string | null;
      branch?: { id: string; name: string; displayCode: string | null } | null;
    };
    driver?: {
      id: string;
      displayName: string;
      phone: string | null;
      licencePlate: string | null;
      vehicleDesc: string | null;
    } | null;
    lines: Array<{
      id: string;
      ingredientId: string;
      quantitySent: Prisma.Decimal;
      quantityReceived: Prisma.Decimal | null;
      ingredient: { id: string; name: string; unit: string; itemKind: string };
    }>;
  }) {
    return {
      id: row.id,
      status: row.status,
      note: row.note,
      fromLocation: this.toLocationDto(row.fromLocation),
      toLocation: this.toLocationDto(row.toLocation),
      driverId: (row as any).driverId ?? null,
      driver: (row as any).driver ?? null,
      pushDropId: (row as any).pushDropId ?? null,
      sentAt: row.sentAt?.toISOString() ?? null,
      dispatchedAt: (row as any).dispatchedAt?.toISOString?.() ?? null,
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
        where.status = query.status || {
          in: ['SUBMITTED', 'APPROVED', 'PREPARING'],
        };
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

    const convertedLines = await Promise.all(
      dto.lines.map(async (l) => {
        const ingredient = await this.prisma.inventoryIngredient.findFirst({
          where: { id: l.ingredientId, tenantId: ctx.tenantId! },
        });
        if (!ingredient) {
          throw new NotFoundException(
            `Ingredient ${l.ingredientId} not found.`,
          );
        }
        const quantity = roundQty(
          await toBaseQty(
            this.prisma,
            ctx.tenantId!,
            l.quantity,
            l.unit,
            ingredient.unit,
            ingredient.name,
          ),
        );
        return {
          ingredientId: l.ingredientId,
          quantity,
          unit: l.unit?.trim() || ingredient.unit,
        };
      }),
    );
    const merged = this.mergeTransferLines(
      convertedLines.map((l) => ({
        ingredientId: l.ingredientId,
        quantity: l.quantity,
      })),
    );
    const unitByIngredient = new Map<string, string | null>();
    for (const line of merged) {
      const units = convertedLines
        .filter((l) => l.ingredientId === line.ingredientId)
        .map((l) => l.unit);
      const uniform = units.every((u) => u === units[0]);
      unitByIngredient.set(line.ingredientId, uniform ? units[0] : null);
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
            unit: unitByIngredient.get(line.ingredientId) ?? null,
          })),
        },
      },
      include: this.supplyInclude(),
    });

    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId! },
    });
    let finalStatus = 'SUBMITTED';
    if (tenantSettings?.autoApproveSupplyRequests) {
      finalStatus = 'APPROVED';
      await this.prisma.inventorySupplyRequest.update({
        where: { id: created.id },
        data: {
          autoApprove: true,
          status: 'APPROVED',
          decisionNote: 'Auto-approved (Owner approval setting is OFF)',
        },
      });
      created.status = 'APPROVED';
    }

    this.emitInventoryEvent(
      ctx.tenantId!,
      from.branchId,
      finalStatus === 'APPROVED'
        ? OpsEventType.INVENTORY_SUPPLY_REQUEST_APPROVED
        : OpsEventType.INVENTORY_SUPPLY_REQUEST_CREATED,
      finalStatus === 'APPROVED'
        ? `Supply request #${created.id.slice(0, 8)} ready for preparation`
        : `New supply request submitted from ${from.name}`,
      `Request for ${merged.length} items submitted by ${from.name}`,
      { supplyRequestId: created.id, status: finalStatus },
    );

    return { data: this.toSupplyDto(created) };
  }

  /**
   * Owner approves a request.
   * When Owner Approval setting is ON, only OWNER_ADMIN can approve!
   * Once approved, status moves to APPROVED, allowing the warehouse storekeeper to start preparing.
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

    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId! },
    });

    // When autoApproveSupplyRequests is false (Owner Approval setting is ON), ONLY OWNER_ADMIN can approve!
    if (
      !tenantSettings?.autoApproveSupplyRequests &&
      ctx.roleCode !== 'OWNER_ADMIN'
    ) {
      throw new ForbiddenException(
        'Only the restaurant owner can approve supply requests when Owner Approval is required.',
      );
    }
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

    const updated = await this.prisma.inventorySupplyRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        decidedAt: new Date(),
        decidedByMembershipId: ctx.staffMembershipId,
        decisionNote: dto.decisionNote?.trim() || 'Approved by owner',
      },
      include: this.supplyInclude(),
    });

    this.emitInventoryEvent(
      ctx.tenantId!,
      request.fromLocation.branchId,
      OpsEventType.INVENTORY_SUPPLY_REQUEST_APPROVED,
      'Supply request approved',
      `Supply request #${request.id.slice(0, 8)} was approved by owner. Central storekeeper can start preparing.`,
      { supplyRequestId: request.id, status: 'APPROVED' },
    );

    return { data: this.toSupplyDto(updated) };
  }

  /**
   * Owner rejects a request.
   * When Owner Approval setting is ON, only OWNER_ADMIN can reject.
   * A rejected request cannot move forward.
   */
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

    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId! },
    });

    if (
      !tenantSettings?.autoApproveSupplyRequests &&
      ctx.roleCode !== 'OWNER_ADMIN'
    ) {
      throw new ForbiddenException(
        'Only the restaurant owner can reject supply requests when Owner Approval is required.',
      );
    }
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
    if (request.status !== 'SUBMITTED' && request.status !== 'APPROVED') {
      throw new BadRequestException(
        `Only pending or approved requests can be rejected (current: ${request.status}).`,
      );
    }

    const updated = await this.prisma.inventorySupplyRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        decidedAt: new Date(),
        decidedByMembershipId: ctx.staffMembershipId,
        decisionNote: dto.decisionNote?.trim() || 'Rejected by owner',
      },
      include: this.supplyInclude(),
    });

    this.emitInventoryEvent(
      ctx.tenantId!,
      request.fromLocation.branchId,
      OpsEventType.INVENTORY_SUPPLY_REQUEST_REJECTED,
      'Supply request rejected',
      `Supply request #${request.id.slice(0, 8)} was rejected: ${dto.decisionNote || 'No reason specified'}`,
      { supplyRequestId: request.id, status: 'REJECTED' },
    );

    return { data: this.toSupplyDto(updated) };
  }

  /**
   * Central Storekeeper / Store Manager starts preparing the items.
   * When Owner Approval is ON, this requires request to be in APPROVED status.
   * When Owner Approval is OFF, storekeeper can start preparing directly.
   */
  async startPreparingSupplyRequest(userId: string, requestId: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'initiate',
      message: 'Not allowed to prepare supply requests.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can prepare supply requests.',
    );

    const request = await this.prisma.inventorySupplyRequest.findFirst({
      where: { id: requestId, tenantId: ctx.tenantId! },
      include: this.supplyInclude(),
    });
    if (!request) {
      throw new NotFoundException('Supply request not found.');
    }

    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId! },
    });
    const isOwnerApprovalOff = Boolean(
      tenantSettings?.autoApproveSupplyRequests,
    );

    const allowedStatuses = isOwnerApprovalOff
      ? ['SUBMITTED', 'APPROVED']
      : ['APPROVED'];

    if (!allowedStatuses.includes(request.status)) {
      throw new BadRequestException(
        `Cannot start preparing: request is ${request.status}. ${
          !isOwnerApprovalOff && request.status === 'SUBMITTED'
            ? 'Request must first be approved by the owner.'
            : ''
        }`,
      );
    }

    const updated = await this.prisma.inventorySupplyRequest.update({
      where: { id: request.id },
      data: {
        status: 'PREPARING',
      },
      include: this.supplyInclude(),
    });

    this.emitInventoryEvent(
      ctx.tenantId!,
      request.fromLocation.branchId,
      OpsEventType.INVENTORY_SUPPLY_REQUEST_PREPARING,
      'Supply request is preparing',
      `Central warehouse has started preparing items for request #${request.id.slice(0, 8)}.`,
      { supplyRequestId: request.id, status: 'PREPARING' },
    );

    return { data: this.toSupplyDto(updated) };
  }

  /**
   * Central Storekeeper dispatches the prepared supply request.
   * Creates transfer, assigns driver (or direct handover), deducts warehouse stock,
   * sets status to FULFILLED and transfer status to IN_TRANSIT or SENT.
   */
  async dispatchSupplyRequest(
    userId: string,
    requestId: string,
    dto: DecideSupplyRequestDto,
  ) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'initiate',
      message: 'Not allowed to dispatch supply requests.',
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can dispatch supply requests.',
    );

    const request = await this.prisma.inventorySupplyRequest.findFirst({
      where: { id: requestId, tenantId: ctx.tenantId! },
      include: this.supplyInclude(),
    });
    if (!request) {
      throw new NotFoundException('Supply request not found.');
    }
    if (request.status !== 'PREPARING' && request.status !== 'APPROVED') {
      throw new BadRequestException(
        `Only PREPARING or APPROVED requests can be dispatched (current: ${request.status}).`,
      );
    }

    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId! },
    });
    if (tenantSettings?.requireDriverForDispatch && !dto.driverId?.trim()) {
      throw new BadRequestException(
        'A driver is required for dispatch by restaurant policy.',
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

    let driverId = dto.driverId?.trim() || null;
    let transferStatus = 'SENT';
    let dispatchedAt: Date | null = null;

    if (driverId) {
      const activeDriver = await this.prisma.driver.findFirst({
        where: { id: driverId, tenantId: ctx.tenantId!, status: 'ACTIVE' },
      });
      if (activeDriver) {
        dispatchedAt = new Date();
        transferStatus = dto.immediateTransit ? 'IN_TRANSIT' : 'SENT';
      } else {
        driverId = null;
      }
    }

    await this.prisma.inventoryTransfer.update({
      where: { id: transferResult.data.id },
      data: {
        supplyRequestId: request.id,
        ...(driverId ? { driverId, dispatchedAt, status: transferStatus } : {}),
      },
    });

    const updated = await this.prisma.inventorySupplyRequest.update({
      where: { id: request.id },
      data: {
        status: 'FULFILLED',
        decidedAt: request.decidedAt || new Date(),
        decidedByMembershipId:
          request.decidedByMembershipId || ctx.staffMembershipId,
        decisionNote: dto.decisionNote?.trim() || request.decisionNote,
      },
      include: this.supplyInclude(),
    });

    this.emitInventoryEvent(
      ctx.tenantId!,
      request.fromLocation.branchId,
      OpsEventType.INVENTORY_SUPPLY_REQUEST_DISPATCHED,
      'Supply request dispatched',
      `Shipment for request #${request.id.slice(0, 8)} dispatched to ${request.fromLocation.name}.`,
      {
        supplyRequestId: request.id,
        transferId: transferResult.data.id,
        status: 'FULFILLED',
        transferStatus,
      },
    );

    return {
      data: this.toSupplyDto(updated),
      transfer: transferResult.data,
    };
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

    // Convert input lines to their base units before merging.
    const convertedInputs = await Promise.all(
      dto.inputs.map(async (line) => {
        const ingredient = await this.prisma.inventoryIngredient.findFirst({
          where: { id: line.ingredientId, tenantId: ctx.tenantId! },
        });
        if (!ingredient) {
          throw new NotFoundException(
            `Input ingredient ${line.ingredientId} not found.`,
          );
        }
        const quantity = roundQty(
          await toBaseQty(
            this.prisma,
            ctx.tenantId!,
            line.quantity,
            line.unit,
            ingredient.unit,
            ingredient.name,
          ),
        );
        return {
          ingredientId: line.ingredientId,
          quantity,
          unit: line.unit?.trim() || ingredient.unit,
        };
      }),
    );
    const mergedInputs = this.mergeTransferLines(
      convertedInputs.map((l) => ({
        ingredientId: l.ingredientId,
        quantity: l.quantity,
      })),
    );
    const inputUnitByIngredient = new Map<string, string | null>();
    for (const line of mergedInputs) {
      const units = convertedInputs
        .filter((l) => l.ingredientId === line.ingredientId)
        .map((l) => l.unit);
      const uniform = units.every((u) => u === units[0]);
      inputUnitByIngredient.set(line.ingredientId, uniform ? units[0] : null);
    }
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
      const outputQty = roundQty(
        await toBaseQty(
          tx,
          ctx.tenantId!,
          dto.outputQuantity,
          dto.outputUnit,
          output.unit,
          output.name,
        ),
      );
      const expectedOutputBase =
        dto.expectedOutputQuantity != null
          ? roundQty(
              await toBaseQty(
                tx,
                ctx.tenantId!,
                dto.expectedOutputQuantity,
                dto.outputUnit,
                output.unit,
                output.name,
              ),
            )
          : null;
      const outputUnitTyped = dto.outputUnit?.trim() || output.unit;

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
      const outputUnitCost =
        outputQty > 0 ? roundMoney4(inputCostTotal / outputQty) : 0;

      let yieldPercent: number | null = null;
      if (expectedOutputBase != null && expectedOutputBase > 0) {
        yieldPercent = roundMoney((outputQty / expectedOutputBase) * 100);
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
          outputUnit: outputUnitTyped,
          expectedOutputQuantity:
            expectedOutputBase != null ? dec(expectedOutputBase) : null,
          yieldPercent: yieldPercent != null ? dec(yieldPercent) : null,
          inputCostTotal: dec(inputCostTotal),
          outputUnitCost: dec(outputUnitCost),
          note: dto.note?.trim() || null,
          postedByMembershipId: ctx.staffMembershipId,
          inputs: {
            create: mergedInputs.map((line) => ({
              ingredientId: line.ingredientId,
              quantity: dec(line.quantity),
              unit: inputUnitByIngredient.get(line.ingredientId) ?? null,
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
      vendorId?: string | null;
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
        vendorId: meta.vendorId ?? null,
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

  private async requireMaterialAccess(
    userId: string,
    action: AppAction = 'read',
  ): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant on this account.');
    }
    const allowed =
      this.casl.can(context, action, 'InventoryMaterial') ||
      this.casl.can(context, 'manage', 'InventoryMaterial') ||
      this.casl.can(context, 'issue', 'InventoryMaterial') ||
      this.casl.can(context, 'approve', 'InventoryMaterial') ||
      this.casl.can(context, 'return', 'InventoryMaterial') ||
      this.casl.can(context, 'manage', 'Inventory') ||
      this.casl.can(context, 'manage', 'all');
    if (!allowed) {
      throw new ForbiddenException(
        'Materials access requires kitchen or inventory permissions.',
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
    vendor?: {
      id: string;
      name: string;
      type: string;
      phone: string | null;
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
      vendor: r.vendor
        ? {
            id: r.vendor.id,
            name: r.vendor.name,
            type: r.vendor.type,
            phone: r.vendor.phone,
          }
        : null,
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
      displayCode?: string | null;
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
      imageUrl?: string | null;
      categoryId?: string | null;
      category?: {
        id: string;
        name: string;
        amharicName?: string | null;
        code: string;
      } | null;
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
      imageUrl: row.imageUrl ?? null,
      categoryId: row.categoryId ?? null,
      category: row.category ?? null,
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
  // ─── Drivers ──────────────────────────────────────────────────────────────

  async listDrivers(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const { page, limit, skip } = this.pageOf(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.driver.findMany({
        where: {
          tenantId: ctx.tenantId!,
          ...(query.status ? { status: query.status } : {}),
          ...(query.q
            ? { displayName: { contains: query.q, mode: 'insensitive' } }
            : {}),
        },
        orderBy: { displayName: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.driver.count({
        where: {
          tenantId: ctx.tenantId!,
          ...(query.status ? { status: query.status } : {}),
        },
      }),
    ]);
    return {
      data: rows.map((d) => this.toDriverDto(d)),
      meta: { page, limit, total },
    };
  }

  async createDriver(userId: string, dto: CreateDriverDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can register drivers.',
    );
    const driver = await this.prisma.driver.create({
      data: {
        tenantId: ctx.tenantId!,
        displayName: dto.displayName.trim(),
        phone: dto.phone?.trim() || null,
        licencePlate: dto.licencePlate?.trim() || null,
        vehicleDesc: dto.vehicleDesc?.trim() || null,
        registeredByMembershipId: ctx.staffMembershipId,
      },
    });
    return { data: this.toDriverDto(driver) };
  }

  async updateDriver(userId: string, driverId: string, dto: UpdateDriverDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can update drivers.',
    );
    const existing = await this.prisma.driver.findFirst({
      where: { id: driverId, tenantId: ctx.tenantId! },
    });
    if (!existing) throw new NotFoundException('Driver not found.');
    const driver = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        ...(dto.displayName ? { displayName: dto.displayName.trim() } : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone?.trim() || null }
          : {}),
        ...(dto.licencePlate !== undefined
          ? { licencePlate: dto.licencePlate?.trim() || null }
          : {}),
        ...(dto.vehicleDesc !== undefined
          ? { vehicleDesc: dto.vehicleDesc?.trim() || null }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    return { data: this.toDriverDto(driver) };
  }

  async deleteDriver(userId: string, driverId: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can delete drivers.',
    );
    const existing = await this.prisma.driver.findFirst({
      where: { id: driverId, tenantId: ctx.tenantId! },
    });
    if (!existing) throw new NotFoundException('Driver not found.');
    await this.prisma.driver.delete({ where: { id: driverId } });
    return { success: true };
  }

  private toDriverDto(d: {
    id: string;
    tenantId: string;
    displayName: string;
    phone: string | null;
    licencePlate: string | null;
    vehicleDesc: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: d.id,
      displayName: d.displayName,
      phone: d.phone,
      licencePlate: d.licencePlate,
      vehicleDesc: d.vehicleDesc,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  // ─── Vendors (suppliers: farms / merchants / other) ────────────────────────

  async listVendors(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'read',
    });
    const { page, limit, skip } = this.pageOf(query);
    const where: Prisma.VendorWhereInput = {
      tenantId: ctx.tenantId!,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { name: { contains: query.q.trim(), mode: 'insensitive' } },
              {
                contactPerson: {
                  contains: query.q.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({
        where,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.vendor.count({ where }),
    ]);
    return {
      data: rows.map((v) => this.toVendorDto(v)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async createVendor(userId: string, dto: CreateVendorDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can register vendors.',
    );
    const vendor = await this.prisma.vendor.create({
      data: {
        tenantId: ctx.tenantId!,
        type: dto.type,
        name: dto.name.trim(),
        contactPerson: dto.contactPerson?.trim() || null,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        createdByMembershipId: ctx.staffMembershipId,
      },
    });
    return { data: this.toVendorDto(vendor) };
  }

  async updateVendor(userId: string, vendorId: string, dto: UpdateVendorDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can update vendors.',
    );
    const existing = await this.prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId! },
    });
    if (!existing) throw new NotFoundException('Vendor not found.');
    const vendor = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.contactPerson !== undefined
          ? { contactPerson: dto.contactPerson?.trim() || null }
          : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone?.trim() || null }
          : {}),
        ...(dto.address !== undefined
          ? { address: dto.address?.trim() || null }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    return { data: this.toVendorDto(vendor) };
  }

  async deleteVendor(userId: string, vendorId: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can delete vendors.',
    );
    const existing = await this.prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId! },
    });
    if (!existing) throw new NotFoundException('Vendor not found.');
    const usage = await this.prisma.inventoryLedgerEntry.count({
      where: { vendorId },
    });
    if (usage > 0) {
      throw new BadRequestException(
        'This vendor has purchase history. Deactivate it instead of deleting.',
      );
    }
    await this.prisma.vendor.delete({ where: { id: vendorId } });
    return { data: { id: vendorId } };
  }

  private toVendorDto(v: {
    id: string;
    type: string;
    name: string;
    contactPerson: string | null;
    phone: string | null;
    address: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: v.id,
      type: v.type,
      name: v.name,
      contactPerson: v.contactPerson,
      phone: v.phone,
      address: v.address,
      status: v.status,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  }

  // ─── Assign a SENT transfer to a driver (driver accepts to start trip) ───

  async dispatchTransfer(
    userId: string,
    transferId: string,
    dto: DispatchTransferDto,
  ) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can dispatch transfers.',
    );

    const transfer = await this.prisma.inventoryTransfer.findFirst({
      where: { id: transferId, tenantId: ctx.tenantId! },
    });
    if (!transfer) throw new NotFoundException('Transfer not found.');
    if (transfer.status !== 'SENT') {
      throw new BadRequestException(
        `Only SENT transfers can be dispatched to a driver (current: ${transfer.status}).`,
      );
    }

    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, tenantId: ctx.tenantId!, status: 'ACTIVE' },
    });
    if (!driver) throw new NotFoundException('Active driver not found.');

    const updated = await this.prisma.inventoryTransfer.update({
      where: { id: transferId },
      data: {
        driverId: driver.id,
        dispatchedAt: new Date(),
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

    return { data: this.toTransferDto(updated) };
  }

  // ─── Driver Portal ────────────────────────────────────────────────────────

  async getMyDriverTransfers(userId: string) {
    const ctx = await this.identity.getByUserId(userId);
    if (!ctx.tenantId) {
      throw new ForbiddenException('No restaurant on this account.');
    }

    // Try to find the Driver record associated with this user
    const driver = await this.prisma.driver.findFirst({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          ...(ctx.staffMembershipId
            ? [{ registeredByMembershipId: ctx.staffMembershipId }]
            : []),
          ...(ctx.phone ? [{ phone: ctx.phone }] : []),
          { displayName: ctx.displayName },
        ],
      },
    });

    const rows = await this.prisma.inventoryTransfer.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(driver ? { driverId: driver.id } : {}),
        status: { in: ['SENT', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED'] },
      },
      include: this.transferInclude(),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      data: {
        driver: driver ? this.toDriverDto(driver) : null,
        pendingPickup: rows
          .filter((r) => r.status === 'SENT')
          .map((r) => this.toTransferDto(r)),
        inTransit: rows
          .filter((r) => r.status === 'IN_TRANSIT')
          .map((r) => this.toTransferDto(r)),
        completed: rows
          .filter((r) => r.status === 'RECEIVED' || r.status === 'ARRIVED')
          .map((r) => this.toTransferDto(r)),
      },
    };
  }

  async startDriverTrip(userId: string, transferId: string) {
    const ctx = await this.identity.getByUserId(userId);
    if (!ctx.tenantId)
      throw new ForbiddenException('No restaurant on this account.');

    const transfer = await this.prisma.inventoryTransfer.findFirst({
      where: { id: transferId, tenantId: ctx.tenantId },
    });
    if (!transfer) throw new NotFoundException('Transfer not found.');

    if (transfer.status !== 'SENT') {
      throw new BadRequestException(
        `Cannot start trip for transfer in ${transfer.status} status.`,
      );
    }

    let driverId = transfer.driverId;
    if (!driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: {
          tenantId: ctx.tenantId,
          OR: [
            ...(ctx.staffMembershipId
              ? [{ registeredByMembershipId: ctx.staffMembershipId }]
              : []),
            ...(ctx.phone ? [{ phone: ctx.phone }] : []),
            { displayName: ctx.displayName },
          ],
        },
      });
      if (driver) driverId = driver.id;
    }

    const updated = await this.prisma.inventoryTransfer.update({
      where: { id: transferId },
      data: {
        status: 'IN_TRANSIT',
        dispatchedAt: new Date(),
        ...(driverId ? { driverId } : {}),
      },
      include: this.transferInclude(),
    });

    return { data: this.toTransferDto(updated) };
  }

  async markDriverArrived(userId: string, transferId: string) {
    const ctx = await this.identity.getByUserId(userId);
    if (!ctx.tenantId)
      throw new ForbiddenException('No restaurant on this account.');

    const transfer = await this.prisma.inventoryTransfer.findFirst({
      where: { id: transferId, tenantId: ctx.tenantId },
    });
    if (!transfer) throw new NotFoundException('Transfer not found.');

    if (transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException(
        `Transfer must be IN_TRANSIT before recording arrival (current: ${transfer.status}).`,
      );
    }

    const arrivalNotice = `[Arrived at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]`;
    const updated = await this.prisma.inventoryTransfer.update({
      where: { id: transferId },
      data: {
        status: 'ARRIVED',
        note: transfer.note
          ? `${transfer.note} · ${arrivalNotice}`
          : arrivalNotice,
      },
      include: this.transferInclude(),
    });

    return { data: this.toTransferDto(updated) };
  }

  // ─── Push Drop (storekeeper-initiated weekly scheduled drops) ─────────────

  async listPushDrops(userId: string, query: InventoryListQueryDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    const { page, limit, skip } = this.pageOf(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryPushDrop.findMany({
        where: {
          tenantId: ctx.tenantId!,
          ...(query.status ? { status: query.status } : {}),
        },
        include: {
          fromLocation: {
            include: {
              branch: { select: { id: true, name: true, displayCode: true } },
            },
          },
          transfers: {
            include: this.transferInclude(),
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.inventoryPushDrop.count({
        where: {
          tenantId: ctx.tenantId!,
          ...(query.status ? { status: query.status } : {}),
        },
      }),
    ]);
    return {
      data: rows.map((d) => ({
        id: d.id,
        status: d.status,
        label: d.label,
        note: d.note,
        scheduledDate: d.scheduledDate?.toISOString().split('T')[0] ?? null,
        fromLocation: this.toLocationDto(d.fromLocation),
        transfers: d.transfers.map((t) => this.toTransferDto(t)),
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      meta: { page, limit, total },
    };
  }

  /**
   * Storekeeper creates a push drop — one transfer per destination branch.
   * Each transfer is immediately SENT (stock deducted from main warehouse).
   */
  async createPushDrop(userId: string, dto: CreatePushDropDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
    });
    this.assertCentralInventoryRole(
      ctx,
      'Only owners or store managers can create push drops.',
    );

    const main = await this.findMainWarehouse(ctx.tenantId!);
    if (!main) {
      throw new BadRequestException(
        'Enable a main warehouse before creating push drops.',
      );
    }
    const fromLocationId = dto.fromLocationId ?? main.id;

    const from = await this.prisma.inventoryLocation.findFirst({
      where: { id: fromLocationId, tenantId: ctx.tenantId!, status: 'ACTIVE' },
    });
    if (!from || from.type !== 'MAIN_WAREHOUSE') {
      throw new BadRequestException(
        'Push drops must ship from the main warehouse.',
      );
    }

    // Validate all destination locations exist and are branch stores
    for (const branch of dto.branches) {
      const to = await this.prisma.inventoryLocation.findFirst({
        where: {
          id: branch.toLocationId,
          tenantId: ctx.tenantId!,
          status: 'ACTIVE',
        },
      });
      if (!to || to.type !== 'BRANCH_STORE') {
        throw new BadRequestException(
          `Destination ${branch.toLocationId} is not an active branch store.`,
        );
      }
      if (to.id === from.id) {
        throw new BadRequestException('Source and destination must differ.');
      }
    }

    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, tenantId: ctx.tenantId!, status: 'ACTIVE' },
      });
      if (!driver) {
        throw new BadRequestException('Selected driver not found or inactive.');
      }
    }

    // Create the push drop header
    const drop = await this.prisma.inventoryPushDrop.create({
      data: {
        tenantId: ctx.tenantId!,
        fromLocationId: from.id,
        label: dto.label?.trim() || null,
        note: dto.note?.trim() || null,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        createdByMembershipId: ctx.staffMembershipId,
        status: 'DISPATCHED',
      },
    });

    // Create one transfer per branch using existing send logic (with pushDropId)
    const transfers: ReturnType<typeof this.toTransferDto>[] = [];
    for (const branch of dto.branches) {
      const result = await this.createAndSendTransfer(userId, {
        fromLocationId: from.id,
        toLocationId: branch.toLocationId,
        note:
          dto.label?.trim() ||
          dto.note?.trim() ||
          `Push drop ${drop.id.slice(0, 8)}`,
        lines: branch.lines,
        _pushDropId: drop.id,
      });
      if (dto.driverId) {
        const updated = await this.prisma.inventoryTransfer.update({
          where: { id: result.data.id },
          data: {
            driverId: dto.driverId,
            dispatchedAt: new Date(),
          },
          include: this.transferInclude(),
        });
        transfers.push(this.toTransferDto(updated));
      } else {
        transfers.push(result.data);
      }
    }

    return {
      data: {
        id: drop.id,
        status: drop.status,
        label: drop.label,
        note: drop.note,
        scheduledDate: drop.scheduledDate?.toISOString().split('T')[0] ?? null,
        transfers,
        createdAt: drop.createdAt.toISOString(),
      },
    };
  }

  // ─── Supply Request V2 (with autoApprove) ─────────────────────────────────

  async createSupplyRequestV2(userId: string, dto: CreateSupplyRequestV2Dto) {
    const base = await this.createSupplyRequest(userId, dto);

    if (dto.autoApprove) {
      // Store autoApprove flag and immediately approve
      await this.prisma.inventorySupplyRequest.update({
        where: { id: base.data.id },
        data: { autoApprove: true },
      });
      return this.approveSupplyRequest(userId, base.data.id, {});
    }

    return base;
  }

  // ─── Materials (reusable assets: cutlery, trays, linen …) ─────────────────

  async listMaterials(userId: string, query: MaterialListQueryDto = {}) {
    const ctx = await this.requireMaterialAccess(userId, 'read');
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const status = (query.status || 'ACTIVE').trim().toUpperCase();

    const where: Prisma.InventoryMaterialWhereInput = {
      tenantId: ctx.tenantId!,
      status,
      ...(query.category ? { category: query.category } : {}),
      ...(query.isReusable === 'true'
        ? { isReusable: true }
        : query.isReusable === 'false'
          ? { isReusable: false }
          : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { name: { contains: query.q.trim(), mode: 'insensitive' } },
              {
                amharicName: { contains: query.q.trim(), mode: 'insensitive' },
              },
              { code: { contains: query.q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.inventoryMaterial.count({ where }),
      this.prisma.inventoryMaterial.findMany({
        where,
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const balances = rows.length
      ? await this.prisma.inventoryMaterialBalance.findMany({
          where: {
            tenantId: ctx.tenantId!,
            materialId: { in: rows.map((r) => r.id) },
            ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
          },
        })
      : [];

    const totals = new Map<
      string,
      { onHandQty: number; issuedQty: number; lostQty: number }
    >();
    for (const b of balances) {
      const acc = totals.get(b.materialId) ?? {
        onHandQty: 0,
        issuedQty: 0,
        lostQty: 0,
      };
      acc.onHandQty += num(b.onHandQty);
      acc.issuedQty += num(b.issuedQty);
      acc.lostQty += num(b.lostQty);
      totals.set(b.materialId, acc);
    }

    return {
      data: rows.map((r) => this.toMaterialDto(r, totals.get(r.id))),
      meta: {
        total,
        page,
        limit,
        hasMore: page * limit < total,
      },
    };
  }

  async createMaterial(userId: string, dto: CreateMaterialDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'manage',
    });
    const name = dto.name.trim();
    const code = await this.resolveMaterialCode(
      ctx.tenantId!,
      dto.code?.trim() || name,
    );

    const clash = await this.prisma.inventoryMaterial.findFirst({
      where: {
        tenantId: ctx.tenantId!,
        OR: [{ code }, { name: { equals: name, mode: 'insensitive' } }],
      },
    });
    if (clash) {
      throw new ConflictException(
        'A material with this name or code already exists.',
      );
    }

    const created = await this.prisma.inventoryMaterial.create({
      data: {
        tenantId: ctx.tenantId!,
        name,
        amharicName: dto.amharicName?.trim() || null,
        code,
        category: (dto.category || 'OTHER').toUpperCase(),
        unit: dto.unit?.trim() || 'pcs',
        isReusable: dto.isReusable ?? true,
        imageUrl: dto.imageUrl?.trim() || null,
        description: dto.description?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        status: 'ACTIVE',
      },
    });

    this.emitInventoryEvent(
      ctx.tenantId!,
      ctx.branchId,
      'inventory.material.created',
      `Material added: ${created.name}`,
      null,
      { materialId: created.id, code: created.code },
    );

    return { data: this.toMaterialDto(created) };
  }

  async updateMaterial(userId: string, id: string, dto: UpdateMaterialDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'manage',
    });
    const existing = await this.prisma.inventoryMaterial.findFirst({
      where: { id, tenantId: ctx.tenantId! },
    });
    if (!existing) throw new NotFoundException('Material not found.');

    const nextName = dto.name?.trim();
    if (nextName && nextName !== existing.name) {
      const clash = await this.prisma.inventoryMaterial.findFirst({
        where: {
          tenantId: ctx.tenantId!,
          name: { equals: nextName, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (clash) {
        throw new ConflictException(
          'A material with that name already exists.',
        );
      }
    }

    let code: string | undefined;
    if (dto.code?.trim() && dto.code.trim().toUpperCase() !== existing.code) {
      code = await this.resolveMaterialCode(ctx.tenantId!, dto.code.trim(), id);
    }

    const updated = await this.prisma.inventoryMaterial.update({
      where: { id },
      data: {
        ...(nextName ? { name: nextName } : {}),
        ...(dto.amharicName !== undefined
          ? { amharicName: dto.amharicName?.trim() || null }
          : {}),
        ...(code ? { code } : {}),
        ...(dto.category ? { category: dto.category.toUpperCase() } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit.trim() || 'pcs' } : {}),
        ...(dto.isReusable !== undefined ? { isReusable: dto.isReusable } : {}),
        ...(dto.imageUrl !== undefined
          ? { imageUrl: dto.imageUrl?.trim() || null }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.status ? { status: dto.status.toUpperCase() } : {}),
      },
    });

    return { data: this.toMaterialDto(updated) };
  }

  async deleteMaterial(userId: string, id: string) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: false,
      action: 'manage',
    });
    const existing = await this.prisma.inventoryMaterial.findFirst({
      where: { id, tenantId: ctx.tenantId! },
    });
    if (!existing) throw new NotFoundException('Material not found.');

    const openIssues = await this.prisma.orderMaterialIssueLine.count({
      where: {
        materialId: id,
        issue: {
          status: { in: ['PENDING', 'ISSUED', 'RETURNED', 'DISPUTED'] },
        },
      },
    });
    if (openIssues > 0) {
      throw new BadRequestException(
        'This material is still out on an open issue. Archive it after all returns are approved.',
      );
    }

    await this.prisma.inventoryMaterial.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    return { success: true };
  }

  /** Set the opening / counted on-hand quantity for a material at a location. */
  async upsertMaterialBalance(userId: string, dto: UpsertMaterialBalanceDto) {
    const ctx = await this.requireInventoryAccess(userId, {
      requireBranch: true,
      action: 'manage',
    });
    const material = await this.prisma.inventoryMaterial.findFirst({
      where: { id: dto.materialId, tenantId: ctx.tenantId! },
    });
    if (!material) throw new NotFoundException('Material not found.');

    const locationId = dto.locationId
      ? dto.locationId
      : (await this.ensureDefaultLocation(ctx.tenantId!, ctx.branchId!)).id;

    const balance = await this.prisma.inventoryMaterialBalance.upsert({
      where: {
        locationId_materialId: { locationId, materialId: dto.materialId },
      },
      create: {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId,
        locationId,
        materialId: dto.materialId,
        onHandQty: dec(dto.onHandQty ?? 0),
      },
      update: {
        ...(dto.onHandQty !== undefined
          ? { onHandQty: dec(dto.onHandQty) }
          : {}),
      },
    });

    return {
      data: {
        id: balance.id,
        materialId: balance.materialId,
        locationId: balance.locationId,
        onHandQty: num(balance.onHandQty),
        issuedQty: num(balance.issuedQty),
        lostQty: num(balance.lostQty),
        updatedAt: balance.updatedAt.toISOString(),
      },
    };
  }

  private async resolveMaterialCode(
    tenantId: string,
    raw: string,
    ignoreId?: string,
  ): Promise<string> {
    const base =
      raw
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50) || 'MATERIAL';
    let code = base;
    let n = 2;
    // Ensure uniqueness within the tenant.
    for (;;) {
      const found = await this.prisma.inventoryMaterial.findFirst({
        where: {
          tenantId,
          code,
          ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
        },
        select: { id: true },
      });
      if (!found) return code;
      code = `${base}_${n}`.slice(0, 60);
      n += 1;
    }
  }

  private toMaterialDto(
    m: {
      id: string;
      tenantId: string;
      name: string;
      amharicName: string | null;
      code: string;
      category: string;
      unit: string;
      isReusable: boolean;
      imageUrl: string | null;
      description: string | null;
      sortOrder: number;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    },
    totals?: { onHandQty: number; issuedQty: number; lostQty: number },
  ) {
    return {
      id: m.id,
      tenantId: m.tenantId,
      name: m.name,
      amharicName: m.amharicName,
      code: m.code,
      category: m.category,
      unit: m.unit,
      isReusable: m.isReusable,
      imageUrl: m.imageUrl,
      description: m.description,
      sortOrder: m.sortOrder,
      status: m.status,
      onHandQty: totals?.onHandQty ?? 0,
      issuedQty: totals?.issuedQty ?? 0,
      lostQty: totals?.lostQty ?? 0,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
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
