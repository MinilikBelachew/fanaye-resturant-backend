import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { CaslService } from '../casl/casl.service';
import { DailyCloseService } from '../daily-close/daily-close.service';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { InventoryService } from '../inventory/inventory.service';
import { OpsEventType } from '../realtime/ops-events';
import { OpsNotifyService } from '../realtime/ops-notify.service';
import { managerRoom, stationRoom, branchRoom } from '../realtime/ops-rooms';
import { OrderSlaQueueService } from './queues/order-sla.queue';
import { ConfirmOrderDto } from './dto/confirm-order.dto';
import {
  ConfirmOrderResponseDto,
  ConfirmedOrderItemDto,
  ServedOrderItemDto,
  SessionOrdersResponseDto,
} from './dto/order-response.dto';
import { WaiterMenuResponseDto } from './dto/waiter-menu-response.dto';
import { isEffectiveVip, resolveVipUnitPrice } from './vip-pricing.util';

/** Floor ownership roles (table assignment) — not a CASL subject alone. */
const ORDER_ROLES = ['WAITER', 'DISPATCHER'];
const READY_STATE = 'READY';
const CONFIRM_COMMAND = 'order.confirm';
const ORDERABLE = ['OPEN', 'ACTIVE_ORDER'];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly opsNotify: OpsNotifyService,
    private readonly dailyClose: DailyCloseService,
    private readonly inventory: InventoryService,
    private readonly orderSlaQueue: OrderSlaQueueService,
    private readonly casl: CaslService,
  ) {}

  async waiterMenu(
    userId: string,
    query: {
      tableSessionId?: string;
      search?: string;
      categoryId?: string;
      periodId?: string;
    },
  ): Promise<WaiterMenuResponseDto> {
    const context = await this.requireWaiter(userId);
    let seatingVip = false;
    let defaultVipPercent: Prisma.Decimal | number = 0;
    if (query.tableSessionId) {
      const session = await this.prisma.tableSession.findFirst({
        where: {
          id: query.tableSessionId,
          branchId: context.branchId!,
        },
        include: {
          table: { include: { location: true } },
        },
      });
      if (!session) {
        throw new NotFoundException('Table session not found.');
      }
      seatingVip = isEffectiveVip(session.table);
      const tenantSettings = await this.prisma.tenantSettings.findUnique({
        where: { tenantId: context.tenantId! },
        select: { defaultVipPercent: true },
      });
      defaultVipPercent = tenantSettings?.defaultVipPercent ?? 0;
    }

    let menu = await this.prisma.menu.findFirst({
      where: {
        tenantId: context.tenantId!,
        status: 'ACTIVE',
        OR: [{ branchId: context.branchId! }, { branchId: null }],
      },
      include: {
        periods: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
        },
        categories: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!menu) {
      menu = await this.prisma.menu.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId ?? null,
          name: 'Main Menu',
          status: 'ACTIVE',
          periods: {
            create: [
              {
                tenantId: context.tenantId!,
                name: 'All day',
                startLocalTime: new Date('1970-01-01T07:00:00.000Z'),
                endLocalTime: new Date('1970-01-01T23:00:00.000Z'),
                daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
                status: 'ACTIVE',
                sortOrder: 0,
              },
            ],
          },
          categories: {
            create: [
              {
                tenantId: context.tenantId!,
                name: 'Kitchen',
                sortOrder: 0,
                status: 'ACTIVE',
              },
              {
                tenantId: context.tenantId!,
                name: 'Barista',
                sortOrder: 1,
                status: 'ACTIVE',
              },
              {
                tenantId: context.tenantId!,
                name: 'Cakes',
                sortOrder: 2,
                status: 'ACTIVE',
              },
              {
                tenantId: context.tenantId!,
                name: 'Soft Drinks',
                sortOrder: 3,
                status: 'ACTIVE',
              },
            ],
          },
        },
        include: {
          periods: {
            where: { status: 'ACTIVE' },
            orderBy: { sortOrder: 'asc' },
          },
          categories: {
            where: { status: 'ACTIVE' },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    }

    const activePeriod =
      menu.periods.find((period) => period.id === query.periodId) ??
      menu.periods[0] ??
      null;

    const items = await this.prisma.menuItem.findMany({
      where: {
        menuId: menu.id,
        status: 'ACTIVE',
        station: { status: 'ACTIVE' },
        ...(query.categoryId ? { menuCategoryId: query.categoryId } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  name: { contains: query.search, mode: 'insensitive' },
                },
                {
                  description: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        station: true,
        periods: true,
        imageFile: true,
        overrides: {
          where: {
            branchId: context.branchId!,
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        modifiers: {
          orderBy: { sortOrder: 'asc' },
          include: {
            group: {
              include: {
                options: {
                  where: { status: 'ACTIVE' },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const visible = items.filter((item) => {
      if (!activePeriod) return true;
      if (item.periods.length === 0) return true;
      return item.periods.some(
        (assignment) => assignment.menuPeriodId === activePeriod.id,
      );
    });

    return {
      menuId: menu.id,
      isVip: seatingVip,
      activePeriod: activePeriod
        ? { id: activePeriod.id, name: activePeriod.name }
        : null,
      categories: menu.categories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
      })),
      items: visible.map((item) => {
        const override = item.overrides[0] ?? null;
        const remainingQty =
          override?.state === 'LIMITED' && override.remainingQty != null
            ? override.remainingQty
            : null;
        const soldOut =
          item.soldOut || remainingQty === 0 || override?.state === 'SOLD_OUT';
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          price: money(
            resolveVipUnitPrice(
              item.currentPrice,
              seatingVip,
              item.vipPercent,
              defaultVipPercent,
            ),
          ),
          currencyCode: item.currencyCode,
          soldOut,
          remainingQty,
          categoryId: item.menuCategoryId,
          categoryName: item.category?.name ?? item.station.name,
          station: { id: item.station.id, name: item.station.name },
          expectedPrepMinutes: item.expectedPrepMinutes,
          imageKey: item.imageKey,
          imageFileId: item.imageFileId,
          imageUrl: item.imageFile?.path
            ? item.imageFile.path.replace(/\\/g, '/')
            : null,
          modifierGroups: item.modifiers
            .filter((assignment) => assignment.group.status === 'ACTIVE')
            .map((assignment) => {
              const min =
                assignment.minSelectionsOverride ??
                assignment.group.minSelections;
              const required =
                assignment.requiredOverride ?? assignment.group.requiredDefault;
              return {
                id: assignment.group.id,
                name: assignment.group.name,
                required,
                minSelections: min,
                maxSelections:
                  assignment.maxSelectionsOverride ??
                  assignment.group.maxSelections,
                options: assignment.group.options.map((option) => ({
                  id: option.id,
                  name: option.name,
                  priceDelta: money(option.priceDelta),
                  currencyCode: option.currencyCode,
                })),
              };
            }),
        };
      }),
    };
  }

  async confirmOrder(
    userId: string,
    dto: ConfirmOrderDto,
    idempotencyKey?: string,
  ): Promise<ConfirmOrderResponseDto> {
    const context = await this.requireWaiterOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(
      context,
      CONFIRM_COMMAND,
      key,
      dto,
    );
    if (existing) {
      return existing as unknown as ConfirmOrderResponseDto;
    }

    const hasTable = Boolean(dto.tableSessionId);
    const hasRoom = Boolean(dto.roomSessionId);
    const hasOutside = Boolean(dto.outsideOrderId);
    const activeCount = Number(hasTable) + Number(hasRoom) + Number(hasOutside);
    if (activeCount !== 1) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'SESSION_XOR_REQUIRED',
        errors: {
          session:
            'Provide exactly one of tableSessionId, roomSessionId, or outsideOrderId.',
        },
      });
    }

    type ConfirmSession = {
      kind: 'table' | 'room' | 'outside';
      id: string;
      businessDate: Date;
      version: number;
      seatingVip: boolean;
      label: string;
    };

    let confirmSession: ConfirmSession;

    if (hasOutside) {
      const outside = await this.prisma.outsideOrder.findFirst({
        where: {
          id: dto.outsideOrderId!,
          branchId: context.branchId!,
        },
      });
      if (!outside) {
        throw new NotFoundException('Outside order not found.');
      }
      if (outside.createdByMembershipId !== context.staffMembershipId) {
        throw new ForbiddenException(
          'This outside order belongs to another waiter.',
        );
      }
      if (outside.closedAt || outside.status === 'CLOSED') {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'ORDER_CLOSED',
          errors: { order: 'This outside order is already closed.' },
        });
      }
      await this.dailyClose.assertBusinessDayNotLocked(
        context.branchId!,
        outside.businessDate,
      );
      if (
        dto.expectedOutsideOrderVersion != null &&
        outside.version !== dto.expectedOutsideOrderVersion
      ) {
        throw new ConflictException({
          status: 409,
          errors: { version: 'stale' },
          expectedVersion: outside.version,
        });
      }
      confirmSession = {
        kind: 'outside',
        id: outside.id,
        businessDate: outside.businessDate,
        version: outside.version,
        seatingVip: false,
        label: `Outside · ${outside.destinationName}`,
      };
    } else if (hasTable) {
      const session = await this.prisma.tableSession.findFirst({
        where: {
          id: dto.tableSessionId!,
          branchId: context.branchId!,
        },
        include: {
          table: { include: { location: true } },
        },
      });
      if (!session) {
        throw new NotFoundException('Table session not found.');
      }
      if (session.primaryWaiterMembershipId !== context.staffMembershipId) {
        throw new ForbiddenException('This table belongs to another waiter.');
      }
      if (session.closedAt || session.status === 'CLOSED') {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'SESSION_CLOSED',
          errors: { session: 'SESSION_CLOSED' },
        });
      }
      await this.dailyClose.assertBusinessDayNotLocked(
        context.branchId!,
        session.businessDate,
      );
      if (!ORDERABLE.includes(session.status)) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'SESSION_NOT_ORDERABLE',
          errors: { session: 'SESSION_NOT_ORDERABLE' },
        });
      }
      if (session.version !== dto.expectedTableSessionVersion) {
        throw new ConflictException({
          status: 409,
          errors: { version: 'stale' },
          expectedVersion: session.version,
        });
      }
      confirmSession = {
        kind: 'table',
        id: session.id,
        businessDate: session.businessDate,
        version: session.version,
        seatingVip: isEffectiveVip(session.table),
        label:
          session.table.displayNumber ?? session.table.displayName ?? 'Table',
      };
    } else {
      const session = await this.prisma.roomSession.findFirst({
        where: {
          id: dto.roomSessionId!,
          branchId: context.branchId!,
        },
        include: {
          hotelRoom: true,
          roomStay: true,
        },
      });
      if (!session) {
        throw new NotFoundException('Room session not found.');
      }
      if (session.primaryWaiterMembershipId !== context.staffMembershipId) {
        throw new ForbiddenException('This room belongs to another waiter.');
      }
      if (session.closedAt || session.status === 'CLOSED') {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'SESSION_CLOSED',
          errors: { session: 'SESSION_CLOSED' },
        });
      }
      if (session.roomStay.status !== 'IN_HOUSE') {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'STAY_NOT_IN_HOUSE',
          errors: { stay: 'STAY_NOT_IN_HOUSE' },
        });
      }
      await this.dailyClose.assertBusinessDayNotLocked(
        context.branchId!,
        session.businessDate,
      );
      if (!ORDERABLE.includes(session.status)) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'SESSION_NOT_ORDERABLE',
          errors: { session: 'SESSION_NOT_ORDERABLE' },
        });
      }
      if (session.version !== dto.expectedRoomSessionVersion) {
        throw new ConflictException({
          status: 409,
          errors: { version: 'stale' },
          expectedVersion: session.version,
        });
      }
      confirmSession = {
        kind: 'room',
        id: session.id,
        businessDate: session.businessDate,
        version: session.version,
        seatingVip: false,
        label: `Room ${session.hotelRoom.roomNumber}`,
      };
    }

    const seatingVip = confirmSession.seatingVip;
    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: context.tenantId! },
      select: { defaultVipPercent: true },
    });
    const defaultVipPercent = tenantSettings?.defaultVipPercent ?? 0;

    const menuItemIds = [...new Set(dto.items.map((item) => item.menuItemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        tenantId: context.tenantId!,
      },
      include: {
        station: true,
        modifiers: { include: { group: { include: { options: true } } } },
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
    const menuById = new Map(menuItems.map((item) => [item.id, item]));

    // Aggregate requested qty per menu item for limit checks.
    const requestedByItem = new Map<string, number>();
    for (const line of dto.items) {
      requestedByItem.set(
        line.menuItemId,
        (requestedByItem.get(line.menuItemId) ?? 0) + line.quantity,
      );
    }

    const prepared = dto.items.map((line, index) => {
      const item = menuById.get(line.menuItemId);
      if (!item || item.status !== 'ACTIVE') {
        throw itemError(index, 'MENU_ITEM_NOT_FOUND');
      }
      const override = item.overrides[0] ?? null;
      const remainingQty =
        override?.state === 'LIMITED' && override.remainingQty != null
          ? override.remainingQty
          : null;
      if (
        item.soldOut ||
        override?.state === 'SOLD_OUT' ||
        remainingQty === 0
      ) {
        throw itemError(index, 'MENU_ITEM_SOLD_OUT');
      }
      if (
        remainingQty != null &&
        (requestedByItem.get(item.id) ?? 0) > remainingQty
      ) {
        throw itemError(index, 'MENU_ITEM_LIMIT_EXCEEDED');
      }
      if (!item.station || item.station.status !== 'ACTIVE') {
        throw itemError(index, 'MENU_ITEM_STATION_MISSING');
      }

      const optionIds = [...new Set(line.modifierOptionIds ?? [])];
      const selected: Array<{
        groupId: string;
        groupName: string;
        optionId: string;
        optionName: string;
        priceDelta: Prisma.Decimal;
        currencyCode: string;
      }> = [];

      for (const optionId of optionIds) {
        const assignment = item.modifiers.find((entry) =>
          entry.group.options.some((option) => option.id === optionId),
        );
        const option = assignment?.group.options.find(
          (entry) => entry.id === optionId,
        );
        if (!assignment || !option || option.status !== 'ACTIVE') {
          throw itemError(index, 'MODIFIER_OPTION_INVALID');
        }
        selected.push({
          groupId: assignment.group.id,
          groupName: assignment.group.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: option.priceDelta,
          currencyCode: option.currencyCode,
        });
      }

      for (const assignment of item.modifiers) {
        if (assignment.group.status !== 'ACTIVE') continue;
        const min =
          assignment.minSelectionsOverride ?? assignment.group.minSelections;
        const max =
          assignment.maxSelectionsOverride ?? assignment.group.maxSelections;
        const required =
          assignment.requiredOverride ?? assignment.group.requiredDefault;
        const count = selected.filter(
          (entry) => entry.groupId === assignment.group.id,
        ).length;
        if (count > max || count < min || (required && count === 0)) {
          throw itemError(index, 'REQUIRED_MODIFIER_MISSING');
        }
      }

      return { line, item, selected };
    });

    const branchSettings = await this.prisma.branchSettings.findUnique({
      where: { branchId: context.branchId! },
    });
    const rushBuffer =
      branchSettings?.rushModeEnabled &&
      branchSettings.rushModeBufferMinutes > 0
        ? branchSettings.rushModeBufferMinutes
        : 0;

    const now = new Date();
    const isRoom = confirmSession.kind === 'room';
    const isOutside = confirmSession.kind === 'outside';
    const isTable = confirmSession.kind === 'table';
    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: confirmSession.businessDate,
          tableSessionId: isTable ? confirmSession.id : null,
          roomSessionId: isRoom ? confirmSession.id : null,
          outsideOrderId: isOutside ? confirmSession.id : null,
          createdByWaiterMembershipId: context.staffMembershipId!,
          waiterShiftSessionId: context.shiftSessionId!,
          status: 'CONFIRMED',
          confirmedAt: now,
          items: {
            create: prepared.map(({ line, item, selected }) => ({
              tenantId: context.tenantId!,
              branchId: context.branchId!,
              businessDate: confirmSession.businessDate,
              tableSessionId: isTable ? confirmSession.id : null,
              roomSessionId: isRoom ? confirmSession.id : null,
              outsideOrderId: isOutside ? confirmSession.id : null,
              menuItemId: item.id,
              itemNameSnapshot: item.name,
              unitPriceSnapshot: resolveVipUnitPrice(
                item.currentPrice,
                seatingVip,
                item.vipPercent,
                defaultVipPercent,
              ),
              currencyCode: item.currencyCode,
              quantity: line.quantity,
              originalPreparationStationId: item.station.id,
              currentPreparationStationId: item.station.id,
              stationNameSnapshot: item.station.name,
              expectedPrepMinutesSnapshot:
                (item.expectedPrepMinutes ?? 15) + rushBuffer,
              specialInstruction: line.specialInstruction?.trim() || null,
              state: 'QUEUED',
              confirmedAt: now,
              queuedAt: now,
              modifiers: {
                create: selected.map((entry, sortOrder) => ({
                  tenantId: context.tenantId!,
                  modifierGroupId: entry.groupId,
                  modifierOptionId: entry.optionId,
                  groupNameSnapshot: entry.groupName,
                  optionNameSnapshot: entry.optionName,
                  priceDeltaSnapshot: entry.priceDelta,
                  currencyCode: entry.currencyCode,
                  sortOrder,
                })),
              },
            })),
          },
        },
        include: {
          items: {
            include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { confirmedAt: 'asc' },
          },
        },
      });

      for (const item of order.items) {
        await this.inventory.depleteForOrderItem(
          tx,
          {
            id: item.id,
            tenantId: item.tenantId,
            branchId: item.branchId,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
          },
          context.staffMembershipId,
        );
      }

      // Decrement LIMITED remaining qty once per menu item.
      const soldOutByLimit: Array<{
        menuItemId: string;
        name: string;
        stationId: string;
        stationName: string;
      }> = [];
      for (const [menuItemId, qty] of requestedByItem) {
        const menuItem = menuById.get(menuItemId);
        const override = menuItem?.overrides[0];
        if (
          !override ||
          override.state !== 'LIMITED' ||
          override.remainingQty == null
        ) {
          continue;
        }
        const decremented = await tx.itemAvailabilityOverride.updateMany({
          where: {
            id: override.id,
            state: 'LIMITED',
            remainingQty: { gte: qty },
          },
          data: { remainingQty: { decrement: qty } },
        });
        if (decremented.count !== 1) {
          throw new ConflictException({
            status: 409,
            code: 'MENU_ITEM_LIMIT_EXCEEDED',
            errors: { menuItemId: 'MENU_ITEM_LIMIT_EXCEEDED' },
          });
        }
        const updatedOverride = await tx.itemAvailabilityOverride.findUnique({
          where: { id: override.id },
        });
        const next = updatedOverride?.remainingQty ?? 0;
        if (next === 0) {
          await tx.menuItem.update({
            where: { id: menuItemId },
            data: { soldOut: true, version: { increment: 1 } },
          });
          soldOutByLimit.push({
            menuItemId,
            name: menuItem.name,
            stationId: menuItem.station.id,
            stationName: menuItem.station.name,
          });
        }
      }

      let sessionStatus = 'ACTIVE_ORDER';
      let sessionVersion = confirmSession.version + 1;

      if (isOutside) {
        // Outside orders don't have table/room sessions
        const updatedOutside = await tx.outsideOrder.update({
          where: { id: confirmSession.id },
          data: {
            version: { increment: 1 },
          },
        });
        sessionVersion = updatedOutside.version;
      } else if (isRoom) {
        const updatedRoom = await tx.roomSession.update({
          where: { id: confirmSession.id },
          data: {
            status: 'ACTIVE_ORDER',
            version: { increment: 1 },
          },
        });
        sessionStatus = updatedRoom.status;
        sessionVersion = updatedRoom.version;
      } else {
        const updatedTable = await tx.tableSession.update({
          where: { id: confirmSession.id },
          data: {
            status: 'ACTIVE_ORDER',
            version: { increment: 1 },
          },
        });
        sessionStatus = updatedTable.status;
        sessionVersion = updatedTable.version;
      }

      const payload: ConfirmOrderResponseDto = {
        orderId: order.id,
        tableSessionId: order.tableSessionId,
        roomSessionId: order.roomSessionId,
        status: order.status,
        confirmedAt: order.confirmedAt,
        businessDate: order.businessDate.toISOString().slice(0, 10),
        createdByWaiterMembershipId: order.createdByWaiterMembershipId,
        items: order.items.map(toItemDto),
        ...(isRoom
          ? {
              roomSession: {
                status: sessionStatus,
                version: sessionVersion,
              },
            }
          : {
              tableSession: {
                status: sessionStatus,
                version: sessionVersion,
              },
            }),
      };

      await this.storeIdempotent(
        tx,
        context,
        CONFIRM_COMMAND,
        key,
        dto,
        payload,
        order.id,
      );
      return { payload, soldOutByLimit, orderItems: order.items };
    });

    for (const row of created.soldOutByLimit) {
      await this.opsNotify.notifyWaiters({
        type: OpsEventType.MENU_ITEM_AVAILABILITY,
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        severity: 'ATTENTION',
        title: `Sold out · ${row.name}`,
        body: `${row.stationName}: remaining limit reached — do not order ${row.name}`,
        relatedEntityType: 'MenuItem',
        relatedEntityId: row.menuItemId,
        payload: {
          menuItemId: row.menuItemId,
          menuItemName: row.name,
          stationId: row.stationId,
          stationName: row.stationName,
          soldOut: true,
          remainingQty: 0,
          state: 'SOLD_OUT',
        },
      });
    }

    // Waiter confirm already queues items — notify stations immediately
    // (sendToKitchen only handles legacy CONFIRMED items).
    const byStation = new Map<string, number>();
    for (const item of created.payload.items) {
      byStation.set(item.stationId, (byStation.get(item.stationId) ?? 0) + 1);
    }

    const seatingLabel = confirmSession.label;

    for (const [stationId, count] of byStation) {
      this.opsNotify.broadcast({
        type: OpsEventType.TICKET_QUEUED,
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        severity: 'ATTENTION',
        title: `New tickets · ${seatingLabel}`,
        body: `${count} item(s) queued for your station.`,
        rooms: [
          stationRoom(stationId),
          branchRoom(context.branchId!),
          managerRoom(context.branchId!),
        ],
        relatedEntityType: isRoom ? 'RoomSession' : 'TableSession',
        relatedEntityId: confirmSession.id,
        payload: {
          ...(isRoom
            ? { roomSessionId: confirmSession.id }
            : { tableSessionId: confirmSession.id }),
          stationId,
          orderId: created.payload.orderId,
          count,
        },
      });
    }

    const unackMinutes = branchSettings?.unacknowledgedAlertMinutes ?? 3;
    for (const item of created.orderItems) {
      void this.orderSlaQueue
        .scheduleItemTimers({
          orderItemId: item.id,
          tenantId: item.tenantId,
          branchId: item.branchId,
          tableSessionId: item.tableSessionId ?? undefined,
          stationId: item.currentPreparationStationId,
          expectedPrepMinutes: item.expectedPrepMinutesSnapshot ?? 15,
          unacknowledgedMinutes: unackMinutes,
        })
        .catch((err) => {
          this.logger.error(
            `Failed to schedule SLA timers for OrderItem ${item.id}:`,
            err,
          );
        });
    }

    return created.payload;
  }

  async listSessionOrders(
    userId: string,
    tableSessionId: string,
  ): Promise<SessionOrdersResponseDto> {
    const context = await this.requireBranch(userId);
    const session = await this.prisma.tableSession.findFirst({
      where: {
        id: tableSessionId,
        branchId: context.branchId!,
      },
      include: {
        orders: {
          orderBy: { confirmedAt: 'asc' },
          include: {
            items: {
              orderBy: { confirmedAt: 'asc' },
              include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Table session not found.');
    }

    return {
      tableSessionId: session.id,
      roomSessionId: null,
      sessionStatus: session.status,
      version: session.version,
      data: session.orders.map((order) => ({
        orderId: order.id,
        status: order.status,
        confirmedAt: order.confirmedAt,
        items: order.items.map(toItemDto),
      })),
    };
  }

  async listRoomSessionOrders(
    userId: string,
    roomSessionId: string,
  ): Promise<SessionOrdersResponseDto> {
    const context = await this.requireBranch(userId);
    const session = await this.prisma.roomSession.findFirst({
      where: {
        id: roomSessionId,
        branchId: context.branchId!,
      },
      include: {
        orders: {
          orderBy: { confirmedAt: 'asc' },
          include: {
            items: {
              orderBy: { confirmedAt: 'asc' },
              include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Room session not found.');
    }

    return {
      tableSessionId: null,
      roomSessionId: session.id,
      sessionStatus: session.status,
      version: session.version,
      data: session.orders.map((order) => ({
        orderId: order.id,
        status: order.status,
        confirmedAt: order.confirmedAt,
        items: order.items.map(toItemDto),
      })),
    };
  }

  async markServed(
    userId: string,
    orderItemId: string,
    expectedVersion: number,
  ): Promise<ServedOrderItemDto> {
    const context = await this.requireBranch(userId);
    if (!context.staffMembershipId) {
      throw new ForbiddenException(
        'No restaurant membership for this account.',
      );
    }
    this.casl.assertCan(
      context,
      'serve',
      'Order',
      'Only the waiter can mark this served.',
    );
    if (ORDER_ROLES.includes(context.roleCode) && !context.shiftSessionId) {
      throw new ForbiddenException({
        status: 403,
        code: 'SHIFT_REQUIRED',
        errors: { shift: 'SHIFT_REQUIRED' },
      });
    }

    const item = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, branchId: context.branchId! },
      include: { tableSession: true, roomSession: true },
    });
    if (!item) {
      throw new NotFoundException('Order item not found.');
    }
    const ownerMembershipId =
      item.tableSession?.primaryWaiterMembershipId ??
      item.roomSession?.primaryWaiterMembershipId ??
      null;
    if (
      ORDER_ROLES.includes(context.roleCode) &&
      ownerMembershipId !== context.staffMembershipId
    ) {
      throw new ForbiddenException('This is not your seating.');
    }
    if (item.state !== READY_STATE) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'INVALID_ITEM_STATE',
        errors: { state: item.state },
      });
    }
    if (item.version !== expectedVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: item.version,
      });
    }

    const updated = await this.prisma.orderItem.update({
      where: { id: item.id },
      data: {
        state: 'SERVED',
        servedAt: new Date(),
        version: { increment: 1 },
      },
    });

    return {
      orderItemId: updated.id,
      state: updated.state,
      servedAt: updated.servedAt!,
      version: updated.version,
    };
  }

  async sendToKitchen(
    userId: string,
    tableSessionId: string,
    orderId?: string,
  ): Promise<{ success: boolean; count: number; message: string }> {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'send_kitchen',
      'Order',
      'Only staff can send orders to kitchen.',
    );

    const session = await this.prisma.tableSession.findFirst({
      where: {
        id: tableSessionId,
        branchId: context.branchId!,
      },
    });

    if (!session) {
      throw new NotFoundException('Table session not found.');
    }

    if (session.closedAt || session.status === 'CLOSED') {
      throw new UnprocessableEntityException('Table session is closed.');
    }

    await this.dailyClose.assertBusinessDayNotLocked(
      context.branchId!,
      session.businessDate,
    );

    const filter: Prisma.OrderItemWhereInput = {
      tableSessionId,
      branchId: context.branchId!,
      cancelledAt: null,
      state: 'CONFIRMED',
      ...(orderId ? { orderId } : {}),
    };

    const confirmedItems = await this.prisma.orderItem.findMany({
      where: filter,
    });

    if (confirmedItems.length === 0) {
      return {
        success: true,
        count: 0,
        message: 'All items are already in kitchen queue or served.',
      };
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: filter,
        data: {
          state: 'QUEUED',
          queuedAt: now,
          version: { increment: 1 },
        },
      });

      await tx.tableSession.update({
        where: { id: session.id },
        data: {
          status: 'ACTIVE_ORDER',
          version: { increment: 1 },
        },
      });
    });

    const byStation = new Map<string, number>();
    for (const item of confirmedItems) {
      const key = item.currentPreparationStationId;
      byStation.set(key, (byStation.get(key) ?? 0) + 1);
    }

    const table = await this.prisma.diningTable.findUnique({
      where: { id: session.tableId },
      select: { displayName: true, displayNumber: true },
    });
    const tableLabel = table?.displayNumber ?? table?.displayName ?? 'Table';

    for (const [stationId, count] of byStation) {
      this.opsNotify.broadcast({
        type: OpsEventType.TICKET_QUEUED,
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        severity: 'ATTENTION',
        title: `New tickets · ${tableLabel}`,
        body: `${count} item(s) queued for your station.`,
        rooms: [
          stationRoom(stationId),
          branchRoom(context.branchId!),
          managerRoom(context.branchId!),
        ],
        relatedEntityType: 'TableSession',
        relatedEntityId: session.id,
        payload: {
          tableSessionId: session.id,
          stationId,
          count,
        },
      });
    }

    return {
      success: true,
      count: confirmedItems.length,
      message: `Sent ${confirmedItems.length} item(s) to kitchen stations!`,
    };
  }

  private async requireBranch(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    return context;
  }

  private async requireWaiter(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    // Runtime: WAITER/DISPATCHER, or CASHIER only when branch is BAKERY.
    if (
      !ORDER_ROLES.includes(context.roleCode) &&
      !(
        context.roleCode === 'CASHIER' &&
        (
          await this.prisma.branch.findUnique({
            where: { id: context.branchId! },
            select: { serviceMode: true },
          })
        )?.serviceMode === 'BAKERY'
      )
    ) {
      throw new ForbiddenException('Waiter menu is for waiters only.');
    }
    return context;
  }

  private async requireWaiterOnShift(userId: string): Promise<AuthContextDto> {
    const context = await this.requireWaiter(userId);
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
    response: ConfirmOrderResponseDto,
    orderId: string,
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
        resourceType: 'order',
        resourceId: orderId,
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
}

