import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { StartTableSessionDto } from './dto/start-table-session.dto';
import { CloseTableSessionDto } from './dto/close-table-session.dto';
import {
  FloorTableDto,
  FloorTablesResponseDto,
} from './dto/floor-tables-response.dto';
import { TableSessionResponseDto } from './dto/table-session-response.dto';

const OPEN_SESSION = {
  closedAt: null,
  status: { not: 'CLOSED' },
} as const;

const COOKING_STATES = ['QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION'];
const READY_STATE = 'READY';
const START_COMMAND = 'table_session.start';
const CLOSE_COMMAND = 'table_session.close';

@Injectable()
export class FloorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async listFloor(userId: string): Promise<FloorTablesResponseDto> {
    const context = await this.requireBranch(userId);
    return this.loadFloor(context);
  }

  async listWaiterTables(
    userId: string,
    view: string = 'all',
  ): Promise<FloorTablesResponseDto> {
    const context = await this.requireBranch(userId);
    if (context.roleCode !== 'WAITER') {
      throw new ForbiddenException('Waiter tables are for waiters only.');
    }
    const floor = await this.loadFloor(context);
    const shiftDefinitionId = await this.resolveActiveShiftDefinitionId(context);
    const coveredTableIds = await this.coveredTableIdsForWaiter(
      context,
      shiftDefinitionId,
    );

    const filtered = floor.data.filter((table) => {
      const assignedToMe =
        coveredTableIds.has(table.tableId) ||
        (!coveredTableIds.size &&
          table.assignedWaiterMembershipId === context.staffMembershipId);
      if (!assignedToMe && !table.mine) return false;
      if (view === 'available') return !table.tableSessionId;
      if (view === 'my') return table.mine;
      if (view === 'attention') {
        return (
          table.sessionStatus === 'ATTENTION_REQUIRED' ||
          table.sessionStatus === 'BILL_REQUESTED' ||
          table.delayedItemCount > 0 ||
          table.readyItemCount > 0
        );
      }
      return true;
    });
    return { locations: floor.locations, data: filtered };
  }

  async startSession(
    userId: string,
    dto: StartTableSessionDto,
    idempotencyKey?: string,
  ): Promise<TableSessionResponseDto> {
    const context = await this.requireWaiterOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);

    const existing = await this.findIdempotent(context, START_COMMAND, key, dto);
    if (existing) {
      return existing as unknown as TableSessionResponseDto;
    }

    const table = await this.prisma.diningTable.findFirst({
      where: {
        id: dto.tableId,
        branchId: context.branchId!,
        archivedAt: null,
      },
      include: { location: true },
    });
    if (!table) {
      throw new NotFoundException('Table not found.');
    }

    if (
      !(await this.canWaiterOpenTable(context, table.id, table.assignedWaiterMembershipId))
    ) {
      throw new ForbiddenException({
        status: 403,
        code: 'TABLE_NOT_ASSIGNED',
        errors: { table: 'TABLE_NOT_ASSIGNED' },
      });
    }

    const open = await this.prisma.tableSession.findFirst({
      where: { tableId: table.id, ...OPEN_SESSION },
    });
    if (open || table.status === 'OCCUPIED') {
      throw new ConflictException({
        status: 409,
        code: 'TABLE_NOT_AVAILABLE',
        errors: { table: 'TABLE_NOT_AVAILABLE' },
      });
    }

    const now = new Date();
    const businessDate = new Date(now);
    businessDate.setHours(0, 0, 0, 0);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const session = await tx.tableSession.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            tableId: table.id,
            businessDate,
            primaryWaiterMembershipId: context.staffMembershipId!,
            primaryWaiterShiftSessionId: context.shiftSessionId!,
            guestCount: dto.guestCount ?? null,
            status: 'OPEN',
            openedAt: now,
          },
          include: {
            table: { include: { location: true } },
            primaryWaiter: true,
          },
        });

        await tx.tableAssignment.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            tableSessionId: session.id,
            waiterMembershipId: context.staffMembershipId!,
            shiftSessionId: context.shiftSessionId!,
            assignedByMembershipId: context.staffMembershipId!,
            reason: 'Opened table',
          },
        });

        await tx.diningTable.update({
          where: { id: table.id },
          data: { status: 'OCCUPIED', version: { increment: 1 } },
        });

        const payload = this.toSessionDto(session, context.staffMembershipId!);
        await this.storeIdempotent(
          tx,
          context,
          START_COMMAND,
          key,
          dto,
          payload,
        );
        return payload;
      });

      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          status: 409,
          code: 'TABLE_NOT_AVAILABLE',
          errors: { table: 'TABLE_NOT_AVAILABLE' },
        });
      }
      throw error;
    }
  }

  async getSession(
    userId: string,
    tableSessionId: string,
  ): Promise<TableSessionResponseDto> {
    const context = await this.requireBranch(userId);
    const session = await this.prisma.tableSession.findFirst({
      where: {
        id: tableSessionId,
        branchId: context.branchId!,
      },
      include: {
        table: { include: { location: true } },
        primaryWaiter: true,
      },
    });
    if (!session) {
      throw new NotFoundException('Table session not found.');
    }
    return this.toSessionDto(session, context.staffMembershipId);
  }

  async closeSession(
    userId: string,
    tableSessionId: string,
    dto: CloseTableSessionDto,
    idempotencyKey?: string,
  ): Promise<TableSessionResponseDto> {
    const context = await this.requireBranch(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);

    const existing = await this.findIdempotent(
      context,
      CLOSE_COMMAND,
      key,
      { tableSessionId, ...dto },
    );
    if (existing) {
      return existing as unknown as TableSessionResponseDto;
    }

    const session = await this.prisma.tableSession.findFirst({
      where: {
        id: tableSessionId,
        branchId: context.branchId!,
      },
      include: {
        table: { include: { location: true } },
        primaryWaiter: true,
        orders: { select: { id: true } },
      },
    });
    if (!session) {
      throw new NotFoundException('Table session not found.');
    }

    const canClose =
      session.primaryWaiterMembershipId === context.staffMembershipId ||
      context.roleCode === 'MANAGER' ||
      context.roleCode === 'OWNER_ADMIN';
    if (!canClose) {
      throw new ForbiddenException('You cannot close this table.');
    }

    if (session.status === 'CLOSED' || session.closedAt) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { session: 'alreadyClosed' },
      });
    }

    if (session.version !== dto.expectedVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: session.version,
      });
    }

    const unpaidBusy =
      session.orders.length > 0 &&
      session.status !== 'PAID' &&
      session.status !== 'OPEN';
    const unpaidOpenWithOrders =
      session.orders.length > 0 && session.status === 'OPEN';
    if (unpaidBusy || unpaidOpenWithOrders) {
      throw new ConflictException({
        status: 409,
        code: 'TABLE_CLOSE_BLOCKED',
        errors: { session: 'TABLE_CLOSE_BLOCKED' },
      });
    }

    const closed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tableSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedByMembershipId: context.staffMembershipId,
          version: { increment: 1 },
        },
        include: {
          table: { include: { location: true } },
          primaryWaiter: true,
        },
      });
      await tx.diningTable.update({
        where: { id: session.tableId },
        data: { status: 'AVAILABLE', version: { increment: 1 } },
      });
      await tx.tableAssignment.updateMany({
        where: { tableSessionId: session.id, releasedAt: null },
        data: { releasedAt: new Date() },
      });
      if (session.status === 'PAID') {
        await tx.bill.updateMany({
          where: {
            tableSessionId: session.id,
            status: 'PAID',
          },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            closedByMembershipId: context.staffMembershipId,
            version: { increment: 1 },
          },
        });
      }
      const payload = this.toSessionDto(updated, context.staffMembershipId);
      await this.storeIdempotent(
        tx,
        context,
        CLOSE_COMMAND,
        key,
        { tableSessionId, ...dto },
        payload,
      );
      return payload;
    });

    return closed;
  }

  private async loadFloor(
    context: AuthContextDto,
  ): Promise<FloorTablesResponseDto> {
    const locations = await this.prisma.tableLocation.findMany({
      where: {
        branchId: context.branchId!,
        status: 'ACTIVE',
        archivedAt: null,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const tables = await this.prisma.diningTable.findMany({
      where: {
        branchId: context.branchId!,
        archivedAt: null,
      },
      include: {
        location: true,
        assignedWaiter: true,
        sessions: {
          where: OPEN_SESSION,
          include: {
            primaryWaiter: true,
            orderItems: {
              select: { state: true },
            },
          },
          take: 1,
        },
      },
      orderBy: [{ location: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    const data: FloorTableDto[] = tables.map((table) => {
      const session = table.sessions[0] ?? null;
      const items = session?.orderItems ?? [];
      return {
        tableId: table.id,
        displayName: table.displayName,
        displayNumber: table.displayNumber,
        locationId: table.locationId,
        locationName: table.location.name,
        locationCode: table.location.code ?? '',
        tableStatus: table.status,
        tableSessionId: session?.id ?? null,
        sessionStatus: session?.status ?? null,
        visitStartedAt: session?.openedAt ?? null,
        guestCount: session?.guestCount ?? null,
        primaryWaiterMembershipId: session?.primaryWaiterMembershipId ?? null,
        waiterName: session?.primaryWaiter.employeeDisplayName ?? null,
        assignedWaiterMembershipId: table.assignedWaiterMembershipId ?? null,
        assignedWaiterName:
          table.assignedWaiter?.employeeDisplayName ?? null,
        mine: session?.primaryWaiterMembershipId === context.staffMembershipId,
        readyItemCount: items.filter((item) => item.state === READY_STATE)
          .length,
        cookingItemCount: items.filter((item) =>
          COOKING_STATES.includes(item.state),
        ).length,
        delayedItemCount: 0,
        version: session?.version ?? table.version,
      };
    });

    return {
      locations: locations.map((location) => ({
        id: location.id,
        code: location.code,
        name: location.name,
        sortOrder: location.sortOrder,
      })),
      data,
    };
  }

  private async canWaiterOpenTable(
    context: AuthContextDto,
    tableId: string,
    permanentWaiterMembershipId: string | null,
  ): Promise<boolean> {
    const shiftDefinitionId = await this.resolveActiveShiftDefinitionId(context);
    if (shiftDefinitionId) {
      const coverage = await this.prisma.diningTableShiftCoverage.findUnique({
        where: {
          diningTableId_shiftDefinitionId: {
            diningTableId: tableId,
            shiftDefinitionId,
          },
        },
      });
      if (coverage) {
        return coverage.waiterMembershipId === context.staffMembershipId;
      }
    }
    return (
      !!permanentWaiterMembershipId &&
      permanentWaiterMembershipId === context.staffMembershipId
    );
  }

  private async coveredTableIdsForWaiter(
    context: AuthContextDto,
    shiftDefinitionId: string | null,
  ): Promise<Set<string>> {
    if (!shiftDefinitionId || !context.staffMembershipId) {
      return new Set();
    }
    const rows = await this.prisma.diningTableShiftCoverage.findMany({
      where: {
        branchId: context.branchId!,
        shiftDefinitionId,
        waiterMembershipId: context.staffMembershipId,
      },
      select: { diningTableId: true },
    });
    return new Set(rows.map((row) => row.diningTableId));
  }

  private async resolveActiveShiftDefinitionId(
    context: AuthContextDto,
  ): Promise<string | null> {
    if (context.shiftSessionId) {
      const session = await this.prisma.shiftSession.findFirst({
        where: { id: context.shiftSessionId, branchId: context.branchId! },
        include: { assignment: true },
      });
      if (session?.assignment?.shiftDefinitionId) {
        return session.assignment.shiftDefinitionId;
      }
    }

    const definitions = await this.prisma.shiftDefinition.findMany({
      where: { branchId: context.branchId!, status: 'ACTIVE' },
      orderBy: { startLocalTime: 'asc' },
    });
    if (definitions.length === 0) return null;

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    for (const definition of definitions) {
      const start =
        definition.startLocalTime.getUTCHours() * 60 +
        definition.startLocalTime.getUTCMinutes();
      const end =
        definition.endLocalTime.getUTCHours() * 60 +
        definition.endLocalTime.getUTCMinutes();
      const inWindow =
        start <= end
          ? minutes >= start && minutes < end
          : minutes >= start || minutes < end;
      if (inWindow) return definition.id;
    }
    return definitions[0]?.id ?? null;
  }

  private async requireBranch(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    return context;
  }

  private async requireWaiterOnShift(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (context.roleCode !== 'WAITER') {
      throw new ForbiddenException('Only a waiter can take a table.');
    }
    if (!context.staffMembershipId || !context.shiftSessionId) {
      throw new ForbiddenException({
        status: 403,
        code: 'SHIFT_REQUIRED',
        errors: { shift: 'SHIFT_REQUIRED' },
      });
    }
    return context;
  }

  private requireIdempotencyKey(key?: string): string {
    if (!key?.trim()) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { idempotencyKey: 'required' },
      });
    }
    return key.trim();
  }

  private requestHash(body: unknown) {
    return createHash('sha256').update(JSON.stringify(body)).digest('hex');
  }

  private async findIdempotent(
    context: AuthContextDto,
    commandType: string,
    key: string,
    body: unknown,
  ) {
    const row = await this.prisma.idempotencyCommand.findUnique({
      where: {
        tenantId_actorUserId_commandType_idempotencyKey: {
          tenantId: context.tenantId!,
          actorUserId: context.userId,
          commandType,
          idempotencyKey: key,
        },
      },
    });
    if (!row) return null;
    if (row.requestHash !== this.requestHash(body)) {
      throw new ConflictException({
        status: 409,
        errors: { idempotencyKey: 'reuseMismatch' },
      });
    }
    return row.responseBodyJson;
  }

  private async storeIdempotent(
    db: Prisma.TransactionClient,
    context: AuthContextDto,
    commandType: string,
    key: string,
    body: unknown,
    response: TableSessionResponseDto,
  ) {
    await db.idempotencyCommand.upsert({
      where: {
        tenantId_actorUserId_commandType_idempotencyKey: {
          tenantId: context.tenantId!,
          actorUserId: context.userId,
          commandType,
          idempotencyKey: key,
        },
      },
      create: {
        tenantId: context.tenantId!,
        actorUserId: context.userId,
        actorStaffMembershipId: context.staffMembershipId,
        commandType,
        idempotencyKey: key,
        requestHash: this.requestHash(body),
        status: 'SUCCEEDED',
        resourceType: 'table_session',
        resourceId: response.tableSessionId,
        responseStatusCode: 200,
        responseBodyJson: JSON.parse(
          JSON.stringify(response),
        ) as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
      update: {
        status: 'SUCCEEDED',
        responseBodyJson: JSON.parse(
          JSON.stringify(response),
        ) as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }

  private toSessionDto(
    session: {
      id: string;
      tableId: string;
      status: string;
      primaryWaiterMembershipId: string;
      guestCount: number | null;
      openedAt: Date;
      closedAt: Date | null;
      businessDate: Date;
      version: number;
      table: {
        displayName: string;
        displayNumber: string | null;
        location: { name: string };
      };
      primaryWaiter: { employeeDisplayName: string };
    },
    membershipId: string | null,
  ): TableSessionResponseDto {
    return {
      tableSessionId: session.id,
      tableId: session.tableId,
      displayName: session.table.displayName,
      displayNumber: session.table.displayNumber,
      locationName: session.table.location.name,
      status: session.status,
      primaryWaiterMembershipId: session.primaryWaiterMembershipId,
      waiterName: session.primaryWaiter.employeeDisplayName,
      guestCount: session.guestCount,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      businessDate: session.businessDate.toISOString().slice(0, 10),
      version: session.version,
      mine: session.primaryWaiterMembershipId === membershipId,
    };
  }
}
