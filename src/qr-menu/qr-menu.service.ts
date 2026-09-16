import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  QrMenuConfigDto,
  UpdateQrMenuConfigDto,
} from './dto/qr-menu-config.dto';
import {
  PublicActiveOrderItemDto,
  PublicActiveSessionDto,
  PublicMenuCategoryDto,
  PublicMenuItemDto,
  PublicModifierGroupDto,
  PublicTableInfoDto,
  PublicTableMenuResponseDto,
  PublicTenantInfoDto,
} from './dto/public-table-menu-response.dto';
import { GuestOrderDto, GuestOrderResponseDto } from './dto/guest-order.dto';
import {
  ServiceRequestDto,
  ServiceRequestResponseDto,
} from './dto/service-request.dto';

function money(
  val: Prisma.Decimal | number | string | null | undefined,
): string {
  if (val == null) return '0.00';
  return Number(val).toFixed(2);
}

const DEFAULT_CONFIG: QrMenuConfigDto = {
  coverImageUrl:
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
  welcomeMessage: 'Welcome to Our Dining Room',
  subtitle:
    'Scan to explore chef specials, drinks, and place your order directly',
  wifiSsid: 'Fanaye_Guest',
  wifiPassword: '',
  featuredItemIds: [],
  allowGuestOrders: true,
  autoSendToKitchen: true,
  enabledDietaryTags: ['FASTING', 'VEGETARIAN', 'SPICY', 'CHEF_PICK'],
};

