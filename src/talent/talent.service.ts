import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TalentProfileStatus,
  TalentRequestStatus,
  TalentRoleCategory,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CaslService } from '../casl/casl.service';
import { PrismaService } from '../database/prisma.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { IdentityContextService } from '../identity/identity-context.service';
import { PLATFORM_ROLE_CODE } from '../identity/identity.constants';
import { OpsEventType } from '../realtime/ops-events';
import { OpsGateway } from '../realtime/ops.gateway';
import { superAdminRoom, tenantRoom } from '../realtime/ops-rooms';
import {
  CreateTalentContactRequestDto,
  CreateTalentProfileDto,
  HireTalentToStaffDto,
  ListTalentProfilesQueryDto,
  ListTalentRequestsQueryDto,
  UpdateTalentProfileDto,
  UpdateTalentRequestStatusDto,
} from './dto/talent.dto';

const PLATFORM_ROLES = new Set([
  PLATFORM_ROLE_CODE,
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
]);

const ALLOWED_REQUEST_TRANSITIONS: Record<
  TalentRequestStatus,
  TalentRequestStatus[]
> = {
  CONTACTED: ['INTERVIEWING', 'HIRED', 'CANCELLED'],
  INTERVIEWING: ['HIRED', 'CANCELLED'],
  HIRED: [],
  CANCELLED: [],
};

function defaultRoleCodeForCategory(category: TalentRoleCategory): string {
  switch (category) {
    case 'WAITER':
      return 'WAITER';
    case 'CASHIER':
      return 'CASHIER';
    case 'STORE_MANAGER':
      return 'STORE_MANAGER';
    case 'RECEPTIONIST':
      return 'RECEPTIONIST';
    case 'DRIVER':
      return 'DRIVER';
    default:
      return 'WAITER';
  }
}

