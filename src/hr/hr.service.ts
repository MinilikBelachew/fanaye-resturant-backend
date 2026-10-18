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
import type { AuthContextDto } from '../identity/dto/auth-context.dto';
import { OpsEventType } from '../realtime/ops-events';
import { OpsNotifyService } from '../realtime/ops-notify.service';
import {
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  DecideLeaveRequestDto,
  HrListQueryDto,
  SetStaffLeaveOverridesDto,
  UpdateLeaveTypeDto,
} from './dto/hr.dto';

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly casl: CaslService,
    private readonly opsNotify: OpsNotifyService,
  ) {}

  private async requireStaffManage(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant on this account.');
    }
    const allowed =
      this.casl.can(context, 'manage', 'Staff') ||
      this.casl.can(context, 'manage', 'all');
    if (!allowed) {
      throw new ForbiddenException('Staff HR is for managers and owners.');
    }
    return context;
  }

  private async requireStaffMember(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.staffMembershipId) {
      throw new ForbiddenException('Staff account required.');
    }
    return context;
  }

  private isOwner(context: AuthContextDto) {
    return context.roleCode === 'OWNER_ADMIN' || context.roleCode === 'OWNER';
  }

  private resolveBranchId(context: AuthContextDto, branchId?: string) {
    if (this.isOwner(context) && branchId) return branchId;
    if (this.isOwner(context) && !branchId) return null;
    if (!context.branchId) {
      throw new ForbiddenException('No branch on this account.');
    }
    return context.branchId;
  }

  /** Ensure tenant has at least the default "Manual" leave type. */
  private async ensureLeaveTypes(tenantId: string) {
    const count = await this.prisma.leaveType.count({ where: { tenantId } });
    if (count > 0) return;
    await this.prisma.leaveType.create({
      data: {
        tenantId,
        name: 'Manual',
        tracksBalance: true,
        defaultDays: 0,
        isDefault: true,
        isActive: true,
        sortOrder: 0,
      },
    });
  }

  private toLeaveTypeDto(row: {
    id: string;
    name: string;
    tracksBalance: boolean;
    defaultDays: Prisma.Decimal | number;
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
  }) {
    return {
      id: row.id,
      name: row.name,
      tracksBalance: row.tracksBalance,
      defaultDays: Number(row.defaultDays),
      isDefault: row.isDefault,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }

  async listLeaveTypes(userId: string, activeOnly = false) {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant on this account.');
    }
    await this.ensureLeaveTypes(context.tenantId);
    const rows = await this.prisma.leaveType.findMany({
      where: {
        tenantId: context.tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { data: rows.map((r) => this.toLeaveTypeDto(r)) };
  }

  async createLeaveType(userId: string, dto: CreateLeaveTypeDto) {
    const context = await this.requireStaffManage(userId);
    await this.ensureLeaveTypes(context.tenantId!);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Leave type name is required.');
    }
    const defaultDays = dto.defaultDays ?? 0;
    try {
      const row = await this.prisma.leaveType.create({
        data: {
          tenantId: context.tenantId!,
          name,
          defaultDays,
          tracksBalance: dto.tracksBalance ?? defaultDays > 0,
          isDefault: false,
          isActive: true,
          sortOrder: dto.sortOrder ?? 100,
        },
      });
      return { data: this.toLeaveTypeDto(row) };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A leave type with this name already exists.',
        );
      }
      throw err;
    }
  }

  async updateLeaveType(userId: string, id: string, dto: UpdateLeaveTypeDto) {
    const context = await this.requireStaffManage(userId);
    const existing = await this.prisma.leaveType.findFirst({
      where: { id, tenantId: context.tenantId! },
    });
    if (!existing) {
      throw new NotFoundException('Leave type not found.');
    }
    if (existing.isDefault && dto.isActive === false) {
      throw new BadRequestException(
        'Cannot deactivate the default Manual type.',
      );
    }
    try {
      const row = await this.prisma.leaveType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.defaultDays !== undefined
            ? { defaultDays: dto.defaultDays }
            : {}),
          ...(dto.tracksBalance !== undefined
            ? { tracksBalance: dto.tracksBalance }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
      return { data: this.toLeaveTypeDto(row) };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A leave type with this name already exists.',
        );
      }
      throw err;
    }
  }

  async deleteLeaveType(userId: string, id: string) {
    const context = await this.requireStaffManage(userId);
    const existing = await this.prisma.leaveType.findFirst({
      where: { id, tenantId: context.tenantId! },
    });
    if (!existing) {
      throw new NotFoundException('Leave type not found.');
    }
    if (existing.isDefault) {
      throw new BadRequestException('Cannot delete the default Manual type.');
    }
    const requestCount = await this.prisma.staffLeaveRequest.count({
      where: { leaveTypeId: id, tenantId: context.tenantId! },
    });
    if (requestCount > 0) {
      const row = await this.prisma.leaveType.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        data: this.toLeaveTypeDto(row),
        deactivated: true,
        message: 'Leave type has requests — deactivated instead of deleted.',
      };
    }
    await this.prisma.staffLeaveBalance.deleteMany({
      where: { leaveTypeId: id, tenantId: context.tenantId! },
    });
    await this.prisma.leaveType.delete({ where: { id } });
    return { data: { id }, deleted: true };
  }

  private entitlementFor(
    leaveType: { id: string; defaultDays: Prisma.Decimal | number },
    overrideByType: Map<string, number | null>,
  ) {
    if (overrideByType.has(leaveType.id)) {
      const o = overrideByType.get(leaveType.id);
      if (o != null) return o;
    }
    return Number(leaveType.defaultDays);
  }

  /** Remaining = entitlement − approved days. */
  private remainingDays(
    leaveType: { id: string; defaultDays: Prisma.Decimal | number },
    overrideByType: Map<string, number | null>,
    usedByType: Map<string, number>,
  ) {
    const entitlement = this.entitlementFor(leaveType, overrideByType);
    const used = usedByType.get(leaveType.id) ?? 0;
    return Math.max(0, entitlement - used);
  }

  private async usedLeaveDaysByType(
    tenantId: string,
    membershipId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.staffLeaveRequest.groupBy({
      by: ['leaveTypeId'],
      where: {
        tenantId,
        staffMembershipId: membershipId,
        status: 'APPROVED',
        leaveTypeId: { not: null },
      },
      _sum: { days: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.leaveTypeId) {
        map.set(row.leaveTypeId, Number(row._sum.days ?? 0));
      }
    }
    return map;
  }

  async listStaffLeaveBalances(userId: string, membershipId: string) {
    const context = await this.requireStaffManage(userId);
    await this.ensureLeaveTypes(context.tenantId!);
    const membership = await this.prisma.tenantStaffMembership.findFirst({
      where: { id: membershipId, tenantId: context.tenantId! },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('Staff member not found.');
    }
    const types = await this.prisma.leaveType.findMany({
      where: { tenantId: context.tenantId!, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const balances = await this.prisma.staffLeaveBalance.findMany({
      where: { tenantId: context.tenantId!, staffMembershipId: membershipId },
    });
    const overrideByType = new Map<string, number | null>();
    for (const b of balances) {
      overrideByType.set(
        b.leaveTypeId,
        b.entitlementDays != null ? Number(b.entitlementDays) : null,
      );
    }
    const usedByType = await this.usedLeaveDaysByType(
      context.tenantId!,
      membershipId,
    );

    return {
      data: types.map((t) => {
        const entitlement = this.entitlementFor(t, overrideByType);
        const override = overrideByType.has(t.id)
          ? (overrideByType.get(t.id) ?? null)
          : null;
        return {
          leaveTypeId: t.id,
          leaveTypeName: t.name,
          tracksBalance: t.tracksBalance,
          defaultDays: Number(t.defaultDays),
          entitlementDays: entitlement,
          overrideDays: override,
          balanceDays: this.remainingDays(t, overrideByType, usedByType),
          usedDays: usedByType.get(t.id) ?? 0,
        };
      }),
    };
  }

  async setStaffLeaveOverrides(userId: string, dto: SetStaffLeaveOverridesDto) {
    const context = await this.requireStaffManage(userId);
    await this.ensureLeaveTypes(context.tenantId!);
    const membership = await this.prisma.tenantStaffMembership.findFirst({
      where: { id: dto.membershipId, tenantId: context.tenantId! },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('Staff member not found.');
    }
    const typeIds = dto.overrides.map((o) => o.leaveTypeId);
    const types = await this.prisma.leaveType.findMany({
      where: { tenantId: context.tenantId!, id: { in: typeIds } },
    });
    if (types.length !== typeIds.length) {
      throw new BadRequestException('One or more leave types are invalid.');
    }
    const typeMap = new Map(types.map((t) => [t.id, t]));
    const usedByType = await this.usedLeaveDaysByType(
      context.tenantId!,
      dto.membershipId,
    );

    await this.prisma.$transaction(
      dto.overrides.map((item) => {
        const leaveType = typeMap.get(item.leaveTypeId)!;
        const entitlement =
          item.entitlementDays != null && item.entitlementDays !== undefined
            ? Number(item.entitlementDays)
            : Number(leaveType.defaultDays);
        const used = usedByType.get(item.leaveTypeId) ?? 0;
        const remaining = Math.max(0, entitlement - used);
        const clearOverride =
          item.entitlementDays === null || item.entitlementDays === undefined;

        return this.prisma.staffLeaveBalance.upsert({
          where: {
            staffMembershipId_leaveTypeId: {
              staffMembershipId: dto.membershipId,
              leaveTypeId: item.leaveTypeId,
            },
          },
          create: {
            tenantId: context.tenantId!,
            staffMembershipId: dto.membershipId,
            leaveTypeId: item.leaveTypeId,
            entitlementDays: clearOverride ? null : entitlement,
            balanceDays: remaining,
          },
          update: {
            entitlementDays: clearOverride ? null : entitlement,
            balanceDays: remaining,
          },
        });
      }),
    );

    return this.listStaffLeaveBalances(userId, dto.membershipId);
  }

  async listAttendance(userId: string, query: HrListQueryDto) {
    const context = await this.requireStaffManage(userId);
    const branchId = this.resolveBranchId(context, query.branchId);
    const to = query.to ? new Date(query.to) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 13 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);

    const rows = await this.prisma.shiftSession.findMany({
      where: {
        tenantId: context.tenantId!,
        ...(branchId ? { branchId } : {}),
        ...(query.membershipId
          ? { staffMembershipId: query.membershipId }
          : {}),
        businessDate: { gte: from, lte: to },
      },
      include: {
        membership: {
          select: { id: true, employeeDisplayName: true, jobTitle: true },
        },
        branch: { select: { id: true, name: true } },
        role: { select: { code: true, name: true } },
      },
      orderBy: [{ businessDate: 'desc' }, { clockInAt: 'desc' }],
      take: 200,
    });

    return {
      data: rows.map((row) => {
        const hours =
          row.clockOutAt != null
            ? Number(
                (
                  (row.clockOutAt.getTime() - row.clockInAt.getTime()) /
                  3_600_000
                ).toFixed(2),
              )
            : null;
        return {
          id: row.id,
          businessDate: row.businessDate.toISOString().slice(0, 10),
          staffMembershipId: row.staffMembershipId,
          staffName: row.membership.employeeDisplayName,
          jobTitle:
            (row.membership as { jobTitle?: string | null }).jobTitle ?? null,
          branchId: row.branchId,
          branchName: row.branch.name,
          roleLabel: row.role?.name ?? row.role?.code ?? null,
          clockInAt: row.clockInAt.toISOString(),
          clockOutAt: row.clockOutAt?.toISOString() ?? null,
          lateByMinutes: row.lateByMinutes,
          hoursWorked: hours,
          state: row.state,
        };
      }),
    };
  }

  private leaveInclude = {
    membership: {
      select: {
        id: true,
        employeeDisplayName: true,
        annualLeaveBalanceDays: true,
      },
    },
    branch: { select: { id: true, name: true } },
    decidedBy: { select: { id: true, employeeDisplayName: true } },
    leaveTypeRef: {
      select: {
        id: true,
        name: true,
        tracksBalance: true,
        defaultDays: true,
      },
    },
  } as const;

  async listLeave(userId: string, query: HrListQueryDto) {
    const context = await this.requireStaffManage(userId);
    await this.ensureLeaveTypes(context.tenantId!);
    const branchId = this.resolveBranchId(context, query.branchId);

    const rows = await this.prisma.staffLeaveRequest.findMany({
      where: {
        tenantId: context.tenantId!,
        ...(branchId ? { branchId } : {}),
        ...(query.membershipId
          ? { staffMembershipId: query.membershipId }
          : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to
          ? {
              startDate: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: this.leaveInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });

    return {
      data: rows.map((row) => this.toLeaveDto(row)),
    };
  }

  async listMyLeave(userId: string) {
    const context = await this.requireStaffMember(userId);
    await this.ensureLeaveTypes(context.tenantId!);

    const types = await this.prisma.leaveType.findMany({
      where: { tenantId: context.tenantId!, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const balances = await this.prisma.staffLeaveBalance.findMany({
      where: {
        tenantId: context.tenantId!,
        staffMembershipId: context.staffMembershipId!,
      },
    });
    const overrideByType = new Map<string, number | null>();
    for (const b of balances) {
      overrideByType.set(
        b.leaveTypeId,
        b.entitlementDays != null ? Number(b.entitlementDays) : null,
      );
    }
    const usedByType = await this.usedLeaveDaysByType(
      context.tenantId!,
      context.staffMembershipId!,
    );

    const rows = await this.prisma.staffLeaveRequest.findMany({
      where: {
        tenantId: context.tenantId!,
        staffMembershipId: context.staffMembershipId!,
      },
      include: this.leaveInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });

    const defaultType = types.find((t) => t.isDefault) ?? types[0] ?? null;

    return {
      data: {
        leaveTypes: types.map((t) => this.toLeaveTypeDto(t)),
        balances: types.map((t) => ({
          leaveTypeId: t.id,
          leaveTypeName: t.name,
          tracksBalance: t.tracksBalance,
          defaultDays: Number(t.defaultDays),
          entitlementDays: this.entitlementFor(t, overrideByType),
          balanceDays: this.remainingDays(t, overrideByType, usedByType),
        })),
        defaultLeaveTypeId: defaultType?.id ?? null,
        /** @deprecated use balances */
        annualLeaveBalanceDays: defaultType
          ? this.remainingDays(defaultType, overrideByType, usedByType)
          : 0,
        requests: rows.map((row) => this.toLeaveDto(row)),
      },
    };
  }

  async requestMyLeave(userId: string, dto: CreateLeaveRequestDto) {
    const context = await this.requireStaffMember(userId);
    return this.createLeaveForMembership(context, {
      ...dto,
      membershipId: context.staffMembershipId!,
    });
  }

  async cancelMyLeave(userId: string, id: string) {
    const context = await this.requireStaffMember(userId);
    const existing = await this.prisma.staffLeaveRequest.findFirst({
      where: {
        id,
        tenantId: context.tenantId!,
        staffMembershipId: context.staffMembershipId!,
      },
    });
    if (!existing) {
      throw new NotFoundException('Leave request not found.');
    }
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('Only pending leave can be cancelled.');
    }
    const updated = await this.prisma.staffLeaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: this.leaveInclude,
    });
    return { data: this.toLeaveDto(updated) };
  }

  async createLeave(userId: string, dto: CreateLeaveRequestDto) {
    const context = await this.requireStaffManage(userId);
    const membershipId = dto.membershipId || context.staffMembershipId;
    if (!membershipId) {
      throw new BadRequestException('Pick a staff member for this leave.');
    }
    return this.createLeaveForMembership(context, {
      ...dto,
      membershipId,
    });
  }

  private async createLeaveForMembership(
    context: AuthContextDto,
    dto: CreateLeaveRequestDto & { membershipId: string },
  ) {
    await this.ensureLeaveTypes(context.tenantId!);

    const leaveType = await this.prisma.leaveType.findFirst({
      where: {
        id: dto.leaveTypeId,
        tenantId: context.tenantId!,
        isActive: true,
      },
    });
    if (!leaveType) {
      throw new BadRequestException('Leave type not found or inactive.');
    }

    const membership = await this.prisma.tenantStaffMembership.findFirst({
      where: { id: dto.membershipId, tenantId: context.tenantId! },
      include: {
        branchAssignments: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });
    if (!membership) {
      throw new NotFoundException('Staff member not found.');
    }

    const branchId =
      dto.branchId ||
      membership.branchAssignments[0]?.branchId ||
      context.branchId;
    if (!branchId) {
      throw new BadRequestException('Branch is required for leave.');
    }
    if (
      this.casl.can(context, 'manage', 'Staff') ||
      this.casl.can(context, 'manage', 'all')
    ) {
      if (!this.isOwner(context) && branchId !== context.branchId) {
        throw new ForbiddenException('Leave must be for your branch.');
      }
    } else if (dto.membershipId !== context.staffMembershipId) {
      throw new ForbiddenException('You can only request leave for yourself.');
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) {
      throw new BadRequestException('End date must be on or after start date.');
    }
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

    const row = await this.prisma.staffLeaveRequest.create({
      data: {
        tenantId: context.tenantId!,
        branchId,
        staffMembershipId: dto.membershipId,
        leaveTypeId: leaveType.id,
        leaveType: leaveType.name,
        startDate: start,
        endDate: end,
        days,
        reason: dto.reason?.trim() || null,
        status: 'PENDING',
      },
      include: this.leaveInclude,
    });

    const leaveDto = this.toLeaveDto(row);
    await this.opsNotify.notifyManagers({
      type: OpsEventType.LEAVE_REQUEST_CREATED,
      tenantId: context.tenantId!,
      branchId,
      severity: 'ATTENTION',
      title: `Leave request · ${leaveDto.staffName}`,
      body: `${leaveDto.leaveType}: ${leaveDto.startDate} → ${leaveDto.endDate} (${leaveDto.days}d)`,
      relatedEntityType: 'StaffLeaveRequest',
      relatedEntityId: row.id,
      payload: {
        leaveRequestId: row.id,
        membershipId: dto.membershipId,
        staffName: leaveDto.staffName,
        leaveType: leaveDto.leaveType,
        startDate: leaveDto.startDate,
        endDate: leaveDto.endDate,
        days: leaveDto.days,
      },
    });

    return { data: leaveDto };
  }

  async decideLeave(userId: string, id: string, dto: DecideLeaveRequestDto) {
    const context = await this.requireStaffManage(userId);
    const existing = await this.prisma.staffLeaveRequest.findFirst({
      where: { id, tenantId: context.tenantId! },
      include: {
        leaveTypeRef: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Leave request not found.');
    }
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('Only pending leave can be decided.');
    }
    if (!this.isOwner(context) && existing.branchId !== context.branchId) {
      throw new ForbiddenException('Leave is for another branch.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffLeaveRequest.update({
        where: { id },
        data: {
          status: dto.status,
          decidedAt: new Date(),
          decidedByMembershipId: context.staffMembershipId ?? null,
          decisionNote: dto.decisionNote?.trim() || null,
        },
        include: this.leaveInclude,
      });

      const leaveType = existing.leaveTypeRef;
      const tracks = leaveType != null ? leaveType.tracksBalance : true;

      if (
        dto.status === 'APPROVED' &&
        tracks &&
        Number(existing.days) > 0 &&
        existing.leaveTypeId
      ) {
        const existingBal = await tx.staffLeaveBalance.findUnique({
          where: {
            staffMembershipId_leaveTypeId: {
              staffMembershipId: existing.staffMembershipId,
              leaveTypeId: existing.leaveTypeId,
            },
          },
        });
        const entitlement =
          existingBal?.entitlementDays != null
            ? Number(existingBal.entitlementDays)
            : Number(leaveType?.defaultDays ?? 0);

        await tx.staffLeaveBalance.upsert({
          where: {
            staffMembershipId_leaveTypeId: {
              staffMembershipId: existing.staffMembershipId,
              leaveTypeId: existing.leaveTypeId,
            },
          },
          create: {
            tenantId: context.tenantId!,
            staffMembershipId: existing.staffMembershipId,
            leaveTypeId: existing.leaveTypeId,
            entitlementDays: existingBal?.entitlementDays ?? null,
            balanceDays: new Prisma.Decimal(entitlement).minus(existing.days),
          },
          update: {
            balanceDays: { decrement: existing.days },
          },
        });
      }

      return updated;
    });

    const leaveDto = this.toLeaveDto(result);
    await this.opsNotify.notify({
      type: OpsEventType.LEAVE_REQUEST_DECIDED,
      tenantId: context.tenantId!,
      branchId: existing.branchId,
      severity: 'ATTENTION',
      title:
        dto.status === 'APPROVED'
          ? `Leave approved · ${leaveDto.leaveType}`
          : `Leave rejected · ${leaveDto.leaveType}`,
      body:
        dto.decisionNote?.trim() ||
        `${leaveDto.startDate} → ${leaveDto.endDate} (${leaveDto.days}d)`,
      recipientMembershipId: existing.staffMembershipId,
      relatedEntityType: 'StaffLeaveRequest',
      relatedEntityId: existing.id,
      payload: {
        leaveRequestId: existing.id,
        status: dto.status,
        leaveType: leaveDto.leaveType,
        startDate: leaveDto.startDate,
        endDate: leaveDto.endDate,
        days: leaveDto.days,
      },
    });

    return { data: leaveDto };
  }

  private toLeaveDto(row: {
    id: string;
    leaveType: string;
    leaveTypeId?: string | null;
    startDate: Date;
    endDate: Date;
    days: Prisma.Decimal | number;
    reason: string | null;
    status: string;
    decidedAt: Date | null;
    decisionNote: string | null;
    createdAt: Date;
    staffMembershipId: string;
    branchId: string;
    membership: {
      id: string;
      employeeDisplayName: string;
      annualLeaveBalanceDays: Prisma.Decimal | number;
    };
    branch: { id: string; name: string };
    decidedBy: { id: string; employeeDisplayName: string } | null;
    leaveTypeRef?: {
      id: string;
      name: string;
      tracksBalance: boolean;
    } | null;
  }) {
    return {
      id: row.id,
      leaveTypeId: row.leaveTypeId ?? row.leaveTypeRef?.id ?? null,
      leaveType: row.leaveTypeRef?.name ?? row.leaveType,
      tracksBalance: row.leaveTypeRef?.tracksBalance ?? true,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      days: Number(row.days),
      reason: row.reason,
      status: row.status,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      createdAt: row.createdAt.toISOString(),
      staffMembershipId: row.staffMembershipId,
      staffName: row.membership.employeeDisplayName,
      annualLeaveBalanceDays: Number(row.membership.annualLeaveBalanceDays),
      branchId: row.branchId,
      branchName: row.branch.name,
      decidedByName: row.decidedBy?.employeeDisplayName ?? null,
    };
  }
}
