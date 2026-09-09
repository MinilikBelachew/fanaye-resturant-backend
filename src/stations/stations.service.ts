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
