import { provisionDefaultMaterials } from '../outside-orders/materials-catalog.constant';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AllConfigType } from '../config/config.type';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { PLATFORM_ROLE_CODE } from '../identity/identity.constants';
import { RoleEnum } from '../roles/roles.enum';
import {
  CityDistributionItemDto,
  CreatePlatformStaffDto,
  CreateSubscriptionPlanDto,
  CreateTenantDto,
  DeletePlanResponseDto,
  DeleteTenantResponseDto,
  GetTenantActivityQueryDto,
  ImpersonateResponseDto,
  ImpersonateSessionDto,
  ListPlatformAuditQueryDto,
  ListPlatformStaffQueryDto,
  LiveOpsResponseDto,
  PlatformAuditEventDto,
  PlatformAuditListResponseDto,
  PlatformStaffListResponseDto,
  PlatformStaffMemberDto,
  ResetPlatformStaffPasswordDto,
  ResetPlatformStaffPinDto,
  SuspendPlatformStaffDto,
  NetworkGmvTrendPointDto,
  PermissionDto,
  PermissionListResponseDto,
  PlanDistributionItemDto,
  PlatformHealthRadarPointDto,
  RestaurantRoleDto,
  RestaurantRoleListResponseDto,
  RolePermissionsResponseDto,
  SetRolePermissionsDto,
  SuperAdminDashboardDataDto,
  SuperAdminDashboardResponseDto,
  SuperAdminKpisDto,
  TenantActivityResponseDto,
  TenantDetailDto,
  TenantDetailResponseDto,
  TenantFleetItemDto,
  SubscriptionPlanDto,
  SubscriptionPlanListResponseDto,
  TenantListResponseDto,
  UpdateSubscriptionPlanDto,
  UpdateTenantDto,
} from './dto/super-admin-dashboard.dto';

const UI_ROLE_MAP: Record<string, string> = {
  waiter: 'WAITER',
  manager: 'MANAGER',
  cashier: 'CASHIER',
  owner: 'OWNER_ADMIN',
  kitchen: 'STATION_OPERATOR',
  barista: 'STATION_OPERATOR',
  cakes: 'STATION_OPERATOR',
  soft_drinks: 'STATION_OPERATOR',
  dispatcher: 'DISPATCHER',
  WAITER: 'WAITER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  OWNER_ADMIN: 'OWNER_ADMIN',
  STATION_OPERATOR: 'STATION_OPERATOR',
  DISPATCHER: 'DISPATCHER',
};

const TENANT_PROFILE_KEY = 'TENANT_PROFILE';

type TenantProfileJson = {
  city?: string;
  area?: string;
  address?: string;
  hours?: string;
  concept?: string;
  contactPhone?: string;
  contactEmail?: string;
};

