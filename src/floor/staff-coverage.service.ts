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
  SetWaiterTableCoverageDto,
  UpdateAdminStaffDto,
  UpdateShiftDefinitionDto,
} from './dto/staff-coverage.dto';
import {
  AdminShiftDefinitionDto,
  AdminShiftDefinitionListResponseDto,
  AdminShiftDefinitionResponseDto,
  AdminShiftFloorResponseDto,
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
  WAITER: 'WAITER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  OWNER_ADMIN: 'OWNER_ADMIN',
  STATION_OPERATOR: 'STATION_OPERATOR',
};

const UI_ROLE_TO_STATION_CODE: Record<string, string> = {
  kitchen: 'KITCHEN',
  barista: 'BARISTA',
  cakes: 'CAKES',
  soft_drinks: 'SOFT_DRINKS',
};

@Injectable()
export class StaffCoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async listStaff(userId: string): Promise<AdminStaffListResponseDto> {
    const context = await this.requireAdmin(userId);
    const [memberships, shifts] = await Promise.all([
      this.prisma.tenantStaffMembership.findMany({
        where: {
          tenantId: context.tenantId!,
          status: 'ACTIVE',
          branchAssignments: {
            some: { branchId: context.branchId!, status: 'ACTIVE' },
          },
        },
        include: {
          user: true,
          roleAssignments: {
            where: { status: 'ACTIVE' },
            include: { role: true },
            orderBy: { grantedAt: 'desc' },
            take: 1,
          },
          shiftTableCoverages: {
            where: { branchId: context.branchId! },
            include: {
              shiftDefinition: true,
              table: { include: { location: true } },
            },
          },
        },
        orderBy: { employeeDisplayName: 'asc' },
      }),
      this.prisma.shiftDefinition.findMany({
        where: { branchId: context.branchId!, status: 'ACTIVE' },
        orderBy: { startLocalTime: 'asc' },
      }),
    ]);

    return {
      data: memberships.map((member) => this.toStaffDto(member)),
      shifts: shifts.map((shift) => this.toShiftDto(shift)),
    };
  }

  async createStaff(
    userId: string,
    dto: CreateAdminStaffDto,
  ): Promise<AdminStaffMemberResponseDto> {
    const context = await this.requireAdmin(userId);
    const roleCode = this.resolveRoleCode(dto.role);
    const role = await this.prisma.restaurantRole.findUnique({
      where: { code: roleCode },
    });
    if (!role) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { role: 'invalid' },
      });
    }

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
          )
        : null;

    const password = (dto.pin?.trim() || '1234').slice(0, 72);
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
          joinedAt: new Date(),
        },
      });

      await tx.branchStaffAssignment.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          staffMembershipId: membership.id,
          status: 'ACTIVE',
        },
      });

      await tx.staffRoleAssignment.create({
        data: {
          tenantId: context.tenantId!,
          staffMembershipId: membership.id,
          roleId: role.id,
          branchId: roleCode === 'OWNER_ADMIN' ? null : context.branchId!,
          status: 'ACTIVE',
          grantedByMembershipId: context.staffMembershipId,
        },
      });

      if (stationId) {
        await tx.stationStaffAssignment.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            stationId,
            staffMembershipId: membership.id,
            status: 'ACTIVE',
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
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

    const member = await this.loadStaffMember(context, membershipId);
    return { data: this.toStaffDto(member) };
  }

  async updateStaff(
    userId: string,
    membershipId: string,
    dto: UpdateAdminStaffDto,
  ): Promise<AdminStaffMemberResponseDto> {
    const context = await this.requireAdmin(userId);
    const existing = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
        branchAssignments: {
          some: { branchId: context.branchId!, status: 'ACTIVE' },
        },
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

      if (dto.pin?.trim()) {
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
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
        await tx.staffRoleAssignment.create({
          data: {
            tenantId: context.tenantId!,
            staffMembershipId: membershipId,
            roleId: role.id,
            branchId:
              nextRoleCode === 'OWNER_ADMIN' ? null : context.branchId!,
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
          );
          await tx.stationStaffAssignment.updateMany({
            where: {
              staffMembershipId: membershipId,
              branchId: context.branchId!,
              status: 'ACTIVE',
            },
            data: { status: 'INACTIVE', releasedAt: new Date() },
          });
          if (stationId) {
            await tx.stationStaffAssignment.create({
              data: {
                tenantId: context.tenantId!,
                branchId: context.branchId!,
                stationId,
                staffMembershipId: membershipId,
                status: 'ACTIVE',
              },
            });
          }
        }
      }
    });

    const member = await this.loadStaffMember(context, membershipId);
    return { data: this.toStaffDto(member) };
  }

  async listShifts(userId: string): Promise<AdminShiftDefinitionListResponseDto> {
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
    await this.requireWaiter(context, waiterMembershipId);

    const shift = await this.prisma.shiftDefinition.findFirst({
      where: {
        id: dto.shiftDefinitionId,
        branchId: context.branchId!,
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
          branchId: context.branchId!,
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
          branchId: context.branchId!,
          shiftDefinitionId: shift.id,
          waiterMembershipId,
        },
      });

      // Also clear other waiters from these tables for this shift (one waiter per table/shift).
      if (uniqueTableIds.length > 0) {
        await tx.diningTableShiftCoverage.deleteMany({
          where: {
            branchId: context.branchId!,
            shiftDefinitionId: shift.id,
            diningTableId: { in: uniqueTableIds },
          },
        });
        await tx.diningTableShiftCoverage.createMany({
          data: uniqueTableIds.map((diningTableId) => ({
            tenantId: context.tenantId!,
            branchId: context.branchId!,
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
    user: { phone: string | null; email: string | null } | null;
    roleAssignments: Array<{ role: { code: string; name: string } }>;
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

    return {
      id: member.id,
      name: member.employeeDisplayName,
      roleCode,
      roleLabel: ROLE_LABELS[roleCode] ?? role?.name ?? roleCode,
      active: member.status === 'ACTIVE',
      phone: member.user?.phone ?? null,
      email: member.user?.email ?? null,
      shiftCoverages: [...byShift.values()].sort((a, b) =>
        a.startLocalTime.localeCompare(b.startLocalTime),
      ),
    };
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
  ): Promise<string | null> {
    if (preparationStationId) {
      const station = await this.prisma.preparationStation.findFirst({
        where: {
          id: preparationStationId,
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
      return station.id;
    }
    if (stationCode) {
      const station = await this.prisma.preparationStation.findFirst({
        where: {
          branchId: context.branchId!,
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
      where: { branchId: context.branchId!, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    });
    return fallback?.id ?? null;
  }

  private async loadStaffMember(
    context: AuthContextDto,
    membershipId: string,
  ) {
    const member = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
      },
      include: {
        user: true,
        roleAssignments: {
          where: { status: 'ACTIVE' },
          include: { role: true },
          orderBy: { grantedAt: 'desc' },
          take: 1,
        },
        shiftTableCoverages: {
          where: { branchId: context.branchId! },
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

  private async requireWaiter(context: AuthContextDto, membershipId: string) {
    const waiter = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
        status: 'ACTIVE',
        branchAssignments: {
          some: { branchId: context.branchId!, status: 'ACTIVE' },
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
