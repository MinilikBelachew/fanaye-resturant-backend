import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { PLATFORM_ROLE_CODE } from '../identity/identity.constants';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import {
  BranchDto,
  BranchListResponseDto,
  BranchResponseDto,
} from './dto/branch-response.dto';

const BRANCH_MAX_KEY = 'branch.max_count';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async listBranches(
    userId: string,
    tenantIdQuery?: string,
    activeOnly = true,
  ): Promise<BranchListResponseDto> {
    const context = await this.identity.getByUserId(userId);
    const tenantId = await this.resolveTenantId(context, tenantIdQuery);

    const where: Prisma.BranchWhereInput = {
      tenantId,
      ...(activeOnly ? { status: 'ACTIVE', archivedAt: null } : {}),
    };

    const branches = await this.prisma.branch.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: {
            diningTables: true,
            stations: true,
            staffAssignments: {
              where: { status: 'ACTIVE' },
            },
          },
        },
        roleAssignments: {
          where: {
            status: 'ACTIVE',
            role: { code: 'MANAGER' },
          },
          take: 1,
          include: {
            membership: {
              include: { user: true },
            },
          },
        },
      },
    });

    const maxBranches = await this.getBranchMaxCount(tenantId);

    return {
      data: branches.map((branch) => this.mapBranch(branch)),
      maxBranches,
      activeCount: branches.filter((b) => b.status === 'ACTIVE').length,
    };
  }

  async createBranch(
    userId: string,
    dto: CreateBranchDto,
  ): Promise<BranchResponseDto> {
    const context = await this.identity.getByUserId(userId);
    const tenantId = await this.resolveTenantIdForWrite(context, dto.tenantId);

    const activeCount = await this.prisma.branch.count({
      where: { tenantId, status: 'ACTIVE', archivedAt: null },
    });
    const maxBranches = await this.getBranchMaxCount(tenantId);
    if (activeCount >= maxBranches) {
      throw new ForbiddenException({
        status: 403,
        errors: { branch: 'max_count' },
        message: `Plan allows ${maxBranches} active branch(es). Upgrade or archive a branch first.`,
      });
    }

    const name = dto.name.trim();
    const displayCode = (
      dto.displayCode?.trim() ||
      `${name.slice(0, 3).toUpperCase()}-${activeCount + 1}`
    ).slice(0, 40);

    const codeClash = await this.prisma.branch.findFirst({
      where: { tenantId, displayCode },
    });
    if (codeClash) {
      throw new ConflictException({
        status: 409,
        errors: { displayCode: 'already_exists' },
        message: 'Branch code already exists for this restaurant.',
      });
    }

    const managerEmail =
      dto.manager.email?.trim().toLowerCase() ||
      `manager.${Date.now().toString(36)}@fanaye.local`;
    const managerPhone = dto.manager.phone?.trim() || null;
    const managerName = dto.manager.name.trim();

    const emailTaken = await this.prisma.appUser.findFirst({
      where: { email: managerEmail },
    });
    if (emailTaken) {
      throw new ConflictException({
        status: 409,
        errors: { email: 'already_exists' },
        message: 'A user with this manager email already exists.',
      });
    }
    if (managerPhone) {
      const phoneTaken = await this.prisma.appUser.findFirst({
        where: { phone: managerPhone },
      });
      if (phoneTaken) {
        throw new ConflictException({
          status: 409,
          errors: { phone: 'already_exists' },
          message: 'A user with this manager phone already exists.',
        });
      }
    }

    type StationSeed = { name: string; code: string; sortOrder: number };
    const isBakery = dto.serviceMode === 'BAKERY';
    let stationConfigs: StationSeed[] = isBakery
      ? [{ name: 'Counter', code: 'COUNTER', sortOrder: 0 }]
      : [
          { name: 'Kitchen Station', code: 'KITCHEN', sortOrder: 0 },
          { name: 'Barista Station', code: 'BARISTA', sortOrder: 1 },
          { name: 'Cakes & Pastry', code: 'CAKES', sortOrder: 2 },
          { name: 'Soft Drinks & Bar', code: 'SOFT_DRINKS', sortOrder: 3 },
        ];

    if (!isBakery && dto.copyFromBranchId) {
      const copyFrom = await this.prisma.branch.findFirst({
        where: { id: dto.copyFromBranchId, tenantId, status: 'ACTIVE' },
        include: {
          stations: {
            where: { status: 'ACTIVE' },
            select: { name: true, code: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      if (!copyFrom) {
        throw new NotFoundException(
          'Source branch to copy from was not found.',
        );
      }
      if (copyFrom.stations.length > 0) {
        stationConfigs = copyFrom.stations.map((st, index) => ({
          name: st.name,
          code: st.code || `STATION_${index + 1}`,
          sortOrder: st.sortOrder ?? index,
        }));
      }
    }

    const tableCount = isBakery
      ? 1
      : Math.min(Math.max(dto.tableCount ?? 8, 0), 60);
    const passwordHash = await bcrypt.hash(
      dto.manager.password.trim().slice(0, 72),
      10,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          tenantId,
          name,
          displayCode,
          timezone: dto.timezone?.trim() || 'Africa/Addis_Ababa',
          serviceMode: isBakery ? 'BAKERY' : 'RESTAURANT',
          status: 'ACTIVE',
          businessDayCutoff: new Date('1970-01-01T04:00:00Z'),
          settings: {
            create: {
              tenant: { connect: { id: tenantId } },
              shiftEndWarningMinutes: 15,
            },
          },
        },
      });

      for (const st of stationConfigs) {
        await tx.preparationStation.create({
          data: {
            tenantId,
            branchId: branch.id,
            name: st.name,
            code: st.code,
            status: 'ACTIVE',
            sortOrder: st.sortOrder,
          },
        });
      }

      if (tableCount > 0) {
        const location = await tx.tableLocation.create({
          data: {
            tenantId,
            branchId: branch.id,
            name: isBakery ? 'Counter' : 'Main Dining Floor',
            code: isBakery ? 'COUNTER' : 'MAIN_FLOOR',
            status: 'ACTIVE',
            sortOrder: 0,
          },
        });
        for (let i = 1; i <= tableCount; i++) {
          await tx.diningTable.create({
            data: {
              tenantId,
              branchId: branch.id,
              locationId: location.id,
              displayName: isBakery ? 'Counter' : `Table ${i}`,
              displayNumber: isBakery ? 'C' : String(i),
              status: 'AVAILABLE',
              sortOrder: i,
            },
          });
        }
      }

      const managerUser = await tx.appUser.create({
        data: {
          displayName: managerName,
          email: managerEmail,
          phone: managerPhone,
          accountStatus: 'ACTIVE',
        },
      });

      await tx.userCredential.create({
        data: {
          userId: managerUser.id,
          passwordHash,
          authProvider: 'email',
        },
      });

      const managerMembership = await tx.tenantStaffMembership.create({
        data: {
          tenantId,
          userId: managerUser.id,
          employeeDisplayName: managerName,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      await tx.branchStaffAssignment.create({
        data: {
          tenantId,
          branchId: branch.id,
          staffMembershipId: managerMembership.id,
          status: 'ACTIVE',
        },
      });

      const managerRole = await tx.restaurantRole.findUnique({
        where: { code: 'MANAGER' },
      });
      if (!managerRole) {
        throw new UnprocessableEntityException('MANAGER role is not seeded.');
      }
      await tx.staffRoleAssignment.create({
        data: {
          tenantId,
          branchId: branch.id,
          staffMembershipId: managerMembership.id,
          roleId: managerRole.id,
          status: 'ACTIVE',
          grantedByMembershipId: context.staffMembershipId,
        },
      });

      await tx.auditEvent.create({
        data: {
          tenantId,
          branchId: branch.id,
          actorUserId: context.userId,
          actorStaffMembershipId: context.staffMembershipId,
          actorRestaurantRole: context.roleCode,
          entityType: 'BRANCH',
          entityId: branch.id,
          action: 'CREATE_BRANCH',
          newStateJson: {
            name,
            displayCode,
            managerMembershipId: managerMembership.id,
            copyFromBranchId: dto.copyFromBranchId ?? null,
          },
        },
      });

      return branch.id;
    });

    const full = await this.loadBranch(created, tenantId);
    return { data: full };
  }

  async updateBranch(
    userId: string,
    branchId: string,
    dto: UpdateBranchDto,
  ): Promise<BranchResponseDto> {
    const context = await this.identity.getByUserId(userId);
    const tenantId = await this.resolveTenantIdForWrite(context, dto.tenantId);

    const existing = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Branch not found.');
    }

    if (dto.displayCode?.trim()) {
      const clash = await this.prisma.branch.findFirst({
        where: {
          tenantId,
          displayCode: dto.displayCode.trim(),
          NOT: { id: branchId },
        },
      });
      if (clash) {
        throw new ConflictException({
          status: 409,
          errors: { displayCode: 'already_exists' },
          message: 'Branch code already exists for this restaurant.',
        });
      }
    }

    await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
        ...(dto.displayCode !== undefined
          ? { displayCode: dto.displayCode?.trim() || null }
          : {}),
        ...(dto.status
          ? {
              status: dto.status,
              archivedAt: dto.status === 'ARCHIVED' ? new Date() : null,
            }
          : {}),
        ...(dto.serviceMode ? { serviceMode: dto.serviceMode } : {}),
        version: { increment: 1 },
      },
    });

    if (dto.serviceMode === 'BAKERY') {
      await this.ensureBakeryCounter(tenantId, branchId);
    }

    const full = await this.loadBranch(branchId, tenantId);
    return { data: full };
  }

  async switchBranch(
    userId: string,
    branchId: string,
  ): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant on this account.');
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        tenantId: context.tenantId,
        status: 'ACTIVE',
        archivedAt: null,
      },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const canAccess = await this.canAccessBranch(context, branchId);
    if (!canAccess) {
      throw new ForbiddenException('You are not assigned to this branch.');
    }

    await this.prisma.appUser.update({
      where: { id: userId },
      data: { preferredBranchId: branchId },
    });

    return this.identity.getByUserId(userId);
  }

  private async canAccessBranch(
    context: AuthContextDto,
    branchId: string,
  ): Promise<boolean> {
    if (context.roleCode === PLATFORM_ROLE_CODE) return true;
    if (context.roleCode === 'OWNER_ADMIN') return true;

    if (!context.staffMembershipId) return false;
    const assignment = await this.prisma.branchStaffAssignment.findFirst({
      where: {
        staffMembershipId: context.staffMembershipId,
        branchId,
        status: 'ACTIVE',
        releasedAt: null,
      },
    });
    return Boolean(assignment);
  }

  private async ensureBakeryCounter(tenantId: string, branchId: string) {
    const station = await this.prisma.preparationStation.findFirst({
      where: { branchId, code: 'COUNTER', status: 'ACTIVE' },
    });
    if (!station) {
      await this.prisma.preparationStation.create({
        data: {
          tenantId,
          branchId,
          name: 'Counter',
          code: 'COUNTER',
          status: 'ACTIVE',
          sortOrder: 0,
        },
      });
    }
    const table = await this.prisma.diningTable.findFirst({
      where: { branchId, status: { not: 'RETIRED' } },
    });
    if (table) return;
    const location = await this.prisma.tableLocation.create({
      data: {
        tenantId,
        branchId,
        name: 'Counter',
        code: 'COUNTER',
        status: 'ACTIVE',
        sortOrder: 0,
      },
    });
    await this.prisma.diningTable.create({
      data: {
        tenantId,
        branchId,
        locationId: location.id,
        displayName: 'Counter',
        displayNumber: 'C',
        status: 'AVAILABLE',
        sortOrder: 1,
      },
    });
  }

  private resolveTenantId(
    context: AuthContextDto,
    tenantIdQuery?: string,
  ): string {
    if (context.roleCode === PLATFORM_ROLE_CODE) {
      if (!tenantIdQuery) {
        throw new UnprocessableEntityException({
          status: 422,
          errors: { tenantId: 'required' },
          message: 'tenantId is required for platform staff.',
        });
      }
      return tenantIdQuery;
    }
    if (context.roleCode !== 'OWNER_ADMIN' && context.roleCode !== 'MANAGER') {
      throw new ForbiddenException('Branch list is for owners and managers.');
    }
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant on this account.');
    }
    if (tenantIdQuery && tenantIdQuery !== context.tenantId) {
      throw new ForbiddenException('Cannot list branches for another tenant.');
    }
    return context.tenantId;
  }

  private resolveTenantIdForWrite(
    context: AuthContextDto,
    tenantIdBody?: string,
  ): string {
    if (context.roleCode === PLATFORM_ROLE_CODE) {
      if (!tenantIdBody) {
        throw new UnprocessableEntityException({
          status: 422,
          errors: { tenantId: 'required' },
          message: 'tenantId is required for platform staff.',
        });
      }
      return tenantIdBody;
    }
    if (context.roleCode !== 'OWNER_ADMIN') {
      throw new ForbiddenException(
        'Only owners (or platform super-admin) can create or update branches.',
      );
    }
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant on this account.');
    }
    if (tenantIdBody && tenantIdBody !== context.tenantId) {
      throw new ForbiddenException('Cannot manage another tenant.');
    }
    return context.tenantId;
  }

  private async getBranchMaxCount(tenantId: string): Promise<number> {
    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: { tenantId, subscriptionStatus: 'ACTIVE' },
      include: {
        plan: {
          include: {
            entitlements: {
              where: { entitlementKey: BRANCH_MAX_KEY },
            },
          },
        },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    const raw = subscription?.plan.entitlements[0]?.valueJson as unknown;
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

  private async loadBranch(
    branchId: string,
    tenantId: string,
  ): Promise<BranchDto> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
      include: {
        _count: {
          select: {
            diningTables: true,
            stations: true,
            staffAssignments: { where: { status: 'ACTIVE' } },
          },
        },
        roleAssignments: {
          where: { status: 'ACTIVE', role: { code: 'MANAGER' } },
          take: 1,
          include: {
            membership: { include: { user: true } },
          },
        },
      },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }
    return this.mapBranch(branch);
  }

  private mapBranch(branch: {
    id: string;
    tenantId: string;
    name: string;
    displayCode: string | null;
    timezone: string;
    serviceMode: string;
    status: string;
    createdAt: Date;
    _count: {
      diningTables: number;
      stations: number;
      staffAssignments: number;
    };
    roleAssignments: Array<{
      membership: {
        id: string;
        employeeDisplayName: string;
        user: { email: string | null; phone: string | null };
      };
    }>;
  }): BranchDto {
    const managerAssignment = branch.roleAssignments[0] ?? null;
    return {
      id: branch.id,
      tenantId: branch.tenantId,
      name: branch.name,
      displayCode: branch.displayCode,
      timezone: branch.timezone,
      serviceMode: branch.serviceMode || 'RESTAURANT',
      status: branch.status,
      createdAt: branch.createdAt.toISOString(),
      manager: managerAssignment
        ? {
            membershipId: managerAssignment.membership.id,
            name: managerAssignment.membership.employeeDisplayName,
            email: managerAssignment.membership.user.email,
            phone: managerAssignment.membership.user.phone,
          }
        : null,
      tableCount: branch._count.diningTables,
      stationCount: branch._count.stations,
      staffCount: branch._count.staffAssignments,
    };
  }
}
