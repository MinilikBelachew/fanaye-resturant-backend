import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import {
  CreateShiftDefinitionDto,
  SetWaiterTableCoverageDto,
  UpdateShiftDefinitionDto,
} from './dto/staff-coverage.dto';
import {
  AdminShiftDefinitionDto,
  AdminShiftDefinitionListResponseDto,
  AdminShiftDefinitionResponseDto,
  AdminShiftFloorResponseDto,
  AdminStaffListResponseDto,
  AdminStaffMemberDto,
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
