import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MarketingCampaignStatus, Prisma } from '@prisma/client';
import { CaslService } from '../casl/casl.service';
import { PrismaService } from '../database/prisma.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { IdentityContextService } from '../identity/identity-context.service';
import { PLATFORM_ROLE_CODE } from '../identity/identity.constants';
import { OpsEventType } from '../realtime/ops-events';
import { OpsGateway } from '../realtime/ops.gateway';
import { superAdminRoom, tenantRoom } from '../realtime/ops-rooms';
import {
  CreateMarketingCampaignDto,
  ListMarketingCampaignsQueryDto,
  SubmitMarketingPaymentDto,
  UpdateMarketingCampaignStatusDto,
} from './dto/marketing.dto';

const PLATFORM_ROLES = new Set([
  PLATFORM_ROLE_CODE,
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
]);

const ALLOWED_ADMIN_TRANSITIONS: Record<
  MarketingCampaignStatus,
  MarketingCampaignStatus[]
> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROMOTING', 'CANCELLED'],
  PROMOTING: ['PROMOTING', 'DONE', 'CANCELLED'],
  DONE: ['DONE', 'PAID', 'CANCELLED'],
  PAYMENT_SUBMITTED: ['PAID', 'DONE', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly casl: CaslService,
    private readonly opsGateway: OpsGateway,
  ) {}

  private async getTenantContext(
    userId: string,
    action: 'read' | 'manage',
  ): Promise<AuthContextDto & { tenantId: string }> {
    const ctx = await this.identity.getByUserId(userId);
    if (!ctx.tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }
    this.casl.assertCan(ctx, action, 'Marketing');
    return ctx as AuthContextDto & { tenantId: string };
  }

  private async assertSuperAdmin(userId: string): Promise<AuthContextDto> {
    const ctx = await this.identity.getByUserId(userId);
    if (!PLATFORM_ROLES.has(ctx.roleCode)) {
      throw new ForbiddenException('Platform super admin access required.');
    }
    this.casl.assertCan(ctx, 'manage', 'Marketing');
    return ctx;
  }

  private mapCampaign(row: {
    id: string;
    tenantId: string;
    branchId: string | null;
    menuItemId: string;
    requestedById: string;
    targetLocation: string;
    targetAgeMin: number;
    targetAgeMax: number;
    targetViews: number;
    notes: string | null;
    status: MarketingCampaignStatus;
    deliveredViews: number;
    amountDue: Prisma.Decimal | null;
    currencyCode: string;
    adminNotes: string | null;
    paymentReference: string | null;
    paymentNotes: string | null;
    confirmedAt: Date | null;
    promotedAt: Date | null;
    doneAt: Date | null;
    paymentSubmittedAt: Date | null;
    paidAt: Date | null;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    tenant?: { id: string; displayName: string; currencyCode: string };
    branch?: { id: string; name: string } | null;
    menuItem?: {
      id: string;
      name: string;
      currentPrice: Prisma.Decimal;
      currencyCode: string;
      imageKey: string | null;
      imageFile?: { path: string } | null;
    };
    requestedBy?: { id: string; displayName: string };
  }) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenant?.displayName ?? null,
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
      menuItemId: row.menuItemId,
      menuItemName: row.menuItem?.name ?? 'Menu Item',
      menuItemPrice: row.menuItem ? Number(row.menuItem.currentPrice) : null,
      menuItemCurrency: row.menuItem?.currencyCode ?? row.currencyCode,
      menuItemImage:
        row.menuItem?.imageFile?.path ?? row.menuItem?.imageKey ?? null,
      requestedById: row.requestedById,
      requestedByName: row.requestedBy?.displayName ?? null,
      targetLocation: row.targetLocation,
      targetAgeMin: row.targetAgeMin,
      targetAgeMax: row.targetAgeMax,
      targetViews: row.targetViews,
      notes: row.notes,
      status: row.status,
      deliveredViews: row.deliveredViews,
      amountDue: row.amountDue !== null ? Number(row.amountDue) : null,
      currencyCode: row.currencyCode,
      adminNotes: row.adminNotes,
      paymentReference: row.paymentReference,
      paymentNotes: row.paymentNotes,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      promotedAt: row.promotedAt?.toISOString() ?? null,
      doneAt: row.doneAt?.toISOString() ?? null,
      paymentSubmittedAt: row.paymentSubmittedAt?.toISOString() ?? null,
      paidAt: row.paidAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private campaignInclude() {
    return {
      tenant: { select: { id: true, displayName: true, currencyCode: true } },
      branch: { select: { id: true, name: true } },
      menuItem: {
        select: {
          id: true,
          name: true,
          currentPrice: true,
          currencyCode: true,
          imageKey: true,
          imageFile: { select: { path: true } },
        },
      },
      requestedBy: { select: { id: true, displayName: true } },
    } satisfies Prisma.MarketingCampaignInclude;
  }

  private async getCountsAndDue(whereBase: Prisma.MarketingCampaignWhereInput) {
    const [grouped, unpaidAgg, viewsAgg] = await Promise.all([
      this.prisma.marketingCampaign.groupBy({
        by: ['status'],
        where: whereBase,
        _count: { _all: true },
      }),
      this.prisma.marketingCampaign.aggregate({
        where: {
          ...whereBase,
          status: { in: ['DONE', 'PAYMENT_SUBMITTED'] },
        },
        _sum: { amountDue: true },
      }),
      this.prisma.marketingCampaign.aggregate({
        where: whereBase,
        _sum: { deliveredViews: true },
      }),
    ]);

    const counts: Record<MarketingCampaignStatus, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      PROMOTING: 0,
      DONE: 0,
      PAYMENT_SUBMITTED: 0,
      PAID: 0,
      CANCELLED: 0,
    };

    let totalAll = 0;
    for (const row of grouped) {
      counts[row.status] = row._count._all;
      totalAll += row._count._all;
    }

    return {
      counts: { ALL: totalAll, ...counts },
      totalAmountDue: Number(unpaidAgg._sum.amountDue ?? 0),
      totalDeliveredViews: Number(viewsAgg._sum.deliveredViews ?? 0),
    };
  }

  private async paginatedList(
    baseWhere: Prisma.MarketingCampaignWhereInput,
    query: ListMarketingCampaignsQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const search = query.search?.trim();

    const where: Prisma.MarketingCampaignWhereInput = {
      ...baseWhere,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { targetLocation: { contains: search, mode: 'insensitive' } },
              {
                menuItem: { name: { contains: search, mode: 'insensitive' } },
              },
              {
                tenant: {
                  displayName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total, summary] = await Promise.all([
      this.prisma.marketingCampaign.findMany({
        where,
        include: this.campaignInclude(),
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.marketingCampaign.count({ where }),
      this.getCountsAndDue(baseWhere),
    ]);

    return {
      items: rows.map((r) => this.mapCampaign(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      ...summary,
    };
  }

  async listForTenant(userId: string, query: ListMarketingCampaignsQueryDto) {
    const ctx = await this.getTenantContext(userId, 'read');
    return this.paginatedList({ tenantId: ctx.tenantId }, query);
  }

  async getForTenant(userId: string, id: string) {
    const ctx = await this.getTenantContext(userId, 'read');
    const row = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: this.campaignInclude(),
    });
    if (!row) {
      throw new NotFoundException('Promotion request not found.');
    }
    return this.mapCampaign(row);
  }

  async createRequest(userId: string, dto: CreateMarketingCampaignDto) {
    const ctx = await this.getTenantContext(userId, 'manage');
    if (dto.targetAgeMin > dto.targetAgeMax) {
      throw new BadRequestException(
        'Minimum target age cannot exceed maximum target age.',
      );
    }

    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: dto.menuItemId, tenantId: ctx.tenantId },
      select: { id: true, name: true, currencyCode: true },
    });
    if (!menuItem) {
      throw new NotFoundException('Menu item not found for this restaurant.');
    }

    const branchId = dto.branchId ?? ctx.branchId ?? null;
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException('Invalid branch for this restaurant.');
      }
    }

    const created = await this.prisma.marketingCampaign.create({
      data: {
        tenantId: ctx.tenantId,
        branchId,
        menuItemId: menuItem.id,
        requestedById: ctx.userId,
        targetLocation: dto.targetLocation.trim(),
        targetAgeMin: dto.targetAgeMin,
        targetAgeMax: dto.targetAgeMax,
        targetViews: dto.targetViews,
        notes: dto.notes?.trim() || null,
        currencyCode: menuItem.currencyCode || 'ETB',
        status: 'PENDING',
      },
      include: this.campaignInclude(),
    });

    const mapped = this.mapCampaign(created);

    this.opsGateway.dispatch({
      type: OpsEventType.MARKETING_REQUEST_CREATED,
      tenantId: ctx.tenantId,
      branchId: branchId ?? '',
      severity: 'ATTENTION',
      title: `New Promotion Request: ${menuItem.name}`,
      body: `${mapped.tenantName ?? 'Restaurant'} • ${mapped.targetLocation} • ${mapped.targetViews.toLocaleString()} views`,
      relatedEntityType: 'MarketingCampaign',
      relatedEntityId: mapped.id,
      payload: mapped,
      rooms: [superAdminRoom(), tenantRoom(ctx.tenantId)],
    });

    return mapped;
  }

  async cancelByTenant(userId: string, id: string) {
    const ctx = await this.getTenantContext(userId, 'manage');
    const existing = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Promotion request not found.');
    }
    if (existing.status !== 'PENDING' && existing.status !== 'CONFIRMED') {
      throw new BadRequestException(
        'Only pending or confirmed requests can be cancelled.',
      );
    }

    const updated = await this.prisma.marketingCampaign.update({
      where: { id: existing.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
      include: this.campaignInclude(),
    });

    const mapped = this.mapCampaign(updated);
    this.emitCampaignUpdated(mapped, 'Promotion Request Cancelled');
    return mapped;
  }

  async submitPayment(
    userId: string,
    id: string,
    dto: SubmitMarketingPaymentDto,
  ) {
    const ctx = await this.getTenantContext(userId, 'manage');
    const existing = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Promotion request not found.');
    }
    if (existing.status !== 'DONE') {
      throw new BadRequestException(
        'Payment can only be submitted after promotion is marked done.',
      );
    }

    const updated = await this.prisma.marketingCampaign.update({
      where: { id: existing.id },
      data: {
        status: 'PAYMENT_SUBMITTED',
        paymentReference: dto.paymentReference.trim(),
        paymentNotes: dto.paymentNotes?.trim() || null,
        paymentSubmittedAt: new Date(),
      },
      include: this.campaignInclude(),
    });

    const mapped = this.mapCampaign(updated);
    this.emitCampaignUpdated(
      mapped,
      `Payment Submitted: ${mapped.menuItemName}`,
    );
    return mapped;
  }

  async listForSuperAdmin(
    userId: string,
    query: ListMarketingCampaignsQueryDto,
  ) {
    await this.assertSuperAdmin(userId);
    const baseWhere: Prisma.MarketingCampaignWhereInput = query.tenantId
      ? { tenantId: query.tenantId }
      : {};
    return this.paginatedList(baseWhere, query);
  }

  async getForSuperAdmin(userId: string, id: string) {
    await this.assertSuperAdmin(userId);
    const row = await this.prisma.marketingCampaign.findUnique({
      where: { id },
      include: this.campaignInclude(),
    });
    if (!row) {
      throw new NotFoundException('Promotion request not found.');
    }
    return this.mapCampaign(row);
  }

  async updateBySuperAdmin(
    userId: string,
    id: string,
    dto: UpdateMarketingCampaignStatusDto,
  ) {
    await this.assertSuperAdmin(userId);
    const existing = await this.prisma.marketingCampaign.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Promotion request not found.');
    }

    const allowed = ALLOWED_ADMIN_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition campaign from ${existing.status} to ${dto.status}.`,
      );
    }

    if (
      dto.status === 'DONE' &&
      dto.amountDue === undefined &&
      existing.amountDue === null
    ) {
      throw new BadRequestException(
        'Amount due is required when marking a campaign as DONE.',
      );
    }

    const now = new Date();
    const data: Prisma.MarketingCampaignUpdateInput = {
      status: dto.status,
      ...(dto.deliveredViews !== undefined
        ? { deliveredViews: dto.deliveredViews }
        : {}),
      ...(dto.amountDue !== undefined
        ? { amountDue: new Prisma.Decimal(dto.amountDue) }
        : {}),
      ...(dto.adminNotes !== undefined
        ? { adminNotes: dto.adminNotes.trim() || null }
        : {}),
    };

    if (dto.status === 'CONFIRMED' && !existing.confirmedAt) {
      data.confirmedAt = now;
    } else if (dto.status === 'PROMOTING' && !existing.promotedAt) {
      data.promotedAt = now;
    } else if (dto.status === 'DONE' && !existing.doneAt) {
      data.doneAt = now;
    } else if (dto.status === 'PAID' && !existing.paidAt) {
      data.paidAt = now;
    } else if (dto.status === 'CANCELLED' && !existing.cancelledAt) {
      data.cancelledAt = now;
    }

    const updated = await this.prisma.marketingCampaign.update({
      where: { id },
      data,
      include: this.campaignInclude(),
    });

    const mapped = this.mapCampaign(updated);
    this.emitCampaignUpdated(
      mapped,
      `Promotion ${mapped.status}: ${mapped.menuItemName}`,
    );
    return mapped;
  }

  private emitCampaignUpdated(
    campaign: ReturnType<MarketingService['mapCampaign']>,
    title: string,
  ) {
    this.opsGateway.dispatch({
      type: OpsEventType.MARKETING_CAMPAIGN_UPDATED,
      tenantId: campaign.tenantId,
      branchId: campaign.branchId ?? '',
      severity: campaign.status === 'DONE' ? 'ATTENTION' : 'INFO',
      title,
      body: `${campaign.menuItemName} • ${campaign.targetLocation} • ${campaign.deliveredViews.toLocaleString()} views`,
      relatedEntityType: 'MarketingCampaign',
      relatedEntityId: campaign.id,
      payload: campaign,
      rooms: [tenantRoom(campaign.tenantId), superAdminRoom()],
    });
  }
}

