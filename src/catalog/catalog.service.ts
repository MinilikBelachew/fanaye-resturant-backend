import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import {
  MenuItemDto,
  MenuItemSingleResponseDto,
  MenuListResponseDto,
  MenuCategoryDto,
} from './dto/menu-item-response.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  private async getContextAndMenu(userId: string) {
    const context = await this.identity.getByUserId(userId);
    let tenantId = context.tenantId;
    let branchId = context.branchId;

    if (!tenantId) {
      const firstTenant = await this.prisma.tenant.findFirst({
        where: { status: 'ACTIVE' },
      });
      if (firstTenant) {
        tenantId = firstTenant.id;
      } else {
        throw new NotFoundException('No active tenant found.');
      }
    }

    if (!branchId) {
      const firstBranch = await this.prisma.branch.findFirst({
        where: { tenantId, status: 'ACTIVE' },
      });
      if (firstBranch) {
        branchId = firstBranch.id;
      }
    }

    let menu = await this.prisma.menu.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
    });

    if (!menu) {
      menu = await this.prisma.menu.create({
        data: {
          tenantId,
          name: 'Main House Menu',
          status: 'ACTIVE',
        },
      });
    }

    return { context, tenantId, branchId, menu };
  }

  private async resolveStation(
    tenantId: string,
    branchId: string | null,
    stationIdOrCode: string,
  ) {
    let station = await this.prisma.preparationStation.findFirst({
      where: {
        OR: [
          { id: stationIdOrCode.length === 36 ? stationIdOrCode : undefined },
          { code: stationIdOrCode.toUpperCase() },
          { name: { equals: stationIdOrCode, mode: 'insensitive' } },
        ],
        ...(branchId ? { branchId } : {}),
      },
    });

    if (!station && branchId) {
      const stationCode = stationIdOrCode
        .replace(/^station-/, '')
        .toUpperCase();
      const stationName =
        stationCode.charAt(0) + stationCode.slice(1).toLowerCase();
      station = await this.prisma.preparationStation.create({
        data: {
          tenantId,
          branchId,
          code: stationCode.slice(0, 30),
          name: stationName,
          status: 'ACTIVE',
        },
      });
    }

    if (!station) {
      station = await this.prisma.preparationStation.findFirst({
        where: { tenantId },
      });
    }

    if (!station && branchId) {
      station = await this.prisma.preparationStation.create({
        data: {
          tenantId,
          branchId,
          code: 'KITCHEN',
          name: 'Kitchen',
          status: 'ACTIVE',
        },
      });
    }

    if (!station) {
      throw new UnprocessableEntityException(
        'Unable to resolve preparation station.',
      );
    }

    return station;
  }

  async list(userId: string): Promise<MenuListResponseDto> {
    const { tenantId, menu } = await this.getContextAndMenu(userId);

    const [items, categories] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: {
          tenantId,
          menuId: menu.id,
          status: 'ACTIVE',
        },
        include: {
          category: true,
          station: true,
          modifiers: {
            include: {
              group: {
                include: {
                  options: {
                    where: { status: 'ACTIVE' },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.menuCategory.findMany({
        where: {
          tenantId,
          menuId: menu.id,
          status: 'ACTIVE',
        },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const formattedItems: MenuItemDto[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      price: Number(item.currentPrice),
      currencyCode: item.currencyCode,
      category: item.category?.name ?? item.station.name,
      categoryId: item.menuCategoryId ?? undefined,
      stationId: item.preparationStationId,
      stationName: item.station.name,
      expectedPreparationMinutes: item.expectedPrepMinutes ?? 10,
      image: undefined,
      available: !item.soldOut,
      modifierGroups: item.modifiers.map((m) => ({
        id: m.group.id,
        name: m.group.name,
        kind: m.group.requiredDefault ? 'choice' : 'included',
        min: m.minSelectionsOverride ?? m.group.minSelections,
        max: m.maxSelectionsOverride ?? m.group.maxSelections,
        options: m.group.options.map((opt) => ({
          id: opt.id,
          name: opt.name,
          ticketLabel: opt.name,
          priceDelta: Number(opt.priceDelta),
        })),
      })),
    }));

    const formattedCats: MenuCategoryDto[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
    }));

    return {
      items: formattedItems,
      categories: formattedCats,
    };
  }

  async create(
    userId: string,
    dto: CreateMenuItemDto,
  ): Promise<MenuItemSingleResponseDto> {
    const { tenantId, branchId, menu } = await this.getContextAndMenu(userId);
    const station = await this.resolveStation(
      tenantId,
      branchId,
      dto.stationId,
    );

    let categoryId = dto.menuCategoryId;
    if (!categoryId && dto.category) {
      let cat = await this.prisma.menuCategory.findFirst({
        where: {
          tenantId,
          menuId: menu.id,
          name: { equals: dto.category.trim(), mode: 'insensitive' },
        },
      });
      if (!cat) {
        cat = await this.prisma.menuCategory.create({
          data: {
            tenantId,
            menuId: menu.id,
            name: dto.category.trim(),
            status: 'ACTIVE',
          },
        });
      }
      categoryId = cat.id;
    }

    const created = await this.prisma.menuItem.create({
      data: {
        tenantId,
        menuId: menu.id,
        menuCategoryId: categoryId,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? '',
        currentPrice: new Prisma.Decimal(dto.price),
        currencyCode: dto.currencyCode ?? 'ETB',
        preparationStationId: station.id,
        expectedPrepMinutes: dto.expectedPreparationMinutes ?? 10,
        status: 'ACTIVE',
        soldOut: dto.available === false,
      },
      include: {
        category: true,
        station: true,
      },
    });

    // Handle modifier groups if provided
    if (dto.modifierGroups && dto.modifierGroups.length > 0) {
      for (let i = 0; i < dto.modifierGroups.length; i++) {
        const mg = dto.modifierGroups[i];
        const group = await this.prisma.modifierGroup.create({
          data: {
            tenantId,
            menuId: menu.id,
            name: mg.name.trim(),
            minSelections: mg.min ?? 0,
            maxSelections: mg.max ?? (mg.kind === 'choice' ? 1 : 5),
            requiredDefault: mg.kind === 'choice',
            status: 'ACTIVE',
          },
        });

        if (mg.options && mg.options.length > 0) {
          for (let j = 0; j < mg.options.length; j++) {
            const opt = mg.options[j];
            await this.prisma.modifierOption.create({
              data: {
                tenantId,
                modifierGroupId: group.id,
                name: opt.name.trim(),
                priceDelta: new Prisma.Decimal(opt.priceDelta ?? 0),
                currencyCode: 'ETB',
                sortOrder: j,
                status: 'ACTIVE',
              },
            });
          }
        }

        await this.prisma.menuItemModifierAssignment.create({
          data: {
            tenantId,
            menuItemId: created.id,
            modifierGroupId: group.id,
            sortOrder: i,
          },
        });
      }
    }

    return {
      data: {
        id: created.id,
        name: created.name,
        description: created.description ?? '',
        price: Number(created.currentPrice),
        currencyCode: created.currencyCode,
        category: created.category?.name ?? created.station.name,
        categoryId: created.menuCategoryId ?? undefined,
        stationId: created.preparationStationId,
        stationName: created.station.name,
        expectedPreparationMinutes: created.expectedPrepMinutes ?? 10,
        image: dto.image,
        available: !created.soldOut,
        modifierGroups: [],
      },
    };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateMenuItemDto,
  ): Promise<MenuItemSingleResponseDto> {
    const { tenantId, branchId } = await this.getContextAndMenu(userId);

    const existing = await this.prisma.menuItem.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Menu item not found.');
    }

    let stationId = existing.preparationStationId;
    if (dto.stationId) {
      const station = await this.resolveStation(
        tenantId,
        branchId,
        dto.stationId,
      );
      stationId = station.id;
    }

    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        description:
          dto.description !== undefined ? dto.description.trim() : undefined,
        currentPrice:
          dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        preparationStationId: stationId,
        menuCategoryId:
          dto.menuCategoryId !== undefined ? dto.menuCategoryId : undefined,
        expectedPrepMinutes: dto.expectedPreparationMinutes,
        soldOut: dto.available !== undefined ? !dto.available : undefined,
      },
      include: {
        category: true,
        station: true,
      },
    });

    return {
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description ?? '',
        price: Number(updated.currentPrice),
        currencyCode: updated.currencyCode,
        category: updated.category?.name ?? updated.station.name,
        categoryId: updated.menuCategoryId ?? undefined,
        stationId: updated.preparationStationId,
        stationName: updated.station.name,
        expectedPreparationMinutes: updated.expectedPrepMinutes ?? 10,
        image: dto.image,
        available: !updated.soldOut,
        modifierGroups: [],
      },
    };
  }

  async toggle86(
    userId: string,
    id: string,
  ): Promise<MenuItemSingleResponseDto> {
    const { tenantId } = await this.getContextAndMenu(userId);
    const existing = await this.prisma.menuItem.findFirst({
      where: { id, tenantId },
      include: { category: true, station: true },
    });
    if (!existing) {
      throw new NotFoundException('Menu item not found.');
    }

    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: {
        soldOut: !existing.soldOut,
      },
      include: {
        category: true,
        station: true,
      },
    });

    return {
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description ?? '',
        price: Number(updated.currentPrice),
        currencyCode: updated.currencyCode,
        category: updated.category?.name ?? updated.station.name,
        categoryId: updated.menuCategoryId ?? undefined,
        stationId: updated.preparationStationId,
        stationName: updated.station.name,
        expectedPreparationMinutes: updated.expectedPrepMinutes ?? 10,
        available: !updated.soldOut,
        modifierGroups: [],
      },
    };
  }

  async delete(userId: string, id: string): Promise<{ success: boolean }> {
    const { tenantId } = await this.getContextAndMenu(userId);
    const existing = await this.prisma.menuItem.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Menu item not found.');
    }

    await this.prisma.menuItem.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    return { success: true };
  }

  async createCategory(
    userId: string,
    dto: CreateCategoryDto,
  ): Promise<MenuCategoryDto> {
    const { tenantId, menu } = await this.getContextAndMenu(userId);

    const created = await this.prisma.menuCategory.create({
      data: {
        tenantId,
        menuId: menu.id,
        name: dto.name.trim(),
        sortOrder: dto.sortOrder ?? 0,
        status: 'ACTIVE',
      },
    });

    return {
      id: created.id,
      name: created.name,
      sortOrder: created.sortOrder,
    };
  }
}
