import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import {
  CreateDiningTableDto,
  CreateTableLocationDto,
  UpdateDiningTableDto,
  UpdateTableLocationDto,
} from './dto/floor-layout.dto';
import {
  AdminDiningTableDto,
  AdminDiningTableResponseDto,
  AdminFloorLayoutResponseDto,
  AdminTableLocationDto,
  AdminTableLocationResponseDto,
} from './dto/floor-layout-response.dto';

const ADMIN_ROLES = ['MANAGER', 'OWNER_ADMIN'];

@Injectable()
export class FloorLayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async layout(userId: string): Promise<AdminFloorLayoutResponseDto> {
    const context = await this.requireAdmin(userId);
    const [locations, waiters] = await Promise.all([
      this.prisma.tableLocation.findMany({
        where: {
          branchId: context.branchId!,
          archivedAt: null,
          status: 'ACTIVE',
        },
        include: {
          tables: {
            where: { archivedAt: null },
            include: { assignedWaiter: true },
            orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
          },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      this.listWaiters(context),
    ]);

    return {
      data: locations.map((location) => this.toLocationDto(location)),
      waiters,
    };
  }

  async createLocation(
    userId: string,
    dto: CreateTableLocationDto,
  ): Promise<AdminTableLocationResponseDto> {
    const context = await this.requireAdmin(userId);
    const name = dto.name.trim();
    if (!name) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { name: 'required' },
      });
    }
    const code =
      dto.code?.trim().toUpperCase().replace(/\s+/g, '_') ||
      name.toUpperCase().replace(/\s+/g, '_').slice(0, 40);
    const sortOrder =
      dto.sortOrder ??
      (await this.prisma.tableLocation.count({
        where: { branchId: context.branchId! },
      }));

    try {
      const created = await this.prisma.tableLocation.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          name,
          code,
          sortOrder,
          status: 'ACTIVE',
        },
        include: {
          tables: {
            where: { archivedAt: null },
            include: { assignedWaiter: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      return { data: this.toLocationDto(created) };
    } catch {
      throw new ConflictException({
        status: 409,
        errors: { name: 'duplicate' },
      });
    }
  }

  async updateLocation(
    userId: string,
    locationId: string,
    dto: UpdateTableLocationDto,
  ): Promise<AdminTableLocationResponseDto> {
    const context = await this.requireAdmin(userId);
    const existing = await this.prisma.tableLocation.findFirst({
      where: {
        id: locationId,
        branchId: context.branchId!,
        archivedAt: null,
      },
    });
    if (!existing) {
      throw new NotFoundException('Place not found.');
    }

    try {
      const updated = await this.prisma.tableLocation.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined
            ? { code: dto.code.trim().toUpperCase().replace(/\s+/g, '_') }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
        include: {
          tables: {
            where: { archivedAt: null },
            include: { assignedWaiter: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      return { data: this.toLocationDto(updated) };
    } catch {
      throw new ConflictException({
        status: 409,
        errors: { name: 'duplicate' },
      });
    }
  }

  async createTable(
    userId: string,
    dto: CreateDiningTableDto,
  ): Promise<AdminDiningTableResponseDto> {
    const context = await this.requireAdmin(userId);
    await this.requireLocation(context, dto.locationId);
    if (dto.assignedWaiterMembershipId) {
      await this.requireWaiter(context, dto.assignedWaiterMembershipId);
    }

    const sortOrder =
      dto.sortOrder ??
      (await this.prisma.diningTable.count({
        where: { branchId: context.branchId!, archivedAt: null },
      }));

    const created = await this.prisma.diningTable.create({
      data: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        locationId: dto.locationId,
        displayName: dto.displayName.trim(),
        displayNumber: dto.displayNumber?.trim() || null,
        assignedWaiterMembershipId: dto.assignedWaiterMembershipId ?? null,
        status: 'AVAILABLE',
        sortOrder,
      },
      include: {
        location: true,
        assignedWaiter: true,
      },
    });

    return { data: this.toTableDto(created) };
  }

  async updateTable(
    userId: string,
    tableId: string,
    dto: UpdateDiningTableDto,
  ): Promise<AdminDiningTableResponseDto> {
    const context = await this.requireAdmin(userId);
    const existing = await this.prisma.diningTable.findFirst({
      where: {
        id: tableId,
        branchId: context.branchId!,
        archivedAt: null,
      },
    });
    if (!existing) {
      throw new NotFoundException('Table not found.');
    }

    if (dto.locationId) {
      await this.requireLocation(context, dto.locationId);
    }
    if (dto.assignedWaiterMembershipId) {
      await this.requireWaiter(context, dto.assignedWaiterMembershipId);
    }

    const updated = await this.prisma.diningTable.update({
      where: { id: existing.id },
      data: {
        ...(dto.locationId !== undefined ? { locationId: dto.locationId } : {}),
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.displayNumber !== undefined
          ? { displayNumber: dto.displayNumber?.trim() || null }
          : {}),
        ...(dto.assignedWaiterMembershipId !== undefined
          ? { assignedWaiterMembershipId: dto.assignedWaiterMembershipId }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        version: { increment: 1 },
      },
      include: {
        location: true,
        assignedWaiter: true,
      },
    });

    return { data: this.toTableDto(updated) };
  }

  private async listWaiters(context: AuthContextDto) {
    const rows = await this.prisma.tenantStaffMembership.findMany({
      where: {
        tenantId: context.tenantId!,
        status: 'ACTIVE',
        branchAssignments: {
          some: {
            branchId: context.branchId!,
            status: 'ACTIVE',
          },
        },
        roleAssignments: {
          some: {
            status: 'ACTIVE',
            role: { code: 'WAITER' },
          },
        },
      },
      orderBy: { employeeDisplayName: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.employeeDisplayName,
    }));
  }

  private async requireLocation(context: AuthContextDto, locationId: string) {
    const location = await this.prisma.tableLocation.findFirst({
      where: {
        id: locationId,
        branchId: context.branchId!,
        archivedAt: null,
        status: 'ACTIVE',
      },
    });
    if (!location) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { locationId: 'invalid' },
      });
    }
    return location;
  }