function money(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function itemError(index: number, code: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    status: 422,
    code,
    errors: { items: { [index]: { menuItemId: code } } },
  });
}

function toItemDto(item: {
  id: string;
  itemNameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: Prisma.Decimal;
  currencyCode: string;
  state: string;
  version: number;
  servedAt: Date | null;
  queuedAt?: Date | null;
  confirmedAt?: Date | null;
  delayAlertSentAt?: Date | null;
  expectedPrepMinutesSnapshot?: number | null;
  currentPreparationStationId: string;
  stationNameSnapshot: string;
  specialInstruction: string | null;
  modifiers: Array<{
    optionNameSnapshot: string;
    priceDeltaSnapshot: Prisma.Decimal;
  }>;
}): ConfirmedOrderItemDto {
  const queued = item.queuedAt ?? item.confirmedAt;
  const targetMin = item.expectedPrepMinutesSnapshot ?? 15;
  const isDelayed =
    Boolean(item.delayAlertSentAt) ||
    (['QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION'].includes(item.state) &&
      queued != null &&
      Date.now() - queued.getTime() > targetMin * 60_000);

  return {
    orderItemId: item.id,
    itemName: item.itemNameSnapshot,
    quantity: item.quantity,
    unitPrice: money(item.unitPriceSnapshot),
    currencyCode: item.currencyCode,
    state: item.state,
    version: item.version,
    servedAt: item.servedAt,
    stationId: item.currentPreparationStationId,
    stationName: item.stationNameSnapshot,
    specialInstruction: item.specialInstruction,
    delayed: isDelayed,
    modifiers: item.modifiers.map((entry) => ({
      name: entry.optionNameSnapshot,
      priceDelta: money(entry.priceDeltaSnapshot),
    })),
  };
}
