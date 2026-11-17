import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CaslService } from '../casl/casl.service';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  MARKET_REPORTER_ROLE_CODE,
  PLATFORM_ROLE_CODE,
} from '../identity/identity.constants';
import { OPS_NOTIFY_EVENT, OpsEventType } from '../realtime/ops-events';
import { OpsGateway } from '../realtime/ops.gateway';
import { PublicFeedGateway } from '../realtime/public-feed.gateway';
import {
  BulkUpdateMarketPricesDto,
  CreateMarketCategoryDto,
  CreateMarketItemDto,
  CreateMarketReporterDto,
  CreateMarketUnitDto,
  CreateMarketplaceDto,
  ListMarketItemsQueryDto,
  UpdateMarketCategoryDto,
  UpdateMarketItemDto,
  UpdateMarketReporterStatusDto,
  UpdateMarketUnitDto,
  UpdateMarketplaceDto,
  UpdatePlatformRolePermissionsDto,
  UpsertMarketPriceDto,
} from './dto/market-prices.dto';

const SUPER_ADMIN_ROLES = new Set([
  PLATFORM_ROLE_CODE,
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
]);

export const MARKET_REPORTER_PERMISSIONS_CATALOG = [
  {
    code: 'market.prices.update',
    label: 'Update Market Prices',
    description: 'Post and update daily prices for items across marketplaces.',
  },
  {
    code: 'market.items.manage',
    label: 'Manage Market Items',
    description: 'Create, edit, feature, or archive market goods (e.g. Red Onion, Cooking Oil).',
  },
  {
    code: 'market.locations.manage',
    label: 'Manage Marketplaces, Categories & Units',
    description: 'Add or edit marketplaces (gebeya), categories, and units.',
  },
] as const;