  private async requireWaiter(context: AuthContextDto, membershipId: string) {
    const waiter = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: membershipId,
        tenantId: context.tenantId!,
        status: 'ACTIVE',
        branchAssignments: {
          some: {
            branchId: context.branchId!,
            status: 'ACTIVE',
          },
        },
        roleAssignments: {
          some: {
            status: 'ACTIVE',
            role: { code: 'WAITER' },
          },
        },
      },
    });
    if (!waiter) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { assignedWaiterMembershipId: 'invalid' },
      });
    }
    return waiter;
  }

  private toLocationDto(location: {
    id: string;
    name: string;
    code: string;
    sortOrder: number;
    status: string;
    tables: Array<{
      id: string;
      locationId: string;
      displayName: string;
      displayNumber: string | null;
      status: string;
      sortOrder: number;
      assignedWaiterMembershipId: string | null;
      version: number;
      assignedWaiter: { employeeDisplayName: string } | null;
      location?: { name: string };
    }>;
  }): AdminTableLocationDto {
    return {
      id: location.id,
      name: location.name,
      code: location.code,
      sortOrder: location.sortOrder,
      status: location.status,
      tables: location.tables.map((table) =>
        this.toTableDto({
          ...table,
          location: { name: location.name },
        }),
      ),
    };
  }

  private toTableDto(table: {
    id: string;
    locationId: string;
    displayName: string;
    displayNumber: string | null;
    status: string;
    sortOrder: number;
    assignedWaiterMembershipId: string | null;
    version: number;
    assignedWaiter: { employeeDisplayName: string } | null;
    location: { name: string };
  }): AdminDiningTableDto {
    return {
      id: table.id,
      locationId: table.locationId,
      locationName: table.location.name,
      displayName: table.displayName,
      displayNumber: table.displayNumber,
      status: table.status,
      sortOrder: table.sortOrder,
      assignedWaiterMembershipId: table.assignedWaiterMembershipId,
      assignedWaiterName: table.assignedWaiter?.employeeDisplayName ?? null,
      version: table.version,
    };
  }

  private async requireAdmin(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    if (!ADMIN_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Floor layout is for managers.');
    }
    return context;
  }
}
