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
import { OpsEventType } from '../realtime/ops-events';
import { OpsNotifyService } from '../realtime/ops-notify.service';
import { managerRoom, stationRoom } from '../realtime/ops-rooms';
import { ExpectedVersionDto } from './dto/expected-version.dto';
import { ReportCannotPrepareDto } from './dto/report-cannot-prepare.dto';
import {
  StationQueueItemDto,
  StationQueueResponseDto,
} from './dto/station-queue-response.dto';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { StationManagementResponseDto } from './dto/station-response.dto';
import {
  SetStationItemLimitDto,
  StationMenuItemDto,
  StationMenuResponseDto,
} from './dto/station-menu.dto';

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
    private readonly opsNotify: OpsNotifyService,
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

    const menuCounts = await this.prisma.menuItem.groupBy({
      by: ['preparationStationId'],
      where: {
        tenantId: context.tenantId!,
        status: { in: ['ACTIVE', 'DRAFT'] },
      },
      _count: {
        _all: true,
      },
    });

    const countMap = new Map<string, number>();
    for (const c of activeCounts) {
      countMap.set(c.currentPreparationStationId, c._count._all);
    }
    const menuCountMap = new Map<string, number>();
    for (const c of menuCounts) {
      menuCountMap.set(c.preparationStationId, c._count._all);
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
      menuItemCount: menuCountMap.get(s.id) ?? 0,
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
      menuItemCount: 0,
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

    if (existing.status !== updated.status) {
      this.opsNotify.broadcast({
        type: OpsEventType.STATION_STATUS_CHANGED,
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        severity: 'INFO',
        title:
          updated.status === 'ACTIVE'
            ? `${updated.name} is online`
            : `${updated.name} is offline`,
        body:
          updated.status === 'ACTIVE'
            ? 'Station can accept tickets again.'
            : 'Station tickets and menu items are paused.',
        rooms: [stationRoom(updated.id), managerRoom(context.branchId!)],
        relatedEntityType: 'PreparationStation',
        relatedEntityId: updated.id,
        payload: {
          stationId: updated.id,
          status: updated.status,
          enabled: updated.status === 'ACTIVE',
        },
      });
    }

    const activeCount = await this.prisma.orderItem.count({
      where: {
        branchId: context.branchId!,
        currentPreparationStationId: stationId,
        state: { in: ACTIVE_COOKING },
        cancelledAt: null,
      },
    });
    const menuItemCount = await this.prisma.menuItem.count({
      where: {
        preparationStationId: stationId,
        status: { in: ['ACTIVE', 'DRAFT'] },
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
      menuItemCount,
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
    const context = await this.requireBranch(userId);
    const station = await this.prisma.preparationStation.findFirst({
      where: {
        id: stationId,
        branchId: context.branchId!,
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

    if (station.status !== 'ACTIVE') {
      return {
        stationId: station.id,
        stationName: station.name,
        stationCode: station.code,
        stationOffline: true,
        data: [],
      };
    }

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
      stationOffline: false,
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

  async listStationMenu(
    userId: string,
    stationId: string,
  ): Promise<StationMenuResponseDto> {
    const { context, station } = await this.requireStation(userId, stationId);
    const items = await this.prisma.menuItem.findMany({
      where: {
        tenantId: context.tenantId!,
        preparationStationId: station.id,
        status: 'ACTIVE',
      },
      include: {
        category: true,
        imageFile: true,
        overrides: {
          where: {
            branchId: context.branchId!,
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      stationId: station.id,
      stationName: station.name,
      data: items.map((item) => {
        const override = item.overrides[0] ?? null;
        const remainingQty =
          override?.state === 'LIMITED' && override.remainingQty != null
            ? override.remainingQty
            : null;
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          price: Number(item.currentPrice).toFixed(2),
          currencyCode: item.currencyCode,
          soldOut: item.soldOut || remainingQty === 0,
          remainingQty,
          availabilityState: override?.state ?? null,
          availabilityReason: override?.reason ?? null,
          imageKey: item.imageKey,
          imageUrl: item.imageFile?.path
            ? item.imageFile.path.replace(/\\/g, '/')
            : null,
          categoryName: item.category?.name ?? null,
        };
      }),
    };
  }

  async markStationItemSoldOut(
    userId: string,
    stationId: string,
    menuItemId: string,
    soldOut: boolean,
    reason?: string,
  ): Promise<StationMenuItemDto> {
    const { context, station } = await this.requireStation(userId, stationId);
    const item = await this.requireStationMenuItem(
      context,
      station.id,
      menuItemId,
    );

    if (soldOut) {
      await this.applySoldOutOverride(
        context,
        item.id,
        reason?.trim() || 'Marked sold out by station',
      );
    } else {
      await this.clearAvailabilityOverrides(context, item.id);
    }

    await this.notifyMenuAvailability(
      context,
      station,
      item.name,
      soldOut
        ? {
            title: `Sold out · ${item.name}`,
            body: `${station.name}: do not take new orders for ${item.name}`,
            soldOut: true,
            remainingQty: null,
            state: 'SOLD_OUT',
          }
        : {
            title: `Available again · ${item.name}`,
            body: `${station.name}: ${item.name} can be ordered again`,
            soldOut: false,
            remainingQty: null,
            state: 'AVAILABLE',
          },
      item.id,
    );

    return this.getStationMenuItemDto(context, station.id, item.id);
  }

  async setStationItemLimit(
    userId: string,
    stationId: string,
    menuItemId: string,
    dto: SetStationItemLimitDto,
  ): Promise<StationMenuItemDto> {
    const { context, station } = await this.requireStation(userId, stationId);
    const item = await this.requireStationMenuItem(
      context,
      station.id,
      menuItemId,
    );
    const qty = Math.max(0, Math.floor(dto.remainingQty));
    const reason =
      dto.reason?.trim() ||
      (qty === 0
        ? 'No more portions available'
        : `Only ${qty} portion${qty === 1 ? '' : 's'} left`);

    if (qty === 0) {
      await this.applySoldOutOverride(context, item.id, reason);
    } else {
      await this.applyLimitedOverride(context, item.id, qty, reason);
    }

    await this.notifyMenuAvailability(
      context,
      station,
      item.name,
      qty === 0
        ? {
            title: `Sold out · ${item.name}`,
            body: `${station.name}: ${reason}`,
            soldOut: true,
            remainingQty: 0,
            state: 'SOLD_OUT',
          }
        : {
            title: `Limited · ${item.name}`,
            body: `${station.name}: only ${qty} left — avoid over-ordering`,
            soldOut: false,
            remainingQty: qty,
            state: 'LIMITED',
          },
      item.id,
    );

    return this.getStationMenuItemDto(context, station.id, item.id);
  }

  async clearStationItemLimit(
    userId: string,
    stationId: string,
    menuItemId: string,
  ): Promise<StationMenuItemDto> {
    return this.markStationItemSoldOut(userId, stationId, menuItemId, false);
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

    const tableName =
      updated.tableSession.table.displayNumber ??
      updated.tableSession.table.displayName;
    await this.opsNotify.notify({
      type: OpsEventType.PRODUCTION_EXCEPTION,
      tenantId: loaded.context.tenantId!,
      branchId: loaded.context.branchId!,
      severity: 'URGENT',
      title: `Cannot prepare · ${tableName}`,
      body: `${updated.quantity}× ${updated.itemNameSnapshot} at ${updated.stationNameSnapshot}`,
      recipientMembershipId: updated.tableSession.primaryWaiterMembershipId,
      rooms: [
        managerRoom(loaded.context.branchId!),
        stationRoom(updated.currentPreparationStationId),
      ],
      relatedEntityType: 'OrderItem',
      relatedEntityId: updated.id,
      payload: {
        orderItemId: updated.id,
        tableSessionId: updated.tableSessionId,
        stationId: updated.currentPreparationStationId,
        reason: dto.reasonDetail?.trim() || dto.reasonCode || 'CANNOT_PREPARE',
      },
    });

    if (dto.markSoldOut && updated.menuItemId) {
      const station = await this.prisma.preparationStation.findFirst({
        where: { id: updated.currentPreparationStationId },
      });
      if (station) {
        await this.applySoldOutOverride(
          loaded.context,
          updated.menuItemId,
          dto.reasonDetail?.trim() ||
            `Cannot prepare: ${updated.itemNameSnapshot}`,
        );
        await this.notifyMenuAvailability(
          loaded.context,
          station,
          updated.itemNameSnapshot,
          {
            title: `Sold out · ${updated.itemNameSnapshot}`,
            body: `${station.name}: do not take new orders for ${updated.itemNameSnapshot}`,
            soldOut: true,
            remainingQty: null,
            state: 'SOLD_OUT',
          },
          updated.menuItemId,
        );
      }
    }

    return toTicketDto(updated);
  }

  private async requireStationMenuItem(
    context: AuthContextDto,
    stationId: string,
    menuItemId: string,
  ) {
    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: menuItemId,
        tenantId: context.tenantId!,
        preparationStationId: stationId,
        status: 'ACTIVE',
      },
    });
    if (!item) {
      throw new NotFoundException('Menu item not found on this station.');
    }
    return item;
  }

  private async endOpenOverrides(
    tx: Prisma.TransactionClient,
    branchId: string,
    menuItemId: string,
  ) {
    await tx.itemAvailabilityOverride.updateMany({
      where: {
        branchId,
        menuItemId,
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
      data: { endsAt: new Date() },
    });
  }

  private async applySoldOutOverride(
    context: AuthContextDto,
    menuItemId: string,
    reason: string,
  ) {
    if (!context.staffMembershipId) {
      throw new ForbiddenException(
        'No restaurant membership for this account.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.endOpenOverrides(tx, context.branchId!, menuItemId);
      await tx.itemAvailabilityOverride.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          menuItemId,
          state: 'SOLD_OUT',
          reason,
          remainingQty: null,
          initialQty: null,
          setByMembershipId: context.staffMembershipId!,
          startsAt: new Date(),
        },
      });
      await tx.menuItem.update({
        where: { id: menuItemId },
        data: { soldOut: true, version: { increment: 1 } },
      });
    });
  }

  private async applyLimitedOverride(
    context: AuthContextDto,
    menuItemId: string,
    qty: number,
    reason: string,
  ) {
    if (!context.staffMembershipId) {
      throw new ForbiddenException(
        'No restaurant membership for this account.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.endOpenOverrides(tx, context.branchId!, menuItemId);
      await tx.itemAvailabilityOverride.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          menuItemId,
          state: 'LIMITED',
          reason,
          remainingQty: qty,
          initialQty: qty,
          setByMembershipId: context.staffMembershipId!,
          startsAt: new Date(),
        },
      });
      await tx.menuItem.update({
        where: { id: menuItemId },
        data: { soldOut: false, version: { increment: 1 } },
      });
    });
  }

  private async clearAvailabilityOverrides(
    context: AuthContextDto,
    menuItemId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.endOpenOverrides(tx, context.branchId!, menuItemId);
      await tx.menuItem.update({
        where: { id: menuItemId },
        data: { soldOut: false, version: { increment: 1 } },
      });
    });
  }

  private async notifyMenuAvailability(
    context: AuthContextDto,
    station: { id: string; name: string },
    itemName: string,
    detail: {
      title: string;
      body: string;
      soldOut: boolean;
      remainingQty: number | null;
      state: string;
    },
    menuItemId: string,
  ) {
    await this.opsNotify.notifyWaiters({
      type: OpsEventType.MENU_ITEM_AVAILABILITY,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: detail.soldOut ? 'ATTENTION' : 'INFO',
      title: detail.title,
      body: detail.body,
      relatedEntityType: 'MenuItem',
      relatedEntityId: menuItemId,
      payload: {
        menuItemId,
        menuItemName: itemName,
        stationId: station.id,
        stationName: station.name,
        soldOut: detail.soldOut,
        remainingQty: detail.remainingQty,
        state: detail.state,
      },
    });
    this.opsNotify.broadcast({
      type: OpsEventType.MENU_ITEM_AVAILABILITY,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: 'INFO',
      title: detail.title,
      body: detail.body,
      rooms: [stationRoom(station.id), managerRoom(context.branchId!)],
      relatedEntityType: 'MenuItem',
      relatedEntityId: menuItemId,
      payload: {
        menuItemId,
        soldOut: detail.soldOut,
        remainingQty: detail.remainingQty,
        state: detail.state,
      },
    });
  }

  private async getStationMenuItemDto(
    context: AuthContextDto,
    stationId: string,
    menuItemId: string,
  ): Promise<StationMenuItemDto> {
    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: menuItemId,
        tenantId: context.tenantId!,
        preparationStationId: stationId,
        status: 'ACTIVE',
      },
      include: {
        category: true,
        imageFile: true,
        overrides: {
          where: {
            branchId: context.branchId!,
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!item) {
      throw new NotFoundException('Menu item not found on this station.');
    }
    const override = item.overrides[0] ?? null;
    const remainingQty =
      override?.state === 'LIMITED' && override.remainingQty != null
        ? override.remainingQty
        : null;
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      price: Number(item.currentPrice).toFixed(2),
      currencyCode: item.currencyCode,
      soldOut: item.soldOut || remainingQty === 0,
      remainingQty,
      availabilityState: override?.state ?? null,
      availabilityReason: override?.reason ?? null,
      imageKey: item.imageKey,
      imageUrl: item.imageFile?.path
        ? item.imageFile.path.replace(/\\/g, '/')
        : null,
      categoryName: item.category?.name ?? null,
    };
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

    await this.emitTicketTransition(loaded.context, updated, spec.to);

    return toTicketDto(updated);
  }

  private async emitTicketTransition(
    context: AuthContextDto,
    item: TicketRecord,
    toState: string,
  ) {
    const tableName =
      item.tableSession.table.displayNumber ??
      item.tableSession.table.displayName;
    const stationId = item.currentPreparationStationId;
    const tableId = item.tableSession.tableId;
    const waiterMembershipId = item.tableSession.primaryWaiterMembershipId;
    const basePayload = {
      orderItemId: item.id,
      tableSessionId: item.tableSessionId,
      tableId,
      stationId,
      state: toState,
      itemName: item.itemNameSnapshot,
      quantity: item.quantity,
      tableDisplayName: tableName,
    };

    // READY is a waiter pickup alert — never fan out to the station that
    // just marked it (that was the old bug: kitchen notified itself).
    if (toState === 'READY') {
      this.opsNotify.broadcast({
        type: OpsEventType.TICKET_UPDATED,
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        severity: 'INFO',
        title: `${item.itemNameSnapshot} → READY`,
        body: `Table ${tableName}`,
        rooms: [managerRoom(context.branchId!)],
        relatedEntityType: 'OrderItem',
        relatedEntityId: item.id,
        payload: basePayload,
      });

      await this.opsNotify.notify({
        type: OpsEventType.ITEM_READY,
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        severity: 'ATTENTION',
        title: `Ready · Table ${tableName}`,
        body: `${item.quantity}× ${item.itemNameSnapshot} from ${item.stationNameSnapshot}`,
        recipientMembershipId: waiterMembershipId,
        relatedEntityType: 'OrderItem',
        relatedEntityId: item.id,
        payload: basePayload,
      });
      return;
    }

    this.opsNotify.broadcast({
      type: OpsEventType.TICKET_UPDATED,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: 'INFO',
      title: `${item.itemNameSnapshot} → ${toState}`,
      body: `Table ${tableName}`,
      rooms: [stationRoom(stationId), managerRoom(context.branchId!)],
      relatedEntityType: 'OrderItem',
      relatedEntityId: item.id,
      payload: basePayload,
    });
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
      },
    });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }
    if (station.status !== 'ACTIVE') {
      throw new ForbiddenException({
        status: 403,
        code: 'STATION_OFFLINE',
        message:
          'This station is offline. A manager must turn it back on before tickets can be worked.',
      });
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
