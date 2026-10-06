import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import {
  CreateAdminStaffDto,
  CreateShiftDefinitionDto,
  ResetAdminStaffPasswordDto,
  ResetAdminStaffPinDto,
  SetWaiterTableCoverageDto,
  UpdateAdminStaffDto,
  UpdateShiftDefinitionDto,
} from './dto/staff-coverage.dto';
import {
  AdminShiftDefinitionDto,
  AdminShiftDefinitionListResponseDto,
  AdminShiftDefinitionResponseDto,
  AdminShiftFloorResponseDto,
  AdminStaffDetailResponseDto,
  AdminStaffListResponseDto,
  AdminStaffMemberDto,
  AdminStaffMemberResponseDto,
  AdminWaiterCoverageResponseDto,
} from './dto/staff-coverage-response.dto';

const ADMIN_ROLES = ['MANAGER', 'OWNER_ADMIN'];

const ROLE_LABELS: Record<string, string> = {
  OWNER_ADMIN: 'Owner / Tenant Admin',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
  STATION_OPERATOR: 'Station operator',
  DISPATCHER: 'Dispatcher',
};

const UI_ROLE_TO_CODE: Record<string, string> = {
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

const UI_ROLE_TO_STATION_CODE: Record<string, string> = {
  kitchen: 'KITCHEN',
  barista: 'BARISTA',
  cakes: 'CAKES',
  soft_drinks: 'SOFT_DRINKS',
};

const WEEKDAY_ORDER = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

const DEFAULT_WORKING_DAYS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

function normalizeWorkingDays(days?: string[] | null): string[] {
  if (!days || days.length === 0) {
    return [...DEFAULT_WORKING_DAYS];
  }
  const selected = new Set(days);
  return WEEKDAY_ORDER.filter((day) => selected.has(day));
}

@Injectable()
export class StaffCoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async listStaff(
    userId: string,
    opts?: { scope?: string; branchId?: string },
  ): Promise<AdminStaffListResponseDto> {
    const context = await this.requireAdmin(userId);
    const { branchIds, scopeAll } = await this.resolveStaffScope(context, opts);

    const membershipWhere = scopeAll
      ? {
          tenantId: context.tenantId!,
          status: 'ACTIVE' as const,
          OR: [
            {
              branchAssignments: {
                some: {
                  branchId: { in: branchIds },
                  status: 'ACTIVE',
                },
              },
            },
            {
              roleAssignments: {
                some: {
                  status: 'ACTIVE',
                  role: { code: 'OWNER_ADMIN' },
                },
              },
            },
          ],
        }
      : {
          tenantId: context.tenantId!,
          status: 'ACTIVE' as const,
          branchAssignments: {
            some: {
              branchId: { in: branchIds },
              status: 'ACTIVE',
            },
          },
        };

    const [memberships, shifts] = await Promise.all([
      this.prisma.tenantStaffMembership.findMany({
        where: membershipWhere,
        include: {
          user: { include: { credential: true } },
          roleAssignments: {
            where: { status: 'ACTIVE' },
            include: { role: true },
            orderBy: { grantedAt: 'desc' },
            take: 1,
          },
          branchAssignments: {
            where: {
              status: 'ACTIVE',
              ...(scopeAll ? {} : { branchId: { in: branchIds } }),
            },
            include: {
              branch: { select: { id: true, name: true } },
            },
            orderBy: { assignedAt: 'asc' },
          },
          stationAssignments: {
            where: {
              status: 'ACTIVE',
              branchId: { in: branchIds },
              releasedAt: null,
            },
            include: { station: true },
            orderBy: { assignedAt: 'desc' },
            take: 1,
          },
          shiftTableCoverages: {
            where: { branchId: { in: branchIds } },
            include: {
              shiftDefinition: true,
              table: { include: { location: true } },
            },
          },
        },
        orderBy: { employeeDisplayName: 'asc' },
      }),
      scopeAll
        ? Promise.resolve([])
        : this.prisma.shiftDefinition.findMany({
            where: { branchId: branchIds[0], status: 'ACTIVE' },
            orderBy: { startLocalTime: 'asc' },
          }),
    ]);

    return {
      data: memberships.map((member) => this.toStaffDto(member)),
      shifts: shifts.map((shift) => this.toShiftDto(shift)),
    };
  }

  async getStaffDetail(
    userId: string,
    membershipId: string,
  ): Promise<AdminStaffDetailResponseDto> {
    const context = await this.requireAdmin(userId);
    await this.requireTenantStaffAccess(context, membershipId);
    const workingBranchId = await this.resolveMembershipBranchId(
      context,
      membershipId,
    );

    const member = await this.loadStaffMember(
      context,
      membershipId,
      workingBranchId,
    );
    const base = this.toStaffDto(member);
    const tablesCoveredCount = base.shiftCoverages.reduce(
      (sum, coverage) => sum + coverage.tables.length,
      0,
    );

    return {
      data: {
        ...base,
        joinedAt: member.joinedAt?.toISOString() ?? null,
        createdAt: member.createdAt.toISOString(),
        tablesCoveredCount,
        shiftsCoveredCount: base.shiftCoverages.length,
      },
    };
  }

  async createStaff(
    userId: string,
    dto: CreateAdminStaffDto,
  ): Promise<AdminStaffMemberResponseDto> {
    const context = await this.requireAdmin(userId);
    const roleCode = this.resolveRoleCode(dto.role);
    this.assertCanAssignRole(context.roleCode, roleCode);
    const role = await this.prisma.restaurantRole.findUnique({
      where: { code: roleCode },
    });
    if (!role) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { role: 'invalid' },
      });
    }

    const targetBranchId = await this.resolveCreateBranchId(
      context,
      dto.branchId,
    );

    const name = dto.name.trim();
    const phone = dto.phone?.trim() || null;
    let email = dto.email?.trim().toLowerCase() || null;
    if (!email && !phone) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 24);
      email = `${slug || 'staff'}.${Date.now().toString(36)}@fanaye.local`;
    }

    if (email) {
      const existingEmail = await this.prisma.appUser.findFirst({
        where: { email },
      });
      if (existingEmail) {
        throw new ConflictException({
          status: 409,
          errors: { email: 'already_exists' },
          message: 'A user with this email already exists.',
        });
      }
    }
    if (phone) {
      const existingPhone = await this.prisma.appUser.findFirst({
        where: { phone },
      });
      if (existingPhone) {
        throw new ConflictException({
          status: 409,
          errors: { phone: 'already_exists' },
          message: 'A user with this phone already exists.',
        });
      }
    }

    const stationId =
      roleCode === 'STATION_OPERATOR'
        ? await this.resolveStationId(
            context,
            dto.preparationStationId,
            dto.stationCode || UI_ROLE_TO_STATION_CODE[dto.role],
            targetBranchId,
          )
        : null;

    const rawPin = dto.pin?.trim() || '1234';
    await this.verifyPinUniqueInTenant(context.tenantId!, rawPin);

    const password = rawPin.slice(0, 72);
    const passwordHash = await bcrypt.hash(password, 10);

    const membershipId = await this.prisma.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: {
          displayName: name,
          email,
          phone,
          accountStatus: dto.active === false ? 'INACTIVE' : 'ACTIVE',
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
          tenantId: context.tenantId!,
          userId: user.id,
          employeeDisplayName: name,
          status: dto.active === false ? 'INACTIVE' : 'ACTIVE',
          workingDays: normalizeWorkingDays(dto.workingDays),
          joinedAt: new Date(),
        },
      });

      await tx.branchStaffAssignment.create({
        data: {
          tenantId: context.tenantId!,
          branchId: targetBranchId,
          staffMembershipId: membership.id,
          status: 'ACTIVE',
        },
      });

      await tx.staffRoleAssignment.create({
        data: {
          tenantId: context.tenantId!,
          staffMembershipId: membership.id,
          roleId: role.id,
          branchId: roleCode === 'OWNER_ADMIN' ? null : targetBranchId,
          status: 'ACTIVE',
          grantedByMembershipId: context.staffMembershipId,
        },
      });

      if (stationId) {
        await tx.stationStaffAssignment.create({
          data: {
            tenantId: context.tenantId!,
            branchId: targetBranchId,
            stationId,
            staffMembershipId: membership.id,
            status: 'ACTIVE',
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId!,
          branchId: targetBranchId,
          actorUserId: context.userId,
          actorStaffMembershipId: context.staffMembershipId,
          actorRestaurantRole: context.roleCode,
          entityType: 'STAFF_MEMBERSHIP',
          entityId: membership.id,
          action: 'CREATE_STAFF',
          newStateJson: {
            name,
            roleCode,
            email,
            phone,
            branchId: targetBranchId,
          },
        },
      });

      return membership.id;
    });

    if (
      roleCode === 'WAITER' &&
      dto.shiftDefinitionId &&
      dto.tableIds &&
      dto.tableIds.length > 0
    ) {
      await this.setWaiterCoverage(userId, membershipId, {
        shiftDefinitionId: dto.shiftDefinitionId,
        tableIds: dto.tableIds,
      });
    }

    const member = await this.loadStaffMember(
      context,
      membershipId,
      targetBranchId,
    );
    return { data: this.toStaffDto(member) };
  }

  async updateStaff(
    userId: string,
    membershipId: string,
    dto: UpdateAdminStaffDto,
  ): Promise<AdminStaffMemberResponseDto> {
    const context = await this.requireAdmin(userId);
    await this.requireTenantStaffAccess(context, membershipId);
    const workingBranchId = await this.resolveMembershipBranchId(
      context,
      membershipId,
    );
    const existing = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
      },
      include: {
        user: { include: { credential: true } },
        roleAssignments: {
          where: { status: 'ACTIVE' },
          include: { role: true },
          take: 1,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Staff member not found.');
    }

    if (dto.email?.trim()) {
      const email = dto.email.trim().toLowerCase();
      const clash = await this.prisma.appUser.findFirst({
        where: { email, NOT: { id: existing.userId } },
      });
      if (clash) {
        throw new ConflictException({
          status: 409,
          errors: { email: 'already_exists' },
          message: 'A user with this email already exists.',
        });
      }
    }
    if (dto.phone?.trim()) {
      const phone = dto.phone.trim();
      const clash = await this.prisma.appUser.findFirst({
        where: { phone, NOT: { id: existing.userId } },
      });
      if (clash) {
        throw new ConflictException({
          status: 409,
          errors: { phone: 'already_exists' },
          message: 'A user with this phone already exists.',
        });
      }
    }

    let nextRoleCode = existing.roleAssignments[0]?.role.code ?? 'WAITER';
    if (dto.role) {
      nextRoleCode = this.resolveRoleCode(dto.role);
      this.assertCanAssignRole(context.roleCode, nextRoleCode);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.name?.trim()) {
        await tx.tenantStaffMembership.update({
          where: { id: membershipId },
          data: { employeeDisplayName: dto.name.trim() },
        });
        await tx.appUser.update({
          where: { id: existing.userId },
          data: { displayName: dto.name.trim() },
        });
      }

      if (dto.active !== undefined) {
        await tx.tenantStaffMembership.update({
          where: { id: membershipId },
          data: {
            status: dto.active ? 'ACTIVE' : 'INACTIVE',
            deactivatedAt: dto.active ? null : new Date(),
          },
        });
        await tx.appUser.update({
          where: { id: existing.userId },
          data: {
            accountStatus: dto.active ? 'ACTIVE' : 'INACTIVE',
          },
        });
      }

      if (dto.workingDays !== undefined) {
        await tx.tenantStaffMembership.update({
          where: { id: membershipId },
          data: { workingDays: normalizeWorkingDays(dto.workingDays) },
        });
      }

      if (dto.email !== undefined || dto.phone !== undefined) {
        await tx.appUser.update({
          where: { id: existing.userId },
          data: {
            ...(dto.email !== undefined
              ? { email: dto.email.trim().toLowerCase() || null }
              : {}),
            ...(dto.phone !== undefined
              ? { phone: dto.phone.trim() || null }
              : {}),
          },
        });
      }

      if (dto.password?.trim()) {
        const passwordHash = await bcrypt.hash(
          dto.password.trim().slice(0, 72),
          10,
        );
        if (existing.user.credential) {
          await tx.userCredential.update({
            where: { userId: existing.userId },
            data: { passwordHash },
          });
        } else {
          await tx.userCredential.create({
            data: {
              userId: existing.userId,
              passwordHash,
              authProvider: 'email',
            },
          });
        }
      }

      if (dto.pin?.trim()) {
        await this.verifyPinUniqueInTenant(
          context.tenantId!,
          dto.pin,
          existing.userId,
        );
        const passwordHash = await bcrypt.hash(dto.pin.trim().slice(0, 72), 10);
        if (existing.user.credential) {
          await tx.userCredential.update({
            where: { userId: existing.userId },
            data: { passwordHash },
          });
        } else {
          await tx.userCredential.create({
            data: {
              userId: existing.userId,
              passwordHash,
              authProvider: 'email',
            },
          });
        }
      }

      if (dto.role) {
        const role = await tx.restaurantRole.findUnique({
          where: { code: nextRoleCode },
        });
        if (!role) {
          throw new UnprocessableEntityException({
            status: 422,
            errors: { role: 'invalid' },
          });
        }
        await tx.staffRoleAssignment.updateMany({
          where: { staffMembershipId: membershipId, status: 'ACTIVE' },
          data: { status: 'INACTIVE', revokedAt: new Date() },
        });
        await tx.staffRoleAssignment.create({
          data: {
            tenantId: context.tenantId!,
            staffMembershipId: membershipId,
            roleId: role.id,
            branchId: nextRoleCode === 'OWNER_ADMIN' ? null : workingBranchId,
            status: 'ACTIVE',
            grantedByMembershipId: context.staffMembershipId,
          },
        });

        if (nextRoleCode === 'STATION_OPERATOR') {
          const stationId = await this.resolveStationId(
            context,
            dto.preparationStationId,
            dto.stationCode ||
              (dto.role ? UI_ROLE_TO_STATION_CODE[dto.role] : undefined),
            workingBranchId,
          );
          await tx.stationStaffAssignment.updateMany({
            where: {
              staffMembershipId: membershipId,
              branchId: workingBranchId,
              status: 'ACTIVE',
            },
            data: { status: 'INACTIVE', releasedAt: new Date() },
          });
          if (stationId) {
            await tx.stationStaffAssignment.create({
              data: {
                tenantId: context.tenantId!,
                branchId: workingBranchId,
                stationId,
                staffMembershipId: membershipId,
                status: 'ACTIVE',
              },
            });
          }
        }
      }
    });

    const member = await this.loadStaffMember(
      context,
      membershipId,
      workingBranchId,
    );
    return { data: this.toStaffDto(member) };
  }

  async listShifts(
    userId: string,
  ): Promise<AdminShiftDefinitionListResponseDto> {
    const context = await this.requireAdmin(userId);
    const shifts = await this.prisma.shiftDefinition.findMany({
      where: { branchId: context.branchId!, status: 'ACTIVE' },
      orderBy: { startLocalTime: 'asc' },
    });
    return { data: shifts.map((shift) => this.toShiftDto(shift)) };
  }

  async shiftFloor(
    userId: string,
    shiftDefinitionId: string,
  ): Promise<AdminShiftFloorResponseDto> {
    const context = await this.requireAdmin(userId);
    const shift = await this.prisma.shiftDefinition.findFirst({
      where: {
        id: shiftDefinitionId,
        branchId: context.branchId!,
        status: 'ACTIVE',
      },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    const [locations, coverages] = await Promise.all([
      this.prisma.tableLocation.findMany({
        where: {
          branchId: context.branchId!,
          archivedAt: null,
          status: 'ACTIVE',
        },
        include: {
          tables: {
            where: { archivedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
          },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.diningTableShiftCoverage.findMany({
        where: {
          branchId: context.branchId!,
          shiftDefinitionId: shift.id,
        },
        include: { waiter: true },
      }),
    ]);

    const byTable = new Map(
      coverages.map((row) => [
        row.diningTableId,
        {
          id: row.waiterMembershipId,
          name: row.waiter.employeeDisplayName,
        },
      ]),
    );

    return {
      shiftDefinitionId: shift.id,
      shiftName: shift.name,
      startLocalTime: formatTime(shift.startLocalTime),
      endLocalTime: formatTime(shift.endLocalTime),
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        sortOrder: location.sortOrder,
        tables: location.tables.map((table) => {
          const assigned = byTable.get(table.id);
          return {
            tableId: table.id,
            displayName: table.displayName,
            displayNumber: table.displayNumber,
            locationId: location.id,
            locationName: location.name,
            assignedWaiterMembershipId: assigned?.id ?? null,
            assignedWaiterName: assigned?.name ?? null,
          };
        }),
      })),
    };
  }

  async createShift(
    userId: string,
    dto: CreateShiftDefinitionDto,
  ): Promise<AdminShiftDefinitionResponseDto> {
    const context = await this.requireAdmin(userId);
    const created = await this.prisma.shiftDefinition.create({
      data: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        name: dto.name.trim(),
        startLocalTime: timeToDate(dto.startLocalTime),
        endLocalTime: timeToDate(dto.endLocalTime),
        graceMinutes: dto.graceMinutes ?? 15,
        status: 'ACTIVE',
      },
    });
    return { data: this.toShiftDto(created) };
  }

  async updateShift(
    userId: string,
    shiftId: string,
    dto: UpdateShiftDefinitionDto,
  ): Promise<AdminShiftDefinitionResponseDto> {
    const context = await this.requireAdmin(userId);
    const existing = await this.prisma.shiftDefinition.findFirst({
      where: { id: shiftId, branchId: context.branchId! },
    });
    if (!existing) {
      throw new NotFoundException('Shift not found.');
    }
    const updated = await this.prisma.shiftDefinition.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.startLocalTime !== undefined
          ? { startLocalTime: timeToDate(dto.startLocalTime) }
          : {}),
        ...(dto.endLocalTime !== undefined
          ? { endLocalTime: timeToDate(dto.endLocalTime) }
          : {}),
        ...(dto.graceMinutes !== undefined
          ? { graceMinutes: dto.graceMinutes }
          : {}),
      },
    });
    return { data: this.toShiftDto(updated) };
  }

  async setWaiterCoverage(
    userId: string,
    waiterMembershipId: string,
    dto: SetWaiterTableCoverageDto,
  ): Promise<AdminWaiterCoverageResponseDto> {
    const context = await this.requireAdmin(userId);
    const workingBranchId = await this.resolveMembershipBranchId(
      context,
      waiterMembershipId,
    );
    await this.requireWaiter(context, waiterMembershipId, workingBranchId);

    const shift = await this.prisma.shiftDefinition.findFirst({
      where: {
        id: dto.shiftDefinitionId,
        branchId: workingBranchId,
        status: 'ACTIVE',
      },
    });
    if (!shift) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { shiftDefinitionId: 'invalid' },
      });
    }

    const uniqueTableIds = [...new Set(dto.tableIds)];
    if (uniqueTableIds.length > 0) {
      const tables = await this.prisma.diningTable.findMany({
        where: {
          id: { in: uniqueTableIds },
          branchId: workingBranchId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (tables.length !== uniqueTableIds.length) {
        throw new UnprocessableEntityException({
          status: 422,
          errors: { tableIds: 'invalid' },
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Clear this waiter's previous rows for the shift, then replace.
      await tx.diningTableShiftCoverage.deleteMany({
        where: {
          branchId: workingBranchId,
          shiftDefinitionId: shift.id,
          waiterMembershipId,
        },
      });

      // Also clear other waiters from these tables for this shift (one waiter per table/shift).
      if (uniqueTableIds.length > 0) {
        await tx.diningTableShiftCoverage.deleteMany({
          where: {
            branchId: workingBranchId,
            shiftDefinitionId: shift.id,
            diningTableId: { in: uniqueTableIds },
          },
        });
        await tx.diningTableShiftCoverage.createMany({
          data: uniqueTableIds.map((diningTableId) => ({
            tenantId: context.tenantId!,
            branchId: workingBranchId,
            diningTableId,
            shiftDefinitionId: shift.id,
            waiterMembershipId,
          })),
        });
      }
    });

    return {
      waiterMembershipId,
      shiftDefinitionId: shift.id,
      tableIds: uniqueTableIds,
    };
  }

  private toStaffDto(member: {
    id: string;
    employeeDisplayName: string;
    status: string;
    workingDays: string[];
    user: { phone: string | null; email: string | null } | null;
    roleAssignments: Array<{ role: { code: string; name: string } }>;
    branchAssignments?: Array<{
      branchId: string;
      branch?: { id: string; name: string } | null;
    }>;
    stationAssignments?: Array<{
      stationId: string;
      station: { id: string; name: string };
    }>;
    shiftTableCoverages: Array<{
      shiftDefinitionId: string;
      shiftDefinition: {
        id: string;
        name: string;
        startLocalTime: Date;
        endLocalTime: Date;
      };
      table: {
        id: string;
        displayName: string;
        displayNumber: string | null;
        location: { name: string };
      };
    }>;
  }): AdminStaffMemberDto {
    const role = member.roleAssignments[0]?.role;
    const roleCode = role?.code ?? 'WAITER';
    const station = member.stationAssignments?.[0]?.station ?? null;
    const primaryBranch = member.branchAssignments?.[0] ?? null;
    const branchId =
      primaryBranch?.branchId ?? primaryBranch?.branch?.id ?? null;
    const branchName =
      primaryBranch?.branch?.name ??
      (roleCode === 'OWNER_ADMIN' ? 'All branches' : null);
    const byShift = new Map<
      string,
      AdminStaffMemberDto['shiftCoverages'][number]
    >();

    for (const row of member.shiftTableCoverages) {
      const key = row.shiftDefinitionId;
      if (!byShift.has(key)) {
        byShift.set(key, {
          shiftDefinitionId: row.shiftDefinition.id,
          shiftName: row.shiftDefinition.name,
          startLocalTime: formatTime(row.shiftDefinition.startLocalTime),
          endLocalTime: formatTime(row.shiftDefinition.endLocalTime),
          tables: [],
        });
      }
      byShift.get(key)!.tables.push({
        tableId: row.table.id,
        displayName: row.table.displayName,
        displayNumber: row.table.displayNumber,
        locationName: row.table.location.name,
      });
    }

    const hasCred = Boolean((member as any).user?.credential?.passwordHash);
    const roleLabel =
      roleCode === 'STATION_OPERATOR' && station
        ? `${station.name} Station`
        : (ROLE_LABELS[roleCode] ?? role?.name ?? roleCode);

    return {
      id: member.id,
      name: member.employeeDisplayName,
      roleCode,
      roleLabel,
      active: member.status === 'ACTIVE',
      workingDays: normalizeWorkingDays(member.workingDays),
      phone: member.user?.phone ?? null,
      email: member.user?.email ?? null,
      hasPin: hasCred,
      hasPassword: hasCred,
      stationId: station?.id ?? null,
      stationName: station?.name ?? null,
      branchId,
      branchName,
      shiftCoverages: [...byShift.values()].sort((a, b) =>
        a.startLocalTime.localeCompare(b.startLocalTime),
      ),
    };
  }

  async resetStaffPin(
    userId: string,
    membershipId: string,
    dto: ResetAdminStaffPinDto,
  ): Promise<AdminStaffMemberResponseDto> {
    const context = await this.requireAdmin(userId);
    await this.requireTenantStaffAccess(context, membershipId);
    const workingBranchId = await this.resolveMembershipBranchId(
      context,
      membershipId,
    );
    const membership = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
      },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('Staff member not found');
    }

    await this.verifyPinUniqueInTenant(
      context.tenantId!,
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
          tenantId: context.tenantId!,
          branchId: workingBranchId,
          actorUserId: context.userId,
          actorStaffMembershipId: context.staffMembershipId,
          actorRestaurantRole: context.roleCode,
          action: 'STAFF_PIN_RESET',
          entityType: 'STAFF_MEMBERSHIP',
          entityId: membershipId,
          reason: `PIN reset for ${membership.employeeDisplayName}`,
        },
      });
    });

    const member = await this.loadStaffMember(
      context,
      membershipId,
      workingBranchId,
    );
    return { data: this.toStaffDto(member) };
  }

  async resetStaffPassword(
    userId: string,
    membershipId: string,
    dto: ResetAdminStaffPasswordDto,
  ): Promise<AdminStaffMemberResponseDto> {
    const context = await this.requireAdmin(userId);
    await this.requireTenantStaffAccess(context, membershipId);
    const workingBranchId = await this.resolveMembershipBranchId(
      context,
      membershipId,
    );
    const password = dto.password?.trim();
    if (!password || password.length < 6) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { password: 'Password must be at least 6 characters.' },
      });
    }

    const membership = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
      },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('Staff member not found');
    }

    const passwordHash = await bcrypt.hash(password.slice(0, 72), 10);

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
          tenantId: context.tenantId!,
          branchId: workingBranchId,
          actorUserId: context.userId,
          actorStaffMembershipId: context.staffMembershipId,
          actorRestaurantRole: context.roleCode,
          action: 'STAFF_PASSWORD_RESET',
          entityType: 'STAFF_MEMBERSHIP',
          entityId: membershipId,
          reason: `Password reset for ${membership.employeeDisplayName}`,
        },
      });
    });

    const member = await this.loadStaffMember(
      context,
      membershipId,
      workingBranchId,
    );
    return { data: this.toStaffDto(member) };
  }

  private toShiftDto(shift: {
    id: string;
    name: string;
    startLocalTime: Date;
    endLocalTime: Date;
    graceMinutes: number;
    status: string;
  }): AdminShiftDefinitionDto {
    return {
      id: shift.id,
      name: shift.name,
      startLocalTime: formatTime(shift.startLocalTime),
      endLocalTime: formatTime(shift.endLocalTime),
      graceMinutes: shift.graceMinutes,
      status: shift.status,
    };
  }

  private resolveRoleCode(role: string): string {
    const mapped = UI_ROLE_TO_CODE[role] || UI_ROLE_TO_CODE[role.toLowerCase()];
    if (!mapped) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { role: 'invalid' },
      });
    }
    return mapped;
  }

  private async resolveStationId(
    context: AuthContextDto,
    preparationStationId?: string,
    stationCode?: string,
    branchId?: string,
  ): Promise<string | null> {
    const targetBranchId = branchId || context.branchId!;
    if (preparationStationId) {
      const station = await this.prisma.preparationStation.findFirst({
        where: {
          id: preparationStationId,
          branchId: targetBranchId,
          status: 'ACTIVE',
        },
      });
      if (!station) {
        throw new UnprocessableEntityException({
          status: 422,
          errors: { preparationStationId: 'invalid' },
        });
      }
      return station.id;
    }
    if (stationCode) {
      const station = await this.prisma.preparationStation.findFirst({
        where: {
          branchId: targetBranchId,
          code: stationCode.toUpperCase(),
          status: 'ACTIVE',
        },
      });
      if (!station) {
        throw new UnprocessableEntityException({
          status: 422,
          errors: { stationCode: 'invalid' },
        });
      }
      return station.id;
    }
    const fallback = await this.prisma.preparationStation.findFirst({
      where: { branchId: targetBranchId, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    });
    return fallback?.id ?? null;
  }

  private async loadStaffMember(
    context: AuthContextDto,
    membershipId: string,
    branchId?: string,
  ) {
    const targetBranchId = branchId || context.branchId!;
    const member = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
      },
      include: {
        user: { include: { credential: true } },
        roleAssignments: {
          where: { status: 'ACTIVE' },
          include: { role: true },
          orderBy: { grantedAt: 'desc' },
          take: 1,
        },
        branchAssignments: {
          where: { status: 'ACTIVE' },
          include: {
            branch: { select: { id: true, name: true } },
          },
          orderBy: { assignedAt: 'asc' },
        },
        stationAssignments: {
          where: {
            status: 'ACTIVE',
            branchId: targetBranchId,
            releasedAt: null,
          },
          include: { station: true },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
        shiftTableCoverages: {
          where: { branchId: targetBranchId },
          include: {
            shiftDefinition: true,
            table: { include: { location: true } },
          },
        },
      },
    });
    if (!member) {
      throw new NotFoundException('Staff member not found.');
    }
    return member;
  }

  private async requireWaiter(
    context: AuthContextDto,
    membershipId: string,
    branchId?: string,
  ) {
    const targetBranchId = branchId || context.branchId!;
    const waiter = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
        status: 'ACTIVE',
        branchAssignments: {
          some: { branchId: targetBranchId, status: 'ACTIVE' },
        },
        roleAssignments: {
          some: { status: 'ACTIVE', role: { code: 'WAITER' } },
        },
      },
    });
    if (!waiter) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { waiterMembershipId: 'invalid' },
      });
    }
    return waiter;
  }

  private async resolveStaffScope(
    context: AuthContextDto,
    opts?: { scope?: string; branchId?: string },
  ): Promise<{ branchIds: string[]; scopeAll: boolean }> {
    const isOwner = context.roleCode === 'OWNER_ADMIN';
    if (isOwner && opts?.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: opts.branchId,
          tenantId: context.tenantId!,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found.');
      }
      return { branchIds: [branch.id], scopeAll: false };
    }

    const scopeAll =
      isOwner && String(opts?.scope || '').toLowerCase() === 'all';
    if (scopeAll) {
      const branches = await this.prisma.branch.findMany({
        where: { tenantId: context.tenantId!, status: 'ACTIVE' },
        select: { id: true },
      });
      return {
        branchIds: branches.map((branch) => branch.id),
        scopeAll: true,
      };
    }

    return { branchIds: [context.branchId!], scopeAll: false };
  }

  private async resolveCreateBranchId(
    context: AuthContextDto,
    branchId?: string,
  ): Promise<string> {
    if (!branchId || context.roleCode !== 'OWNER_ADMIN') {
      return context.branchId!;
    }
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        tenantId: context.tenantId!,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!branch) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { branchId: 'invalid' },
      });
    }
    return branch.id;
  }

  private async resolveMembershipBranchId(
    context: AuthContextDto,
    membershipId: string,
  ): Promise<string> {
    if (context.roleCode !== 'OWNER_ADMIN') {
      return context.branchId!;
    }
    const assignment = await this.prisma.branchStaffAssignment.findFirst({
      where: {
        staffMembershipId: membershipId,
        status: 'ACTIVE',
        branch: { tenantId: context.tenantId! },
      },
      select: { branchId: true },
      orderBy: { assignedAt: 'asc' },
    });
    return assignment?.branchId ?? context.branchId!;
  }

  private async requireTenantStaffAccess(
    context: AuthContextDto,
    membershipId: string,
  ): Promise<void> {
    if (context.roleCode === 'OWNER_ADMIN') {
      const membership = await this.prisma.tenantStaffMembership.findFirst({
        where: {
          id: membershipId,
          tenantId: context.tenantId!,
        },
        select: { id: true },
      });
      if (!membership) {
        throw new NotFoundException('Staff member not found.');
      }
      return;
    }

    const membership = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
        branchAssignments: {
          some: { branchId: context.branchId!, status: 'ACTIVE' },
        },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('Staff member not found.');
    }
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
            errors: { pin: 'already_exists' },
            message: `This PIN is already in use by ${staffName} in this restaurant. Please choose a different PIN.`,
          });
        }
      }
    }
  }

  private assertCanAssignRole(actorRole: string, targetRole: string): void {
    if (actorRole === 'MANAGER' && targetRole === 'OWNER_ADMIN') {
      throw new ForbiddenException({
        status: 403,
        errors: { role: 'owner_forbidden' },
        message:
          'Managers cannot create or promote staff to Owner. Owners are created by platform super-admin only.',
      });
    }
    if (actorRole === 'MANAGER' && targetRole === 'MANAGER') {
      throw new ForbiddenException({
        status: 403,
        errors: { role: 'manager_forbidden' },
        message:
          'Managers cannot create other managers. Branch managers are created when a branch is set up.',
      });
    }
  }

  private async requireAdmin(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    if (!ADMIN_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Staff coverage is for managers.');
    }
    return context;
  }
}

function timeToDate(hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

function formatTime(value: Date): string {
  const hours = value.getUTCHours().toString().padStart(2, '0');
  const minutes = value.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
