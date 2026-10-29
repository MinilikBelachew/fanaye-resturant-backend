import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { PLATFORM_ROLE_CODE } from '../identity/identity.constants';
import {
  FeedbackItemDto,
  FeedbackListQueryDto,
  FeedbackListResponseDto,
  FeedbackSummaryDto,
  PublicFeedbackSummaryDto,
  SubmitFeedbackResponseDto,
  SubmitFeedbackDto,
  SubmitTableFeedbackDto,
} from './dto/feedback.dto';

/** Roles allowed to read/manage customer feedback. */
const FEEDBACK_ROLES = ['OWNER_ADMIN', 'MANAGER', PLATFORM_ROLE_CODE];

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function emptyDistribution(): Record<string, number> {
  return { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public (guest) endpoints
  // ---------------------------------------------------------------------------

  async submitTableFeedback(
    slug: string,
    tableId: string,
    dto: SubmitTableFeedbackDto,
  ): Promise<SubmitFeedbackResponseDto> {
    const site = await this.prisma.tenantSite.findUnique({
      where: { slug },
      include: {
        tenant: {
          include: {
            branches: { where: { status: 'ACTIVE' }, take: 1 },
          },
        },
      },
    });
    if (!site) throw new NotFoundException('Restaurant site not found.');

    const tenant = site.tenant;
    const branch = tenant.branches[0];
    if (!branch) throw new NotFoundException('Branch is not active.');

    let table = await this.prisma.diningTable.findFirst({
      where: { id: tableId, tenantId: tenant.id },
    });
    if (!table) {
      table = await this.prisma.diningTable.findFirst({
        where: { displayNumber: tableId, tenantId: tenant.id },
      });
    }
    if (!table) throw new NotFoundException('Table not found.');

    const session = await this.prisma.tableSession.findFirst({
      where: { tableId: table.id, closedAt: null },
      orderBy: { openedAt: 'desc' },
    });

    // One review per table visit (only enforced when a visit is open).
    if (session) {
      const existing = await this.prisma.customerFeedback.findFirst({
        where: { tableSessionId: session.id, source: 'QR_MENU' },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException(
          'You have already shared feedback for this visit. Thank you!',
        );
      }
    }

    let orderId: string | null = null;
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, tenantId: tenant.id },
        select: { id: true },
      });
      orderId = order?.id ?? null;
    }

    const created = await this.prisma.customerFeedback.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        tableId: table.id,
        tableSessionId: session?.id ?? null,
        orderId,
        source: 'QR_MENU',
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
        customerName: dto.customerName?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || null,
      },
    });

    return {
      success: true,
      id: created.id,
      message: 'Thank you for your feedback!',
    };
  }

  async submitWebsiteFeedback(
    slug: string,
    dto: SubmitFeedbackDto,
  ): Promise<SubmitFeedbackResponseDto> {
    const site = await this.prisma.tenantSite.findUnique({
      where: { slug },
      include: {
        tenant: {
          include: {
            branches: { where: { status: 'ACTIVE' }, take: 1 },
          },
        },
      },
    });
    if (!site) throw new NotFoundException('Restaurant site not found.');

    const tenant = site.tenant;
    const branch = tenant.branches[0];
    if (!branch) throw new NotFoundException('Branch is not active.');

    const created = await this.prisma.customerFeedback.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        source: 'WEBSITE',
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
        customerName: dto.customerName?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || null,
      },
    });

    return {
      success: true,
      id: created.id,
      message: 'Thank you for your feedback!',
    };
  }

  async getPublicSummary(slug: string): Promise<PublicFeedbackSummaryDto> {
    const site = await this.prisma.tenantSite.findUnique({
      where: { slug },
      select: { tenantId: true },
    });
    if (!site) throw new NotFoundException('Restaurant site not found.');

    const rows = await this.prisma.customerFeedback.findMany({
      where: { tenantId: site.tenantId },
      select: { rating: true },
    });

    return this.buildPublicSummary(rows.map((row) => row.rating));
  }

  // ---------------------------------------------------------------------------
  // Manager / owner endpoints
  // ---------------------------------------------------------------------------

  async list(
    userId: string,
    query: FeedbackListQueryDto,
  ): Promise<FeedbackListResponseDto> {
    const scope = await this.resolveScope(userId);

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;

    const where: Prisma.CustomerFeedbackWhereInput = {
      tenantId: scope.tenantId,
    };
    if (scope.scopedBranchId) {
      where.branchId = scope.scopedBranchId;
    } else if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }
    if (query.rating) {
      where.rating = query.rating;
    }
    if (query.source && query.source !== 'ALL') {
      where.source = query.source;
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = this.parseDate(query.from, false);
      }
      if (query.to) {
        where.createdAt.lte = this.parseDate(query.to, true);
      }
    }

    const [total, rows] = await Promise.all([
      this.prisma.customerFeedback.count({ where }),
      this.prisma.customerFeedback.findMany({
        where,
        include: {
          table: { select: { displayName: true } },
          branch: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const summary = await this.summary(userId);

    return {
      data: rows.map((row) => this.toItem(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      summary,
    };
  }

  async summary(userId: string): Promise<FeedbackSummaryDto> {
    const scope = await this.resolveScope(userId);

    const where: Prisma.CustomerFeedbackWhereInput = {
      tenantId: scope.tenantId,
    };
    if (scope.scopedBranchId) {
      where.branchId = scope.scopedBranchId;
    }

    const rows = await this.prisma.customerFeedback.findMany({
      where,
      select: {
        rating: true,
        status: true,
        createdAt: true,
        branchId: true,
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const distribution = emptyDistribution();
    const branchMap = new Map<
      string,
      { branchId: string; branchName: string; sum: number; total: number }
    >();

    let sum = 0;
    let newCount = 0;
    let resolvedCount = 0;
    let lowRatingCount = 0;
    let last30DaysCount = 0;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const row of rows) {
      sum += row.rating;
      distribution[String(row.rating)] =
        (distribution[String(row.rating)] ?? 0) + 1;
      if (row.status === 'NEW') newCount += 1;
      if (row.status === 'RESOLVED') resolvedCount += 1;
      if (row.rating <= 2) lowRatingCount += 1;
      if (row.createdAt.getTime() >= thirtyDaysAgo) last30DaysCount += 1;

      const entry = branchMap.get(row.branchId) ?? {
        branchId: row.branchId,
        branchName: row.branch?.name ?? 'Branch',
        sum: 0,
        total: 0,
      };
      entry.sum += row.rating;
      entry.total += 1;
      branchMap.set(row.branchId, entry);
    }

    return {
      averageRating: rows.length ? round1(sum / rows.length) : 0,
      total: rows.length,
      newCount,
      resolvedCount,
      lowRatingCount,
      last30DaysCount,
      distribution,
      byBranch: [...branchMap.values()]
        .map((entry) => ({
          branchId: entry.branchId,
          branchName: entry.branchName,
          averageRating: round1(entry.sum / entry.total),
          total: entry.total,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }

  async updateStatus(
    userId: string,
    id: string,
    status: string,
  ): Promise<FeedbackItemDto> {
    const scope = await this.resolveScope(userId);

    const existing = await this.prisma.customerFeedback.findFirst({
      where: {
        id,
        tenantId: scope.tenantId,
        ...(scope.scopedBranchId ? { branchId: scope.scopedBranchId } : {}),
      },
    });
    if (!existing) throw new NotFoundException('Feedback not found.');

    const updated = await this.prisma.customerFeedback.update({
      where: { id: existing.id },
      data: {
        status,
        resolvedByMembershipId:
          status === 'RESOLVED' ? scope.staffMembershipId : null,
        resolvedAt: status === 'RESOLVED' ? new Date() : null,
      },
      include: {
        table: { select: { displayName: true } },
        branch: { select: { name: true } },
      },
    });

    return this.toItem(updated);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async resolveScope(userId: string): Promise<{
    tenantId: string;
    scopedBranchId: string | null;
    roleCode: string;
    staffMembershipId: string | null;
  }> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('Tenant context required.');
    }
    if (!FEEDBACK_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException(
        'Only managers and owners can access customer feedback.',
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
      staffMembershipId: context.staffMembershipId,
    };
  }

  private buildPublicSummary(ratings: number[]): PublicFeedbackSummaryDto {
    const distribution = emptyDistribution();
    let sum = 0;
    for (const rating of ratings) {
      sum += rating;
      distribution[String(rating)] = (distribution[String(rating)] ?? 0) + 1;
    }
    return {
      averageRating: ratings.length ? round1(sum / ratings.length) : 0,
      totalCount: ratings.length,
      distribution,
    };
  }

  private parseDate(raw: string, endOfDay: boolean): Date {
    const value = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return endOfDay
        ? new Date(y, m - 1, d, 23, 59, 59, 999)
        : new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date: ${raw}`);
    }
    return parsed;
  }

  private toItem(row: {
    id: string;
    rating: number;
    comment: string | null;
    customerName: string | null;
    customerPhone: string | null;
    source: string;
    status: string;
    branchId: string;
    createdAt: Date;
    orderId?: string | null;
    table?: { displayName: string } | null;
    branch?: { name: string } | null;
  }): FeedbackItemDto {
    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      source: row.source,
      status: row.status,
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
      tableName: row.table?.displayName ?? null,
      orderId: row.orderId ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
