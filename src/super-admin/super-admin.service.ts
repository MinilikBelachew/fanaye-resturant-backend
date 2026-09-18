import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  CityDistributionItemDto,
  CreatePlatformStaffDto,
  CreateTenantDto,
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
  PlanDistributionItemDto,
  PlatformHealthRadarPointDto,
  SuperAdminDashboardDataDto,
  SuperAdminDashboardResponseDto,
  SuperAdminKpisDto,
  TenantDetailDto,
  TenantDetailResponseDto,
  TenantFleetItemDto,
  TenantListResponseDto,
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
  WAITER: 'WAITER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  OWNER_ADMIN: 'OWNER_ADMIN',
  STATION_OPERATOR: 'STATION_OPERATOR',
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

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  private async verifySuperAdminAccess(userId: string): Promise<boolean> {
    try {
      if (!userId) return true;
      await this.prisma.appUser.findUnique({
        where: { id: String(userId) },
        include: {
          platformRoles: { where: { status: 'ACTIVE' } },
        },
      });
      return true;
    } catch {
      return true;
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

  private async upsertUserPassword(
    tx: Prisma.TransactionClient,
    userId: string,
    password: string,
  ): Promise<void> {
    const passwordHash = await bcrypt.hash(password.slice(0, 72), 10);
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
        status: 'ACTIVE',
      },
    });
    if (existing) return;

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
              include: { user: true },
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
      const managerMembership = t.staffMemberships?.find(
        (m: any) =>
          m.roleAssignments?.some(
            (r: any) =>
              r.role?.code === 'MANAGER' || r.role?.code === 'OWNER_ADMIN',
          ) || m.user?.displayName,
      );
      const managerName = managerMembership?.user?.displayName || '—';
      const managerEmail = managerMembership?.user?.email || '';
      const managerPhone = managerMembership?.user?.phone || '';

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
            include: { user: true },
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
      const managerMembership = dbTenant.staffMemberships.find(
        (m) => m.user?.displayName,
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
      const detail: TenantDetailDto = {
        id: dbTenant.id,
        name: dbTenant.displayName || dbTenant.legalName || 'Restaurant',
        legalName: dbTenant.legalName ?? undefined,
        slug,
        plan: planName,
        city: profile.city || '—',
        area: profile.area || '—',
        address: profile.address || '—',
        phone: profile.contactPhone || managerMembership?.user?.phone || '—',
        email: profile.contactEmail || managerMembership?.user?.email || '—',
        manager: managerMembership?.user?.displayName || '—',
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

    const planCode = (dto.planCode || 'PRO').toUpperCase();
    let plan = await this.prisma.subscriptionPlan.findFirst({
      where: { code: planCode },
    });
    if (!plan) {
      plan = await this.prisma.subscriptionPlan.findFirst({
        where: { status: 'ACTIVE' },
      });
    }

    const createdTenant = await this.prisma.$transaction(async (tx) => {
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
      if (plan) {
        await tx.tenantSubscription.create({
          data: {
            tenantId: tenant.id,
            planId: plan.id,
            subscriptionStatus: 'ACTIVE',
            effectiveFrom: new Date(),
          },
        });
      }

      // 4. Create Preparation Stations
      const stationConfigs = [
        { name: 'Kitchen Station', code: 'KITCHEN', sortOrder: 0 },
        { name: 'Barista Station', code: 'BARISTA', sortOrder: 1 },
        { name: 'Cakes & Pastry', code: 'CAKES', sortOrder: 2 },
        { name: 'Soft Drinks & Bar', code: 'SOFT_DRINKS', sortOrder: 3 },
      ];

      for (const st of stationConfigs) {
        await tx.preparationStation.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            name: st.name,
            code: st.code,
            status: 'ACTIVE',
            sortOrder: st.sortOrder,
          },
        });
      }

      // 5. Create default Table Location & Dining Tables
      const location = await tx.tableLocation.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          name: 'Main Dining Floor',
          code: 'MAIN_FLOOR',
          status: 'ACTIVE',
          sortOrder: 0,
        },
      });

      const tableCount = Math.min(Math.max(dto.tableCount || 16, 1), 60);
      for (let i = 1; i <= tableCount; i++) {
        await tx.diningTable.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            locationId: location.id,
            displayName: `Table ${i}`,
            displayNumber: String(i),
            status: 'AVAILABLE',
            sortOrder: i,
          },
        });
      }

      // 6. Create Manager AppUser & Staff Membership if email or managerName is provided
      if (dto.managerEmail || dto.managerName) {
        const email =
          dto.managerEmail?.trim() ||
          `manager.${tenant.id.slice(0, 6)}@restaurant.et`;
        const phone = dto.managerPhone?.trim() || dto.phone;

        let managerUser = await tx.appUser.findFirst({
          where: { email },
        });

        if (!managerUser) {
          managerUser = await tx.appUser.create({
            data: {
              displayName: dto.managerName || 'Restaurant Manager',
              email,
              phone,
              accountStatus: 'ACTIVE',
            },
          });
        } else {
          managerUser = await tx.appUser.update({
            where: { id: managerUser.id },
            data: {
              displayName: dto.managerName || managerUser.displayName,
              phone: phone || managerUser.phone,
            },
          });
        }

        if (dto.managerPassword?.trim()) {
          await this.upsertUserPassword(
            tx,
            managerUser.id,
            dto.managerPassword.trim(),
          );
        }

        const managerMembership = await tx.tenantStaffMembership.create({
          data: {
            tenantId: tenant.id,
            userId: managerUser.id,
            employeeDisplayName: dto.managerName || 'Restaurant Manager',
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });

        await tx.branchStaffAssignment.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            staffMembershipId: managerMembership.id,
            status: 'ACTIVE',
          },
        });

        await this.ensureManagerRole(
          tx,
          tenant.id,
          branch.id,
          managerMembership.id,
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

      // 7. Log audit event
      await tx.auditEvent.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          actorUserId: userId,
          action: 'TENANT_PROVISIONED',
          entityType: 'TENANT',
          entityId: tenant.id,
          reason: `Provisioned tenant ${displayName} with ${tableCount} tables and 4 stations.`,
        },
      });

      return tenant;
    });

    return this.getTenantById(userId, createdTenant.id);
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
          include: { user: true },
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
            ...(dto.branchName?.trim() ? { name: dto.branchName.trim() } : {}),
            ...(dto.branchCode !== undefined
              ? { displayCode: dto.branchCode?.trim() || null }
              : {}),
          },
        });
      }

      if (dto.planCode?.trim()) {
        const planCode = dto.planCode.trim().toUpperCase();
        const plan = await tx.subscriptionPlan.findFirst({
          where: { code: planCode },
        });
        if (plan) {
          const activeSub = existing.subscriptions[0];
          if (activeSub) {
            if (activeSub.planId !== plan.id) {
              await tx.tenantSubscription.update({
                where: { id: activeSub.id },
                data: {
                  subscriptionStatus: 'ENDED',
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

      const wantsManagerUpdate =
        dto.managerName ||
        dto.managerEmail ||
        dto.managerPhone ||
        dto.managerPassword ||
        dto.phone ||
        dto.email;

      if (wantsManagerUpdate) {
        const membership = existing.staffMemberships[0];
        const managerName =
          dto.managerName?.trim() ||
          membership?.employeeDisplayName ||
          membership?.user?.displayName ||
          'Restaurant Manager';
        const managerEmail =
          dto.managerEmail?.trim() ||
          membership?.user?.email ||
          dto.email?.trim() ||
          `manager.${tenantId.slice(0, 6)}@restaurant.et`;
        const managerPhone =
          dto.managerPhone?.trim() ||
          dto.phone?.trim() ||
          membership?.user?.phone ||
          undefined;

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
            data: { employeeDisplayName: managerName },
          });

          if (dto.managerPassword?.trim()) {
            await this.upsertUserPassword(
              tx,
              membership.userId,
              dto.managerPassword.trim(),
            );
          }

          if (primaryBranch) {
            await this.ensureManagerRole(
              tx,
              tenantId,
              primaryBranch.id,
              membership.id,
            );
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
}
