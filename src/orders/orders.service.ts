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
import { ConfirmOrderDto } from './dto/confirm-order.dto';
import {
  ConfirmOrderResponseDto,
  ConfirmedOrderItemDto,
  ServedOrderItemDto,
  SessionOrdersResponseDto,
} from './dto/order-response.dto';
import { WaiterMenuResponseDto } from './dto/waiter-menu-response.dto';

const SERVE_ROLES = ['WAITER', 'MANAGER', 'OWNER_ADMIN'];
const READY_STATE = 'READY';
const CONFIRM_COMMAND = 'order.confirm';
const ORDERABLE = ['OPEN', 'ACTIVE_ORDER'];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
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
    if (query.tableSessionId) {
      const session = await this.prisma.tableSession.findFirst({
        where: {
          id: query.tableSessionId,
          branchId: context.branchId!,
        },
      });
      if (!session) {
        throw new NotFoundException('Table session not found.');
      }
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
      activePeriod: activePeriod
        ? { id: activePeriod.id, name: activePeriod.name }
        : null,
      categories: menu.categories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
      })),
      items: visible.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: money(item.currentPrice),
        currencyCode: item.currencyCode,
        soldOut: item.soldOut,
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
      })),
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

    const session = await this.prisma.tableSession.findFirst({
      where: {
        id: dto.tableSessionId,
        branchId: context.branchId!,
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

    const menuItemIds = [...new Set(dto.items.map((item) => item.menuItemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        tenantId: context.tenantId!,
      },
      include: {
        station: true,
        modifiers: { include: { group: { include: { options: true } } } },
      },
    });
    const menuById = new Map(menuItems.map((item) => [item.id, item]));

    const prepared = dto.items.map((line, index) => {
      const item = menuById.get(line.menuItemId);
      if (!item || item.status !== 'ACTIVE') {
        throw itemError(index, 'MENU_ITEM_NOT_FOUND');
      }
      if (item.soldOut) {
        throw itemError(index, 'MENU_ITEM_SOLD_OUT');
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

    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: session.businessDate,
          tableSessionId: session.id,
          createdByWaiterMembershipId: context.staffMembershipId!,
          waiterShiftSessionId: context.shiftSessionId!,
          status: 'CONFIRMED',
          confirmedAt: now,
          items: {
            create: prepared.map(({ line, item, selected }) => ({
              tenantId: context.tenantId!,
              branchId: context.branchId!,
              businessDate: session.businessDate,
              tableSessionId: session.id,
              menuItemId: item.id,
              itemNameSnapshot: item.name,
              unitPriceSnapshot: item.currentPrice,
              currencyCode: item.currencyCode,
              quantity: line.quantity,
              originalPreparationStationId: item.station.id,
              currentPreparationStationId: item.station.id,
              stationNameSnapshot: item.station.name,
              expectedPrepMinutesSnapshot: item.expectedPrepMinutes,
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

      const updatedSession = await tx.tableSession.update({
        where: { id: session.id },
        data: {
          status: 'ACTIVE_ORDER',
          version: { increment: 1 },
        },
      });

      const payload: ConfirmOrderResponseDto = {
        orderId: order.id,
        tableSessionId: order.tableSessionId,
        status: order.status,
        confirmedAt: order.confirmedAt,
        businessDate: order.businessDate.toISOString().slice(0, 10),
        createdByWaiterMembershipId: order.createdByWaiterMembershipId,
        items: order.items.map(toItemDto),
        tableSession: {
          status: updatedSession.status,
          version: updatedSession.version,
        },
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
      return payload;
    });

    return created;
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
    if (!SERVE_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Only the waiter can mark this served.');
    }
    if (context.roleCode === 'WAITER' && !context.shiftSessionId) {
      throw new ForbiddenException({
        status: 403,
        code: 'SHIFT_REQUIRED',
        errors: { shift: 'SHIFT_REQUIRED' },
      });
    }

    const item = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, branchId: context.branchId! },
      include: { tableSession: true },
    });
    if (!item) {
      throw new NotFoundException('Order item not found.');
    }
    if (
      context.roleCode === 'WAITER' &&
      item.tableSession.primaryWaiterMembershipId !== context.staffMembershipId
    ) {
      throw new ForbiddenException('This is not your table.');
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

  private async requireBranch(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    return context;
  }

  private async requireWaiter(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (context.roleCode !== 'WAITER') {
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
  currentPreparationStationId: string;
  stationNameSnapshot: string;
  specialInstruction: string | null;
  modifiers: Array<{
    optionNameSnapshot: string;
    priceDeltaSnapshot: Prisma.Decimal;
  }>;
}): ConfirmedOrderItemDto {
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
    modifiers: item.modifiers.map((entry) => ({
      name: entry.optionNameSnapshot,
      priceDelta: money(entry.priceDeltaSnapshot),
    })),
  };
}