@Injectable()
export class TalentService {
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
    this.casl.assertCan(ctx, action, 'Talent');
    return ctx as AuthContextDto & { tenantId: string };
  }

  private async assertSuperAdmin(userId: string): Promise<AuthContextDto> {
    const ctx = await this.identity.getByUserId(userId);
    if (!PLATFORM_ROLES.has(ctx.roleCode)) {
      throw new ForbiddenException('Platform super admin access required.');
    }
    this.casl.assertCan(ctx, 'manage', 'Talent');
    return ctx;
  }

  private requestInclude() {
    return {
      talentProfile: true,
      tenant: { select: { id: true, displayName: true } },
      branch: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, displayName: true } },
    } satisfies Prisma.TalentHireRequestInclude;
  }

  private mapProfile(row: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    photoUrl: string | null;
    roleCategory: TalentRoleCategory;
    roleTitle: string;
    location: string;
    yearsExperience: number;
    availability: string;
    skills: string[];
    languages: string[];
    bio: string | null;
    isVerified: boolean;
    status: TalentProfileStatus;
    hiredByTenantId: string | null;
    hiredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    hiredByTenant?: { id: string; displayName: string } | null;
  }) {
    return {
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      photoUrl: row.photoUrl,
      roleCategory: row.roleCategory,
      roleTitle: row.roleTitle,
      location: row.location,
      yearsExperience: row.yearsExperience,
      availability: row.availability,
      skills: row.skills,
      languages: row.languages,
      bio: row.bio,
      isVerified: row.isVerified,
      status: row.status,
      hiredByTenantId: row.hiredByTenantId,
      hiredByTenantName: row.hiredByTenant?.displayName ?? null,
      hiredAt: row.hiredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapRequest(row: {
    id: string;
    talentProfileId: string;
    tenantId: string;
    branchId: string | null;
    requestedById: string;
    status: TalentRequestStatus;
    notes: string | null;
    adminNotes: string | null;
    onboardedMembershipId: string | null;
    contactedAt: Date;
    interviewingAt: Date | null;
    hiredAt: Date | null;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    talentProfile: Parameters<TalentService['mapProfile']>[0];
    tenant?: { id: string; displayName: string };
    branch?: { id: string; name: string } | null;
    requestedBy?: { id: string; displayName: string };
  }) {
    return {
      id: row.id,
      talentProfileId: row.talentProfileId,
      talentProfile: this.mapProfile(row.talentProfile),
      tenantId: row.tenantId,
      tenantName: row.tenant?.displayName ?? null,
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
      requestedById: row.requestedById,
      requestedByName: row.requestedBy?.displayName ?? null,
      status: row.status,
      notes: row.notes,
      adminNotes: row.adminNotes,
      onboardedMembershipId: row.onboardedMembershipId,
      contactedAt: row.contactedAt.toISOString(),
      interviewingAt: row.interviewingAt?.toISOString() ?? null,
      hiredAt: row.hiredAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private buildProfileWhere(
    query: ListTalentProfilesQueryDto,
    defaultStatuses?: TalentProfileStatus[],
  ): Prisma.TalentProfileWhereInput {
    const search = query.search?.trim();
    const location = query.location?.trim();

    return {
      ...(query.status
        ? { status: query.status }
        : defaultStatuses
          ? { status: { in: defaultStatuses } }
          : {}),
      ...(query.roleCategory ? { roleCategory: query.roleCategory } : {}),
      ...(query.availability ? { availability: query.availability } : {}),
      ...(location
        ? { location: { contains: location, mode: 'insensitive' } }
        : {}),
      ...(query.minExperience !== undefined
        ? { yearsExperience: { gte: query.minExperience } }
        : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { roleTitle: { contains: search, mode: 'insensitive' } },
              { location: { contains: search, mode: 'insensitive' } },
              { skills: { has: search } },
            ],
          }
        : {}),
    };
  }

  async browseProfiles(userId: string, query: ListTalentProfilesQueryDto) {
    await this.getTenantContext(userId, 'read');
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 12));
    const where = this.buildProfileWhere(query, ['AVAILABLE', 'IN_PROCESS']);

    const [rows, total] = await Promise.all([
      this.prisma.talentProfile.findMany({
        where,
        orderBy: [{ isVerified: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.talentProfile.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapProfile(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async listTenantRequests(userId: string, query: ListTalentRequestsQueryDto) {
    const ctx = await this.getTenantContext(userId, 'read');
    return this.paginatedRequests({ tenantId: ctx.tenantId }, query);
  }

  async logContactRequest(userId: string, dto: CreateTalentContactRequestDto) {
    const ctx = await this.getTenantContext(userId, 'manage');
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id: dto.talentProfileId },
    });
    if (!profile) {
      throw new NotFoundException('Talent profile not found.');
    }
    if (profile.status === 'HIRED' || profile.status === 'ARCHIVED') {
      throw new BadRequestException(
        'This candidate is no longer available.',
      );
    }

    const existing = await this.prisma.talentHireRequest.findFirst({
      where: {
        talentProfileId: profile.id,
        tenantId: ctx.tenantId,
        status: { in: ['CONTACTED', 'INTERVIEWING'] },
      },
      include: this.requestInclude(),
    });

    if (existing) {
      return this.mapRequest(existing);
    }

    const created = await this.prisma.talentHireRequest.create({
      data: {
        talentProfileId: profile.id,
        tenantId: ctx.tenantId,
        branchId: dto.branchId ?? ctx.branchId ?? null,
        requestedById: ctx.userId,
        status: 'CONTACTED',
        notes: dto.notes?.trim() || null,
      },
      include: this.requestInclude(),
    });

    const mapped = this.mapRequest(created);
    this.opsGateway.dispatch({
      type: OpsEventType.TALENT_REQUEST_CREATED,
      tenantId: ctx.tenantId,
      branchId: mapped.branchId ?? '',
      severity: 'INFO',
      title: `Talent Contact Logged: ${profile.fullName}`,
      body: `${mapped.tenantName ?? 'Restaurant'} contacted ${profile.fullName} (${profile.roleTitle})`,
      relatedEntityType: 'TalentHireRequest',
      relatedEntityId: mapped.id,
      payload: mapped,
      rooms: [superAdminRoom(), tenantRoom(ctx.tenantId)],
    });

    return mapped;
  }

  async hireAndOnboardByTenant(userId: string, dto: HireTalentToStaffDto) {
    const ctx = await this.getTenantContext(userId, 'manage');
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id: dto.talentProfileId },
    });
    if (!profile) {
      throw new NotFoundException('Talent profile not found.');
    }
    if (profile.status === 'HIRED' && profile.hiredByTenantId !== ctx.tenantId) {
      throw new BadRequestException(
        'This candidate has already been hired by another restaurant.',
      );
    }

    const branchId =
      dto.branchId ??
      ctx.branchId ??
      (
        await this.prisma.branch.findFirst({
          where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
          select: { id: true },
        })
      )?.id;

    if (!branchId) {
      throw new BadRequestException('An active branch is required to onboard staff.');
    }

    const roleCode =
      dto.roleCode?.trim() || defaultRoleCodeForCategory(profile.roleCategory);

    const role = await this.prisma.restaurantRole.findUnique({
      where: { code: roleCode },
    });
    if (!role) {
      throw new BadRequestException(`Unknown restaurant role: ${roleCode}`);
    }

    const rawPin = dto.pin?.trim() || '1234';
    const passwordHash = await bcrypt.hash(rawPin.slice(0, 72), 10);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      let user = await tx.appUser.findFirst({
        where: {
          OR: [
            { phone: profile.phone },
            ...(profile.email ? [{ email: profile.email }] : []),
          ],
        },
      });

      if (!user) {
        user = await tx.appUser.create({
          data: {
            displayName: profile.fullName,
            phone: profile.phone,
            email: profile.email,
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
      }

      let membership = await tx.tenantStaffMembership.findFirst({
        where: { tenantId: ctx.tenantId, userId: user.id },
      });

      if (!membership) {
        membership = await tx.tenantStaffMembership.create({
          data: {
            tenantId: ctx.tenantId,
            userId: user.id,
            employeeDisplayName: profile.fullName,
            jobTitle: profile.roleTitle,
            status: 'ACTIVE',
            joinedAt: now,
            hireDate: now,
          },
        });

        await tx.branchStaffAssignment.create({
          data: {
            tenantId: ctx.tenantId,
            branchId,
            staffMembershipId: membership.id,
            status: 'ACTIVE',
          },
        });

        await tx.staffRoleAssignment.create({
          data: {
            tenantId: ctx.tenantId,
            staffMembershipId: membership.id,
            roleId: role.id,
            branchId:
              roleCode === 'OWNER_ADMIN' ||
              roleCode === 'STORE_MANAGER' ||
              roleCode === 'DRIVER'
                ? null
                : branchId,
            status: 'ACTIVE',
            grantedByMembershipId: ctx.staffMembershipId,
          },
        });
      }

      await tx.talentProfile.update({
        where: { id: profile.id },
        data: {
          status: 'HIRED',
          hiredByTenantId: ctx.tenantId,
          hiredAt: now,
        },
      });

      const existingReq = await tx.talentHireRequest.findFirst({
        where: {
          talentProfileId: profile.id,
          tenantId: ctx.tenantId,
          status: { in: ['CONTACTED', 'INTERVIEWING'] },
        },
      });

      const request = existingReq
        ? await tx.talentHireRequest.update({
            where: { id: existingReq.id },
            data: {
              status: 'HIRED',
              branchId,
              hiredAt: now,
              onboardedMembershipId: membership.id,
              ...(dto.notes ? { notes: dto.notes.trim() } : {}),
            },
            include: this.requestInclude(),
          })
        : await tx.talentHireRequest.create({
            data: {
              talentProfileId: profile.id,
              tenantId: ctx.tenantId,
              branchId,
              requestedById: ctx.userId,
              status: 'HIRED',
              hiredAt: now,
              onboardedMembershipId: membership.id,
              notes: dto.notes?.trim() || 'Hired via 1-click onboarding',
            },
            include: this.requestInclude(),
          });

      return request;
    });

    const mapped = this.mapRequest(result);
    this.opsGateway.dispatch({
      type: OpsEventType.TALENT_REQUEST_UPDATED,
      tenantId: ctx.tenantId,
      branchId: mapped.branchId ?? '',
      severity: 'ATTENTION',
      title: `Candidate Hired: ${profile.fullName}`,
      body: `${mapped.tenantName ?? 'Restaurant'} hired & onboarded ${profile.fullName}`,
      relatedEntityType: 'TalentHireRequest',
      relatedEntityId: mapped.id,
      payload: mapped,
      rooms: [superAdminRoom(), tenantRoom(ctx.tenantId)],
    });

    return mapped;
  }

  async updateTenantRequestStatus(
    userId: string,
    id: string,
    dto: UpdateTalentRequestStatusDto,
  ) {
    const ctx = await this.getTenantContext(userId, 'manage');
    const existing = await this.prisma.talentHireRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Talent request not found.');
    }

    const allowed = ALLOWED_REQUEST_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ${dto.status}.`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.talentHireRequest.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === 'INTERVIEWING' ? { interviewingAt: now } : {}),
        ...(dto.status === 'HIRED' ? { hiredAt: now } : {}),
        ...(dto.status === 'CANCELLED' ? { cancelledAt: now } : {}),
      },
      include: this.requestInclude(),
    });

    if (dto.status === 'HIRED') {
      await this.prisma.talentProfile.update({
        where: { id: existing.talentProfileId },
        data: { status: 'HIRED', hiredByTenantId: ctx.tenantId, hiredAt: now },
      });
    }

    const mapped = this.mapRequest(updated);
    this.opsGateway.dispatch({
      type: OpsEventType.TALENT_REQUEST_UPDATED,
      tenantId: ctx.tenantId,
      branchId: mapped.branchId ?? '',
      severity: 'INFO',
      title: `Talent Request ${mapped.status}: ${mapped.talentProfile.fullName}`,
      body: mapped.tenantName ?? undefined,
      relatedEntityType: 'TalentHireRequest',
      relatedEntityId: mapped.id,
      payload: mapped,
      rooms: [superAdminRoom(), tenantRoom(ctx.tenantId)],
    });
    return mapped;
  }

  // ---- Super Admin Methods ----

  async listSuperAdminProfiles(
    userId: string,
    query: ListTalentProfilesQueryDto,
  ) {
    await this.assertSuperAdmin(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 12));
    const where = this.buildProfileWhere(query);

    const [rows, total, grouped] = await Promise.all([
      this.prisma.talentProfile.findMany({
        where,
        include: { hiredByTenant: { select: { id: true, displayName: true } } },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.talentProfile.count({ where }),
      this.prisma.talentProfile.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const counts: Record<TalentProfileStatus, number> = {
      AVAILABLE: 0,
      IN_PROCESS: 0,
      HIRED: 0,
      ARCHIVED: 0,
    };
    let all = 0;
    for (const g of grouped) {
      counts[g.status] = g._count._all;
      all += g._count._all;
    }

    return {
      items: rows.map((r) => this.mapProfile(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      counts: { ALL: all, ...counts },
    };
  }

  async createProfile(userId: string, dto: CreateTalentProfileDto) {
    const ctx = await this.assertSuperAdmin(userId);
    const created = await this.prisma.talentProfile.create({
      data: {
        fullName: dto.fullName.trim(),
        phone: dto.phone.trim(),
        email: dto.email?.trim() || null,
        photoUrl: dto.photoUrl?.trim() || null,
        roleCategory: dto.roleCategory,
        roleTitle: dto.roleTitle.trim(),
        location: dto.location.trim(),
        yearsExperience: dto.yearsExperience,
        availability: dto.availability ?? 'FULL_TIME',
        skills: (dto.skills ?? []).map((s) => s.trim()).filter(Boolean),
        languages: (dto.languages ?? []).map((s) => s.trim()).filter(Boolean),
        bio: dto.bio?.trim() || null,
        isVerified: dto.isVerified ?? true,
        createdById: ctx.userId,
      },
    });
    return this.mapProfile(created);
  }

  async updateProfile(userId: string, id: string, dto: UpdateTalentProfileDto) {
    await this.assertSuperAdmin(userId);
    const existing = await this.prisma.talentProfile.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Talent profile not found.');
    }

    const updated = await this.prisma.talentProfile.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim() || null } : {}),
        ...(dto.photoUrl !== undefined
          ? { photoUrl: dto.photoUrl.trim() || null }
          : {}),
        ...(dto.roleCategory !== undefined
          ? { roleCategory: dto.roleCategory }
          : {}),
        ...(dto.roleTitle !== undefined
          ? { roleTitle: dto.roleTitle.trim() }
          : {}),
        ...(dto.location !== undefined ? { location: dto.location.trim() } : {}),
        ...(dto.yearsExperience !== undefined
          ? { yearsExperience: dto.yearsExperience }
          : {}),
        ...(dto.availability !== undefined
          ? { availability: dto.availability }
          : {}),
        ...(dto.skills !== undefined
          ? { skills: dto.skills.map((s) => s.trim()).filter(Boolean) }
          : {}),
        ...(dto.languages !== undefined
          ? { languages: dto.languages.map((s) => s.trim()).filter(Boolean) }
          : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio.trim() || null } : {}),
        ...(dto.isVerified !== undefined ? { isVerified: dto.isVerified } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { hiredByTenant: { select: { id: true, displayName: true } } },
    });

    return this.mapProfile(updated);
  }

  async listSuperAdminRequests(
    userId: string,
    query: ListTalentRequestsQueryDto,
  ) {
    await this.assertSuperAdmin(userId);
    return this.paginatedRequests({}, query);
  }

  async getSuperAdminRequest(userId: string, id: string) {
    await this.assertSuperAdmin(userId);
    const row = await this.prisma.talentHireRequest.findUnique({
      where: { id },
      include: this.requestInclude(),
    });
    if (!row) {
      throw new NotFoundException('Talent request not found.');
    }
    return this.mapRequest(row);
  }

  async updateRequestBySuperAdmin(
    userId: string,
    id: string,
    dto: UpdateTalentRequestStatusDto,
  ) {
    await this.assertSuperAdmin(userId);
    const existing = await this.prisma.talentHireRequest.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Talent request not found.');
    }

    const allowed = ALLOWED_REQUEST_TRANSITIONS[existing.status] ?? [];
    if (dto.status !== existing.status && !allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ${dto.status}.`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.talentHireRequest.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.adminNotes !== undefined
          ? { adminNotes: dto.adminNotes.trim() || null }
          : {}),
        ...(dto.status === 'INTERVIEWING' && !existing.interviewingAt
          ? { interviewingAt: now }
          : {}),
        ...(dto.status === 'HIRED' && !existing.hiredAt
          ? { hiredAt: now }
          : {}),
        ...(dto.status === 'CANCELLED' && !existing.cancelledAt
          ? { cancelledAt: now }
          : {}),
      },
      include: this.requestInclude(),
    });

    if (dto.status === 'HIRED') {
      await this.prisma.talentProfile.update({
        where: { id: existing.talentProfileId },
        data: {
          status: 'HIRED',
          hiredByTenantId: existing.tenantId,
          hiredAt: now,
        },
      });
    }

    const mapped = this.mapRequest(updated);
    this.opsGateway.dispatch({
      type: OpsEventType.TALENT_REQUEST_UPDATED,
      tenantId: mapped.tenantId,
      branchId: mapped.branchId ?? '',
      severity: 'INFO',
      title: `Talent Update: ${mapped.talentProfile.fullName}`,
      body: `Status changed to ${mapped.status}`,
      relatedEntityType: 'TalentHireRequest',
      relatedEntityId: mapped.id,
      payload: mapped,
      rooms: [tenantRoom(mapped.tenantId), superAdminRoom()],
    });
    return mapped;
  }

  private async paginatedRequests(
    baseWhere: Prisma.TalentHireRequestWhereInput,
    query: ListTalentRequestsQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const search = query.search?.trim();

    const where: Prisma.TalentHireRequestWhereInput = {
      ...baseWhere,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              {
                talentProfile: {
                  fullName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                talentProfile: {
                  roleTitle: { contains: search, mode: 'insensitive' },
                },
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

    const [rows, total, grouped] = await Promise.all([
      this.prisma.talentHireRequest.findMany({
        where,
        include: this.requestInclude(),
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.talentHireRequest.count({ where }),
      this.prisma.talentHireRequest.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
      }),
    ]);

    const counts: Record<TalentRequestStatus, number> = {
      CONTACTED: 0,
      INTERVIEWING: 0,
      HIRED: 0,
      CANCELLED: 0,
    };
    let all = 0;
    for (const g of grouped) {
      counts[g.status] = g._count._all;
      all += g._count._all;
    }

    return {
      items: rows.map((r) => this.mapRequest(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      counts: { ALL: all, ...counts },
    };
  }
}

