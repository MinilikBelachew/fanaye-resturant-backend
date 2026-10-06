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
import {
  TableDetailResponseDto,
  TableKpiPeriodDto,
  TableVisitHistoryResponseDto,
} from './dto/table-detail.dto';
import { Prisma } from '@prisma/client';

const ADMIN_ROLES = ['MANAGER', 'OWNER_ADMIN'];
const ACTIVE_COOKING = ['QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION'];
const READY_STATES = ['READY'];

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

    const displayNumber = dto.displayNumber.trim();
    if (!displayNumber) {
      throw new UnprocessableEntityException('Table number is required.');
    }
    await this.assertUniqueTableNumber(context.branchId!, displayNumber);

    const displayName = dto.displayName?.trim() || `Table ${displayNumber}`;

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
        displayName,
        displayNumber,
        assignedWaiterMembershipId: dto.assignedWaiterMembershipId ?? null,
        status: 'AVAILABLE',
        sortOrder,
      },
      include: {
        location: true,
        assignedWaiter: true,
      },
    });

    if (dto.assignedWaiterMembershipId) {
      await this.syncPermanentAssignmentToShifts(
        context,
        created.id,
        dto.assignedWaiterMembershipId,
      );
    }

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

    let nextNumber = existing.displayNumber;
    if (dto.displayNumber !== undefined) {
      const trimmed = dto.displayNumber.trim();
      if (!trimmed) {
        throw new UnprocessableEntityException('Table number is required.');
      }
      if (trimmed !== existing.displayNumber) {
        await this.assertUniqueTableNumber(
          context.branchId!,
          trimmed,
          existing.id,
        );
      }
      nextNumber = trimmed;
    }

    const updated = await this.prisma.diningTable.update({
      where: { id: existing.id },
      data: {
        ...(dto.locationId !== undefined ? { locationId: dto.locationId } : {}),
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.displayNumber !== undefined
          ? { displayNumber: nextNumber }
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

    if (dto.assignedWaiterMembershipId !== undefined) {
      await this.syncPermanentAssignmentToShifts(
        context,
        updated.id,
        dto.assignedWaiterMembershipId,
      );
    }

    return { data: this.toTableDto(updated) };
  }

  async getTableDetail(
    userId: string,
    tableId: string,
  ): Promise<TableDetailResponseDto> {
    const context = await this.requireAdmin(userId);
    const table = await this.prisma.diningTable.findFirst({
      where: {
        id: tableId,
        branchId: context.branchId!,
        archivedAt: null,
      },
      include: {
        location: true,
        assignedWaiter: true,
      },
    });
    if (!table) {
      throw new NotFoundException('Table not found.');
    }

    const site = await this.prisma.tenantSite.findUnique({
      where: { tenantId: context.tenantId! },
      select: { slug: true },
    });
    const slug = site?.slug ?? 'restaurant';

    const openSession = await this.prisma.tableSession.findFirst({
      where: {
        tableId: table.id,
        closedAt: null,
        status: { not: 'CLOSED' },
      },
      include: {
        primaryWaiter: { select: { employeeDisplayName: true } },
        bill: {
          select: {
            billNumber: true,
            status: true,
            totalAmount: true,
            amountPaid: true,
            currencyCode: true,
          },
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    let live: TableDetailResponseDto['live'] = null;
    if (openSession) {
      const items = await this.prisma.orderItem.findMany({
        where: {
          tableSessionId: openSession.id,
          cancelledAt: null,
        },
        select: {
          state: true,
          queuedAt: true,
          expectedPrepMinutesSnapshot: true,
        },
      });
      const now = Date.now();
      let cookingItemCount = 0;
      let readyItemCount = 0;
      let delayedItemCount = 0;
      for (const item of items) {
        if (READY_STATES.includes(item.state)) readyItemCount += 1;
        if (ACTIVE_COOKING.includes(item.state)) {
          cookingItemCount += 1;
          const started = item.queuedAt?.getTime() ?? now;
          const thresholdMin = item.expectedPrepMinutesSnapshot ?? 15;
          if (now - started > thresholdMin * 60_000) delayedItemCount += 1;
        }
      }
      live = {
        tableSessionId: openSession.id,
        sessionStatus: openSession.status,
        guestCount: openSession.guestCount,
        openedAt: openSession.openedAt.toISOString(),
        waiterName: openSession.primaryWaiter.employeeDisplayName,
        waiterMembershipId: openSession.primaryWaiterMembershipId,
        cookingItemCount,
        readyItemCount,
        delayedItemCount,
        openItemCount: items.length,
        billTotal:
          openSession.bill != null
            ? Number(openSession.bill.totalAmount)
            : null,
        amountPaid:
          openSession.bill != null ? Number(openSession.bill.amountPaid) : null,
        billStatus: openSession.bill?.status ?? null,
        billNumber: openSession.bill?.billNumber ?? null,
      };
    }

    const [kpisToday, kpisWeek] = await Promise.all([
      this.computeTableKpis(context.branchId!, table.id, 'today'),
      this.computeTableKpis(context.branchId!, table.id, 'week'),
    ]);

    return {
      id: table.id,
      displayName: table.displayName,
      displayNumber: table.displayNumber,
      locationId: table.locationId,
      locationName: table.location.name,
      status: table.status,
      tableStatus: openSession ? 'OCCUPIED' : table.status || 'AVAILABLE',
      assignedWaiterMembershipId: table.assignedWaiterMembershipId,
      assignedWaiterName: table.assignedWaiter?.employeeDisplayName ?? null,
      qrRelativeUrl: `/r/${slug}/t/${table.id}`,
      qrSlug: slug,
      live,
      kpisToday,
      kpisWeek,
      version: table.version,
    };
  }

  async listTableVisits(
    userId: string,
    tableId: string,
    opts?: {
      q?: string;
      period?: string;
      fromDate?: string;
      toDate?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<TableVisitHistoryResponseDto> {
    const context = await this.requireAdmin(userId);
    const table = await this.prisma.diningTable.findFirst({
      where: {
        id: tableId,
        branchId: context.branchId!,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!table) {
      throw new NotFoundException('Table not found.');
    }

    const { period, rangeStart, rangeEnd, periodLabel } = resolveTableRange(
      opts?.period,
      opts?.fromDate,
      opts?.toDate,
    );

    const page = Math.max(1, Number(opts?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 20));
    const skip = (page - 1) * limit;
    const q = opts?.q?.trim();

    const where: Prisma.TableSessionWhereInput = {
      branchId: context.branchId!,
      tableId,
      closedAt: { not: null },
      businessDate: { gte: rangeStart, lte: rangeEnd },
      ...(q
        ? {
            OR: [
              {
                primaryWaiter: {
                  employeeDisplayName: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
              },
              {
                bill: {
                  billNumber: { contains: q, mode: 'insensitive' },
                },
              },
              {
                status: { contains: q, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.tableSession.count({ where }),
      this.prisma.tableSession.findMany({
        where,
        orderBy: [{ closedAt: 'desc' }, { openedAt: 'desc' }],
        skip,
        take: limit,
        include: {
          primaryWaiter: { select: { employeeDisplayName: true } },
          bill: {
            select: {
              billNumber: true,
              status: true,
              totalAmount: true,
              amountPaid: true,
              currencyCode: true,
            },
          },
          _count: {
            select: { orders: true, orderItems: true },
          },
        },
      }),
    ]);

    return {
      tableId,
      period,
      periodLabel,
      data: rows.map((row) => {
        const revenue = row.bill ? Number(row.bill.totalAmount) : 0;
        const amountPaid = row.bill ? Number(row.bill.amountPaid) : 0;
        let durationMinutes: number | null = null;
        if (row.closedAt) {
          durationMinutes = Math.max(
            0,
            Math.round(
              (row.closedAt.getTime() - row.openedAt.getTime()) / 60000,
            ),
          );
        }
        return {
          tableSessionId: row.id,
          status: row.status,
          businessDate: localYmd(row.businessDate),
          openedAt: row.openedAt.toISOString(),
          closedAt: row.closedAt?.toISOString() ?? null,
          guestCount: row.guestCount,
          waiterName: row.primaryWaiter.employeeDisplayName,
          billNumber: row.bill?.billNumber ?? null,
          billStatus: row.bill?.status ?? null,
          revenue,
          amountPaid,
          currencyCode: row.bill?.currencyCode ?? 'ETB',
          orderCount: row._count.orders,
          itemCount: row._count.orderItems,
          durationMinutes,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private async computeTableKpis(
    branchId: string,
    tableId: string,
    period: 'today' | 'week',
  ): Promise<TableKpiPeriodDto> {
    const { rangeStart, rangeEnd, periodLabel } = resolveTableRange(period);
    const sessions = await this.prisma.tableSession.findMany({
      where: {
        branchId,
        tableId,
        closedAt: { not: null },
        businessDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        guestCount: true,
        bill: {
          select: {
            totalAmount: true,
            amountPaid: true,
          },
        },
      },
    });

    const turns = sessions.length;
    let revenue = 0;
    let covers = 0;
    for (const s of sessions) {
      covers += s.guestCount ?? 0;
      if (s.bill) {
        const paid = Number(s.bill.amountPaid);
        const total = Number(s.bill.totalAmount);
        revenue += paid > 0 ? paid : total;
      }
    }
    revenue = roundMoney(revenue);
    const avgTicket = turns > 0 ? roundMoney(revenue / turns) : 0;

    return {
      period,
      periodLabel,
      turns,
      revenue,
      avgTicket,
      covers,
      currencyCode: 'ETB',
    };
  }

  async deleteTable(
    userId: string,
    tableId: string,
  ): Promise<{ success: boolean; message: string }> {
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

    const openSession = await this.prisma.tableSession.findFirst({
      where: {
        tableId: existing.id,
        status: { not: 'CLOSED' },
        closedAt: null,
      },
    });
    if (openSession) {
      throw new ConflictException({
        status: 409,
        code: 'TABLE_HAS_OPEN_SESSION',
        message: 'Close the open table session before deleting this table.',
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.diningTableShiftCoverage.deleteMany({
        where: { diningTableId: existing.id },
      });
      await tx.diningTable.update({
        where: { id: existing.id },
        data: {
          archivedAt: now,
          status: 'INACTIVE',
          assignedWaiterMembershipId: null,
          version: { increment: 1 },
        },
      });
    });

    return {
      success: true,
      message: `"${existing.displayName}" removed from the floor.`,
    };
  }

  async deleteLocation(
    userId: string,
    locationId: string,
  ): Promise<{ success: boolean; message: string }> {
    const context = await this.requireAdmin(userId);
    const existing = await this.prisma.tableLocation.findFirst({
      where: {
        id: locationId,
        branchId: context.branchId!,
        archivedAt: null,
      },
      include: {
        tables: {
          where: { archivedAt: null },
          select: { id: true, displayName: true },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Place not found.');
    }

    const tableIds = existing.tables.map((t) => t.id);
    if (tableIds.length > 0) {
      const openSession = await this.prisma.tableSession.findFirst({
        where: {
          tableId: { in: tableIds },
          status: { not: 'CLOSED' },
          closedAt: null,
        },
      });
      if (openSession) {
        throw new ConflictException({
          status: 409,
          code: 'PLACE_HAS_OPEN_SESSION',
          message:
            'Close all open table sessions in this place before deleting it.',
        });
      }
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (tableIds.length > 0) {
        await tx.diningTableShiftCoverage.deleteMany({
          where: { diningTableId: { in: tableIds } },
        });
        await tx.diningTable.updateMany({
          where: { id: { in: tableIds } },
          data: {
            archivedAt: now,
            status: 'INACTIVE',
            assignedWaiterMembershipId: null,
          },
        });
      }
      await tx.tableLocation.update({
        where: { id: existing.id },
        data: {
          archivedAt: now,
          status: 'INACTIVE',
        },
      });
    });

    const tableCount = existing.tables.length;
    return {
      success: true,
      message:
        tableCount > 0
          ? `"${existing.name}" and ${tableCount} table${tableCount === 1 ? '' : 's'} removed.`
          : `"${existing.name}" removed.`,
    };
  }

  /** Keep shift coverage in sync when manager assigns a permanent waiter. */
  private async syncPermanentAssignmentToShifts(
    context: AuthContextDto,
    diningTableId: string,
    waiterMembershipId: string | null,
  ) {
    const shifts = await this.prisma.shiftDefinition.findMany({
      where: { branchId: context.branchId!, status: 'ACTIVE' },
      select: { id: true },
    });
    if (shifts.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.diningTableShiftCoverage.deleteMany({
        where: {
          branchId: context.branchId!,
          diningTableId,
        },
      });
      if (!waiterMembershipId) return;
      await tx.diningTableShiftCoverage.createMany({
        data: shifts.map((shift) => ({
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          diningTableId,
          shiftDefinitionId: shift.id,
          waiterMembershipId,
        })),
      });
    });
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

  private async assertUniqueTableNumber(
    branchId: string,
    displayNumber: string,
    excludeTableId?: string,
  ) {
    const clash = await this.prisma.diningTable.findFirst({
      where: {
        branchId,
        archivedAt: null,
        displayNumber,
        ...(excludeTableId ? { id: { not: excludeTableId } } : {}),
      },
      select: { id: true, displayName: true },
    });
    if (clash) {
      throw new ConflictException(
        `Table number "${displayNumber}" is already used by ${clash.displayName}.`,
      );
    }
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

function startOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseBusinessDate(raw?: string): Date {
  if (!raw) return startOfLocalDay();
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return startOfLocalDay();
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addLocalDays(date: Date, days: number): Date {
  const d = startOfLocalDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function resolveTableRange(
  periodRaw?: string,
  fromRaw?: string,
  toRaw?: string,
): {
  period: string;
  rangeStart: Date;
  rangeEnd: Date;
  periodLabel: string;
} {
  const today = startOfLocalDay();
  const period = (periodRaw || 'today').toLowerCase();

  if (period === 'custom' && fromRaw && toRaw) {
    const from = parseBusinessDate(fromRaw);
    const to = parseBusinessDate(toRaw);
    const rangeStart = from <= to ? from : to;
    const rangeEnd = from <= to ? to : from;
    return {
      period: 'custom',
      rangeStart,
      rangeEnd,
      periodLabel: `${localYmd(rangeStart)} → ${localYmd(rangeEnd)}`,
    };
  }

  if (period === 'week') {
    return {
      period: 'week',
      rangeStart: addLocalDays(today, -6),
      rangeEnd: today,
      periodLabel: 'Last 7 days',
    };
  }

  if (period === 'month') {
    return {
      period: 'month',
      rangeStart: addLocalDays(today, -29),
      rangeEnd: today,
      periodLabel: 'Last 30 days',
    };
  }

  return {
    period: 'today',
    rangeStart: today,
    rangeEnd: today,
    periodLabel: 'Today',
  };
}
