import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import {
  CreateMenuItemDto,
  CreateModifierGroupDto,
  ModifierGroupInputDto,
  UpdateMenuItemDto,
} from './dto/menu-item.dto';
import {
  AdminMenuItemDto,
  AdminMenuItemListResponseDto,
  AdminMenuItemResponseDto,
  AdminMenuMetaResponseDto,
  AdminModifierGroupDto,
  AdminModifierGroupListResponseDto,
  AdminModifierGroupResponseDto,
} from './dto/menu-item-response.dto';

const ADMIN_ROLES = ['MANAGER', 'OWNER_ADMIN'];

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async meta(userId: string): Promise<AdminMenuMetaResponseDto> {
    const context = await this.requireAdmin(userId);
    const menu = await this.resolveMenu(context);
    const [stations, categories, periods] = await Promise.all([
      this.prisma.preparationStation.findMany({
        where: { branchId: context.branchId!, status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.menuCategory.findMany({
        where: { menuId: menu.id, status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.menuPeriod.findMany({
        where: { menuId: menu.id, status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    return {
      data: {
        menuId: menu.id,
        defaultPeriodId: periods[0]?.id ?? null,
        stations: stations.map((station) => ({
          id: station.id,
          name: station.name,
          code: station.code,
          status: station.status,
        })),
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          sortOrder: category.sortOrder,
        })),
      },
    };
  }

  async list(userId: string): Promise<AdminMenuItemListResponseDto> {
    const context = await this.requireAdmin(userId);
    const menu = await this.resolveMenu(context);
    const items = await this.prisma.menuItem.findMany({
      where: {
        menuId: menu.id,
        status: { in: ['ACTIVE', 'DRAFT'] },
      },
      include: this.itemInclude(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { data: items.map((item) => this.toDto(item)) };
  }

  async listModifierGroups(
    userId: string,
  ): Promise<AdminModifierGroupListResponseDto> {
    const context = await this.requireAdmin(userId);
    const menu = await this.resolveMenu(context);
    const groups = await this.prisma.modifierGroup.findMany({
      where: {
        menuId: menu.id,
        tenantId: context.tenantId!,
        status: 'ACTIVE',
      },
      include: {
        options: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return {
      data: groups.map((group) =>
        toModifierGroupDto({
          minSelectionsOverride: null,
          maxSelectionsOverride: null,
          requiredOverride: null,
          group,
        }),
      ),
    };
  }

  async createModifierGroup(
    userId: string,
    dto: CreateModifierGroupDto,
  ): Promise<AdminModifierGroupResponseDto> {
    const context = await this.requireAdmin(userId);
    const menu = await this.resolveMenu(context);
    if (!dto.name?.trim()) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { name: 'required' },
      });
    }
    if (!dto.options?.length) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { options: 'required' },
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const [id] = await this.createInlineGroups(tx, context, menu.id, [dto]);
      return tx.modifierGroup.findUniqueOrThrow({
        where: { id },
        include: {
          options: {
            where: { status: 'ACTIVE' },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    return {
      data: toModifierGroupDto({
        minSelectionsOverride: null,
        maxSelectionsOverride: null,
        requiredOverride: null,
        group: created,
      }),
    };
  }

  async getOne(
    userId: string,
    menuItemId: string,
  ): Promise<AdminMenuItemResponseDto> {
    const context = await this.requireAdmin(userId);
    const item = await this.findItem(context, menuItemId);
    return { data: this.toDto(item) };
  }

  async create(
    userId: string,
    dto: CreateMenuItemDto,
  ): Promise<AdminMenuItemResponseDto> {
    const context = await this.requireAdmin(userId);
    const menu = await this.resolveMenu(context, dto.menuId);
    const station = await this.requireStation(
      context,
      dto.preparationStationId,
    );
    const categoryId = await this.resolveCategoryId(
      context,
      menu.id,
      dto.categoryId,
      dto.categoryName ?? station.name,
    );
    const periodIds =
      dto.periodIds && dto.periodIds.length > 0
        ? dto.periodIds
        : await this.defaultPeriodIds(menu.id);

    const soldOut = dto.available === false;
    const sortOrder = await this.prisma.menuItem.count({
      where: { menuId: menu.id },
    });

    if (dto.imageFileId) {
      await this.requireFile(dto.imageFileId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await this.requireModifierGroupIds(
        tx,
        context,
        menu.id,
        dto.modifierGroupIds ?? [],
      );
      const groupIds = [
        ...(dto.modifierGroupIds ?? []),
        ...(await this.createInlineGroups(
          tx,
          context,
          menu.id,
          dto.modifierGroups ?? [],
        )),
      ];

      const item = await tx.menuItem.create({
        data: {
          tenantId: context.tenantId!,
          menuId: menu.id,
          menuCategoryId: categoryId,
          name: dto.name.trim(),
          description:
            dto.description?.trim() ||
            `${dto.name.trim()} prepared fresh to order.`,
          currentPrice: new Prisma.Decimal(dto.price),
          currencyCode: dto.currencyCode ?? 'ETB',
          preparationStationId: station.id,
          expectedPrepMinutes: dto.expectedPrepMinutes ?? null,
          status: 'ACTIVE',
          soldOut,
          sortOrder,
          imageKey: dto.imageFileId ? null : (dto.imageKey ?? null),
          imageFileId: dto.imageFileId ?? null,
          periods: {
            create: periodIds.map((menuPeriodId) => ({
              menuPeriodId,
            })),
          },
          modifiers: {
            create: groupIds.map((modifierGroupId, sortOrder) => ({
              tenantId: context.tenantId!,
              modifierGroupId,
              sortOrder,
            })),
          },
        },
        include: this.itemInclude(),
      });
      return item;
    });

    return { data: this.toDto(created) };
  }

  async update(
    userId: string,
    menuItemId: string,
    dto: UpdateMenuItemDto,
  ): Promise<AdminMenuItemResponseDto> {
    const context = await this.requireAdmin(userId);
    const existing = await this.findItem(context, menuItemId);
    if (
      dto.expectedVersion !== undefined &&
      existing.version !== dto.expectedVersion
    ) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: existing.version,
      });
    }

    if (dto.preparationStationId) {
      await this.requireStation(context, dto.preparationStationId);
    }

    if (dto.imageFileId) {
      await this.requireFile(dto.imageFileId);
    }

    const categoryId =
      dto.categoryId || dto.categoryName
        ? await this.resolveCategoryId(
            context,
            existing.menuId,
            dto.categoryId,
            dto.categoryName,
          )
        : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        dto.modifierGroups !== undefined ||
        dto.modifierGroupIds !== undefined
      ) {
        await this.requireModifierGroupIds(
          tx,
          context,
          existing.menuId,
          dto.modifierGroupIds ?? [],
        );
        await tx.menuItemModifierAssignment.deleteMany({
          where: { menuItemId: existing.id },
        });
        const groupIds = [
          ...(dto.modifierGroupIds ?? []),
          ...(await this.createInlineGroups(
            tx,
            context,
            existing.menuId,
            dto.modifierGroups ?? [],
          )),
        ];
        if (groupIds.length > 0) {
          await tx.menuItemModifierAssignment.createMany({
            data: groupIds.map((modifierGroupId, sortOrder) => ({
              tenantId: context.tenantId!,
              menuItemId: existing.id,
              modifierGroupId,
              sortOrder,
            })),
          });
        }
      }

      const imagePatch =
        dto.imageFileId !== undefined
          ? {
              imageFileId: dto.imageFileId,
              imageKey: dto.imageFileId ? null : (dto.imageKey ?? null),
            }
          : dto.imageKey !== undefined
            ? {
                imageKey: dto.imageKey,
                imageFileId: null,
              }
            : {};

      return tx.menuItem.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
          ...(dto.price !== undefined
            ? { currentPrice: new Prisma.Decimal(dto.price) }
            : {}),
          ...(dto.preparationStationId
            ? { preparationStationId: dto.preparationStationId }
            : {}),
          ...(categoryId !== undefined ? { menuCategoryId: categoryId } : {}),
          ...(dto.expectedPrepMinutes !== undefined
            ? { expectedPrepMinutes: dto.expectedPrepMinutes }
            : {}),
          ...(dto.available !== undefined ? { soldOut: !dto.available } : {}),
          ...imagePatch,
          version: { increment: 1 },
        },
        include: this.itemInclude(),
      });
    });

    return { data: this.toDto(updated) };
  }

  async markSoldOut(
    userId: string,
    menuItemId: string,
    soldOut: boolean,
  ): Promise<AdminMenuItemResponseDto> {
    const context = await this.requireAdmin(userId);
    await this.findItem(context, menuItemId);
    const updated = await this.prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        soldOut,
        version: { increment: 1 },
      },
      include: this.itemInclude(),
    });
    return { data: this.toDto(updated) };
  }

  private async requireModifierGroupIds(
    tx: Prisma.TransactionClient,
    context: AuthContextDto,
    menuId: string,
    groupIds: string[],
  ) {
    if (groupIds.length === 0) return;
    const uniqueIds = [...new Set(groupIds)];
    const found = await tx.modifierGroup.findMany({
      where: {
        id: { in: uniqueIds },
        tenantId: context.tenantId!,
        menuId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { modifierGroupIds: 'invalid' },
      });
    }
  }

  private async createInlineGroups(
    tx: Prisma.TransactionClient,
    context: AuthContextDto,
    menuId: string,
    groups: ModifierGroupInputDto[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const group of groups) {
      if (!group.name?.trim()) continue;
      const kind = group.kind ?? 'extra';
      const created = await tx.modifierGroup.create({
        data: {
          tenantId: context.tenantId!,
          menuId,
          name: group.name.trim(),
          requiredDefault: kind === 'choice',
          minSelections: kind === 'choice' ? 1 : 0,
          maxSelections: kind === 'choice' ? 1 : Math.max(group.options.length, 1),
          status: 'ACTIVE',
          options: {
            create: (group.options ?? [])
              .filter((option) => option.name?.trim())
              .map((option, sortOrder) => ({
                tenantId: context.tenantId!,
                name: option.name.trim(),
                priceDelta: new Prisma.Decimal(option.priceDelta ?? '0'),
                currencyCode: 'ETB',
                status: 'ACTIVE',
                sortOrder,
              })),
          },
        },
      });
      ids.push(created.id);
    }
    return ids;
  }

  private async resolveCategoryId(
    context: AuthContextDto,
    menuId: string,
    categoryId?: string,
    categoryName?: string,
  ): Promise<string | null> {
    if (categoryId) {
      const existing = await this.prisma.menuCategory.findFirst({
        where: { id: categoryId, menuId },
      });
      if (!existing) {
        throw new UnprocessableEntityException({
          status: 422,
          errors: { categoryId: 'invalid' },
        });
      }
      return existing.id;
    }
    const name = categoryName?.trim();
    if (!name) return null;

    const found = await this.prisma.menuCategory.findFirst({
      where: {
        menuId,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (found) return found.id;

    const sortOrder = await this.prisma.menuCategory.count({
      where: { menuId },
    });
    const created = await this.prisma.menuCategory.create({
      data: {
        tenantId: context.tenantId!,
        menuId,
        name,
        sortOrder,
        status: 'ACTIVE',
      },
    });
    return created.id;
  }

  private async defaultPeriodIds(menuId: string): Promise<string[]> {
    const periods = await this.prisma.menuPeriod.findMany({
      where: { menuId, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      take: 1,
    });
    return periods.map((period) => period.id);
  }

  private async requireStation(context: AuthContextDto, stationId: string) {
    const station = await this.prisma.preparationStation.findFirst({
      where: {
        id: stationId,
        branchId: context.branchId!,
        status: 'ACTIVE',
      },
    });
    if (!station) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { preparationStationId: 'invalid' },
      });
    }
    return station;
  }

  private async resolveMenu(context: AuthContextDto, menuId?: string) {
    if (menuId) {
      const menu = await this.prisma.menu.findFirst({
        where: {
          id: menuId,
          tenantId: context.tenantId!,
          status: 'ACTIVE',
          OR: [{ branchId: context.branchId! }, { branchId: null }],
        },
      });
      if (!menu) throw new NotFoundException('Menu not found.');
      return menu;
    }
    const menu = await this.prisma.menu.findFirst({
      where: {
        tenantId: context.tenantId!,
        status: 'ACTIVE',
        OR: [{ branchId: context.branchId! }, { branchId: null }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!menu) throw new NotFoundException('No active menu for this branch.');
    return menu;
  }

  private async findItem(context: AuthContextDto, menuItemId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: menuItemId,
        tenantId: context.tenantId!,
      },
      include: this.itemInclude(),
    });
    if (!item) throw new NotFoundException('Menu item not found.');
    return item;
  }

  private itemInclude() {
    return {
      category: true,
      station: true,
      imageFile: true,
      modifiers: {
        include: {
          group: {
            include: {
              options: {
                where: { status: 'ACTIVE' },
                orderBy: { sortOrder: 'asc' as const },
              },
            },
          },
        },
      },
    };
  }

  private async requireFile(fileId: string) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { imageFileId: 'invalid' },
      });
    }
    return file;
  }

  private toDto(item: {
    id: string;
    menuId: string;
    name: string;
    description: string | null;
    currentPrice: Prisma.Decimal;
    currencyCode: string;
    soldOut: boolean;
    menuCategoryId: string | null;
    preparationStationId: string;
    expectedPrepMinutes: number | null;
    status: string;
    version: number;
    imageFileId: string | null;
    imageKey: string | null;
    imageFile?: { path: string } | null;
    category: { name: string } | null;
    station: { name: string };
    modifiers: Array<{
      minSelectionsOverride: number | null;
      maxSelectionsOverride: number | null;
      requiredOverride: boolean | null;
      group: {
        id: string;
        name: string;
        status: string;
        requiredDefault: boolean;
        minSelections: number;
        maxSelections: number;
        options: Array<{
          id: string;
          name: string;
          priceDelta: Prisma.Decimal;
          currencyCode: string;
        }>;
      };
    }>;
  }): AdminMenuItemDto {
    return {
      id: item.id,
      menuId: item.menuId,
      name: item.name,
      description: item.description,
      price: money(item.currentPrice),
      currencyCode: item.currencyCode,
      soldOut: item.soldOut,
      available: !item.soldOut,
      categoryId: item.menuCategoryId,
      categoryName: item.category?.name ?? item.station.name,
      preparationStationId: item.preparationStationId,
      stationName: item.station.name,
      expectedPrepMinutes: item.expectedPrepMinutes,
      status: item.status,
      version: item.version,
      imageKey: item.imageKey,
      imageFileId: item.imageFileId,
      imageUrl: item.imageFile?.path
        ? item.imageFile.path.replace(/\\/g, '/')
        : null,
      modifierGroups: item.modifiers
        .filter((assignment) => assignment.group.status === 'ACTIVE')
        .map((assignment) => toModifierGroupDto(assignment)),
    };
  }

  private async requireAdmin(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    if (!ADMIN_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Menu admin is for managers.');
    }
    return context;
  }
}

