import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { ExpectedVersionDto } from './dto/expected-version.dto';
import { ReportCannotPrepareDto } from './dto/report-cannot-prepare.dto';
import {
  StationQueueItemDto,
  StationQueueResponseDto,
} from './dto/station-queue-response.dto';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { StationManagementResponseDto } from './dto/station-response.dto';

const DEFAULT_STATES = [
  'QUEUED',
  'ACKNOWLEDGED',
  'IN_PREPARATION',
  'READY',
  'CANNOT_PREPARE',
];

const ACTIVE_COOKING = ['QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION'];

@Injectable()
export class StationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async listStations(userId: string): Promise<StationManagementResponseDto[]> {
    const context = await this.requireBranch(userId);
    const stations = await this.prisma.preparationStation.findMany({
      where: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const activeCounts = await this.prisma.orderItem.groupBy({
      by: ['currentPreparationStationId'],
      where: {
        branchId: context.branchId!,
        state: { in: ACTIVE_COOKING },
        cancelledAt: null,
      },
      _count: {
        _all: true,
      },
    });

    const countMap = new Map<string, number>();
    for (const c of activeCounts) {
      countMap.set(c.currentPreparationStationId, c._count._all);
    }

    return stations.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      status: s.status,
      enabled: s.status === 'ACTIVE',
      defaultDelayThresholdMinutes: s.defaultDelayThresholdMinutes,
      avgPrepMin: s.defaultDelayThresholdMinutes ?? 10,
      sortOrder: s.sortOrder,
      ticketCount: countMap.get(s.id) ?? 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async createStation(
    userId: string,
    dto: CreateStationDto,
  ): Promise<StationManagementResponseDto> {
    const context = await this.requireManager(userId);

    const baseCode = dto.code?.trim() || slugify(dto.name);
    let code = baseCode || 'station';

    const existingWithCode = await this.prisma.preparationStation.findFirst({
      where: { branchId: context.branchId!, code },
    });
    if (existingWithCode) {
      code = `${baseCode}-${Date.now().toString(36).slice(-4)}`;
    }

    const status =
      dto.status?.toUpperCase() === 'INACTIVE' ||
      dto.status?.toUpperCase() === 'DISABLED'
        ? 'INACTIVE'
        : 'ACTIVE';

    const station = await this.prisma.preparationStation.create({
      data: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        name: dto.name.trim(),
        code,
        status,
        defaultDelayThresholdMinutes: dto.defaultDelayThresholdMinutes ?? 10,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return {
      id: station.id,
      name: station.name,
      code: station.code,
      status: station.status,
      enabled: station.status === 'ACTIVE',
      defaultDelayThresholdMinutes: station.defaultDelayThresholdMinutes,
      avgPrepMin: station.defaultDelayThresholdMinutes ?? 10,
      sortOrder: station.sortOrder,
      ticketCount: 0,
      createdAt: station.createdAt,
      updatedAt: station.updatedAt,
    };
  }

  async updateStation(
    userId: string,
    stationId: string,
    dto: UpdateStationDto,
  ): Promise<StationManagementResponseDto> {
    const context = await this.requireManager(userId);

    const existing = await this.prisma.preparationStation.findFirst({
      where: { id: stationId, branchId: context.branchId! },
    });
    if (!existing) {
      throw new NotFoundException('Station not found.');
    }

    let code = existing.code;
    if (dto.code && dto.code !== existing.code) {
      const codeConflict = await this.prisma.preparationStation.findFirst({
        where: {
          branchId: context.branchId!,
          code: dto.code,
          id: { not: stationId },
        },
      });
      if (codeConflict) {
        throw new ConflictException('A station with this code already exists.');
      }
      code = dto.code;
    }

    let status = existing.status;
    if (dto.status !== undefined) {
      status =
        dto.status.toUpperCase() === 'INACTIVE' ||
        dto.status.toUpperCase() === 'DISABLED'
          ? 'INACTIVE'
          : 'ACTIVE';
    }

    const updated = await this.prisma.preparationStation.update({
      where: { id: stationId },
      data: {
        name: dto.name?.trim() ?? existing.name,
        code,
        status,
        defaultDelayThresholdMinutes:
          dto.defaultDelayThresholdMinutes !== undefined
            ? dto.defaultDelayThresholdMinutes
            : existing.defaultDelayThresholdMinutes,
        sortOrder:
          dto.sortOrder !== undefined ? dto.sortOrder : existing.sortOrder,
      },
    });

    const activeCount = await this.prisma.orderItem.count({
      where: {
        branchId: context.branchId!,
        currentPreparationStationId: stationId,
        state: { in: ACTIVE_COOKING },
        cancelledAt: null,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      code: updated.code,
      status: updated.status,
      enabled: updated.status === 'ACTIVE',
      defaultDelayThresholdMinutes: updated.defaultDelayThresholdMinutes,
      avgPrepMin: updated.defaultDelayThresholdMinutes ?? 10,
      sortOrder: updated.sortOrder,
      ticketCount: activeCount,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteStation(
    userId: string,
    stationId: string,
  ): Promise<{ success: boolean; message: string }> {
    const context = await this.requireManager(userId);

    const existing = await this.prisma.preparationStation.findFirst({
      where: { id: stationId, branchId: context.branchId! },
      include: {
        _count: {
          select: {
            currentOrderItems: true,
            menuItems: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Station not found.');
    }

    if (
      existing._count.currentOrderItems > 0 ||
      existing._count.menuItems > 0
    ) {
      await this.prisma.preparationStation.update({
        where: { id: stationId },
        data: { status: 'INACTIVE' },
      });
      return {
        success: true,
        message:
          'Station has associated menu items or orders and was deactivated.',
      };
    }

    await this.prisma.preparationStation.delete({
      where: { id: stationId },
    });

    return {
      success: true,
      message: 'Station deleted successfully.',
    };
  }

  async listQueue(
    userId: string,
    stationId: string,
    stateQuery?: string,
  ): Promise<StationQueueResponseDto> {
    const { context, station } = await this.requireStation(userId, stationId);
    const states = parseStates(stateQuery);

    const items = await this.prisma.orderItem.findMany({
      where: {
        branchId: context.branchId!,
        currentPreparationStationId: station.id,
        cancelledAt: null,
        state: { in: states },
      },
      include: ticketInclude,
      orderBy: [{ queuedAt: 'asc' }, { confirmedAt: 'asc' }],
    });

    return {
      stationId: station.id,
      stationName: station.name,
      stationCode: station.code,
      data: items.map(toTicketDto),
    };
  }

  async getItem(
    userId: string,
    orderItemId: string,
  ): Promise<StationQueueItemDto> {
    const context = await this.requireBranch(userId);
    const item = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, branchId: context.branchId! },
      include: ticketInclude,
    });
    if (!item) {
      throw new NotFoundException('Order item not found.');
    }
    await this.requireStation(userId, item.currentPreparationStationId);
    return toTicketDto(item);
  }

  async acknowledge(
    userId: string,
    orderItemId: string,
    dto: ExpectedVersionDto,
  ): Promise<StationQueueItemDto> {
    return this.transition(userId, orderItemId, dto.expectedVersion, {
      from: ['QUEUED'],
      to: 'ACKNOWLEDGED',
      extra: { acknowledgedAt: new Date() },
    });
  }

  async startPreparation(
    userId: string,
    orderItemId: string,
    dto: ExpectedVersionDto,
  ): Promise<StationQueueItemDto> {
    return this.transition(userId, orderItemId, dto.expectedVersion, {
      from: ['QUEUED', 'ACKNOWLEDGED'],
      to: 'IN_PREPARATION',
      extra: { preparationStartedAt: new Date() },
    });
  }

  async markReady(
    userId: string,
    orderItemId: string,
    dto: ExpectedVersionDto,
  ): Promise<StationQueueItemDto> {
    return this.transition(userId, orderItemId, dto.expectedVersion, {
      from: ['IN_PREPARATION'],
      to: 'READY',
      extra: { readyAt: new Date() },
    });
  }

  async reportCannotPrepare(
    userId: string,
    orderItemId: string,
    dto: ReportCannotPrepareDto,
  ): Promise<StationQueueItemDto> {
    const loaded = await this.loadForMutation(
      userId,
      orderItemId,
      dto.expectedVersion,
    );
    if (!ACTIVE_COOKING.includes(loaded.item.state)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'INVALID_ITEM_STATE',
        errors: { state: loaded.item.state },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.productionException.create({
        data: {
          tenantId: loaded.context.tenantId!,
          branchId: loaded.context.branchId!,
          orderItemId: loaded.item.id,
          stationId: loaded.item.currentPreparationStationId,
          reportedByMembershipId: loaded.context.staffMembershipId!,
          reasonCode: dto.reasonCode?.trim() || 'CANNOT_PREPARE',
          reasonDetail: dto.reasonDetail?.trim() || 'Cannot prepare',
          status: 'OPEN',
        },
      });
      return tx.orderItem.update({
        where: { id: loaded.item.id },
        data: {
          state: 'CANNOT_PREPARE',
          version: { increment: 1 },
        },
        include: ticketInclude,
      });
    });
    return toTicketDto(updated);
  }

  private async transition(
    userId: string,
    orderItemId: string,
    expectedVersion: number,
    spec: {
      from: string[];
      to: string;
      extra: Prisma.OrderItemUpdateInput;
    },
  ): Promise<StationQueueItemDto> {
    const loaded = await this.loadForMutation(
      userId,
      orderItemId,
      expectedVersion,
    );
    if (!spec.from.includes(loaded.item.state)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'INVALID_ITEM_STATE',
        errors: { state: loaded.item.state },
      });
    }
    const updated = await this.prisma.orderItem.update({
      where: { id: loaded.item.id },
      data: {
        ...spec.extra,
        state: spec.to,
        version: { increment: 1 },
      },
      include: ticketInclude,
    });
    return toTicketDto(updated);
  }

  private async loadForMutation(
    userId: string,
    orderItemId: string,
    expectedVersion: number,
  ) {
    const context = await this.requireBranch(userId);
    if (!context.staffMembershipId) {
      throw new ForbiddenException(
        'No restaurant membership for this account.',
      );
    }
    const item = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, branchId: context.branchId! },
      include: ticketInclude,
    });
    if (!item) {
      throw new NotFoundException('Order item not found.');
    }
    await this.requireStation(userId, item.currentPreparationStationId);
    if (item.version !== expectedVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: item.version,
      });
    }
    return { context, item };
  }

  private async requireBranch(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    return context;
  }

  private async requireStation(userId: string, stationId: string) {
    const context = await this.requireBranch(userId);
    const station = await this.prisma.preparationStation.findFirst({
      where: {
        id: stationId,
        branchId: context.branchId!,
        status: 'ACTIVE',
      },
    });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }
    if (context.roleCode === 'STATION_OPERATOR') {
      if (context.stationId !== station.id) {
        throw new ForbiddenException('This is not your station.');
      }
    } else if (
      context.roleCode !== 'MANAGER' &&
      context.roleCode !== 'OWNER_ADMIN'
    ) {
      throw new ForbiddenException('Station queue is for station staff.');
    }
    return { context, station };
  }