function asProfileJson(value: unknown): TenantProfileJson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as TenantProfileJson;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatK(val: number): string {
  if (val >= 1_000_000) {
    return `ETB ${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `ETB ${(val / 1_000).toFixed(1)}k`;
  }
  return `ETB ${val.toLocaleString()}`;
}

const PLAN_PRICES: Record<string, number> = {
  STARTER: 15000,
  PRO: 45000,
  ENTERPRISE: 120000,
};

const BRANCH_MAX_KEY = 'branch.max_count';

function parseBranchMax(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (raw && typeof raw === 'object' && 'value' in (raw as object)) {
    const n = Number((raw as { value: unknown }).value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  private async verifySuperAdminAccess(userId: string): Promise<void> {
    if (!userId) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.appUser.findUnique({
      where: { id: String(userId) },
      include: {
        platformRoles: {
          where: {
            status: 'ACTIVE',
            roleCode: PLATFORM_ROLE_CODE,
          },
        },
      },
    });

    if (!user || user.accountStatus !== 'ACTIVE') {
      throw new UnauthorizedException();
    }

    if (user.platformRoles.length === 0) {
      throw new ForbiddenException('Platform super-admin access required.');
    }
  }

  private readProfile(
    entitlements?: Array<{ entitlementKey: string; valueJson: unknown }> | null,
  ): TenantProfileJson {
    const row = entitlements?.find(
      (e) => e.entitlementKey === TENANT_PROFILE_KEY,
    );
    return asProfileJson(row?.valueJson);
  }

  private async upsertTenantProfile(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    patch: TenantProfileJson,
  ): Promise<void> {
    const cleaned: TenantProfileJson = {};
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === 'string' && value.trim()) {
        cleaned[key as keyof TenantProfileJson] = value.trim();
      }
    }
    if (Object.keys(cleaned).length === 0) return;

    const existing = await tx.tenantEntitlement.findFirst({
      where: {
        tenantId,
        entitlementKey: TENANT_PROFILE_KEY,
        effectiveTo: null,
      },
    });

    if (existing) {
      await tx.tenantEntitlement.update({
        where: { id: existing.id },
        data: {
          valueJson: {
            ...asProfileJson(existing.valueJson),
            ...cleaned,
          },
          changedByUserId: actorUserId,
        },
      });
      return;
    }

    await tx.tenantEntitlement.create({
      data: {
        tenantId,
        entitlementKey: TENANT_PROFILE_KEY,
        valueJson: cleaned,
        effectiveFrom: new Date(),
        changedByUserId: actorUserId,
      },
    });
  }

  private async upsertUserPasswordHash(
    tx: Prisma.TransactionClient,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    const existing = await tx.userCredential.findUnique({ where: { userId } });
    if (existing) {
      await tx.userCredential.update({
        where: { userId },
        data: { passwordHash },
      });
      return;
    }
    await tx.userCredential.create({
      data: {
        userId,
        passwordHash,
        authProvider: 'email',
      },
    });
  }

  private async upsertUserPassword(
    tx: Prisma.TransactionClient,
    userId: string,
    password: string,
  ): Promise<void> {
    const passwordHash = await bcrypt.hash(password.slice(0, 72), 10);
    await this.upsertUserPasswordHash(tx, userId, passwordHash);
  }

  private async ensureManagerRole(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    membershipId: string,
  ): Promise<void> {
    const role = await tx.restaurantRole.findUnique({
      where: { code: 'MANAGER' },
    });
    if (!role) return;

    const existing = await tx.staffRoleAssignment.findFirst({
      where: {
        tenantId,
        staffMembershipId: membershipId,
        roleId: role.id,
      },
    });
    if (existing) {
      if (existing.status !== 'ACTIVE' || existing.branchId !== branchId) {
        await tx.staffRoleAssignment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', branchId, revokedAt: null },
        });
      }
      return;
    }

    await tx.staffRoleAssignment.create({
      data: {
        tenantId,
        branchId,
        staffMembershipId: membershipId,
        roleId: role.id,
        status: 'ACTIVE',
      },
    });
  }

  private pickManagerMembership<
    T extends {
      roleAssignments?: { role?: { code: string } | null }[] | null;
      user?: {
        displayName?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null;
      employeeDisplayName?: string | null;
      userId?: string;
      status?: string;
    },
  >(memberships: T[]): T | undefined {
    return (
      memberships.find(
        (m) =>
          (m.status === 'ACTIVE' || !m.status) &&
          m.roleAssignments?.some((r) => r.role?.code === 'MANAGER'),
      ) ||
      memberships.find((m) =>
        m.roleAssignments?.some((r) => r.role?.code === 'MANAGER'),
      )
    );
  }

  private pickOwnerMembership<
    T extends {
      roleAssignments?: { role?: { code: string } | null }[] | null;
      user?: {
        displayName?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null;
      employeeDisplayName?: string | null;
      userId?: string;
      status?: string;
    },
  >(memberships: T[]): T | undefined {
    return (
      memberships.find(
        (m) =>
          (m.status === 'ACTIVE' || !m.status) &&
          m.roleAssignments?.some((r) => r.role?.code === 'OWNER_ADMIN'),
      ) ||
      memberships.find((m) =>
        m.roleAssignments?.some((r) => r.role?.code === 'OWNER_ADMIN'),
      )
    );
  }

  private async ensureOwnerRole(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
  ): Promise<void> {
    const role = await tx.restaurantRole.findUnique({
      where: { code: 'OWNER_ADMIN' },
    });
    if (!role) return;

    const existing = await tx.staffRoleAssignment.findFirst({
      where: {
        tenantId,
        staffMembershipId: membershipId,
        roleId: role.id,
      },
    });
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        await tx.staffRoleAssignment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', revokedAt: null },
        });
      }
      return;
    }

    await tx.staffRoleAssignment.create({
      data: {
        tenantId,
        branchId: null,
        staffMembershipId: membershipId,
        roleId: role.id,
        status: 'ACTIVE',
      },
    });
  }

  async getDashboard(
    userId: string,
    businessDateRaw?: string,
  ): Promise<SuperAdminDashboardResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const businessDate = businessDateRaw
      ? new Date(`${businessDateRaw}T00:00:00.000Z`)
      : new Date(new Date().setUTCHours(0, 0, 0, 0));

    const weekAgo = new Date(businessDate);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const twelveMonthsAgo = new Date(businessDate);
    twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 11);
    twelveMonthsAgo.setUTCDate(1);

    const [
      tenants,
      branches,
      subscriptions,
      todayPayments,
      todayBills,
      todaySessions,
      auditEvents,
      stations,
      dailyCloses,
      pendingCashDrops,
      openExceptions,
      unpaidBillsCount,
      monthBills,
      weekAgoBills,
    ] = await Promise.all([
      this.prisma.tenant.findMany({
        include: {
          branches: { where: { status: 'ACTIVE' } },
          subscriptions: {
            where: { subscriptionStatus: 'ACTIVE' },
            include: { plan: true },
          },
          entitlements: {
            where: {
              entitlementKey: TENANT_PROFILE_KEY,
              effectiveTo: null,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.branch.findMany({ where: { status: 'ACTIVE' } }),
      this.prisma.tenantSubscription.findMany({
        where: { subscriptionStatus: 'ACTIVE' },
        include: { plan: true },
      }),
      this.prisma.payment.findMany({ where: { businessDate } }),
      this.prisma.bill.findMany({ where: { businessDate } }),
      this.prisma.tableSession.findMany({
        where: {
          businessDate,
          status: { not: 'CLOSED' },
        },
      }),
      this.prisma.auditEvent.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 8,
        include: { tenant: true },
      }),
      this.prisma.preparationStation.findMany({
        select: { id: true, status: true },
      }),
      this.prisma.operationalDailyClose.findMany({
        where: { businessDate },
        select: {
          branchId: true,
          status: true,
          cashierVariance: true,
          lockedAt: true,
        },
      }),
      this.prisma.cashDrop.count({
        where: {
          businessDate,
          status: { in: ['INITIATED', 'PENDING', 'DECLARED'] },
        },
      }),
      this.prisma.productionException.count({
        where: { status: 'OPEN' },
      }),
      this.prisma.bill.count({
        where: {
          paidAt: null,
          status: { notIn: ['SETTLED', 'CLOSED', 'CANCELLED'] },
        },
      }),
      this.prisma.bill.findMany({
        where: { businessDate: { gte: twelveMonthsAgo } },
        select: { businessDate: true, totalAmount: true, tenantId: true },
      }),
      this.prisma.bill.findMany({
        where: { businessDate: weekAgo },
        select: { totalAmount: true },
      }),
    ]);

    const liveTenantsCount = tenants.filter(
      (t) => t.status === 'ACTIVE',
    ).length;
    const provisionedTenantsCount = tenants.length;

    let todayGmv = 0;
    for (const b of todayBills) todayGmv += Number(b.totalAmount);
    if (todayGmv === 0) {
      for (const p of todayPayments) todayGmv += Number(p.amount);
    }

    let weekAgoGmv = 0;
    for (const b of weekAgoBills) weekAgoGmv += Number(b.totalAmount);
    const gmvTrendPct =
      weekAgoGmv > 0
        ? Number((((todayGmv - weekAgoGmv) / weekAgoGmv) * 100).toFixed(1))
        : todayGmv > 0
          ? 100
          : 0;

    const activeBranchesCount = branches.length;
    const citiesSet = new Set<string>();
    for (const t of tenants) {
      const profile = this.readProfile(t.entitlements);
      if (profile.city?.trim()) citiesSet.add(profile.city.trim());
    }
    const citiesCount = citiesSet.size;

    let digitalVolume = 0;
    let totalPaymentsVolume = 0;
    for (const p of todayPayments) {
      const amt = Number(p.amount);
      totalPaymentsVolume += amt;
      if (p.method === 'TRANSFER') digitalVolume += amt;
    }
    const digitalSettlementPct =
      totalPaymentsVolume > 0
        ? Number(((digitalVolume / totalPaymentsVolume) * 100).toFixed(1))
        : 0;

    let platformMrr = 0;
    for (const s of subscriptions) {
      const code = s.plan?.code?.toUpperCase() || '';
      platformMrr += PLAN_PRICES[code] || 0;
    }

    const kpis: SuperAdminKpisDto = {
      liveTenantsCount,
      provisionedTenantsCount,
      tenantGrowthRate: '',
      networkGmvTodayFormatted: formatK(todayGmv),
      networkGmvTodayValue: todayGmv,
      networkGmvTrend: `${gmvTrendPct >= 0 ? '+' : ''}${gmvTrendPct}%`,
      networkGmvTrendLabel: 'vs same day last week',
      activeBranchesCount,
      citiesCount,
      branchesLocationSummary:
        citiesCount > 0
          ? `Across ${citiesCount} cities`
          : `${activeBranchesCount} active branches`,
      digitalSettlementPercentage: `${digitalSettlementPct}%`,
      digitalSettlementValue: digitalSettlementPct,
      digitalSettlementTrend: '',
      platformMrrFormatted: formatK(platformMrr),
      platformMrrValue: platformMrr,
      systemUptimePercentage: '',
    };

    const monthBucket = new Map<string, { gmv: number }>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(businessDate);
      d.setUTCMonth(d.getUTCMonth() - (11 - i));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      monthBucket.set(key, { gmv: 0 });
    }
    for (const bill of monthBills) {
      const d = new Date(bill.businessDate);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const bucket = monthBucket.get(key);
      if (bucket) bucket.gmv += Number(bill.totalAmount);
    }
    const gmvTrend: NetworkGmvTrendPointDto[] = [...monthBucket.entries()].map(
      ([key, vals]) => {
        const [y, m] = key.split('-');
        const label = new Date(
          Date.UTC(Number(y), Number(m) - 1, 1),
        ).toLocaleString('en', { month: 'short' });
        return {
          period: label,
          networkGmv: Number((vals.gmv / 1_000_000).toFixed(2)),
          digitalVolume: 0,
          subscriptionInflow: 0,
        };
      },
    );

    const lockedCloses = dailyCloses.filter(
      (c) => c.status === 'LOCKED' || Boolean(c.lockedAt),
    ).length;
    const dailyCloseCompliancePct =
      activeBranchesCount > 0
        ? Number(((lockedCloses / activeBranchesCount) * 100).toFixed(1))
        : 0;
    const varianceAbs = dailyCloses.reduce(
      (sum, c) => sum + Math.abs(Number(c.cashierVariance || 0)),
      0,
    );
    const varianceBranches = dailyCloses.filter(
      (c) => Math.abs(Number(c.cashierVariance || 0)) > 0.01,
    ).length;
    const offlineStations = stations.filter(
      (s) => s.status !== 'ACTIVE',
    ).length;
    const totalStations = stations.length;
    const stationAvailabilityPct =
      totalStations > 0
        ? Number(
            (((totalStations - offlineStations) / totalStations) * 100).toFixed(
              1,
            ),
          )
        : 100;
    const cashHealthPct =
      dailyCloses.length === 0
        ? 100
        : Number(
            (
              ((dailyCloses.length - varianceBranches) / dailyCloses.length) *
              100
            ).toFixed(1),
          );

    const opsHealth = {
      dailyCloseCompliancePct,
      branchesClosedToday: lockedCloses,
      activeBranches: activeBranchesCount,
      offlineStations,
      totalStations,
      stationAvailabilityPct,
      pendingCashDrops,
      openProductionExceptions: openExceptions,
      unpaidBills: unpaidBillsCount,
      openSessions: todaySessions.length,
      cashVarianceAbsTotal: Number(varianceAbs.toFixed(2)),
      cashVarianceBranches: varianceBranches,
      cashHealthPct,
      digitalSettlementPct,
    };

    const healthRadar: PlatformHealthRadarPointDto[] = [
      {
        dimension: 'Daily Close',
        score: dailyCloseCompliancePct,
        benchmark: 100,
      },
      { dimension: 'Cash Health', score: cashHealthPct, benchmark: 100 },
      {
        dimension: 'Stations Online',
        score: stationAvailabilityPct,
        benchmark: 100,
      },
      { dimension: 'Digital Mix', score: digitalSettlementPct, benchmark: 100 },
      {
        dimension: 'Floor Load',
        score: Math.max(0, 100 - Math.min(100, todaySessions.length * 2)),
        benchmark: 100,
      },
      {
        dimension: 'Exceptions',
        score: Math.max(0, 100 - openExceptions * 5),
        benchmark: 100,
      },
    ];

    const planCounts: Record<string, number> = {};
    for (const t of tenants) {
      const p = t.subscriptions?.[0]?.plan?.code?.toUpperCase() ?? 'NONE';
      planCounts[p] = (planCounts[p] ?? 0) + 1;
    }
    const PLAN_META: Record<string, { name: string; color: string }> = {
      PRO: { name: 'Pro', color: '#e85d04' },
      GROWTH: { name: 'Growth', color: '#ea580c' },
      ENTERPRISE: { name: 'Enterprise', color: '#f97316' },
      STARTER: { name: 'Starter', color: '#fdba74' },
      NONE: { name: 'No plan', color: '#94a3b8' },
    };
    const totalPlans =
      Object.values(planCounts).reduce((a, b) => a + b, 0) || 1;
    const planDistribution: PlanDistributionItemDto[] = Object.entries(
      planCounts,
    )
      .map(([planCode, tenantCount]) => ({
        planCode,
        name: PLAN_META[planCode]?.name || planCode,
        tenantCount,
        percentage: Math.round((tenantCount / totalPlans) * 100),
        color: PLAN_META[planCode]?.color || '#94a3b8',
      }))
      .filter((p) => p.tenantCount > 0);

    const cityCounts: Record<string, number> = {};
    for (const t of tenants) {
      const profile = this.readProfile(t.entitlements);
      const city = profile.city?.trim() || 'Unspecified';
      cityCounts[city] = (cityCounts[city] ?? 0) + (t.branches?.length || 0);
    }
    const totalBranchCount =
      Object.values(cityCounts).reduce((a, b) => a + b, 0) || 1;
    const cityDistribution: CityDistributionItemDto[] = Object.entries(
      cityCounts,
    )
      .filter(([, count]) => count > 0)
      .map(([city, count]) => ({
        city,
        branchCount: count,
        percentage: Math.round((count / totalBranchCount) * 100),
      }));

    const sessionsByTenant = new Map<string, number>();
    for (const s of todaySessions) {
      sessionsByTenant.set(
        s.tenantId,
        (sessionsByTenant.get(s.tenantId) || 0) + 1,
      );
    }
    const gmvByTenant = new Map<string, number>();
    for (const b of todayBills) {
      gmvByTenant.set(
        b.tenantId,
        (gmvByTenant.get(b.tenantId) || 0) + Number(b.totalAmount),
      );
    }

    const tenantFleet: TenantFleetItemDto[] = tenants.map((t) => {
      const profile = this.readProfile(t.entitlements);
      const gmv = gmvByTenant.get(t.id) || 0;
      const planCode = t.subscriptions?.[0]?.plan?.name || '—';
      const slug = (t.displayName || t.legalName || 'tenant')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return {
        id: t.id,
        name: t.displayName || t.legalName || 'Restaurant',
        slug,
        plan: planCode,
        city: profile.city?.trim() || '—',
        branchCount: t.branches?.length || 0,
        gmvTodayValue: gmv,
        gmvTodayFormatted: formatK(gmv),
        activeTablesCount: sessionsByTenant.get(t.id) || 0,
        status: t.status,
        active: t.status === 'ACTIVE',
      };
    });

    const recentAuditEvents: PlatformAuditEventDto[] = auditEvents.map((a) => ({
      id: a.id,
      action: a.action,
      entityName: a.tenant?.displayName || a.entityType,
      description: a.reason ?? `${a.action} on ${a.entityType}`,
      occurredAt: a.occurredAt.toISOString(),
      severity:
        a.action.includes('LOCKED') || a.action.includes('PROVISION')
          ? 'info'
          : 'default',
    }));

    const data: SuperAdminDashboardDataDto = {
      kpis,
      gmvTrend,
      healthRadar,
      opsHealth,
      planDistribution,
      cityDistribution,
      tenants: tenantFleet,
      recentAuditEvents,
      businessDate: ymd(businessDate),
    };

    return { data };
  }

  private mapPlanDto(plan: {
    id: string;
    code: string;
    name: string;
    status: string;
    entitlements: Array<{ entitlementKey: string; valueJson: unknown }>;
    _count: { subscriptions: number };
  }): SubscriptionPlanDto {
    const maxRaw = plan.entitlements.find(
      (row) => row.entitlementKey === BRANCH_MAX_KEY,
    )?.valueJson;
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      status: plan.status,
      maxBranches: parseBranchMax(maxRaw),
      tenantCount: plan._count.subscriptions,
    };
  }

  private async loadPlanDto(planId: string): Promise<SubscriptionPlanDto> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: {
        entitlements: true,
        _count: { select: { subscriptions: true } },
      },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found.');
    }
    return this.mapPlanDto(plan);
  }

  async listPlans(userId: string): Promise<SubscriptionPlanListResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { status: 'ACTIVE' },
      include: {
        entitlements: true,
        _count: { select: { subscriptions: true } },
      },
      orderBy: { code: 'asc' },
    });

    return { data: plans.map((plan) => this.mapPlanDto(plan)) };
  }

  async listRestaurantRoles(
    userId: string,
  ): Promise<RestaurantRoleListResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const roles = await this.prisma.restaurantRole.findMany({
      orderBy: { id: 'asc' },
    });

    return {
      data: roles.map((role) => this.mapRestaurantRoleDto(role)),
    };
  }

  async listPermissions(userId: string): Promise<PermissionListResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const rows = await this.prisma.permission.findMany({
      orderBy: [{ domain: 'asc' }, { code: 'asc' }],
    });

    return {
      data: rows.map((row) => this.mapPermissionDto(row)),
    };
  }

  async getRolePermissions(
    userId: string,
    roleIdRaw: string,
  ): Promise<RolePermissionsResponseDto> {
    await this.verifySuperAdminAccess(userId);
    const role = await this.findRestaurantRole(roleIdRaw);

    const links = await this.prisma.rolePermission.findMany({
      where: { roleId: role.id, allowed: true },
      include: { permission: true },
      orderBy: { permissionId: 'asc' },
    });

    return {
      roleId: role.id,
      roleCode: role.code,
      editable: role.code !== 'OWNER_ADMIN',
      permissionIds: links.map((link) => link.permissionId),
      permissionCodes: links.map((link) => link.permission.code),
    };
  }

  async setRolePermissions(
    userId: string,
    roleIdRaw: string,
    dto: SetRolePermissionsDto,
  ): Promise<RolePermissionsResponseDto> {
    await this.verifySuperAdminAccess(userId);
    const role = await this.findRestaurantRole(roleIdRaw);

    if (role.code === 'OWNER_ADMIN') {
      throw new ForbiddenException(
        'Owner role has full access and cannot be edited.',
      );
    }

    const uniqueIds = [...new Set(dto.permissionIds.map((id) => Number(id)))];
    if (uniqueIds.some((id) => !Number.isInteger(id) || id < 1)) {
      throw new BadRequestException('permissionIds must be positive integers.');
    }

    if (uniqueIds.length > 0) {
      const found = await this.prisma.permission.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      if (found.length !== uniqueIds.length) {
        throw new BadRequestException(
          'One or more permission ids are invalid.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (uniqueIds.length > 0) {
        await tx.rolePermission.createMany({
          data: uniqueIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
            allowed: true,
          })),
        });
      }
    });

    return this.getRolePermissions(userId, String(role.id));
  }

  private async findRestaurantRole(roleIdRaw: string) {
    const roleId = Number(roleIdRaw);
    if (!Number.isInteger(roleId) || roleId < 1) {
      throw new BadRequestException('Invalid role id.');
    }
    const role = await this.prisma.restaurantRole.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }
    return role;
  }

  private mapRestaurantRoleDto(role: {
    id: number;
    code: string;
    name: string;
    isSystem: boolean;
  }): RestaurantRoleDto {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      editable: role.code !== 'OWNER_ADMIN',
    };
  }

  private mapPermissionDto(row: {
    id: number;
    code: string;
    domain: string;
    description: string | null;
  }): PermissionDto {
    return {
      id: row.id,
      code: row.code,
      domain: row.domain,
      description: row.description,
    };
  }

  async createPlan(
    userId: string,
    dto: CreateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanDto> {
    await this.verifySuperAdminAccess(userId);

    const code = dto.code.trim().toUpperCase();
    const clash = await this.prisma.subscriptionPlan.findFirst({
      where: { code, version: 1 },
    });
    if (clash) {
      throw new ConflictException(`Plan code "${code}" already exists.`);
    }

    const created = await this.prisma.subscriptionPlan.create({
      data: {
        code,
        name: dto.name.trim(),
        status: 'ACTIVE',
        version: 1,
        entitlements: {
          create: {
            entitlementKey: BRANCH_MAX_KEY,
            valueJson: dto.maxBranches,
          },
        },
      },
    });

    return this.loadPlanDto(created.id);
  }

  async updatePlan(
    userId: string,
    planId: string,
    dto: UpdateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanDto> {
    await this.verifySuperAdminAccess(userId);

    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!existing) {
      throw new NotFoundException('Plan not found.');
    }

    const nextCode = dto.code?.trim().toUpperCase();
    if (nextCode && nextCode !== existing.code) {
      const clash = await this.prisma.subscriptionPlan.findFirst({
        where: {
          code: nextCode,
          version: existing.version,
          NOT: { id: planId },
        },
      });
      if (clash) {
        throw new ConflictException(`Plan code "${nextCode}" already exists.`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.name?.trim() || nextCode) {
        await tx.subscriptionPlan.update({
          where: { id: planId },
          data: {
            ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
            ...(nextCode ? { code: nextCode } : {}),
          },
        });
      }
      if (dto.maxBranches != null) {
        await tx.planEntitlement.upsert({
          where: {
            planId_entitlementKey: {
              planId,
              entitlementKey: BRANCH_MAX_KEY,
            },
          },
          update: { valueJson: dto.maxBranches },
          create: {
            planId,
            entitlementKey: BRANCH_MAX_KEY,
            valueJson: dto.maxBranches,
          },
        });
      }
    });

    return this.loadPlanDto(planId);
  }

  async deletePlan(
    userId: string,
    planId: string,
  ): Promise<DeletePlanResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Plan not found.');
    }
    if (existing._count.subscriptions > 0) {
      throw new ConflictException(
        `Cannot delete "${existing.name}" while ${existing._count.subscriptions} tenant(s) still use it. Move them to another plan first.`,
      );
    }

    await this.prisma.subscriptionPlan.delete({ where: { id: planId } });
    return { ok: true, deletedPlanId: planId };
  }

  async getTenants(userId: string): Promise<TenantListResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const today = new Date(new Date().setUTCHours(0, 0, 0, 0));

    let tenants: any[] = [];
    let todayBills: any[] = [];

    try {
      [tenants, todayBills] = await Promise.all([
        this.prisma.tenant.findMany({
          include: {
            branches: {
              include: {
                diningTables: true,
                staffAssignments: true,
              },
            },
            subscriptions: {
              where: { subscriptionStatus: 'ACTIVE' },
              include: { plan: true },
            },
            staffMemberships: {
              include: {
                user: true,
                roleAssignments: {
                  where: { status: 'ACTIVE' },
                  include: { role: true },
                },
              },
            },
            diningTables: true,
            entitlements: {
              where: {
                entitlementKey: TENANT_PROFILE_KEY,
                effectiveTo: null,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.bill.findMany({
          where: { businessDate: today },
        }),
      ]);
    } catch (e) {
      console.warn('SuperAdmin getTenants query error:', e);
    }

    const tenantGmvMap = new Map<string, number>();
    for (const b of todayBills) {
      const current = tenantGmvMap.get(b.tenantId) || 0;
      tenantGmvMap.set(b.tenantId, current + Number(b.totalAmount));
    }

    const result: TenantDetailDto[] = tenants.map((t) => {
      const gmv = tenantGmvMap.get(t.id) || 0;
      const primaryBranch = t.branches?.[0];
      const planName = t.subscriptions?.[0]?.plan?.name || '—';
      const managerMembership = this.pickManagerMembership(
        t.staffMemberships || [],
      );
      const managerName =
        managerMembership?.employeeDisplayName ||
        managerMembership?.user?.displayName ||
        '—';
      const managerEmail = managerMembership?.user?.email || '';
      const managerPhone = managerMembership?.user?.phone || '';

      const ownerMembership = this.pickOwnerMembership(
        t.staffMemberships || [],
      );
      const ownerName =
        ownerMembership?.employeeDisplayName ||
        ownerMembership?.user?.displayName ||
        '';
      const ownerEmail = ownerMembership?.user?.email || '';
      const ownerPhone = ownerMembership?.user?.phone || '';

      const branchesList = (t.branches || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        displayCode: b.displayCode || 'MAIN',
        status: b.status,
        timezone: b.timezone,
        tablesCount: b.diningTables?.length || 0,
        staffCount: b.staffAssignments?.length || 0,
      }));

      const profile = this.readProfile(t.entitlements);
      const slug = (t.displayName || t.legalName || 'tenant')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      return {
        id: t.id,
        name: t.displayName || t.legalName || 'Restaurant',
        legalName: t.legalName ?? undefined,
        slug,
        plan: planName,
        city: profile.city || '—',
        area: profile.area || '—',
        address: profile.address || primaryBranch?.name || '—',
        phone: profile.contactPhone || managerPhone || '—',
        email: profile.contactEmail || managerEmail || '—',
        manager: managerName,
        managerEmail: managerEmail || undefined,
        managerPhone: managerPhone || undefined,
        owner: ownerName || undefined,
        ownerEmail: ownerEmail || undefined,
        ownerPhone: ownerPhone || undefined,
        hours: profile.hours || '—',
        concept: profile.concept || '—',
        branches: t.branches?.length || 0,
        tableCount: t.diningTables?.length || 0,
        staffCount: t.staffMemberships?.length || 0,
        gmvToday: gmv,
        gmvTodayFormatted: formatK(gmv),
        status: t.status,
        active: t.status === 'ACTIVE',
        provisionedAt: t.createdAt
          ? t.createdAt.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : '—',
        branchesList,
      };
    });

    return { data: result };
  }

  async getTenantById(
    userId: string,
    tenantId: string,
  ): Promise<TenantDetailResponseDto> {
    const listResponse = await this.getTenants(userId);
    const found = listResponse.data.find(
      (t) =>
        t.id === tenantId ||
        t.slug === tenantId ||
        t.name.toLowerCase() === tenantId.toLowerCase(),
    );

    if (!found) {
      const dbTenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          branches: {
            include: {
              diningTables: true,
              staffAssignments: true,
            },
          },
          subscriptions: {
            where: { subscriptionStatus: 'ACTIVE' },
            include: { plan: true },
          },
          staffMemberships: {
            include: {
              user: true,
              roleAssignments: {
                where: { status: 'ACTIVE' },
                include: { role: true },
              },
            },
          },
          diningTables: true,
          entitlements: {
            where: {
              entitlementKey: TENANT_PROFILE_KEY,
              effectiveTo: null,
            },
          },
        },
      });

      if (!dbTenant) {
        throw new UnauthorizedException(`Tenant ${tenantId} not found`);
      }

      const profile = this.readProfile(dbTenant.entitlements);
      const planName = dbTenant.subscriptions[0]?.plan?.name || '—';
      const managerMembership = this.pickManagerMembership(
        dbTenant.staffMemberships,
      );
      const today = new Date(new Date().setUTCHours(0, 0, 0, 0));
      const todayBills = await this.prisma.bill.findMany({
        where: { tenantId: dbTenant.id, businessDate: today },
        select: { totalAmount: true },
      });
      const gmv = todayBills.reduce((s, b) => s + Number(b.totalAmount), 0);
      const slug = (dbTenant.displayName || dbTenant.legalName || 'tenant')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const managerEmail = managerMembership?.user?.email || '';
      const managerPhone = managerMembership?.user?.phone || '';
      const ownerMembership = this.pickOwnerMembership(
        dbTenant.staffMemberships || [],
      );
      const ownerName =
        ownerMembership?.employeeDisplayName ||
        ownerMembership?.user?.displayName ||
        '';
      const ownerEmail = ownerMembership?.user?.email || '';
      const ownerPhone = ownerMembership?.user?.phone || '';
      const detail: TenantDetailDto = {
        id: dbTenant.id,
        name: dbTenant.displayName || dbTenant.legalName || 'Restaurant',
        legalName: dbTenant.legalName ?? undefined,
        slug,
        plan: planName,
        city: profile.city || '—',
        area: profile.area || '—',
        address: profile.address || '—',
        phone: profile.contactPhone || managerPhone || '—',
        email: profile.contactEmail || managerEmail || '—',
        manager:
          managerMembership?.employeeDisplayName ||
          managerMembership?.user?.displayName ||
          '—',
        managerEmail: managerEmail || undefined,
        managerPhone: managerPhone || undefined,
        owner: ownerName || undefined,
        ownerEmail: ownerEmail || undefined,
        ownerPhone: ownerPhone || undefined,
        hours: profile.hours || '—',
        concept: profile.concept || '—',
        branches: dbTenant.branches.length,
        tableCount: dbTenant.diningTables.length,
        staffCount: dbTenant.staffMemberships.length,
        gmvToday: gmv,
        gmvTodayFormatted: formatK(gmv),
        status: dbTenant.status,
        active: dbTenant.status === 'ACTIVE',
        provisionedAt: dbTenant.createdAt.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        branchesList: dbTenant.branches.map((b) => ({
          id: b.id,
          name: b.name,
          displayCode: b.displayCode || 'MAIN',
          status: b.status,
          timezone: b.timezone,
          tablesCount: b.diningTables.length,
          staffCount: b.staffAssignments.length,
        })),
      };

      return { data: detail };
    }

    return { data: found };
  }

  async createTenant(
    userId: string,
    dto: CreateTenantDto,
  ): Promise<TenantDetailResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const displayName = (dto.name || '').trim();
    if (!displayName) {
      throw new BadRequestException('Restaurant brand name is required.');
    }

    const planCode = (dto.planCode || '').trim().toUpperCase();
    if (!planCode) {
      throw new BadRequestException('Select a subscription plan.');
    }
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { code: planCode, status: 'ACTIVE' },
    });
    if (!plan) {
      throw new BadRequestException(`Unknown or inactive plan "${planCode}".`);
    }

    const ownerPasswordHash = dto.ownerPassword?.trim()
      ? await bcrypt.hash(dto.ownerPassword.trim().slice(0, 72), 10)
      : null;
    const managerPasswordHash = dto.managerPassword?.trim()
      ? await bcrypt.hash(dto.managerPassword.trim().slice(0, 72), 10)
      : null;

    let createdTenant: { id: string };
    try {
      createdTenant = await this.prisma.$transaction(
        async (tx) => {
          // 1. Create Tenant
          const tenant = await tx.tenant.create({
            data: {
              displayName,
              legalName: (dto.legalName || displayName).trim(),
              status: 'ACTIVE',
              defaultTimezone: 'Africa/Addis_Ababa',
              currencyCode: 'ETB',
              activatedAt: new Date(),
              settings: {
                create: {
                  calendarPreference: 'ETHIOPIAN',
                  defaultShiftGraceMinutes: 15,
                  waiterMayClosePaidTable: true,
                  cashierMayCollectCustomerPayment: false,
                },
              },
            },
          });

          // 2. Create primary Branch
          const branchCode = (
            dto.branchCode || displayName.slice(0, 3).toUpperCase() + '-1'
          ).slice(0, 40);
          const branch = await tx.branch.create({
            data: {
              tenantId: tenant.id,
              name: (dto.branchName || `${displayName} Main Branch`).trim(),
              displayCode: branchCode,
              timezone: 'Africa/Addis_Ababa',
              serviceMode:
                dto.serviceMode === 'BAKERY' ? 'BAKERY' : 'RESTAURANT',
              status: 'ACTIVE',
              businessDayCutoff: new Date('1970-01-01T04:00:00Z'),
              settings: {
                create: {
                  tenant: { connect: { id: tenant.id } },
                  shiftEndWarningMinutes: 15,
                },
              },
            },
          });

          // 3. Create Subscription
          await tx.tenantSubscription.create({
            data: {
              tenantId: tenant.id,
              planId: plan.id,
              subscriptionStatus: 'ACTIVE',
              effectiveFrom: new Date(),
            },
          });

          const isBakery = dto.serviceMode === 'BAKERY';

          // 4. Create Preparation Stations (presets + custom), or Counter for bakery
          let createdStationCount = 1;
          if (isBakery) {
            await tx.preparationStation.create({
              data: {
                tenantId: tenant.id,
                branchId: branch.id,
                name: 'Counter',
                code: 'COUNTER',
                status: 'ACTIVE',
                sortOrder: 0,
              },
            });
          } else {
            const presetStations = [
              { name: 'Kitchen Station', code: 'KITCHEN', sortOrder: 0 },
              { name: 'Barista Station', code: 'BARISTA', sortOrder: 1 },
              { name: 'Cakes & Pastry', code: 'CAKES', sortOrder: 2 },
              { name: 'Soft Drinks & Bar', code: 'SOFT_DRINKS', sortOrder: 3 },
            ];
            const nameByCode = new Map(
              presetStations.map((st) => [st.code, st.name]),
            );
            for (const custom of dto.customStations ?? []) {
              const code = custom.code.trim().toUpperCase();
              if (code) nameByCode.set(code, custom.name.trim() || code);
            }
            const selectedCodes = (
              dto.activeStations?.length
                ? dto.activeStations
                : presetStations.map((s) => s.code)
            )
              .map((code) => code.trim().toUpperCase())
              .filter(Boolean);
            const uniqueCodes = [...new Set(selectedCodes)];
            createdStationCount = uniqueCodes.length;

            await tx.preparationStation.createMany({
              data: uniqueCodes.map((code, index) => {
                const name = nameByCode.get(code) || code.replace(/_/g, ' ');
                return {
                  tenantId: tenant.id,
                  branchId: branch.id,
                  name: name.slice(0, 120),
                  code: code.slice(0, 60),
                  status: 'ACTIVE',
                  sortOrder: index,
                };
              }),
            });
          }

          // 5. Create default Table Location & Dining Tables
          const location = await tx.tableLocation.create({
            data: {
              tenantId: tenant.id,
              branchId: branch.id,
              name: isBakery ? 'Counter' : 'Main Dining Floor',
              code: isBakery ? 'COUNTER' : 'MAIN_FLOOR',
              status: 'ACTIVE',
              sortOrder: 0,
            },
          });

          const tableCount = isBakery
            ? 1
            : Math.min(Math.max(dto.tableCount || 16, 1), 60);
          await tx.diningTable.createMany({
            data: Array.from({ length: tableCount }, (_, idx) => {
              const i = idx + 1;
              return {
                tenantId: tenant.id,
                branchId: branch.id,
                locationId: location.id,
                displayName: isBakery ? 'Counter' : `Table ${i}`,
                displayNumber: isBakery ? 'C' : String(i),
                status: 'AVAILABLE',
                sortOrder: i,
              };
            }),
          });

          // 6. Create Owner AppUser & Staff Membership if ownerName is provided
          let ownerUserId: string | null = null;
          let ownerMembershipId: string | null = null;

          if (dto.ownerName?.trim()) {
            const ownerEmail = dto.ownerEmail?.trim() || undefined;
            const ownerPhone = dto.ownerPhone?.trim() || undefined;

            const ownerByEmail = ownerEmail
              ? await tx.appUser.findFirst({ where: { email: ownerEmail } })
              : null;
            const ownerByPhone = ownerPhone
              ? await tx.appUser.findFirst({ where: { phone: ownerPhone } })
              : null;

            if (
              ownerByEmail &&
              ownerByPhone &&
              ownerByEmail.id !== ownerByPhone.id
            ) {
              throw new ConflictException(
                'Owner email and phone belong to two different existing accounts.',
              );
            }

            let ownerUser = ownerByEmail || ownerByPhone;

            if (!ownerUser) {
              ownerUser = await tx.appUser.create({
                data: {
                  displayName: dto.ownerName.trim(),
                  email: ownerEmail || null,
                  phone: ownerPhone || null,
                  accountStatus: 'ACTIVE',
                  preferredBranchId: branch.id,
                },
              });
            } else {
              ownerUser = await tx.appUser.update({
                where: { id: ownerUser.id },
                data: {
                  displayName: dto.ownerName.trim(),
                  ...(ownerEmail ? { email: ownerEmail } : {}),
                  ...(ownerPhone ? { phone: ownerPhone } : {}),
                  preferredBranchId: ownerUser.preferredBranchId ?? branch.id,
                },
              });
            }

            if (ownerPasswordHash) {
              await this.upsertUserPasswordHash(
                tx,
                ownerUser.id,
                ownerPasswordHash,
              );
            }

            const ownerMembership = await tx.tenantStaffMembership.create({
              data: {
                tenantId: tenant.id,
                userId: ownerUser.id,
                employeeDisplayName: dto.ownerName.trim(),
                status: 'ACTIVE',
                joinedAt: new Date(),
              },
            });

            await this.ensureOwnerRole(tx, tenant.id, ownerMembership.id);
            ownerUserId = ownerUser.id;
            ownerMembershipId = ownerMembership.id;
          }

          // 7. Create Manager AppUser & Staff Membership if email or managerName is provided
          if (dto.managerEmail || dto.managerName) {
            const explicitManagerEmail = dto.managerEmail?.trim() || undefined;
            const fallbackEmail = `manager.${tenant.id.slice(0, 6)}@restaurant.et`;
            const phone = dto.managerPhone?.trim() || dto.phone;

            const managerByEmail = explicitManagerEmail
              ? await tx.appUser.findFirst({
                  where: { email: explicitManagerEmail },
                })
              : null;
            const managerByPhone = phone
              ? await tx.appUser.findFirst({ where: { phone } })
              : null;

            if (
              managerByEmail &&
              managerByPhone &&
              managerByEmail.id !== managerByPhone.id
            ) {
              throw new ConflictException(
                'Manager email and phone belong to two different existing accounts.',
              );
            }

            let managerUser = managerByEmail || managerByPhone;

            if (!managerUser) {
              managerUser = await tx.appUser.create({
                data: {
                  displayName: dto.managerName || 'Restaurant Manager',
                  email: explicitManagerEmail || fallbackEmail,
                  phone,
                  accountStatus: 'ACTIVE',
                },
              });
            } else {
              managerUser = await tx.appUser.update({
                where: { id: managerUser.id },
                data: {
                  displayName: dto.managerName || managerUser.displayName,
                  ...(explicitManagerEmail
                    ? { email: explicitManagerEmail }
                    : {}),
                  ...(phone ? { phone } : {}),
                },
              });
            }

            if (managerPasswordHash && managerUser.id !== ownerUserId) {
              await this.upsertUserPasswordHash(
                tx,
                managerUser.id,
                managerPasswordHash,
              );
            }

            let managerMembershipId: string;
            if (ownerUserId && ownerMembershipId && managerUser.id === ownerUserId) {
              managerMembershipId = ownerMembershipId;
            } else {
              const managerMembership = await tx.tenantStaffMembership.create({
                data: {
                  tenantId: tenant.id,
                  userId: managerUser.id,
                  employeeDisplayName: dto.managerName || 'Restaurant Manager',
                  status: 'ACTIVE',
                  joinedAt: new Date(),
                },
              });
              managerMembershipId = managerMembership.id;
            }

            await tx.branchStaffAssignment.create({
              data: {
                tenantId: tenant.id,
                branchId: branch.id,
                staffMembershipId: managerMembershipId,
                status: 'ACTIVE',
              },
            });

            await this.ensureManagerRole(
              tx,
              tenant.id,
              branch.id,
              managerMembershipId,
            );
          }

          await this.upsertTenantProfile(tx, tenant.id, userId, {
            city: dto.city,
            area: dto.area,
            address: dto.address,
            hours: dto.hours,
            concept: dto.concept,
            contactPhone: dto.phone,
            contactEmail: dto.email,
          });

          // 8. Log audit event
          await tx.auditEvent.create({
            data: {
              tenantId: tenant.id,
              branchId: branch.id,
              actorUserId: userId,
              action: 'TENANT_PROVISIONED',
              entityType: 'TENANT',
              entityId: tenant.id,
              reason: `Provisioned tenant ${displayName} with ${tableCount} tables and ${createdStationCount} stations.`,
            },
          });

          // 9. Auto-provision default returnable materials (bulk)
          await provisionDefaultMaterials(tx, tenant.id, branch.id);

          return tenant;
        },
        { timeout: 60_000, maxWait: 15_000 },
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = Array.isArray(error.meta?.target)
          ? (error.meta?.target as string[]).join(', ')
          : String(error.meta?.target || 'field');
        throw new ConflictException(
          `Could not provision tenant: ${target} is already in use.`,
        );
      }
      throw error;
    }

    return this.getTenantById(userId, createdTenant.id);
  }

  async deleteTenant(
    userId: string,
    tenantId: string,
  ): Promise<DeleteTenantResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, displayName: true },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    const tenantName = tenant.displayName;

    await this.prisma.$transaction(
      async (tx) => {
        const memberships = await tx.tenantStaffMembership.findMany({
          where: { tenantId },
          select: { userId: true },
        });
        const staffUserIds = [...new Set(memberships.map((m) => m.userId))];

        await tx.appUser.updateMany({
          where: {
            preferredBranch: { tenantId },
          },
          data: { preferredBranchId: null },
        });

        const byTenant = { tenantId };

        await tx.orderItemModifier.deleteMany({ where: byTenant });
        await tx.productionException.deleteMany({ where: byTenant });
        await tx.orderChangeRequest.deleteMany({ where: byTenant });
        await tx.cancellationRequest.deleteMany({ where: byTenant });
        await tx.orderItem.deleteMany({ where: byTenant });
        await tx.order.deleteMany({ where: byTenant });
        await tx.billLine.deleteMany({ where: byTenant });
        await tx.billReopenRequest.deleteMany({ where: byTenant });
        await tx.payment.deleteMany({ where: byTenant });
        await tx.transferReceipt.deleteMany({ where: byTenant });
        await tx.bill.deleteMany({ where: byTenant });
        await tx.billRequest.deleteMany({ where: byTenant });
        await tx.cashDropDispute.deleteMany({ where: byTenant });
        await tx.cashLedgerEntry.deleteMany({ where: byTenant });
        await tx.cashDrop.deleteMany({ where: byTenant });
        await tx.cashierReconciliation.deleteMany({ where: byTenant });
        await tx.cashierFinancialSession.deleteMany({ where: byTenant });
        await tx.tableAssignment.deleteMany({ where: byTenant });
        await tx.tableSession.deleteMany({ where: byTenant });
        await tx.diningTableShiftCoverage.deleteMany({ where: byTenant });
        await tx.diningTable.deleteMany({ where: byTenant });
        await tx.tableLocation.deleteMany({ where: byTenant });
        await tx.notification.deleteMany({ where: byTenant });
        await tx.auditEvent.deleteMany({ where: byTenant });
        await tx.dailyCloseWaiterLine.deleteMany({ where: byTenant });
        await tx.dailyCloseStationLine.deleteMany({ where: byTenant });
        await tx.operationalDailyClose.deleteMany({ where: byTenant });
        await tx.stationStaffAssignment.deleteMany({ where: byTenant });
        await tx.stationFallbackConfiguration.deleteMany({ where: byTenant });
        await tx.preparationStation.deleteMany({ where: byTenant });
        await tx.itemAvailabilityOverride.deleteMany({ where: byTenant });
        await tx.menuItemModifierAssignment.deleteMany({ where: byTenant });
        await tx.menuItem.deleteMany({ where: byTenant });
        await tx.menuCategory.deleteMany({ where: byTenant });
        await tx.menuPeriod.deleteMany({ where: byTenant });
        await tx.menu.deleteMany({ where: byTenant });
        await tx.modifierOption.deleteMany({ where: byTenant });
        await tx.modifierGroup.deleteMany({ where: byTenant });
        await tx.shiftSession.deleteMany({ where: byTenant });
        await tx.shiftAssignment.deleteMany({ where: byTenant });
        await tx.shiftDefinition.deleteMany({ where: byTenant });
        await tx.branchStaffAssignment.deleteMany({ where: byTenant });
        await tx.staffRoleAssignment.deleteMany({ where: byTenant });
        await tx.branchSettings.deleteMany({ where: byTenant });
        await tx.branch.deleteMany({ where: byTenant });
        await tx.tenantStaffMembership.deleteMany({ where: byTenant });
        await tx.tenantSite.deleteMany({ where: byTenant });
        await tx.tenantSettings.deleteMany({ where: byTenant });
        await tx.tenantSubscription.deleteMany({ where: byTenant });
        await tx.tenantEntitlement.deleteMany({ where: byTenant });
        await tx.platformSupportSession.deleteMany({ where: byTenant });
        await tx.idempotencyCommand.deleteMany({ where: byTenant });

        if (staffUserIds.length > 0) {
          const remaining = await tx.tenantStaffMembership.findMany({
            where: { userId: { in: staffUserIds } },
            select: { userId: true },
          });
          const stillMember = new Set(remaining.map((r) => r.userId));

          const platformAdmins = await tx.platformUserRole.findMany({
            where: {
              userId: { in: staffUserIds },
              status: 'ACTIVE',
            },
            select: { userId: true },
          });
          const isPlatformAdmin = new Set(platformAdmins.map((r) => r.userId));

          const orphanUserIds = staffUserIds.filter(
            (id) => !stillMember.has(id) && !isPlatformAdmin.has(id),
          );

          if (orphanUserIds.length > 0) {
            await tx.appUser.deleteMany({
              where: { id: { in: orphanUserIds } },
            });
          }
        }

        await tx.tenant.delete({ where: { id: tenantId } });

        await tx.auditEvent.create({
          data: {
            tenantId: null,
            actorUserId: userId,
            action: 'TENANT_DELETED',
            entityType: 'TENANT',
            entityId: tenantId,
            reason: `Deleted tenant ${tenantName}`,
          },
        });
      },
      { timeout: 120_000, maxWait: 15_000 },
    );

    return { ok: true, deletedTenantId: tenantId };
  }

  async updateTenant(
    userId: string,
    tenantId: string,
    dto: UpdateTenantDto,
  ): Promise<TenantDetailResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const existing = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        branches: { orderBy: { createdAt: 'asc' } },
        subscriptions: {
          where: { subscriptionStatus: 'ACTIVE' },
          include: { plan: true },
        },
        staffMemberships: {
          include: {
            user: true,
            roleAssignments: {
              where: { status: 'ACTIVE' },
              include: { role: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!existing) {
      throw new UnauthorizedException(`Tenant ${tenantId} not found`);
    }

    const displayName = dto.name?.trim();
    if (displayName !== undefined && displayName.length < 2) {
      throw new BadRequestException('Restaurant brand name is required.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (displayName || dto.legalName !== undefined) {
          await tx.tenant.update({
            where: { id: tenantId },
            data: {
              ...(displayName ? { displayName } : {}),
              ...(dto.legalName !== undefined
                ? { legalName: dto.legalName?.trim() || null }
                : {}),
            },
          });
        }

        const primaryBranch = existing.branches[0];
        if (primaryBranch && (dto.branchName || dto.branchCode !== undefined)) {
          await tx.branch.update({
            where: { id: primaryBranch.id },
            data: {
              ...(dto.branchName?.trim()
                ? { name: dto.branchName.trim() }
                : {}),
              ...(dto.branchCode !== undefined
                ? { displayCode: dto.branchCode?.trim() || null }
                : {}),
            },
          });
        }

        if (dto.planCode?.trim()) {
          const planCode = dto.planCode.trim().toUpperCase();
          const plan = await tx.subscriptionPlan.findFirst({
            where: { code: planCode, status: 'ACTIVE' },
          });
          if (!plan) {
            throw new BadRequestException(
              `Unknown or inactive plan "${planCode}".`,
            );
          }
          if (plan) {
            const activeSub = existing.subscriptions[0];
            if (activeSub) {
              if (activeSub.planId !== plan.id) {
                await tx.tenantSubscription.update({
                  where: { id: activeSub.id },
                  data: {
                    // DB check allows: TRIAL | ACTIVE | PAST_DUE | SUSPENDED | CANCELLED
                    subscriptionStatus: 'CANCELLED',
                    effectiveTo: new Date(),
                  },
                });
                await tx.tenantSubscription.create({
                  data: {
                    tenantId,
                    planId: plan.id,
                    subscriptionStatus: 'ACTIVE',
                    effectiveFrom: new Date(),
                  },
                });
              }
            } else {
              await tx.tenantSubscription.create({
                data: {
                  tenantId,
                  planId: plan.id,
                  subscriptionStatus: 'ACTIVE',
                  effectiveFrom: new Date(),
                },
              });
            }
          }
        }

        await this.upsertTenantProfile(tx, tenantId, userId, {
          city: dto.city,
          area: dto.area,
          address: dto.address,
          hours: dto.hours,
          concept: dto.concept,
          contactPhone: dto.phone,
          contactEmail: dto.email,
        });

        if (dto.removeManager) {
          const membership = this.pickManagerMembership(
            existing.staffMemberships,
          );
          if (membership) {
            await tx.staffRoleAssignment.updateMany({
              where: { staffMembershipId: membership.id, status: 'ACTIVE' },
              data: { status: 'INACTIVE', revokedAt: new Date() },
            });
            await tx.branchStaffAssignment.updateMany({
              where: { staffMembershipId: membership.id, status: 'ACTIVE' },
              data: { status: 'INACTIVE', releasedAt: new Date() },
            });
            await tx.tenantStaffMembership.update({
              where: { id: membership.id },
              data: { status: 'INACTIVE', deactivatedAt: new Date() },
            });
          }
        } else {
          const wantsManagerUpdate =
            dto.managerName ||
            dto.managerEmail ||
            dto.managerPhone ||
            dto.managerPassword;

          if (wantsManagerUpdate) {
            const membership = this.pickManagerMembership(
              existing.staffMemberships,
            );
            const managerName =
              dto.managerName?.trim() ||
              membership?.employeeDisplayName ||
              membership?.user?.displayName ||
              'Restaurant Manager';
            const managerEmail =
              dto.managerEmail?.trim() ||
              membership?.user?.email ||
              `manager.${tenantId.slice(0, 6)}@restaurant.et`;
            const managerPhone =
              dto.managerPhone?.trim() || membership?.user?.phone || undefined;

            if (dto.managerEmail?.trim()) {
              const emailTaken = await tx.appUser.findFirst({
                where: {
                  email: dto.managerEmail.trim(),
                  NOT: membership?.userId ? { id: membership.userId } : undefined,
                },
              });
              if (emailTaken) {
                throw new ConflictException({
                  message:
                    'That manager email is already used by another account.',
                  field: 'managerEmail',
                });
              }
            }

            if (managerPhone) {
              const phoneTaken = await tx.appUser.findFirst({
                where: {
                  phone: managerPhone,
                  NOT: membership?.userId ? { id: membership.userId } : undefined,
                },
              });
              if (phoneTaken) {
                throw new ConflictException({
                  message:
                    'That manager phone is already used by another account.',
                  field: 'managerPhone',
                });
              }
            }

            if (!membership) {
              let managerUser = await tx.appUser.findFirst({
                where: { email: managerEmail },
              });
              if (!managerUser) {
                managerUser = await tx.appUser.create({
                  data: {
                    displayName: managerName,
                    email: managerEmail,
                    phone: managerPhone,
                    accountStatus: 'ACTIVE',
                  },
                });
              } else {
                managerUser = await tx.appUser.update({
                  where: { id: managerUser.id },
                  data: {
                    displayName: managerName,
                    phone: managerPhone || managerUser.phone,
                  },
                });
              }

              const createdMembership = await tx.tenantStaffMembership.create({
                data: {
                  tenantId,
                  userId: managerUser.id,
                  employeeDisplayName: managerName,
                  status: 'ACTIVE',
                  joinedAt: new Date(),
                },
              });

              if (primaryBranch) {
                await tx.branchStaffAssignment.create({
                  data: {
                    tenantId,
                    branchId: primaryBranch.id,
                    staffMembershipId: createdMembership.id,
                    status: 'ACTIVE',
                  },
                });
                await this.ensureManagerRole(
                  tx,
                  tenantId,
                  primaryBranch.id,
                  createdMembership.id,
                );
              }

              if (dto.managerPassword?.trim()) {
                await this.upsertUserPassword(
                  tx,
                  managerUser.id,
                  dto.managerPassword.trim(),
                );
              }
            } else {
              await tx.appUser.update({
                where: { id: membership.userId },
                data: {
                  displayName: managerName,
                  ...(dto.managerEmail?.trim()
                    ? { email: dto.managerEmail.trim() }
                    : {}),
                  ...(managerPhone ? { phone: managerPhone } : {}),
                },
              });

              await tx.tenantStaffMembership.update({
                where: { id: membership.id },
                data: {
                  employeeDisplayName: managerName,
                  status: 'ACTIVE',
                  deactivatedAt: null,
                },
              });

              if (primaryBranch) {
                const activeBranchAssign =
                  await tx.branchStaffAssignment.findFirst({
                    where: {
                      tenantId,
                      branchId: primaryBranch.id,
                      staffMembershipId: membership.id,
                      status: 'ACTIVE',
                    },
                  });
                if (!activeBranchAssign) {
                  await tx.branchStaffAssignment.create({
                    data: {
                      tenantId,
                      branchId: primaryBranch.id,
                      staffMembershipId: membership.id,
                      status: 'ACTIVE',
                    },
                  });
                }
                await this.ensureManagerRole(
                  tx,
                  tenantId,
                  primaryBranch.id,
                  membership.id,
                );
              }

              if (dto.managerPassword?.trim()) {
                await this.upsertUserPassword(
                  tx,
                  membership.userId,
                  dto.managerPassword.trim(),
                );
              }
            }
          }
        }

        if (dto.removeOwner) {
          const membership = this.pickOwnerMembership(
            existing.staffMemberships,
          );
          if (membership) {
            await tx.staffRoleAssignment.updateMany({
              where: { staffMembershipId: membership.id, status: 'ACTIVE' },
              data: { status: 'INACTIVE', revokedAt: new Date() },
            });
            await tx.tenantStaffMembership.update({
              where: { id: membership.id },
              data: { status: 'INACTIVE', deactivatedAt: new Date() },
            });
          }
        } else {
          const wantsOwnerUpdate =
            dto.ownerName ||
            dto.ownerEmail ||
            dto.ownerPhone ||
            dto.ownerPassword;

          if (wantsOwnerUpdate) {
            const membership = this.pickOwnerMembership(
              existing.staffMemberships,
            );
            const ownerName =
              dto.ownerName?.trim() ||
              membership?.employeeDisplayName ||
              membership?.user?.displayName ||
              'Restaurant Owner';
            const ownerEmail =
              dto.ownerEmail?.trim() ||
              membership?.user?.email ||
              `owner.${tenantId.slice(0, 6)}@restaurant.et`;
            const ownerPhone =
              dto.ownerPhone?.trim() || membership?.user?.phone || undefined;

            if (dto.ownerEmail?.trim()) {
              const emailTaken = await tx.appUser.findFirst({
                where: {
                  email: dto.ownerEmail.trim(),
                  NOT: membership?.userId ? { id: membership.userId } : undefined,
                },
              });
              if (emailTaken) {
                throw new ConflictException({
                  message:
                    'That owner email is already used by another account.',
                  field: 'ownerEmail',
                });
              }
            }

            if (ownerPhone) {
              const phoneTaken = await tx.appUser.findFirst({
                where: {
                  phone: ownerPhone,
                  NOT: membership?.userId ? { id: membership.userId } : undefined,
                },
              });
              if (phoneTaken) {
                throw new ConflictException({
                  message:
                    'That owner phone is already used by another account.',
                  field: 'ownerPhone',
                });
              }
            }

            if (!membership) {
              let ownerUser = await tx.appUser.findFirst({
                where: { email: ownerEmail },
              });
              if (!ownerUser) {
                ownerUser = await tx.appUser.create({
                  data: {
                    displayName: ownerName,
                    email: ownerEmail,
                    phone: ownerPhone,
                    accountStatus: 'ACTIVE',
                  },
                });
              } else {
                ownerUser = await tx.appUser.update({
                  where: { id: ownerUser.id },
                  data: {
                    displayName: ownerName,
                    phone: ownerPhone || ownerUser.phone,
                  },
                });
              }

              const createdMembership = await tx.tenantStaffMembership.create({
                data: {
                  tenantId,
                  userId: ownerUser.id,
                  employeeDisplayName: ownerName,
                  status: 'ACTIVE',
                  joinedAt: new Date(),
                },
              });

              await this.ensureOwnerRole(tx, tenantId, createdMembership.id);

              if (dto.ownerPassword?.trim()) {
                await this.upsertUserPassword(
                  tx,
                  ownerUser.id,
                  dto.ownerPassword.trim(),
                );
              }
            } else {
              await tx.appUser.update({
                where: { id: membership.userId },
                data: {
                  displayName: ownerName,
                  ...(dto.ownerEmail?.trim()
                    ? { email: dto.ownerEmail.trim() }
                    : {}),
                  ...(ownerPhone ? { phone: ownerPhone } : {}),
                },
              });

              await tx.tenantStaffMembership.update({
                where: { id: membership.id },
                data: {
                  employeeDisplayName: ownerName,
                  status: 'ACTIVE',
                  deactivatedAt: null,
                },
              });

              await this.ensureOwnerRole(tx, tenantId, membership.id);

              if (dto.ownerPassword?.trim()) {
                await this.upsertUserPassword(
                  tx,
                  membership.userId,
                  dto.ownerPassword.trim(),
                );
              }
            }
          }
        }

        await tx.auditEvent.create({
          data: {
            tenantId,
            branchId: existing.branches[0]?.id,
            actorUserId: userId,
            action: 'TENANT_UPDATED',
            entityType: 'TENANT',
            entityId: tenantId,
            reason: `Updated tenant ${displayName || existing.displayName}`,
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = Array.isArray(error.meta?.target)
          ? (error.meta?.target as string[]).join(', ')
          : String(error.meta?.target || 'field');
        throw new ConflictException(
          `Could not update tenant: ${target} is already in use.`,
        );
      }
      throw error;
    }

    return this.getTenantById(userId, tenantId);
  }

  async listAuditEvents(
    userId: string,
    query: ListPlatformAuditQueryDto = {},
  ): Promise<PlatformAuditListResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.AuditEventWhereInput = {};

    if (query.tenantId?.trim()) {
      where.tenantId = query.tenantId.trim();
    }

    if (query.action?.trim()) {
      where.action = { contains: query.action.trim(), mode: 'insensitive' };
    }

    if (query.startDate || query.endDate) {
      where.occurredAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }

    if (query.search?.trim()) {
      const s = query.search.trim();
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          s,
        );

      where.OR = [
        { action: { contains: s, mode: 'insensitive' } },
        { reason: { contains: s, mode: 'insensitive' } },
        { entityType: { contains: s, mode: 'insensitive' } },
        ...(isUuid ? [{ id: s }, { entityId: s }, { tenantId: s }] : []),
        { tenant: { displayName: { contains: s, mode: 'insensitive' } } },
        { actorUser: { displayName: { contains: s, mode: 'insensitive' } } },
        { actorUser: { email: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (query.category && query.category !== 'all') {
      const cat = query.category.toLowerCase();
      if (cat === 'orders') {
        where.entityType = {
          in: ['ORDER', 'ORDER_ITEM', 'TABLE_SESSION', 'DINING_TABLE'],
        };
      } else if (cat === 'payments') {
        where.entityType = {
          in: ['BILL', 'PAYMENT', 'CASH_DROP', 'RECONCILIATION', 'DAILY_CLOSE'],
        };
      } else if (cat === 'staff' || cat === 'security') {
        where.entityType = {
          in: [
            'STAFF',
            'STAFF_MEMBERSHIP',
            'USER',
            'ROLE',
            'PERMISSION',
            'AUTH',
          ],
        };
      } else if (cat === 'system' || cat === 'platform') {
        where.entityType = {
          in: ['TENANT', 'BRANCH', 'FEATURE_FLAG', 'SUBSCRIPTION', 'SITE'],
        };
      }
    }

    const [total, events, todayCount] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
        include: {
          tenant: true,
          actorUser: {
            include: {
              staffMemberships: {
                where: { status: 'ACTIVE' },
                include: {
                  roleAssignments: {
                    where: { status: 'ACTIVE' },
                    include: { role: true },
                  },
                },
              },
            },
          },
        },
      }),
      (() => {
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);
        return this.prisma.auditEvent.count({
          where: { occurredAt: { gte: startOfToday } },
        });
      })(),
    ]);

    const data: PlatformAuditEventDto[] = events.map((event) => {
      const severity =
        event.action.includes('SUSPEND') ||
        event.action.includes('CANCEL') ||
        event.action.includes('DISPUTE')
          ? 'warning'
          : event.action.includes('DELETE') || event.action.includes('FAIL')
            ? 'error'
            : event.action.includes('PROVISION') ||
                event.action.includes('PAID') ||
                event.action.includes('CLOSE')
              ? 'success'
              : 'info';

      const membership =
        event.actorUser?.staffMemberships?.find(
          (m) => m.tenantId === event.tenantId,
        ) || event.actorUser?.staffMemberships?.[0];
      const actorRole =
        membership?.roleAssignments?.[0]?.role?.code || 'PLATFORM_USER';

      let category = 'system';
      const entity = (event.entityType || '').toUpperCase();
      if (
        ['ORDER', 'ORDER_ITEM', 'TABLE_SESSION', 'DINING_TABLE'].includes(
          entity,
        )
      ) {
        category = 'orders';
      } else if (
        [
          'BILL',
          'PAYMENT',
          'CASH_DROP',
          'RECONCILIATION',
          'DAILY_CLOSE',
        ].includes(entity)
      ) {
        category = 'payments';
      } else if (
        [
          'STAFF',
          'STAFF_MEMBERSHIP',
          'USER',
          'ROLE',
          'PERMISSION',
          'AUTH',
        ].includes(entity)
      ) {
        category = 'staff';
      }

      return {
        id: event.id,
        action: event.action,
        category,
        entityName: event.tenant?.displayName || event.entityType || 'Platform',
        entityType: event.entityType,
        entityId: event.entityId,
        tenantId: event.tenantId,
        tenantName:
          event.tenant?.displayName ||
          (event.tenantId ? 'Restaurant' : 'Platform System'),
        actorName: event.actorUser?.displayName || 'System Automated',
        actorRole,
        description:
          event.reason ||
          `${event.action} on ${event.entityType}${
            event.actorUser?.displayName
              ? ` by ${event.actorUser.displayName}`
              : ''
          }`,
        occurredAt: event.occurredAt.toISOString(),
        severity,
        metadataJson: event.metadataJson,
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      summary: await this.buildAuditSummary(todayCount),
    };
  }

  private async buildAuditSummary(totalToday: number) {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todayWhere = { occurredAt: { gte: startOfToday } };

    const [operationsToday, securityToday, systemToday] = await Promise.all([
      this.prisma.auditEvent.count({
        where: {
          ...todayWhere,
          entityType: {
            in: ['ORDER', 'ORDER_ITEM', 'TABLE_SESSION', 'DINING_TABLE'],
          },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          ...todayWhere,
          entityType: {
            in: [
              'STAFF',
              'STAFF_MEMBERSHIP',
              'USER',
              'ROLE',
              'PERMISSION',
              'AUTH',
            ],
          },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          ...todayWhere,
          entityType: {
            in: ['TENANT', 'BRANCH', 'FEATURE_FLAG', 'SUBSCRIPTION', 'SITE'],
          },
        },
      }),
    ]);

    return {
      totalToday,
      securityToday,
      operationsToday,
      systemToday,
    };
  }

  async exportAuditCsv(
    userId: string,
    query: ListPlatformAuditQueryDto = {},
  ): Promise<string> {
    await this.verifySuperAdminAccess(userId);
    const pageQuery = { ...query, page: 1, limit: 5000 };
    const { data } = await this.listAuditEvents(userId, pageQuery);

    const escape = (value: unknown) => {
      const raw = value == null ? '' : String(value);
      if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
      return raw;
    };

    const header = [
      'id',
      'occurredAt',
      'action',
      'category',
      'tenant',
      'entityType',
      'entityId',
      'actor',
      'actorRole',
      'severity',
      'description',
    ].join(',');

    const rows = data.map((row) =>
      [
        row.id,
        row.occurredAt,
        row.action,
        row.category || '',
        row.tenantName || '',
        row.entityType || '',
        row.entityId || '',
        row.actorName || '',
        row.actorRole || '',
        row.severity,
        row.description,
      ]
        .map(escape)
        .join(','),
    );

    return [header, ...rows].join('\n');
  }

  async getLiveOps(userId: string): Promise<LiveOpsResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const branches = await this.prisma.branch.findMany({
      where: { status: 'ACTIVE' },
      include: {
        tenant: true,
        diningTables: true,
        tableSessions: {
          where: {
            closedAt: null,
            status: { not: 'CLOSED' },
          },
        },
        orders: {
          where: {
            tableSession: {
              closedAt: null,
              status: { not: 'CLOSED' },
            },
          },
        },
        bills: {
          where: {
            paidAt: null,
            status: { notIn: ['SETTLED', 'CLOSED', 'CANCELLED'] },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const mapped = branches.map((branch) => ({
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.displayCode || 'MAIN',
      tenantId: branch.tenantId,
      tenantName:
        branch.tenant.displayName || branch.tenant.legalName || 'Tenant',
      status: branch.status,
      openSessions: branch.tableSessions.length,
      openOrders: branch.orders.length,
      unpaidBills: branch.bills.length,
      tableCount: branch.diningTables.length,
    }));

    const liveTenantIds = new Set(
      mapped
        .filter((b) => b.openSessions > 0 || b.openOrders > 0)
        .map((b) => b.tenantId),
    );

    return {
      summary: {
        openSessions: mapped.reduce((sum, b) => sum + b.openSessions, 0),
        openOrders: mapped.reduce((sum, b) => sum + b.openOrders, 0),
        unpaidBills: mapped.reduce((sum, b) => sum + b.unpaidBills, 0),
        activeBranches: mapped.length,
        liveTenants: liveTenantIds.size,
      },
      branches: mapped,
    };
  }

  async listPlatformStaff(
    userId: string,
    query?: ListPlatformStaffQueryDto,
  ): Promise<PlatformStaffListResponseDto> {
    if (userId !== 'system') {
      await this.verifySuperAdminAccess(userId);
    }

    const page = Math.max(Number(query?.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query?.limit) || 20, 1), 100);
    const search = query?.search?.trim();
    const tenantId = query?.tenantId?.trim();
    const role = query?.role?.trim();
    const status = query?.status?.trim()?.toUpperCase();
    const sortOrder = query?.sortOrder === 'asc' ? 'asc' : 'desc';

    const whereClause: Prisma.TenantStaffMembershipWhereInput = {};

    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    if (status) {
      if (status === 'ACTIVE') {
        whereClause.status = 'ACTIVE';
        whereClause.user = { accountStatus: 'ACTIVE' };
      } else if (status === 'SUSPENDED' || status === 'INACTIVE') {
        whereClause.OR = [
          { status: 'INACTIVE' },
          { user: { accountStatus: 'SUSPENDED' } },
        ];
      }
    }

    if (role) {
      const normalizedRole =
        UI_ROLE_MAP[role] ||
        UI_ROLE_MAP[role.toLowerCase()] ||
        role.toUpperCase();
      whereClause.roleAssignments = {
        some: {
          status: 'ACTIVE',
          role: {
            code: {
              equals: normalizedRole,
              mode: 'insensitive',
            },
          },
        },
      };
    }

    if (search) {
      const searchConditions: Prisma.TenantStaffMembershipWhereInput[] = [
        { employeeDisplayName: { contains: search, mode: 'insensitive' } },
        { user: { displayName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search, mode: 'insensitive' } } },
        { tenant: { displayName: { contains: search, mode: 'insensitive' } } },
        { tenant: { legalName: { contains: search, mode: 'insensitive' } } },
      ];

      if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, { OR: searchConditions }];
        delete whereClause.OR;
      } else {
        whereClause.OR = searchConditions;
      }
    }

    const total = await this.prisma.tenantStaffMembership.count({
      where: whereClause,
    });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const skip = (page - 1) * limit;

    const memberships = await this.prisma.tenantStaffMembership.findMany({
      where: whereClause,
      include: {
        tenant: true,
        user: {
          include: {
            credential: true,
            photo: true,
            sessions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        roleAssignments: {
          where: { status: 'ACTIVE' },
          include: { role: true },
        },
      },
      orderBy: { createdAt: sortOrder },
      skip,
      take: limit,
    });

    const data: PlatformStaffMemberDto[] = memberships.map((m) => {
      const assignedRoles = m.roleAssignments.map((r) => r.role.code);
      const roles = assignedRoles.length > 0 ? assignedRoles : ['STAFF'];

      return {
        membershipId: m.id,
        userId: m.userId,
        displayName: m.employeeDisplayName || m.user.displayName,
        email: m.user.email ?? undefined,
        phone: m.user.phone ?? undefined,
        tenantId: m.tenantId,
        tenantName: m.tenant.displayName || m.tenant.legalName || 'Tenant',
        roles,
        accountStatus: m.user.accountStatus,
        membershipStatus: m.status,
        lastLoginAt: m.user.sessions[0]?.createdAt?.toISOString() ?? null,
        hasPassword: Boolean(m.user.credential?.passwordHash),
        hasPin: Boolean(m.user.credential?.passwordHash),
        photoUrl: m.user.photo?.path || null,
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  private async getStaffMemberDto(
    membershipId: string,
  ): Promise<PlatformStaffMemberDto> {
    const membership = await this.prisma.tenantStaffMembership.findUnique({
      where: { id: membershipId },
      include: {
        tenant: true,
        user: {
          include: {
            credential: true,
            photo: true,
            sessions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        roleAssignments: {
          where: { status: 'ACTIVE' },
          include: { role: true },
        },
      },
    });

    if (!membership) {
      throw new UnauthorizedException('Staff member not found');
    }

    const assignedRoles = membership.roleAssignments.map((r) => r.role.code);
    const roles = assignedRoles.length > 0 ? assignedRoles : ['STAFF'];

    return {
      membershipId: membership.id,
      userId: membership.userId,
      displayName:
        membership.employeeDisplayName || membership.user.displayName,
      email: membership.user.email ?? undefined,
      phone: membership.user.phone ?? undefined,
      tenantId: membership.tenantId,
      tenantName:
        membership.tenant.displayName ||
        membership.tenant.legalName ||
        'Tenant',
      roles,
      accountStatus: membership.user.accountStatus,
      membershipStatus: membership.status,
      lastLoginAt:
        membership.user.sessions[0]?.createdAt?.toISOString() ?? null,
      hasPassword: Boolean(membership.user.credential?.passwordHash),
      hasPin: Boolean(membership.user.credential?.passwordHash),
      photoUrl: membership.user.photo?.path || null,
    };
  }

  private async verifyPinUniqueInTenant(
    tenantId: string,
    pin: string,
    excludeUserId?: string,
  ): Promise<void> {
    const trimmedPin = pin.trim();
    if (!trimmedPin) return;

    const memberships = await this.prisma.tenantStaffMembership.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      },
      include: {
        user: {
          include: { credential: true },
        },
      },
    });

    for (const membership of memberships) {
      const hash = membership.user.credential?.passwordHash;
      if (hash) {
        const isMatch = await bcrypt.compare(trimmedPin, hash);
        if (isMatch) {
          const staffName =
            membership.employeeDisplayName ||
            membership.user.displayName ||
            'another staff member';
          throw new ConflictException({
            status: 409,
            message: `This PIN is already in use by ${staffName} in this restaurant. Please choose a different PIN.`,
          });
        }
      }
    }
  }

  async createPlatformStaff(
    userId: string,
    dto: CreatePlatformStaffDto,
  ): Promise<PlatformStaffMemberDto> {
    await this.verifySuperAdminAccess(userId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      include: {
        branches: { where: { status: 'ACTIVE' }, take: 1 },
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Verify PIN uniqueness within this restaurant
    await this.verifyPinUniqueInTenant(dto.tenantId, dto.pin);

    if (dto.email?.trim()) {
      const existingEmail = await this.prisma.appUser.findFirst({
        where: { email: dto.email.trim().toLowerCase() },
      });
      if (existingEmail) {
        throw new ConflictException({
          status: 409,
          message: 'A user with this email address already exists.',
        });
      }
    }

    if (dto.phone?.trim()) {
      const existingPhone = await this.prisma.appUser.findFirst({
        where: { phone: dto.phone.trim() },
      });
      if (existingPhone) {
        throw new ConflictException({
          status: 409,
          message: 'A user with this phone number already exists.',
        });
      }
    }

    const roleCode =
      UI_ROLE_MAP[dto.role] ||
      UI_ROLE_MAP[dto.role?.toLowerCase()] ||
      dto.role?.toUpperCase() ||
      'WAITER';

    const roleRecord = await this.prisma.restaurantRole.findUnique({
      where: { code: roleCode },
    });
    if (!roleRecord) {
      throw new BadRequestException(`Role ${roleCode} does not exist.`);
    }

    const branchId = tenant.branches[0]?.id;
    const passwordHash = await bcrypt.hash(dto.pin.trim().slice(0, 72), 10);

    const createdMembership = await this.prisma.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: {
          displayName: dto.name.trim(),
          email: dto.email?.trim().toLowerCase() || null,
          phone: dto.phone?.trim() || null,
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

      const membership = await tx.tenantStaffMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          employeeDisplayName: dto.name.trim(),
          status: 'ACTIVE',
        },
      });

      if (branchId) {
        await tx.branchStaffAssignment.create({
          data: {
            tenantId: tenant.id,
            branchId,
            staffMembershipId: membership.id,
            status: 'ACTIVE',
          },
        });

        await tx.staffRoleAssignment.create({
          data: {
            tenantId: tenant.id,
            branchId,
            staffMembershipId: membership.id,
            roleId: roleRecord.id,
            status: 'ACTIVE',
          },
        });

        if (dto.stationCode) {
          const station = await tx.preparationStation.findFirst({
            where: {
              branchId,
              code: dto.stationCode.toUpperCase(),
              status: 'ACTIVE',
            },
          });
          if (station) {
            await tx.stationStaffAssignment.create({
              data: {
                tenantId: tenant.id,
                branchId,
                staffMembershipId: membership.id,
                stationId: station.id,
                status: 'ACTIVE',
              },
            });
          }
        }
      }

      await tx.auditEvent.create({
        data: {
          tenantId: tenant.id,
          actorUserId: userId,
          action: 'STAFF_CREATED_BY_SUPER_ADMIN',
          entityType: 'STAFF_MEMBERSHIP',
          entityId: membership.id,
          reason: `Created staff ${dto.name.trim()} (${roleCode}) at ${tenant.displayName}`,
        },
      });

      return membership;
    });

    return this.getStaffMemberDto(createdMembership.id);
  }

  async resetPlatformStaffPin(
    userId: string,
    membershipId: string,
    dto: ResetPlatformStaffPinDto,
  ): Promise<PlatformStaffMemberDto> {
    await this.verifySuperAdminAccess(userId);

    const membership = await this.prisma.tenantStaffMembership.findUnique({
      where: { id: membershipId },
      include: { tenant: true },
    });
    if (!membership) {
      throw new UnauthorizedException('Staff member not found');
    }

    // Verify PIN uniqueness within this restaurant, excluding this staff member
    await this.verifyPinUniqueInTenant(
      membership.tenantId,
      dto.pin,
      membership.userId,
    );

    const passwordHash = await bcrypt.hash(dto.pin.trim().slice(0, 72), 10);

    await this.prisma.$transaction(async (tx) => {
      const existingCred = await tx.userCredential.findUnique({
        where: { userId: membership.userId },
      });

      if (existingCred) {
        await tx.userCredential.update({
          where: { userId: membership.userId },
          data: { passwordHash },
        });
      } else {
        await tx.userCredential.create({
          data: {
            userId: membership.userId,
            passwordHash,
            authProvider: 'email',
          },
        });
      }

      await tx.authSession.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.auditEvent.create({
        data: {
          tenantId: membership.tenantId,
          actorUserId: userId,
          action: 'STAFF_PIN_RESET',
          entityType: 'STAFF_MEMBERSHIP',
          entityId: membershipId,
          reason: `PIN reset for ${membership.employeeDisplayName} at ${membership.tenant.displayName}`,
        },
      });
    });

    return this.getStaffMemberDto(membershipId);
  }

  async suspendPlatformStaff(
    userId: string,
    membershipId: string,
    dto: SuspendPlatformStaffDto,
  ): Promise<PlatformStaffMemberDto> {
    await this.verifySuperAdminAccess(userId);

    const membership = await this.prisma.tenantStaffMembership.findUnique({
      where: { id: membershipId },
      include: { user: true, tenant: true },
    });
    if (!membership) {
      throw new UnauthorizedException('Staff member not found');
    }

    const nextAccount = dto.suspended ? 'SUSPENDED' : 'ACTIVE';
    const nextMembership = dto.suspended ? 'INACTIVE' : 'ACTIVE';

    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({
        where: { id: membership.userId },
        data: { accountStatus: nextAccount },
      });
      await tx.tenantStaffMembership.update({
        where: { id: membershipId },
        data: {
          status: nextMembership,
          deactivatedAt: dto.suspended ? new Date() : null,
        },
      });

      if (dto.suspended) {
        await tx.authSession.updateMany({
          where: { userId: membership.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditEvent.create({
        data: {
          tenantId: membership.tenantId,
          actorUserId: userId,
          action: dto.suspended ? 'STAFF_SUSPENDED' : 'STAFF_REACTIVATED',
          entityType: 'STAFF_MEMBERSHIP',
          entityId: membershipId,
          reason: `${dto.suspended ? 'Suspended' : 'Reactivated'} ${
            membership.employeeDisplayName
          } at ${membership.tenant.displayName}`,
        },
      });
    });

    return this.getStaffMemberDto(membershipId);
  }

  async resetPlatformStaffPassword(
    userId: string,
    membershipId: string,
    dto: ResetPlatformStaffPasswordDto,
  ): Promise<PlatformStaffMemberDto> {
    await this.verifySuperAdminAccess(userId);

    const password = dto.password?.trim();
    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters.');
    }

    const membership = await this.prisma.tenantStaffMembership.findUnique({
      where: { id: membershipId },
      include: { tenant: true },
    });
    if (!membership) {
      throw new UnauthorizedException('Staff member not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.upsertUserPassword(tx, membership.userId, password);
      await tx.authSession.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: membership.tenantId,
          actorUserId: userId,
          action: 'STAFF_PASSWORD_RESET',
          entityType: 'STAFF_MEMBERSHIP',
          entityId: membershipId,
          reason: `Password reset for ${membership.employeeDisplayName} at ${membership.tenant.displayName}`,
        },
      });
    });

    return this.getStaffMemberDto(membershipId);
  }

  async impersonateSession(
    actorUserId: string,
    sessionId: string | number | undefined,
    dto: ImpersonateSessionDto,
  ): Promise<ImpersonateResponseDto> {
    await this.verifySuperAdminAccess(actorUserId);

    let targetMembershipId: string;
    let targetUserId: string;
    let targetTenantId: string;
    let targetBranchId: string | null = dto.branchId?.trim() || null;
    let targetRoleLabel: string;
    let targetDisplayName: string;
    let tenantDisplayName: string;

    if (dto.membershipId?.trim()) {
      const membership = await this.prisma.tenantStaffMembership.findUnique({
        where: { id: dto.membershipId.trim() },
        include: {
          tenant: true,
          user: true,
          roleAssignments: {
            where: { status: 'ACTIVE' },
            include: { role: true },
          },
          branchAssignments: {
            where: { status: 'ACTIVE', releasedAt: null },
          },
        },
      });

      if (!membership) {
        throw new NotFoundException('Staff membership not found.');
      }
      if (
        membership.status !== 'ACTIVE' ||
        membership.user.accountStatus !== 'ACTIVE'
      ) {
        throw new BadRequestException(
          'Cannot impersonate a suspended or inactive staff account.',
        );
      }

      targetMembershipId = membership.id;
      targetUserId = membership.userId;
      targetTenantId = membership.tenantId;
      targetBranchId =
        targetBranchId || membership.branchAssignments[0]?.branchId || null;
      targetRoleLabel = membership.roleAssignments[0]?.role?.code || 'STAFF';
      targetDisplayName =
        membership.employeeDisplayName || membership.user.displayName;
      tenantDisplayName =
        membership.tenant.displayName ||
        membership.tenant.legalName ||
        'Tenant';
    } else if (dto.tenantId?.trim()) {
      const desiredRole = dto.targetRole || 'MANAGER';
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: dto.tenantId.trim() },
        include: {
          branches: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' },
          },
          staffMemberships: {
            where: { status: 'ACTIVE' },
            include: {
              user: {
                include: {
                  platformRoles: { where: { status: 'ACTIVE' } },
                },
              },
              roleAssignments: {
                where: { status: 'ACTIVE', revokedAt: null },
                include: { role: true },
              },
              branchAssignments: {
                where: { status: 'ACTIVE', releasedAt: null },
              },
            },
          },
        },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found.');
      }

      tenantDisplayName =
        tenant.displayName || tenant.legalName || 'Restaurant';
      const branchId = targetBranchId || tenant.branches[0]?.id || null;
      targetBranchId = branchId;

      const matchingMemberships = tenant.staffMemberships.filter(
        (m) =>
          m.user.accountStatus === 'ACTIVE' &&
          m.roleAssignments.some((r) => r.role?.code === desiredRole),
      );

      const chosen =
        (branchId
          ? matchingMemberships.find((m) =>
              m.branchAssignments.some((b) => b.branchId === branchId),
            )
          : undefined) || matchingMemberships[0];

      if (!chosen) {
        // Auto-provision an active Owner or Manager account for this tenant so support impersonation always works
        const created = await this.prisma.$transaction(async (tx) => {
          const defaultName =
            desiredRole === 'OWNER_ADMIN'
              ? `${tenantDisplayName} Owner`
              : `${tenantDisplayName} Manager`;
          const user = await tx.appUser.create({
            data: {
              displayName: defaultName,
              accountStatus: 'ACTIVE',
              preferredBranchId: branchId,
            },
          });
          const membership = await tx.tenantStaffMembership.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              employeeDisplayName: defaultName,
              status: 'ACTIVE',
              joinedAt: new Date(),
            },
          });
          if (branchId) {
            await tx.branchStaffAssignment.create({
              data: {
                tenantId: tenant.id,
                branchId,
                staffMembershipId: membership.id,
                status: 'ACTIVE',
              },
            });
          }
          if (desiredRole === 'OWNER_ADMIN') {
            await this.ensureOwnerRole(tx, tenant.id, membership.id);
          } else if (branchId) {
            await this.ensureManagerRole(
              tx,
              tenant.id,
              branchId,
              membership.id,
            );
          }
          return { user, membership, defaultName };
        });

        targetMembershipId = created.membership.id;
        targetUserId = created.user.id;
        targetTenantId = tenant.id;
        targetRoleLabel = desiredRole;
        targetDisplayName = created.defaultName;
      } else {
        targetMembershipId = chosen.id;
        targetUserId = chosen.userId;
        targetTenantId = tenant.id;
        targetRoleLabel = desiredRole;
        targetDisplayName =
          chosen.employeeDisplayName || chosen.user.displayName;

        if (branchId) {
          await this.prisma.$transaction(async (tx) => {
            await tx.appUser.update({
              where: { id: chosen.userId },
              data: { preferredBranchId: branchId },
            });
            const hasBranchAssignment = chosen.branchAssignments.some(
              (b) => b.branchId === branchId,
            );
            if (!hasBranchAssignment && desiredRole === 'MANAGER') {
              await tx.branchStaffAssignment.create({
                data: {
                  tenantId: tenant.id,
                  branchId,
                  staffMembershipId: chosen.id,
                  status: 'ACTIVE',
                },
              });
            }
          });
        }
      }
    } else {
      throw new BadRequestException(
        'Provide either membershipId or tenantId to impersonate.',
      );
    }

    const expiresInMs = 2 * 60 * 60 * 1000; // 2 hours
    const tokenExpires = Date.now() + expiresInMs;

    const token = await this.jwtService.signAsync(
      {
        id: targetUserId,
        role: { id: RoleEnum.user },
        sessionId: sessionId ?? 'impersonation',
        impersonatedBy: actorUserId,
        impersonatedMembershipId: targetMembershipId,
      },
      {
        secret: this.configService.getOrThrow('auth.secret', { infer: true }),
        expiresIn: '2h',
      },
    );

    await this.prisma.auditEvent.create({
      data: {
        tenantId: targetTenantId,
        branchId: targetBranchId,
        actorUserId,
        action: 'PLATFORM_IMPERSONATION_STARTED',
        entityType: 'STAFF_MEMBERSHIP',
        entityId: targetMembershipId,
        reason: `Super Admin impersonated ${targetDisplayName} (${targetRoleLabel}) at ${tenantDisplayName}`,
      },
    });

    const context = await this.identity.getByUserId(targetUserId, {
      ignorePlatformRoles: true,
      membershipId: targetMembershipId,
      impersonatedBy: actorUserId,
    });

    return {
      token,
      tokenExpires,
      context,
    };
  }

  async getTenantActivity(
    userId: string,
    query: GetTenantActivityQueryDto,
  ): Promise<TenantActivityResponseDto> {
    await this.verifySuperAdminAccess(userId);

    const tenantId = query.tenantId?.trim() || undefined;
    const branchId = query.branchId?.trim() || undefined;
    const movementType = (query.movementType || 'ALL').trim().toUpperCase();

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const endDate = query.endDate?.trim()
      ? new Date(`${query.endDate.trim()}T23:59:59.999Z`)
      : new Date(todayUtc.getTime() + 86_399_999);

    const defaultStart = new Date(todayUtc);
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 6);

    const startDate = query.startDate?.trim()
      ? new Date(`${query.startDate.trim()}T00:00:00.000Z`)
      : defaultStart;

    const startBusinessDate = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
      ),
    );
    const endBusinessDate = new Date(
      Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate(),
      ),
    );

    const scopeWhere: { tenantId?: string; branchId?: string } = {};
    if (tenantId) scopeWhere.tenantId = tenantId;
    if (branchId) scopeWhere.branchId = branchId;

    const businessDateRange = {
      gte: startBusinessDate,
      lte: endBusinessDate,
    };
    const timestampRange = {
      gte: startDate,
      lte: endDate,
    };

    const [
      branches,
      diningTables,
      bills,
      payments,
      tableSessions,
      orders,
      shifts,
      cashDrops,
      financeEntries,
      dailyCloses,
      inventoryEntries,
      auditEvents,
    ] = await Promise.all([
      this.prisma.branch.findMany({
        where: {
          status: 'ACTIVE',
          ...(tenantId ? { tenantId } : {}),
        },
        include: {
          tenant: true,
          diningTables: { where: { archivedAt: null } },
          tableSessions: {
            where: { closedAt: null, status: { not: 'CLOSED' } },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.diningTable.findMany({
        where: {
          archivedAt: null,
          ...scopeWhere,
        },
        include: {
          branch: true,
          tenant: true,
          assignedWaiter: true,
          sessions: {
            where: { closedAt: null, status: { not: 'CLOSED' } },
            include: {
              primaryWaiter: true,
              bill: true,
              orders: true,
            },
            orderBy: { openedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ branchId: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.bill.findMany({
        where: {
          ...scopeWhere,
          businessDate: businessDateRange,
        },
        include: {
          branch: true,
          tenant: true,
          generatedBy: true,
          tableSession: { include: { table: true } },
        },
        orderBy: { generatedAt: 'desc' },
        take: 400,
      }),
      this.prisma.payment.findMany({
        where: {
          ...scopeWhere,
          businessDate: businessDateRange,
        },
        include: {
          branch: true,
          tenant: true,
          collector: true,
          bill: true,
        },
        orderBy: { initiatedAt: 'desc' },
        take: 400,
      }),
      this.prisma.tableSession.findMany({
        where: {
          ...scopeWhere,
          businessDate: businessDateRange,
        },
        include: {
          branch: true,
          tenant: true,
          table: true,
          primaryWaiter: true,
          bill: true,
          orders: true,
        },
        orderBy: { openedAt: 'desc' },
        take: 400,
      }),
      this.prisma.order.findMany({
        where: {
          ...scopeWhere,
          businessDate: businessDateRange,
        },
        include: {
          branch: true,
          tenant: true,
          createdBy: true,
          tableSession: { include: { table: true } },
          items: { select: { itemNameSnapshot: true, quantity: true } },
        },
        orderBy: { confirmedAt: 'desc' },
        take: 300,
      }),
      this.prisma.shiftSession.findMany({
        where: {
          ...scopeWhere,
          businessDate: businessDateRange,
        },
        include: {
          branch: true,
          tenant: true,
          membership: true,
          role: true,
        },
        orderBy: { clockInAt: 'desc' },
        take: 300,
      }),
      this.prisma.cashDrop.findMany({
        where: {
          ...scopeWhere,
          businessDate: businessDateRange,
        },
        include: {
          branch: true,
          tenant: true,
          waiter: true,
          receivedBy: true,
        },
        orderBy: { initiatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.manualFinanceEntry.findMany({
        where: {
          ...scopeWhere,
          businessDate: businessDateRange,
          status: { not: 'VOID' },
        },
        include: {
          branch: true,
          tenant: true,
          createdBy: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.operationalDailyClose.findMany({
        where: {
          ...scopeWhere,
          businessDate: businessDateRange,
        },
        include: {
          branch: true,
          tenant: true,
        },
        orderBy: { businessDate: 'desc' },
      }),
      this.prisma.inventoryLedgerEntry.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(branchId ? { branchId } : {}),
          createdAt: timestampRange,
        },
        include: {
          branch: true,
          tenant: true,
          ingredient: true,
          createdBy: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.auditEvent.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(branchId ? { branchId } : {}),
          occurredAt: timestampRange,
        },
        include: {
          branch: true,
          tenant: true,
          actorUser: true,
          actorStaff: true,
        },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
    ]);

    // 1. Active Tables & Live Floor status
    const activeTables = diningTables.map((t) => {
      const openSession = t.sessions[0] ?? null;
      const isOccupied =
        Boolean(openSession) ||
        t.status === 'OCCUPIED' ||
        t.status === 'BILL_REQUESTED';
      return {
        tableId: t.id,
        tableName: t.displayName,
        tableNumber: t.displayNumber || t.displayName,
        isVip: t.isVip,
        branchId: t.branchId,
        branchName: t.branch.name,
        tenantId: t.tenantId,
        tenantName: t.tenant.displayName || t.tenant.legalName || 'Tenant',
        status: openSession?.billRequestedAt
          ? 'BILL_REQUESTED'
          : isOccupied
            ? 'OCCUPIED'
            : t.status,
        isOccupied,
        sessionId: openSession?.id ?? null,
        waiterName:
          openSession?.primaryWaiter?.employeeDisplayName ||
          t.assignedWaiter?.employeeDisplayName ||
          null,
        guestCount: openSession?.guestCount ?? null,
        openedAt: openSession?.openedAt?.toISOString() ?? null,
        runningBillTotal: openSession?.bill
          ? Number(openSession.bill.totalAmount)
          : 0,
        billStatus: openSession?.bill?.status ?? null,
        ordersCount: openSession?.orders?.length ?? 0,
      };
    });

    // 2. Daily Breakdown (grouped by YYYY-MM-DD + branchId)
    type DayBranchAccumulator = {
      date: string;
      branchId: string;
      branchName: string;
      tenantId: string;
      tenantName: string;
      totalGmv: number;
      cashSales: number;
      digitalSales: number;
      billsCount: number;
      paidBillsCount: number;
      ordersCount: number;
      tableSessionsCount: number;
      shiftsCount: number;
      cashDropsTotal: number;
      expensesTotal: number;
      dailyCloseStatus: string;
      cashVariance: number;
    };

    const dayMap = new Map<string, DayBranchAccumulator>();
    const ensureDayRow = (
      dateStr: string,
      bId: string,
      bName: string,
      tId: string,
      tName: string,
    ): DayBranchAccumulator => {
      const key = `${dateStr}::${bId}`;
      let row = dayMap.get(key);
      if (!row) {
        row = {
          date: dateStr,
          branchId: bId,
          branchName: bName,
          tenantId: tId,
          tenantName: tName,
          totalGmv: 0,
          cashSales: 0,
          digitalSales: 0,
          billsCount: 0,
          paidBillsCount: 0,
          ordersCount: 0,
          tableSessionsCount: 0,
          shiftsCount: 0,
          cashDropsTotal: 0,
          expensesTotal: 0,
          dailyCloseStatus: 'OPEN',
          cashVariance: 0,
        };
        dayMap.set(key, row);
      }
      return row;
    };

    let totalGmv = 0;
    let cashVolume = 0;
    let digitalVolume = 0;
    let paidBills = 0;
    let unpaidBills = 0;

    for (const b of bills) {
      if (b.status === 'CANCELLED') continue;
      const d = ymd(b.businessDate);
      const tName = b.tenant.displayName || b.tenant.legalName || 'Tenant';
      const row = ensureDayRow(d, b.branchId, b.branch.name, b.tenantId, tName);
      const amt = Number(b.totalAmount);
      row.totalGmv += amt;
      row.billsCount += 1;
      totalGmv += amt;
      if (b.paidAt || b.status === 'SETTLED' || b.status === 'CLOSED') {
        row.paidBillsCount += 1;
        paidBills += 1;
      } else {
        unpaidBills += 1;
      }
    }

    for (const p of payments) {
      if (p.status === 'CANCELLED') continue;
      const d = ymd(p.businessDate);
      const tName = p.tenant.displayName || p.tenant.legalName || 'Tenant';
      const row = ensureDayRow(d, p.branchId, p.branch.name, p.tenantId, tName);
      const amt = Number(p.amount);
      if (p.method === 'CASH') {
        row.cashSales += amt;
        cashVolume += amt;
      } else {
        row.digitalSales += amt;
        digitalVolume += amt;
      }
    }

    for (const o of orders) {
      const d = ymd(o.businessDate);
      const tName = o.tenant.displayName || o.tenant.legalName || 'Tenant';
      const row = ensureDayRow(d, o.branchId, o.branch.name, o.tenantId, tName);
      row.ordersCount += 1;
    }

    for (const ts of tableSessions) {
      const d = ymd(ts.businessDate);
      const tName = ts.tenant.displayName || ts.tenant.legalName || 'Tenant';
      const row = ensureDayRow(
        d,
        ts.branchId,
        ts.branch.name,
        ts.tenantId,
        tName,
      );
      row.tableSessionsCount += 1;
    }

    for (const s of shifts) {
      const d = ymd(s.businessDate);
      const tName = s.tenant.displayName || s.tenant.legalName || 'Tenant';
      const row = ensureDayRow(d, s.branchId, s.branch.name, s.tenantId, tName);
      row.shiftsCount += 1;
    }

    let cashDropsVolume = 0;
    for (const cd of cashDrops) {
      const d = ymd(cd.businessDate);
      const tName = cd.tenant.displayName || cd.tenant.legalName || 'Tenant';
      const row = ensureDayRow(
        d,
        cd.branchId,
        cd.branch.name,
        cd.tenantId,
        tName,
      );
      const amt = Number(cd.countedAmount ?? cd.declaredAmount);
      row.cashDropsTotal += amt;
      cashDropsVolume += amt;
    }

    let expensesVolume = 0;
    for (const fe of financeEntries) {
      const d = ymd(fe.businessDate);
      const tName = fe.tenant.displayName || fe.tenant.legalName || 'Tenant';
      const row = ensureDayRow(
        d,
        fe.branchId,
        fe.branch.name,
        fe.tenantId,
        tName,
      );
      if (fe.direction === 'EXPENSE') {
        const amt = Number(fe.amount);
        row.expensesTotal += amt;
        expensesVolume += amt;
      }
    }

    for (const dc of dailyCloses) {
      const d = ymd(dc.businessDate);
      const tName = dc.tenant.displayName || dc.tenant.legalName || 'Tenant';
      const row = ensureDayRow(
        d,
        dc.branchId,
        dc.branch.name,
        dc.tenantId,
        tName,
      );
      row.dailyCloseStatus = dc.status;
      row.cashVariance = Number(dc.cashierVariance);
    }

    const dailyBreakdown = Array.from(dayMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date) || a.branchName.localeCompare(b.branchName),
    );

    const uniqueDays = new Set(dailyBreakdown.map((d) => d.date)).size || 1;

    // 3.Unified Chronological Movement Feed
    type MovementItem = {
      id: string;
      timestamp: string;
      category: 'SALES' | 'TABLES' | 'CASH' | 'INVENTORY' | 'SHIFTS' | 'AUDIT';
      title: string;
      subtitle: string;
      amount: number | null;
      status: string;
      actorName: string;
      branchName: string;
      tenantName: string;
    };

    const allMovements: MovementItem[] = [];

    if (movementType === 'ALL' || movementType === 'SALES') {
      for (const b of bills.slice(0, 100)) {
        const tableLabel = b.tableSession?.table?.displayName
          ? ` · ${b.tableSession.table.displayName}`
          : '';
        allMovements.push({
          id: `bill-${b.id}`,
          timestamp: (b.paidAt ?? b.generatedAt).toISOString(),
          category: 'SALES',
          title: `Bill ${b.billNumber}${tableLabel}`,
          subtitle: `Generated by ${b.generatedBy.employeeDisplayName}`,
          amount: Number(b.totalAmount),
          status: b.status,
          actorName: b.generatedBy.employeeDisplayName,
          branchName: b.branch.name,
          tenantName: b.tenant.displayName || b.tenant.legalName || 'Tenant',
        });
      }
      for (const p of payments.slice(0, 100)) {
        allMovements.push({
          id: `pay-${p.id}`,
          timestamp: (p.collectedAt ?? p.initiatedAt).toISOString(),
          category: 'SALES',
          title: `Payment (${p.method}${p.transferChannel ? ` · ${p.transferChannel}` : ''}) — Bill ${p.bill.billNumber}`,
          subtitle: `Collected by ${p.collector.employeeDisplayName}`,
          amount: Number(p.amount),
          status: p.status,
          actorName: p.collector.employeeDisplayName,
          branchName: p.branch.name,
          tenantName: p.tenant.displayName || p.tenant.legalName || 'Tenant',
        });
      }
    }

    if (movementType === 'ALL' || movementType === 'TABLES') {
      for (const ts of tableSessions.slice(0, 100)) {
        allMovements.push({
          id: `ts-${ts.id}`,
          timestamp: (ts.closedAt ?? ts.openedAt).toISOString(),
          category: 'TABLES',
          title: `${ts.table.displayName} Session (${ts.status})`,
          subtitle: `Waiter: ${ts.primaryWaiter.employeeDisplayName} · ${ts.orders.length} order(s)${ts.guestCount ? ` · ${ts.guestCount} guests` : ''}`,
          amount: ts.bill ? Number(ts.bill.totalAmount) : null,
          status: ts.status,
          actorName: ts.primaryWaiter.employeeDisplayName,
          branchName: ts.branch.name,
          tenantName: ts.tenant.displayName || ts.tenant.legalName || 'Tenant',
        });
      }
      for (const o of orders.slice(0, 80)) {
        const itemSummary = o.items
          .slice(0, 3)
          .map((i) => `${i.quantity}x ${i.itemNameSnapshot}`)
          .join(', ');
        allMovements.push({
          id: `ord-${o.id}`,
          timestamp: o.confirmedAt.toISOString(),
          category: 'TABLES',
          title: `Order Confirmed${o.tableSession?.table ? ` · ${o.tableSession.table.displayName}` : ''}`,
          subtitle: itemSummary || `${o.items.length} items`,
          amount: null,
          status: o.status,
          actorName: o.createdBy.employeeDisplayName,
          branchName: o.branch.name,
          tenantName: o.tenant.displayName || o.tenant.legalName || 'Tenant',
        });
      }
    }

    if (movementType === 'ALL' || movementType === 'CASH') {
      for (const cd of cashDrops.slice(0, 80)) {
        allMovements.push({
          id: `cd-${cd.id}`,
          timestamp: (cd.receivedAt ?? cd.initiatedAt).toISOString(),
          category: 'CASH',
          title: `Cash Drop (${cd.status})`,
          subtitle: `Waiter: ${cd.waiter.employeeDisplayName}${cd.receivedBy ? ` → Cashier: ${cd.receivedBy.employeeDisplayName}` : ''}`,
          amount: Number(cd.countedAmount ?? cd.declaredAmount),
          status: cd.status,
          actorName: cd.waiter.employeeDisplayName,
          branchName: cd.branch.name,
          tenantName: cd.tenant.displayName || cd.tenant.legalName || 'Tenant',
        });
      }
      for (const fe of financeEntries.slice(0, 80)) {
        allMovements.push({
          id: `fin-${fe.id}`,
          timestamp: fe.createdAt.toISOString(),
          category: 'CASH',
          title: `${fe.direction}: ${fe.label}`,
          subtitle: `Settled via ${fe.settledVia} · By ${fe.createdBy.employeeDisplayName}`,
          amount: Number(fe.amount),
          status: fe.direction,
          actorName: fe.createdBy.employeeDisplayName,
          branchName: fe.branch.name,
          tenantName: fe.tenant.displayName || fe.tenant.legalName || 'Tenant',
        });
      }
    }

    if (movementType === 'ALL' || movementType === 'INVENTORY') {
      for (const inv of inventoryEntries.slice(0, 80)) {
        const qty = Number(inv.quantityDelta);
        allMovements.push({
          id: `inv-${inv.id}`,
          timestamp: inv.createdAt.toISOString(),
          category: 'INVENTORY',
          title: `Stock ${inv.entryType.replace(/_/g, ' ')}: ${inv.ingredient.name} (${qty > 0 ? `+${qty}` : qty})`,
          subtitle: inv.note || inv.supplierNote || 'Inventory ledger movement',
          amount: inv.unitCostSnapshot
            ? Math.abs(qty) * Number(inv.unitCostSnapshot)
            : null,
          status: inv.entryType,
          actorName: inv.createdBy?.employeeDisplayName || 'System',
          branchName: inv.branch?.name || 'Central Warehouse',
          tenantName:
            inv.tenant.displayName || inv.tenant.legalName || 'Tenant',
        });
      }
    }

    if (movementType === 'ALL' || movementType === 'SHIFTS') {
      for (const s of shifts.slice(0, 80)) {
        allMovements.push({
          id: `shift-${s.id}`,
          timestamp: (s.clockOutAt ?? s.clockInAt).toISOString(),
          category: 'SHIFTS',
          title: `Shift ${s.state === 'OPEN' ? 'Clock-In' : 'Completed'} — ${s.membership.employeeDisplayName}`,
          subtitle: `Role: ${s.role?.name || s.role?.code || 'Staff'}${s.lateByMinutes > 0 ? ` · Late ${s.lateByMinutes}m` : ''}`,
          amount: null,
          status: s.state,
          actorName: s.membership.employeeDisplayName,
          branchName: s.branch.name,
          tenantName: s.tenant.displayName || s.tenant.legalName || 'Tenant',
        });
      }
    }

    if (movementType === 'ALL' || movementType === 'AUDIT') {
      for (const ae of auditEvents.slice(0, 80)) {
        allMovements.push({
          id: `aud-${ae.id}`,
          timestamp: ae.occurredAt.toISOString(),
          category: 'AUDIT',
          title: ae.action.replace(/_/g, ' '),
          subtitle: ae.reason || `${ae.entityType} event`,
          amount: null,
          status: ae.entityType,
          actorName:
            ae.actorStaff?.employeeDisplayName ||
            ae.actorUser?.displayName ||
            'Platform',
          branchName: ae.branch?.name || 'Platform',
          tenantName:
            ae.tenant?.displayName || ae.tenant?.legalName || 'Platform',
        });
      }
    }

    allMovements.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const search = query.movementSearch?.trim().toLowerCase();
    const filteredMovements = search
      ? allMovements.filter(
          (m) =>
            m.title.toLowerCase().includes(search) ||
            m.subtitle.toLowerCase().includes(search) ||
            m.actorName.toLowerCase().includes(search) ||
            m.branchName.toLowerCase().includes(search) ||
            m.tenantName.toLowerCase().includes(search),
        )
      : allMovements;

    const totalMovements = filteredMovements.length;
    const mPage = Math.max(1, Number(query.movementPage) || 1);
    const mLimit = query.movementLimit
      ? Math.max(1, Math.min(500, Number(query.movementLimit)))
      : 25;
    const mTotalPages = Math.max(1, Math.ceil(totalMovements / mLimit));
    const startIdx = (mPage - 1) * mLimit;
    const paginatedMovements = filteredMovements.slice(startIdx, startIdx + mLimit);

    const branchesSummary = branches.map((b) => {
      const bTables = activeTables.filter((t) => t.branchId === b.id);
      const bOccupied = bTables.filter((t) => t.isOccupied).length;
      const bGmv = dailyBreakdown
        .filter((d) => d.branchId === b.id)
        .reduce((s, d) => s + d.totalGmv, 0);
      return {
        id: b.id,
        name: b.name,
        displayCode: b.displayCode || 'MAIN',
        serviceMode: b.serviceMode,
        tenantId: b.tenantId,
        tenantName: b.tenant.displayName || b.tenant.legalName || 'Tenant',
        totalTables: b.diningTables.length,
        activeTables: bOccupied,
        openSessions: b.tableSessions.length,
        periodGmv: bGmv,
      };
    });

    return {
      summary: {
        totalGmv,
        avgDailyGmv: Math.round(totalGmv / uniqueDays),
        cashVolume,
        digitalVolume,
        totalBills: paidBills + unpaidBills,
        paidBills,
        unpaidBills,
        totalOrders: orders.length,
        totalTableSessions: tableSessions.length,
        activeTablesCount: activeTables.filter((t) => t.isOccupied).length,
        totalTablesCount: activeTables.length,
        openTableSessionsCount: tableSessions.filter(
          (ts) => !ts.closedAt && ts.status !== 'CLOSED',
        ).length,
        activeStaffShiftsCount: shifts.filter((s) => s.state === 'OPEN').length,
        totalStaffShiftsCount: shifts.length,
        cashDropsVolume,
        expensesVolume,
      },
      branches: branchesSummary,
      dailyBreakdown,
      activeTables,
      movements: paginatedMovements,
      movementPagination: {
        page: mPage,
        limit: mLimit,
        total: totalMovements,
        totalPages: mTotalPages,
      },
    };
  }
}