function money(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function toModifierGroupDto(assignment: {
  minSelectionsOverride: number | null;
  maxSelectionsOverride: number | null;
  requiredOverride: boolean | null;
  group: {
    id: string;
    name: string;
    requiredDefault: boolean;
    minSelections: number;
    maxSelections: number;
    options: Array<{
      id: string;
      name: string;
      priceDelta: Prisma.Decimal;
      currencyCode: string;
    }>;
  };
}): AdminModifierGroupDto {
  const min =
    assignment.minSelectionsOverride ?? assignment.group.minSelections;
  const max =
    assignment.maxSelectionsOverride ?? assignment.group.maxSelections;
  const required =
    assignment.requiredOverride ?? assignment.group.requiredDefault;
  const kind: AdminModifierGroupDto['kind'] =
    required && max === 1
      ? 'choice'
      : assignment.group.options.some((option) =>
            option.name.toLowerCase().startsWith('no '),
          ) || assignment.group.name.toLowerCase().includes('hold')
        ? 'included'
        : 'extra';

  return {
    id: assignment.group.id,
    name: assignment.group.name,
    kind,
    minSelections: min,
    maxSelections: max,
    required,
    options: assignment.group.options.map((option) => ({
      id: option.id,
      name: option.name,
      priceDelta: money(option.priceDelta),
      currencyCode: option.currencyCode,
    })),
  };
}