  private async requireManager(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (context.roleCode !== 'MANAGER' && context.roleCode !== 'OWNER_ADMIN') {
      throw new ForbiddenException(
        'Station management is for managers and admins.',
      );
    }
    return context;
  }
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

const ticketInclude = {
  tableSession: {
    include: {
      table: true,
      primaryWaiter: true,
    },
  },
  modifiers: { orderBy: { sortOrder: 'asc' as const } },
  productionExceptions: {
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.OrderItemInclude;

type TicketRecord = Prisma.OrderItemGetPayload<{
  include: typeof ticketInclude;
}>;

function parseStates(raw?: string): string[] {
  if (!raw?.trim()) return DEFAULT_STATES;
  const states = raw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  return states.length > 0 ? states : DEFAULT_STATES;
}

function money(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function toTicketDto(item: TicketRecord): StationQueueItemDto {
  const queuedAt = item.queuedAt ?? item.confirmedAt;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - queuedAt.getTime()) / 1000),
  );
  const expectedPrepMinutes = item.expectedPrepMinutesSnapshot ?? 0;
  const delayed =
    ACTIVE_COOKING.includes(item.state) &&
    expectedPrepMinutes > 0 &&
    elapsedSeconds > expectedPrepMinutes * 60;
  const exception = item.productionExceptions[0];
  const table = item.tableSession.table;

  return {
    orderItemId: item.id,
    tableSessionId: item.tableSessionId,
    tableDisplayName:
      table.displayNumber ?? table.displayName.replace(/^Table\s+/i, ''),
    itemName: item.itemNameSnapshot,
    quantity: item.quantity,
    unitPrice: money(item.unitPriceSnapshot),
    currencyCode: item.currencyCode,
    modifiers: item.modifiers.map((entry) => ({
      name: entry.optionNameSnapshot,
      priceDelta: money(entry.priceDeltaSnapshot),
    })),
    specialInstruction: item.specialInstruction,
    waiter: {
      membershipId: item.tableSession.primaryWaiterMembershipId,
      displayName: item.tableSession.primaryWaiter.employeeDisplayName,
    },
    state: item.state,
    queuedAt,
    expectedPrepMinutes,
    elapsedSeconds,
    delayed,
    version: item.version,
    exceptionReason: exception?.reasonDetail ?? exception?.reasonCode ?? null,
  };
}