function slugify(value: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'item';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

@Injectable()
export class MarketPricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
    private readonly caslService: CaslService,
    private readonly opsGateway: OpsGateway,
    private readonly publicFeedGateway: PublicFeedGateway,
  ) {}

  private broadcastPricesUpdated(payload?: Record<string, unknown>) {
    try {
      this.opsGateway.server?.emit(OPS_NOTIFY_EVENT, {
        type: OpsEventType.MARKET_PRICES_UPDATED,
        severity: 'INFO',
        title: 'Market prices updated',
        payload: payload ?? {},
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Best-effort real-time broadcast
    }
    this.publicFeedGateway.broadcast(
      OpsEventType.MARKET_PRICES_UPDATED,
      payload,
    );
  }

  private async getPlatformActor(userId: string) {
    const ctx = await this.identityContext.getByUserId(userId);
    const isSuperAdmin = SUPER_ADMIN_ROLES.has(ctx.roleCode);
    const isReporter = ctx.roleCode === MARKET_REPORTER_ROLE_CODE;

    if (!isSuperAdmin && !isReporter) {
      throw new ForbiddenException(
        'Platform Super Admin or Market Reporter access required.',
      );
    }

    const permSet = new Set(ctx.permissions ?? []);
    return {
      ctx,
      isSuperAdmin,
      isReporter,
      canUpdatePrices: isSuperAdmin || permSet.has('market.prices.update'),
      canManageItems: isSuperAdmin || permSet.has('market.items.manage'),
      canManageLocations:
        isSuperAdmin || permSet.has('market.locations.manage'),
    };
  }

  async getMyPlatformPermissions(userId: string) {
    const actor = await this.getPlatformActor(userId);
    return {
      roleCode: actor.ctx.roleCode,
      isSuperAdmin: actor.isSuperAdmin,
      canUpdatePrices: actor.canUpdatePrices,
      canManageItems: actor.canManageItems,
      canManageLocations: actor.canManageLocations,
    };
  }

  async assertTenantCanRead(userId: string) {
    const ctx = await this.identityContext.getByUserId(userId);
    if (
      SUPER_ADMIN_ROLES.has(ctx.roleCode) ||
      ctx.roleCode === MARKET_REPORTER_ROLE_CODE
    ) {
      return ctx;
    }
    if (!ctx.tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }
    const ability = this.caslService.abilityFor(ctx);
    if (!ability.can('read', 'MarketPrices')) {
      throw new ForbiddenException('Not allowed to read Market Prices.');
    }
    return ctx;
  }

  private mapMarketItem(row: {
    id: string;
    name: string;
    slug: string;
    categoryId: string;
    unitId: string;
    photoUrl: string | null;
    description: string | null;
    isFeaturedOnLanding: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    category: { id: string; name: string; slug: string };
    unit: { id: string; code: string; label: string };
    prices: Array<{
      id: string;
      marketplaceId: string;
      price: Prisma.Decimal;
      previousPrice: Prisma.Decimal | null;
      updatedByName: string | null;
      updatedAt: Date;
      marketplace: {
        id: string;
        name: string;
        slug: string;
        city: string | null;
        area: string | null;
        isActive: boolean;
      };
    }>;
  }) {
    const activePrices = row.prices
      .filter((p) => p.marketplace.isActive)
      .map((p) => {
        const priceNum = Number(p.price);
        const prevNum = p.previousPrice !== null ? Number(p.previousPrice) : null;
        const changePercent =
          prevNum && prevNum > 0
            ? Number((((priceNum - prevNum) / prevNum) * 100).toFixed(1))
            : null;
        return {
          id: p.id,
          marketplaceId: p.marketplaceId,
          marketplaceName: p.marketplace.name,
          marketplaceSlug: p.marketplace.slug,
          city: p.marketplace.city,
          area: p.marketplace.area,
          price: priceNum,
          previousPrice: prevNum,
          changePercent,
          updatedByName: p.updatedByName,
          updatedAt: p.updatedAt.toISOString(),
        };
      })
      .sort((a, b) => a.price - b.price);

    const priceValues = activePrices.map((p) => p.price);
    const averagePrice =
      priceValues.length > 0
        ? Number(
            (
              priceValues.reduce((sum, val) => sum + val, 0) /
              priceValues.length
            ).toFixed(2),
          )
        : null;

    const prevValues = activePrices
      .map((p) => p.previousPrice ?? p.price)
      .filter((v) => v > 0);
    const previousAveragePrice =
      prevValues.length > 0
        ? Number(
            (
              prevValues.reduce((sum, val) => sum + val, 0) / prevValues.length
            ).toFixed(2),
          )
        : null;

    const changePercent =
      averagePrice !== null &&
      previousAveragePrice !== null &&
      previousAveragePrice > 0
        ? Number(
            (
              ((averagePrice - previousAveragePrice) / previousAveragePrice) *
              100
            ).toFixed(1),
          )
        : null;

    const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : null;
    const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : null;
    const sortedDates = activePrices.map((p) => p.updatedAt).sort();
    const lastUpdatedAt =
      sortedDates.length > 0
        ? sortedDates[sortedDates.length - 1]
        : row.updatedAt.toISOString();

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      categoryId: row.categoryId,
      category: row.category,
      unitId: row.unitId,
      unit: row.unit,
      photoUrl: row.photoUrl,
      description: row.description,
      isFeaturedOnLanding: row.isFeaturedOnLanding,
      isActive: row.isActive,
      averagePrice,
      previousAveragePrice,
      changePercent,
      minPrice,
      maxPrice,
      marketplaceCount: activePrices.length,
      marketPrices: activePrices,
      lastUpdatedAt,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listMetadata(includeInactive = false) {
    const whereActive = includeInactive ? {} : { isActive: true };
    const [categories, units, marketplaces] = await Promise.all([
      this.prisma.marketCategory.findMany({
        where: whereActive,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.marketUnit.findMany({
        where: whereActive,
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
      this.prisma.marketplace.findMany({
        where: whereActive,
        orderBy: [{ name: 'asc' }],
      }),
    ]);

    return { categories, units, marketplaces };
  }

  async listItems(query: ListMarketItemsQueryDto, allowInactive = false) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 24));
    const search = query.search?.trim();

    const where: Prisma.MarketItemWhereInput = {
      ...(allowInactive && query.includeInactive ? {} : { isActive: true }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.featuredOnly ? { isFeaturedOnLanding: true } : {}),
      ...(query.marketplaceId
        ? { prices: { some: { marketplaceId: query.marketplaceId } } }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              {
                category: { name: { contains: search, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.marketItem.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          unit: { select: { id: true, code: true, label: true } },
          prices: {
            include: {
              marketplace: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  city: true,
                  area: true,
                  isActive: true,
                },
              },
            },
          },
        },
        orderBy: [
          { isFeaturedOnLanding: 'desc' },
          { updatedAt: 'desc' },
          { name: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.marketItem.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapMarketItem(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getItemDetail(idOrSlug: string) {
    const where: Prisma.MarketItemWhereInput = isUuid(idOrSlug)
      ? { id: idOrSlug }
      : { slug: idOrSlug };

    const row = await this.prisma.marketItem.findFirst({
      where: { ...where, isActive: true },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        unit: { select: { id: true, code: true, label: true } },
        prices: {
          include: {
            marketplace: {
              select: {
                id: true,
                name: true,
                slug: true,
                city: true,
                area: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Market item not found.');
    }

    const historyRows = await this.prisma.marketPriceHistory.findMany({
      where: { itemId: row.id },
      include: {
        marketplace: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { recordedAt: 'desc' },
      take: 60,
    });

    return {
      ...this.mapMarketItem(row),
      history: historyRows
        .reverse()
        .map((h) => ({
          id: h.id,
          marketplaceId: h.marketplaceId,
          marketplaceName: h.marketplace.name,
          price: Number(h.price),
          recordedByName: h.recordedByName,
          recordedAt: h.recordedAt.toISOString(),
        })),
    };
  }

  async listPriceHistory(query: {
    dateFrom?: string;
    dateTo?: string;
    itemId?: string;
    marketplaceId?: string;
    categoryId?: string;
    limit?: number;
  }) {
    const where: Prisma.MarketPriceHistoryWhereInput = {};
    if (query.itemId) where.itemId = query.itemId;
    if (query.marketplaceId) where.marketplaceId = query.marketplaceId;
    if (query.categoryId) {
      where.item = { categoryId: query.categoryId };
    }
    if (query.dateFrom || query.dateTo) {
      where.recordedAt = {};
      if (query.dateFrom) {
        const from = new Date(query.dateFrom);
        if (!Number.isNaN(from.getTime())) {
          where.recordedAt.gte = from;
        }
      }
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        if (!Number.isNaN(to.getTime())) {
          // Include the entire end day if a YYYY-MM-DD string was passed
          if (query.dateTo.length <= 10) {
            to.setHours(23, 59, 59, 999);
          }
          where.recordedAt.lte = to;
        }
      }
    }

    const take = Math.min(Math.max(Number(query.limit) || 150, 1), 500);

    const rows = await this.prisma.marketPriceHistory.findMany({
      where,
      include: {
        item: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: { select: { id: true, name: true } },
            unit: { select: { code: true, label: true } },
          },
        },
        marketplace: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { recordedAt: 'desc' },
      take,
    });

    const prices = rows.map((r) => Number(r.price));
    const avgPrice =
      prices.length > 0
        ? Math.round(
            (prices.reduce((a, b) => a + b, 0) / prices.length) * 100,
          ) / 100
        : null;

    return {
      entries: rows.map((r) => ({
        id: r.id,
        itemId: r.itemId,
        itemName: r.item.name,
        itemSlug: r.item.slug,
        categoryName: r.item.category.name,
        unitCode: r.item.unit.code,
        marketplaceId: r.marketplaceId,
        marketplaceName: r.marketplace.name,
        price: Number(r.price),
        recordedByName: r.recordedByName,
        recordedAt: r.recordedAt.toISOString(),
      })),
      summary: {
        count: rows.length,
        avgPrice,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
        maxPrice: prices.length > 0 ? Math.max(...prices) : null,
      },
    };
  }

  async upsertPrice(userId: string, dto: UpsertMarketPriceDto) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canUpdatePrices) {
      throw new ForbiddenException(
        'Your role does not have permission to update market prices.',
      );
    }

    const [item, marketplace] = await Promise.all([
      this.prisma.marketItem.findUnique({ where: { id: dto.itemId } }),
      this.prisma.marketplace.findUnique({ where: { id: dto.marketplaceId } }),
    ]);

    if (!item) throw new NotFoundException('Market item not found.');
    if (!marketplace) throw new NotFoundException('Marketplace not found.');

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.marketItemPrice.findUnique({
        where: {
          itemId_marketplaceId: {
            itemId: dto.itemId,
            marketplaceId: dto.marketplaceId,
          },
        },
      });

      const previousPrice = existing ? existing.price : null;
      const saved = await tx.marketItemPrice.upsert({
        where: {
          itemId_marketplaceId: {
            itemId: dto.itemId,
            marketplaceId: dto.marketplaceId,
          },
        },
        update: {
          price: dto.price,
          previousPrice,
          updatedById: actor.ctx.userId,
          updatedByName: actor.ctx.displayName,
        },
        create: {
          itemId: dto.itemId,
          marketplaceId: dto.marketplaceId,
          price: dto.price,
          previousPrice: null,
          updatedById: actor.ctx.userId,
          updatedByName: actor.ctx.displayName,
        },
      });

      await tx.marketPriceHistory.create({
        data: {
          itemId: dto.itemId,
          marketplaceId: dto.marketplaceId,
          price: dto.price,
          recordedById: actor.ctx.userId,
          recordedByName: actor.ctx.displayName,
        },
      });

      await tx.marketItem.update({
        where: { id: dto.itemId },
        data: { updatedAt: new Date() },
      });

      return saved;
    });

    this.broadcastPricesUpdated({
      itemId: dto.itemId,
      marketplaceId: dto.marketplaceId,
    });

    return {
      id: updated.id,
      itemId: updated.itemId,
      marketplaceId: updated.marketplaceId,
      price: Number(updated.price),
      previousPrice:
        updated.previousPrice !== null ? Number(updated.previousPrice) : null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async bulkUpsertPrices(userId: string, dto: BulkUpdateMarketPricesDto) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canUpdatePrices) {
      throw new ForbiddenException(
        'Your role does not have permission to update market prices.',
      );
    }
    if (!dto.entries.length) {
      throw new BadRequestException('At least one price entry is required.');
    }

    const results: Array<{
      id: string;
      itemId: string;
      marketplaceId: string;
      price: number;
      previousPrice: number | null;
      updatedAt: string;
    }> = [];
    for (const entry of dto.entries) {
      results.push(await this.upsertPrice(userId, entry));
    }
    return { updatedCount: results.length, entries: results };
  }

  async createItem(userId: string, dto: CreateMarketItemDto) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canManageItems) {
      throw new ForbiddenException(
        'Your role does not have permission to create market items.',
      );
    }

    const baseSlug = slugify(dto.name);
    const existingSlug = await this.prisma.marketItem.findUnique({
      where: { slug: baseSlug },
    });
    const slug = existingSlug
      ? `${baseSlug}-${Date.now().toString(36).slice(-4)}`
      : baseSlug;

    const created = await this.prisma.marketItem.create({
      data: {
        name: dto.name.trim(),
        slug,
        categoryId: dto.categoryId,
        unitId: dto.unitId,
        photoUrl: dto.photoUrl?.trim() || null,
        description: dto.description?.trim() || null,
        isFeaturedOnLanding: dto.isFeaturedOnLanding ?? true,
        isActive: true,
      },
    });

    this.broadcastPricesUpdated({ itemId: created.id });
    return created;
  }

  async updateItem(userId: string, id: string, dto: UpdateMarketItemDto) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canManageItems) {
      throw new ForbiddenException(
        'Your role does not have permission to edit market items.',
      );
    }

    const existing = await this.prisma.marketItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Market item not found.');

    const updated = await this.prisma.marketItem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.unitId !== undefined ? { unitId: dto.unitId } : {}),
        ...(dto.photoUrl !== undefined
          ? { photoUrl: dto.photoUrl?.trim() || null }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.isFeaturedOnLanding !== undefined
          ? { isFeaturedOnLanding: dto.isFeaturedOnLanding }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    this.broadcastPricesUpdated({ itemId: updated.id });
    return updated;
  }

  async createCategory(userId: string, dto: CreateMarketCategoryDto) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canManageLocations) {
      throw new ForbiddenException(
        'Your role does not have permission to manage categories.',
      );
    }
    const baseSlug = slugify(dto.name);
    const existing = await this.prisma.marketCategory.findUnique({
      where: { slug: baseSlug },
    });
    const slug = existing
      ? `${baseSlug}-${Date.now().toString(36).slice(-4)}`
      : baseSlug;

    return this.prisma.marketCategory.create({
      data: {
        name: dto.name.trim(),
        slug,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(
    userId: string,
    id: string,
    dto: UpdateMarketCategoryDto,
  ) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canManageLocations) {
      throw new ForbiddenException(
        'Your role does not have permission to manage categories.',
      );
    }
    return this.prisma.marketCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async createUnit(userId: string, dto: CreateMarketUnitDto) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canManageLocations) {
      throw new ForbiddenException(
        'Your role does not have permission to manage units.',
      );
    }
    return this.prisma.marketUnit.create({
      data: {
        code: dto.code.trim(),
        label: dto.label.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateUnit(userId: string, id: string, dto: UpdateMarketUnitDto) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canManageLocations) {
      throw new ForbiddenException(
        'Your role does not have permission to manage units.',
      );
    }
    return this.prisma.marketUnit.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async createMarketplace(userId: string, dto: CreateMarketplaceDto) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canManageLocations) {
      throw new ForbiddenException(
        'Your role does not have permission to manage marketplaces.',
      );
    }
    const baseSlug = slugify(dto.name);
    const existing = await this.prisma.marketplace.findUnique({
      where: { slug: baseSlug },
    });
    const slug = existing
      ? `${baseSlug}-${Date.now().toString(36).slice(-4)}`
      : baseSlug;

    return this.prisma.marketplace.create({
      data: {
        name: dto.name.trim(),
        slug,
        city: dto.city?.trim() || null,
        area: dto.area?.trim() || null,
      },
    });
  }

  async updateMarketplace(
    userId: string,
    id: string,
    dto: UpdateMarketplaceDto,
  ) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.canManageLocations) {
      throw new ForbiddenException(
        'Your role does not have permission to manage marketplaces.',
      );
    }
    return this.prisma.marketplace.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
        ...(dto.area !== undefined ? { area: dto.area?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // ---- Super Admin ONLY: Market Reporters & Platform Role Permissions ----

  private async assertSuperAdmin(userId: string) {
    const actor = await this.getPlatformActor(userId);
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException('Super Admin access required.');
    }
    return actor;
  }

  async listReporters(userId: string) {
    await this.assertSuperAdmin(userId);
    const rows = await this.prisma.platformUserRole.findMany({
      where: { roleCode: MARKET_REPORTER_ROLE_CODE },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            email: true,
            accountStatus: true,
            createdAt: true,
          },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      displayName: r.user.displayName,
      phone: r.user.phone,
      email: r.user.email,
      status: r.status,
      accountStatus: r.user.accountStatus,
      grantedAt: r.grantedAt.toISOString(),
    }));
  }

  async createReporter(userId: string, dto: CreateMarketReporterDto) {
    const actor = await this.assertSuperAdmin(userId);
    const phone = dto.phone.trim();
    const email = dto.email?.trim() || null;
    const passwordHash = await bcrypt.hash(dto.password.trim(), 10);

    const existingUser = await this.prisma.appUser.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
      include: { platformRoles: true },
    });

    if (existingUser) {
      const alreadySuper = existingUser.platformRoles.some((r) =>
        SUPER_ADMIN_ROLES.has(r.roleCode),
      );
      if (alreadySuper) {
        throw new BadRequestException(
          'This user is already a Platform Super Admin.',
        );
      }

      const roleRow = await this.prisma.platformUserRole.upsert({
        where: {
          userId_roleCode: {
            userId: existingUser.id,
            roleCode: MARKET_REPORTER_ROLE_CODE,
          },
        },
        update: {
          status: 'ACTIVE',
          grantedByUserId: actor.ctx.userId,
        },
        create: {
          userId: existingUser.id,
          roleCode: MARKET_REPORTER_ROLE_CODE,
          status: 'ACTIVE',
          grantedByUserId: actor.ctx.userId,
        },
      });

      return {
        id: roleRow.id,
        userId: existingUser.id,
        displayName: existingUser.displayName,
        phone: existingUser.phone,
        email: existingUser.email,
        status: roleRow.status,
      };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: {
          displayName: dto.displayName.trim(),
          phone,
          email,
          accountStatus: 'ACTIVE',
        },
      });

      await tx.userCredential.create({
        data: {
          userId: user.id,
          passwordHash,
          authProvider: 'email',
        },
      });

      const roleRow = await tx.platformUserRole.create({
        data: {
          userId: user.id,
          roleCode: MARKET_REPORTER_ROLE_CODE,
          status: 'ACTIVE',
          grantedByUserId: actor.ctx.userId,
        },
      });

      return { user, roleRow };
    });

    return {
      id: created.roleRow.id,
      userId: created.user.id,
      displayName: created.user.displayName,
      phone: created.user.phone,
      email: created.user.email,
      status: created.roleRow.status,
    };
  }

  async updateReporterStatus(
    userId: string,
    roleId: string,
    dto: UpdateMarketReporterStatusDto,
  ) {
    await this.assertSuperAdmin(userId);
    const updated = await this.prisma.platformUserRole.update({
      where: { id: roleId },
      data: { status: dto.status },
    });
    return { id: updated.id, status: updated.status };
  }

  async getPlatformRolePermissions(userId: string, roleCode: string) {
    await this.assertSuperAdmin(userId);
    const rows = await this.prisma.platformRolePermission.findMany({
      where: { roleCode },
    });
    const enabledByCode = new Map(
      rows.map((r) => [r.permissionCode, r.enabled]),
    );

    return {
      roleCode,
      permissions: MARKET_REPORTER_PERMISSIONS_CATALOG.map((item) => ({
        permissionCode: item.code,
        label: item.label,
        description: item.description,
        enabled: enabledByCode.get(item.code) ?? false,
      })),
    };
  }

  async updatePlatformRolePermissions(
    userId: string,
    roleCode: string,
    dto: UpdatePlatformRolePermissionsDto,
  ) {
    await this.assertSuperAdmin(userId);
    for (const perm of dto.permissions) {
      await this.prisma.platformRolePermission.upsert({
        where: {
          roleCode_permissionCode: {
            roleCode,
            permissionCode: perm.permissionCode,
          },
        },
        update: { enabled: perm.enabled },
        create: {
          roleCode,
          permissionCode: perm.permissionCode,
          enabled: perm.enabled,
        },
      });
    }
    return this.getPlatformRolePermissions(userId, roleCode);
  }
}