@Injectable()
export class QrMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async getPublicTableMenu(
    slug: string,
    tableId: string,
  ): Promise<PublicTableMenuResponseDto> {
    const site = await this.prisma.tenantSite.findUnique({
      where: { slug },
      include: {
        tenant: {
          include: {
            branches: {
              where: { status: 'ACTIVE' },
              take: 1,
            },
          },
        },
      },
    });

    if (!site) {
      throw new NotFoundException(`Restaurant site '${slug}' not found.`);
    }

    const tenant = site.tenant;
    const branch = tenant.branches[0];
    if (!branch) {
      throw new NotFoundException(
        'Restaurant location is not currently available.',
      );
    }

    // Try finding table by UUID or displayNumber
    let table = await this.prisma.diningTable.findFirst({
      where: {
        id: tableId,
        tenantId: tenant.id,
      },
      include: {
        location: true,
      },
    });

    if (!table) {
      table = await this.prisma.diningTable.findFirst({
        where: {
          displayNumber: tableId,
          tenantId: tenant.id,
        },
        include: {
          location: true,
        },
      });
    }

    if (!table) {
      throw new NotFoundException(`Dining table '${tableId}' was not found.`);
    }

    const rawConfig = (site.qrMenuConfigJson as Record<string, unknown>) || {};
    const config: QrMenuConfigDto = {
      ...DEFAULT_CONFIG,
      ...rawConfig,
    };

    // Load active menu items & categories
    const categories = await this.prisma.menuCategory.findMany({
      where: {
        menu: {
          tenantId: tenant.id,
          status: 'ACTIVE',
        },
        status: 'ACTIVE',
      },
      orderBy: { sortOrder: 'asc' },
    });

    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        tenantId: tenant.id,
        status: 'ACTIVE',
        showOnQrMenu: true,
      },
      include: {
        category: true,
        station: true,
        imageFile: true,
        modifiers: {
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
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const categoryCounts = new Map<string, number>();
    for (const item of menuItems) {
      const catId = item.menuCategoryId ?? 'other';
      categoryCounts.set(catId, (categoryCounts.get(catId) ?? 0) + 1);
    }

    const publicCategories: PublicMenuCategoryDto[] = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      sortOrder: cat.sortOrder,
      itemsCount: categoryCounts.get(cat.id) ?? 0,
    }));

    const mapItem = (item: (typeof menuItems)[number]): PublicMenuItemDto => {
      const modifierGroups: PublicModifierGroupDto[] = item.modifiers
        .filter((assignment) => assignment.group.status === 'ACTIVE')
        .map((assignment) => ({
          id: assignment.group.id,
          name: assignment.group.name,
          required:
            assignment.requiredOverride ?? assignment.group.requiredDefault,
          minSelections:
            assignment.minSelectionsOverride ?? assignment.group.minSelections,
          maxSelections:
            assignment.maxSelectionsOverride ?? assignment.group.maxSelections,
          options: assignment.group.options.map((option) => ({
            id: option.id,
            name: option.name,
            priceDelta: money(option.priceDelta),
            currencyCode: option.currencyCode,
          })),
        }));

      return {
        id: item.id,
        name: item.name,
        description: item.description,
        price: money(item.currentPrice),
        currencyCode: item.currencyCode,
        badge: item.badge,
        categoryId: item.menuCategoryId,
        categoryName: item.category?.name ?? item.station.name,
        stationName: item.station.name,
        imageUrl: item.imageFile?.path
          ? item.imageFile.path.replace(/\\/g, '/')
          : null,
        modifierGroups,
      };
    };

    const publicItems = menuItems.map(mapItem);

    // Featured items
    const featuredIds = new Set(config.featuredItemIds ?? []);
    const featuredItems =
      featuredIds.size > 0
        ? publicItems.filter((i) => featuredIds.has(i.id))
        : publicItems.slice(0, 4);

    // Check active table session
    const session = await this.prisma.tableSession.findFirst({
      where: {
        tableId: table.id,
        status: { in: ['OPEN', 'ACTIVE_ORDER', 'BILL_REQUESTED'] },
        closedAt: null,
      },
      include: {
        orders: {
          include: {
            items: true,
          },
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    let activeSession: PublicActiveSessionDto | null = null;
    if (session) {
      const orderItems = session.orders.flatMap((o) => o.items);
      const activeLines: PublicActiveOrderItemDto[] = orderItems.map((oi) => ({
        id: oi.id,
        name: oi.itemNameSnapshot,
        quantity: oi.quantity,
        state: oi.state,
        price: money(new Prisma.Decimal(oi.unitPriceSnapshot).mul(oi.quantity)),
        comment: oi.specialInstruction,
        createdAt: oi.createdAt.toISOString(),
      }));

      const total = orderItems.reduce(
        (sum, oi) =>
          sum.plus(new Prisma.Decimal(oi.unitPriceSnapshot).mul(oi.quantity)),
        new Prisma.Decimal(0),
      );

      activeSession = {
        sessionId: session.id,
        status: session.status,
        customerCount: session.guestCount ?? 2,
        openedAt: session.openedAt.toISOString(),
        items: activeLines,
        totalAmount: money(total),
      };
    }

    const publicTable: PublicTableInfoDto = {
      id: table.id,
      displayName: table.displayName,
      displayNumber: table.displayNumber,
      locationName: table.location.name,
      status: table.status,
      currentSessionId: session?.id ?? null,
    };

    const theme = (site.themeJson as Record<string, unknown>) || {};
    const publicTenant: PublicTenantInfoDto = {
      id: tenant.id,
      name: tenant.displayName,
      slug: site.slug,
      logoUrl: (theme.logoUrl as string) || null,
      phone: null,
      city: null,
      address: null,
      currencyCode: tenant.currencyCode || 'ETB',
    };

    return {
      tenant: publicTenant,
      table: publicTable,
      config,
      categories: publicCategories,
      featuredItems,
      items: publicItems,
      activeSession,
    };
  }

  async submitGuestOrder(
    slug: string,
    tableId: string,
    dto: GuestOrderDto,
  ): Promise<GuestOrderResponseDto> {
    const site = await this.prisma.tenantSite.findUnique({
      where: { slug },
      include: {
        tenant: {
          include: {
            branches: {
              where: { status: 'ACTIVE' },
              take: 1,
            },
          },
        },
      },
    });

    if (!site) throw new NotFoundException('Restaurant site not found.');
    const tenant = site.tenant;
    const branch = tenant.branches[0];
    if (!branch) throw new NotFoundException('Branch is not active.');

    let table = await this.prisma.diningTable.findFirst({
      where: { id: tableId, tenantId: tenant.id },
    });
    if (!table) {
      table = await this.prisma.diningTable.findFirst({
        where: { displayNumber: tableId, tenantId: tenant.id },
      });
    }
    if (!table) throw new NotFoundException('Table not found.');

    const config = (site.qrMenuConfigJson as Record<string, unknown>) || {};
    const autoSendToKitchen = config.autoSendToKitchen !== false;
    if (config.allowGuestOrders === false) {
      throw new BadRequestException(
        'Guest ordering is currently disabled for this location. Please call a waiter to order.',
      );
    }

    // Resolve waiter to attribute order/session to
    let waiterMembershipId = table.assignedWaiterMembershipId;
    let waiterShiftSessionId: string | null = null;

    if (waiterMembershipId) {
      const activeShift = await this.prisma.shiftSession.findFirst({
        where: {
          staffMembershipId: waiterMembershipId,
          state: 'OPEN',
        },
        orderBy: { clockInAt: 'desc' },
      });
      waiterShiftSessionId = activeShift?.id ?? null;
    }

    // If table has no assigned waiter or shift, fallback to any active waiter on shift
    if (!waiterShiftSessionId) {
      const activeShift = await this.prisma.shiftSession.findFirst({
        where: {
          branchId: branch.id,
          state: 'OPEN',
          membership: {
            status: 'ACTIVE',
            roleAssignments: {
              some: { role: { code: 'WAITER' } },
            },
          },
        },
        include: { membership: true },
        orderBy: { clockInAt: 'desc' },
      });

      if (activeShift) {
        waiterMembershipId = activeShift.staffMembershipId;
        waiterShiftSessionId = activeShift.id;
      }
    }

    // Fallback if no shifts currently clocked in
    if (!waiterMembershipId || !waiterShiftSessionId) {
      const anyStaff = await this.prisma.tenantStaffMembership.findFirst({
        where: {
          tenantId: tenant.id,
          status: 'ACTIVE',
        },
      });
      if (!anyStaff) {
        throw new BadRequestException('No active restaurant staff available.');
      }
      waiterMembershipId = anyStaff.id;

      let dummyShift = await this.prisma.shiftSession.findFirst({
        where: { staffMembershipId: waiterMembershipId },
      });
      if (!dummyShift) {
        const now = new Date();
        dummyShift = await this.prisma.shiftSession.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            staffMembershipId: waiterMembershipId,
            businessDate: now,
            state: 'OPEN',
            clockInAt: now,
          },
        });
      }
      waiterShiftSessionId = dummyShift.id;
    }

    // Fetch or create table session
    let session = await this.prisma.tableSession.findFirst({
      where: {
        tableId: table.id,
        status: { in: ['OPEN', 'ACTIVE_ORDER', 'BILL_REQUESTED'] },
        closedAt: null,
      },
    });

    const now = new Date();
    if (!session) {
      session = await this.prisma.tableSession.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          tableId: table.id,
          businessDate: now,
          primaryWaiterMembershipId: waiterMembershipId,
          primaryWaiterShiftSessionId: waiterShiftSessionId,
          guestCount: dto.customerCount ?? 2,
          status: 'ACTIVE_ORDER',
          openedAt: now,
        },
      });

      await this.prisma.diningTable.update({
        where: { id: table.id },
        data: { status: 'OCCUPIED' },
      });
    }

    // Validate and prepare items
    const itemIds = [...new Set(dto.items.map((i) => i.menuItemId))];
    const items = await this.prisma.menuItem.findMany({
      where: {
        id: { in: itemIds },
        tenantId: tenant.id,
      },
      include: {
        station: true,
        modifiers: {
          include: {
            group: {
              include: { options: true },
            },
          },
        },
      },
    });

    const itemsMap = new Map(items.map((i) => [i.id, i]));
    let maxPrepMin = 12;

    const preparedOrderLines = dto.items.map((entry, idx) => {
      const item = itemsMap.get(entry.menuItemId);
      if (!item || item.status !== 'ACTIVE') {
        throw new BadRequestException(`Item #${idx + 1} is not available.`);
      }
      if (item.soldOut) {
        throw new BadRequestException(`"${item.name}" is currently sold out.`);
      }
      if (item.expectedPrepMinutes && item.expectedPrepMinutes > maxPrepMin) {
        maxPrepMin = item.expectedPrepMinutes;
      }

      // Modifier options
      const optIds = (entry.modifiers ?? []).map((m) => m.modifierOptionId);
      const selected: Array<{
        groupId: string;
        groupName: string;
        optionId: string;
        optionName: string;
        priceDelta: Prisma.Decimal;
        currencyCode: string;
      }> = [];

      for (const optId of optIds) {
        for (const modAssign of item.modifiers) {
          const opt = modAssign.group.options.find((o) => o.id === optId);
          if (opt && opt.status === 'ACTIVE') {
            selected.push({
              groupId: modAssign.group.id,
              groupName: modAssign.group.name,
              optionId: opt.id,
              optionName: opt.name,
              priceDelta: opt.priceDelta,
              currencyCode: opt.currencyCode,
            });
          }
        }
      }

      return {
        line: entry,
        item,
        selected,
      };
    });

    // Execute order creation in transaction
    const createdOrder = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          businessDate: session.businessDate,
          tableSessionId: session.id,
          createdByWaiterMembershipId: waiterMembershipId!,
          waiterShiftSessionId: waiterShiftSessionId!,
          status: 'CONFIRMED',
          confirmedAt: now,
          items: {
            create: preparedOrderLines.map(({ line, item, selected }) => ({
              tenantId: tenant.id,
              branchId: branch.id,
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
              specialInstruction:
                line.comment?.trim() || dto.notes?.trim() || null,
              state: autoSendToKitchen ? 'QUEUED' : 'CONFIRMED',
              confirmedAt: now,
              queuedAt: autoSendToKitchen ? now : null,
              modifiers: {
                create: selected.map((entry, sortOrder) => ({
                  tenantId: tenant.id,
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
      });

      await tx.tableSession.update({
        where: { id: session.id },
        data: {
          status: 'ACTIVE_ORDER',
          version: { increment: 1 },
        },
      });

      // Emit waiter notification
      if (waiterMembershipId) {
        const notifTitle = autoSendToKitchen
          ? `QR Order at ${table.displayName}`
          : `📱 Guest QR Order · ${table.displayName}`;
        const notifBody = autoSendToKitchen
          ? `Guest ordered ${dto.items.length} item(s) from table QR code (Sent to kitchen).`
          : `Guest ordered ${dto.items.length} item(s) from table QR code. Please review and send to kitchen.`;

        await tx.notification.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            recipientStaffMembershipId: waiterMembershipId,
            type: 'GUEST_ORDER_PLACED',
            severity: autoSendToKitchen ? 'INFO' : 'ATTENTION',
            title: notifTitle,
            body: notifBody,
            payloadJson: {
              tableId: table.id,
              orderId: order.id,
              sessionId: session.id,
              autoSendToKitchen,
            },
          },
        });
      }

      return order;
    });

    return {
      orderId: createdOrder.id,
      tableSessionId: session.id,
      status: createdOrder.status,
      itemCount: dto.items.reduce((s, i) => s + i.quantity, 0),
      estimatedWaitMinutes: maxPrepMin,
      message: autoSendToKitchen
        ? 'Your order has been sent to the kitchen!'
        : 'Your order has been received! Your server is reviewing it now.',
    };
  }

  async submitServiceRequest(
    slug: string,
    tableId: string,
    dto: ServiceRequestDto,
  ): Promise<ServiceRequestResponseDto> {
    const site = await this.prisma.tenantSite.findUnique({
      where: { slug },
      include: {
        tenant: {
          include: {
            branches: { where: { status: 'ACTIVE' }, take: 1 },
          },
        },
      },
    });

    if (!site) throw new NotFoundException('Restaurant site not found.');
    const tenant = site.tenant;
    const branch = tenant.branches[0];
    if (!branch) throw new NotFoundException('Branch is not active.');

    let table = await this.prisma.diningTable.findFirst({
      where: { id: tableId, tenantId: tenant.id },
    });
    if (!table) {
      table = await this.prisma.diningTable.findFirst({
        where: { displayNumber: tableId, tenantId: tenant.id },
      });
    }
    if (!table) throw new NotFoundException('Table not found.');

    let waiterId = table.assignedWaiterMembershipId;
    if (!waiterId) {
      const session = await this.prisma.tableSession.findFirst({
        where: { tableId: table.id, closedAt: null },
      });
      waiterId = session?.primaryWaiterMembershipId ?? null;
    }

    if (!waiterId) {
      const activeWaiter = await this.prisma.tenantStaffMembership.findFirst({
        where: {
          tenantId: tenant.id,
          status: 'ACTIVE',
          roleAssignments: { some: { role: { code: 'WAITER' } } },
        },
      });
      waiterId = activeWaiter?.id ?? null;
    }

    if (waiterId) {
      const titleMap: Record<string, string> = {
        CALL_WAITER: `🔔 Call Waiter · ${table.displayName}`,
        REQUEST_WATER: `💧 Water / Napkins · ${table.displayName}`,
        REQUEST_BILL: `🧾 Bill Request · ${table.displayName}`,
        EXTRA_NAPKINS: `🧻 Extra Napkins · ${table.displayName}`,
        ASSISTANCE: `🙋 Service Needed · ${table.displayName}`,
      };

      const body = dto.comment
        ? `${dto.comment}${dto.paymentMethod ? ' (Payment: ' + dto.paymentMethod + ')' : ''}`
        : dto.paymentMethod
          ? `Requested payment via ${dto.paymentMethod}`
          : `Guest requested assistance at ${table.displayName}`;

      await this.prisma.notification.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          recipientStaffMembershipId: waiterId,
          type: dto.type,
          severity: dto.type === 'REQUEST_BILL' ? 'URGENT' : 'ATTENTION',
          title: titleMap[dto.type] ?? `Service Alert · ${table.displayName}`,
          body,
          payloadJson: {
            tableId: table.id,
            requestType: dto.type,
            paymentMethod: dto.paymentMethod,
          },
        },
      });
    }

    return {
      success: true,
      message:
        dto.type === 'REQUEST_BILL'
          ? 'Your waiter has been notified to bring the bill.'
          : 'Your waiter has been notified and will be with you shortly.',
      requestedAt: new Date().toISOString(),
    };
  }

  async getAdminConfig(userId: string): Promise<QrMenuConfigDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('Tenant context required.');
    }

    const site = await this.prisma.tenantSite.findUnique({
      where: { tenantId: context.tenantId },
    });

    if (!site) {
      return DEFAULT_CONFIG;
    }

    const raw = (site.qrMenuConfigJson as Record<string, unknown>) || {};
    return {
      ...DEFAULT_CONFIG,
      ...raw,
    };
  }

  async updateAdminConfig(
    userId: string,
    dto: UpdateQrMenuConfigDto,
  ): Promise<QrMenuConfigDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('Tenant context required.');
    }

    const site = await this.prisma.tenantSite.upsert({
      where: { tenantId: context.tenantId },
      update: {
        qrMenuConfigJson: dto as unknown as Prisma.InputJsonValue,
      },
      create: {
        tenantId: context.tenantId,
        slug: `tenant-${context.tenantId.slice(0, 8)}`,
        status: 'PUBLISHED',
        themeJson: {},
        draftDataJson: {},
        qrMenuConfigJson: dto as unknown as Prisma.InputJsonValue,
      },
    });

    const raw = (site.qrMenuConfigJson as Record<string, unknown>) || {};
    return {
      ...DEFAULT_CONFIG,
      ...raw,
    };
  }

  async getTablesQrData(userId: string) {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('Tenant context required.');
    }

    const site = await this.prisma.tenantSite.findUnique({
      where: { tenantId: context.tenantId },
    });

    const slug = site?.slug ?? 'restaurant';

    const tables = await this.prisma.diningTable.findMany({
      where: {
        tenantId: context.tenantId,
        archivedAt: null,
      },
      include: {
        location: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    });

    return {
      slug,
      tables: tables.map((t) => ({
        id: t.id,
        displayName: t.displayName,
        displayNumber: t.displayNumber,
        locationName: t.location.name,
        status: t.status,
        qrRelativeUrl: `/r/${slug}/t/${t.id}`,
        qrFullUrl: `${slug}/t/${t.id}`,
      })),
    };
  }
}
