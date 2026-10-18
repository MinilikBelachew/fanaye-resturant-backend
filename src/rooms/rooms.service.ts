import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CaslService } from '../casl/casl.service';
import { PrismaService } from '../database/prisma.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  CheckInRoomStayDto,
  CreateHotelRoomDto,
  ForceCloseRoomSessionDto,
  OpenRoomSessionDto,
  RedeemBreakfastDto,
  UpdateHotelRoomDto,
  UpdateRoomServiceSettingsDto,
  UpsertRoomFloorCoverageDto,
} from './dto/rooms.dto';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly casl: CaslService,
  ) {}

  async getSettings(userId: string) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(context, 'read', 'Room', 'Rooms access required.');
    await this.assertRoomServiceOrAdmin(context);
    const settings = await this.ensureSettings(context.tenantId!);
    return {
      data: {
        roomServiceEnabled: settings.roomServiceEnabled,
        breakfastEntitlementEnabled: settings.breakfastEntitlementEnabled,
        breakfastValidFromLocal: settings.breakfastValidFromLocal,
        breakfastValidToLocal: settings.breakfastValidToLocal,
        breakfastMenuItemId: settings.breakfastMenuItemId,
      },
    };
  }

  async updateSettings(userId: string, dto: UpdateRoomServiceSettingsDto) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'manage',
      'Room',
      'Only managers can change room settings.',
    );
    await this.ensureSettings(context.tenantId!);
    const updated = await this.prisma.tenantSettings.update({
      where: { tenantId: context.tenantId! },
      data: {
        ...(dto.roomServiceEnabled !== undefined
          ? { roomServiceEnabled: dto.roomServiceEnabled }
          : {}),
        ...(dto.breakfastEntitlementEnabled !== undefined
          ? { breakfastEntitlementEnabled: dto.breakfastEntitlementEnabled }
          : {}),
        ...(dto.breakfastValidFromLocal !== undefined
          ? { breakfastValidFromLocal: dto.breakfastValidFromLocal }
          : {}),
        ...(dto.breakfastValidToLocal !== undefined
          ? { breakfastValidToLocal: dto.breakfastValidToLocal }
          : {}),
        ...(dto.breakfastMenuItemId !== undefined
          ? { breakfastMenuItemId: dto.breakfastMenuItemId }
          : {}),
        updatedByMembershipId: context.staffMembershipId ?? null,
        settingsVersion: { increment: 1 },
      },
    });
    return {
      data: {
        roomServiceEnabled: updated.roomServiceEnabled,
        breakfastEntitlementEnabled: updated.breakfastEntitlementEnabled,
        breakfastValidFromLocal: updated.breakfastValidFromLocal,
        breakfastValidToLocal: updated.breakfastValidToLocal,
        breakfastMenuItemId: updated.breakfastMenuItemId,
      },
    };
  }

  async listRooms(userId: string) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(context, 'read', 'Room', 'Rooms access required.');
    await this.requireRoomServiceEnabled(context);
    const rows = await this.prisma.hotelRoom.findMany({
      where: { branchId: context.branchId!, archivedAt: null },
      include: {
        defaultWaiter: { select: { id: true, employeeDisplayName: true } },
        stays: {
          where: { status: 'IN_HOUSE' },
          take: 1,
          orderBy: { checkInAt: 'desc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { roomNumber: 'asc' }],
    });
    return {
      data: rows.map((row) => this.toRoomDto(row)),
    };
  }

  async createRoom(userId: string, dto: CreateHotelRoomDto) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'manage',
      'Room',
      'Only managers can create rooms.',
    );
    await this.requireRoomServiceEnabled(context);
    const roomNumber = dto.roomNumber.trim();
    try {
      const created = await this.prisma.hotelRoom.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          roomNumber,
          floor: dto.floor?.trim() || null,
          wing: dto.wing?.trim() || null,
          defaultWaiterMembershipId: dto.defaultWaiterMembershipId ?? null,
          sortOrder: dto.sortOrder ?? 0,
          status: 'AVAILABLE',
        },
        include: {
          defaultWaiter: { select: { id: true, employeeDisplayName: true } },
          stays: { where: { status: 'IN_HOUSE' }, take: 1 },
        },
      });
      return { data: this.toRoomDto(created) };
    } catch {
      throw new ConflictException({
        status: 409,
        errors: { roomNumber: 'duplicate' },
      });
    }
  }

  async updateRoom(userId: string, roomId: string, dto: UpdateHotelRoomDto) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'manage',
      'Room',
      'Only managers can update rooms.',
    );
    await this.requireRoomServiceEnabled(context);
    const existing = await this.prisma.hotelRoom.findFirst({
      where: { id: roomId, branchId: context.branchId!, archivedAt: null },
    });
    if (!existing) throw new NotFoundException('Room not found.');
    try {
      const updated = await this.prisma.hotelRoom.update({
        where: { id: existing.id },
        data: {
          ...(dto.roomNumber !== undefined
            ? { roomNumber: dto.roomNumber.trim() }
            : {}),
          ...(dto.floor !== undefined
            ? { floor: dto.floor?.trim() || null }
            : {}),
          ...(dto.wing !== undefined ? { wing: dto.wing?.trim() || null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.defaultWaiterMembershipId !== undefined
            ? { defaultWaiterMembershipId: dto.defaultWaiterMembershipId }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
        include: {
          defaultWaiter: { select: { id: true, employeeDisplayName: true } },
          stays: { where: { status: 'IN_HOUSE' }, take: 1 },
        },
      });
      return { data: this.toRoomDto(updated) };
    } catch {
      throw new ConflictException({
        status: 409,
        errors: { roomNumber: 'duplicate' },
      });
    }
  }

  async archiveRoom(userId: string, roomId: string) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'manage',
      'Room',
      'Only managers can archive rooms.',
    );
    const existing = await this.prisma.hotelRoom.findFirst({
      where: { id: roomId, branchId: context.branchId!, archivedAt: null },
      include: { stays: { where: { status: 'IN_HOUSE' }, take: 1 } },
    });
    if (!existing) throw new NotFoundException('Room not found.');
    if (existing.stays.length > 0) {
      throw new UnprocessableEntityException(
        'Check out the guest before archiving.',
      );
    }
    await this.prisma.hotelRoom.update({
      where: { id: existing.id },
      data: { archivedAt: new Date(), status: 'OOO' },
    });
    return { success: true, message: 'Room archived.' };
  }

  async listInHouseStays(userId: string) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'operate',
      'RoomStay',
      'Front desk access required.',
    );
    await this.requireRoomServiceEnabled(context);
    const rows = await this.prisma.roomStay.findMany({
      where: { branchId: context.branchId!, status: 'IN_HOUSE' },
      include: {
        hotelRoom: true,
        entitlements: {
          where: { businessDate: startOfLocalDay() },
        },
      },
      orderBy: { checkInAt: 'desc' },
    });
    return {
      data: rows.map((row) => this.toStayDto(row)),
    };
  }

  async checkIn(userId: string, dto: CheckInRoomStayDto) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'operate',
      'RoomStay',
      'Front desk access required.',
    );
    await this.requireRoomServiceEnabled(context);
    if (!context.staffMembershipId) {
      throw new ForbiddenException('No staff membership.');
    }
    const settings = await this.ensureSettings(context.tenantId!);
    const room = await this.prisma.hotelRoom.findFirst({
      where: {
        id: dto.hotelRoomId,
        branchId: context.branchId!,
        archivedAt: null,
      },
    });
    if (!room) throw new NotFoundException('Room not found.');
    if (room.status === 'OOO') {
      throw new UnprocessableEntityException('Room is out of order.');
    }
    const openStay = await this.prisma.roomStay.findFirst({
      where: { hotelRoomId: room.id, status: 'IN_HOUSE' },
    });
    if (openStay) {
      throw new ConflictException('Room already has an in-house guest.');
    }

    const mealPlan =
      dto.mealPlan === 'BREAKFAST' && settings.breakfastEntitlementEnabled
        ? 'BREAKFAST'
        : 'NONE';
    const checkInAt = new Date();
    const plannedCheckOutAt = parseCheckout(dto.plannedCheckOutAt);
    if (plannedCheckOutAt <= checkInAt) {
      throw new UnprocessableEntityException(
        'Checkout must be after check-in.',
      );
    }
    const adults = dto.adults ?? 1;
    const kids = dto.kids ?? 0;

    const stay = await this.prisma.$transaction(async (tx) => {
      const created = await tx.roomStay.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          hotelRoomId: room.id,
          guestName: dto.guestName.trim(),
          guestPhone: dto.guestPhone?.trim() || null,
          adults,
          kids,
          mealPlan,
          status: 'IN_HOUSE',
          checkInAt,
          plannedCheckOutAt,
          checkedInByMembershipId: context.staffMembershipId!,
        },
      });
      await tx.hotelRoom.update({
        where: { id: room.id },
        data: { status: 'OCCUPIED' },
      });
      if (mealPlan === 'BREAKFAST') {
        const nights = eachBusinessNight(checkInAt, plannedCheckOutAt);
        if (nights.length > 0) {
          await tx.stayMealEntitlement.createMany({
            data: nights.map((businessDate) => ({
              tenantId: context.tenantId!,
              branchId: context.branchId!,
              roomStayId: created.id,
              mealType: 'BREAKFAST',
              businessDate,
              qtyAllowed: adults,
              qtyUsed: 0,
            })),
          });
        }
      }
      return tx.roomStay.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          hotelRoom: true,
          entitlements: true,
        },
      });
    });

    return { data: this.toStayDto(stay) };
  }

  async checkOut(userId: string, stayId: string) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'operate',
      'RoomStay',
      'Front desk access required.',
    );
    await this.requireRoomServiceEnabled(context);
    const stay = await this.prisma.roomStay.findFirst({
      where: { id: stayId, branchId: context.branchId!, status: 'IN_HOUSE' },
    });
    if (!stay) throw new NotFoundException('Stay not found.');

    const openSession = await this.prisma.roomSession.findFirst({
      where: {
        roomStayId: stay.id,
        status: { not: 'CLOSED' },
      },
    });
    if (openSession) {
      throw new UnprocessableEntityException(
        'Close the open room service session before checkout.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.roomStay.update({
        where: { id: stay.id },
        data: {
          status: 'CHECKED_OUT',
          checkedOutAt: new Date(),
          checkedOutByMembershipId: context.staffMembershipId ?? null,
        },
        include: { hotelRoom: true, entitlements: true },
      });
      await tx.hotelRoom.update({
        where: { id: stay.hotelRoomId },
        data: { status: 'AVAILABLE' },
      });
      return row;
    });
    return { data: this.toStayDto(updated) };
  }

  async listCoverages(userId: string) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(context, 'read', 'Room', 'Rooms access required.');
    await this.requireRoomServiceEnabled(context);
    const rows = await this.prisma.roomFloorCoverage.findMany({
      where: { branchId: context.branchId! },
      include: {
        waiter: { select: { id: true, employeeDisplayName: true } },
      },
      orderBy: [{ floor: 'asc' }],
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        floor: row.floor,
        waiterMembershipId: row.waiterMembershipId,
        waiterName: row.waiter.employeeDisplayName,
        shiftDefinitionId: row.shiftDefinitionId,
      })),
    };
  }

  async upsertCoverage(userId: string, dto: UpsertRoomFloorCoverageDto) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'manage',
      'Room',
      'Only managers can set coverage.',
    );
    await this.requireRoomServiceEnabled(context);
    const floor = dto.floor.trim();
    const existing = await this.prisma.roomFloorCoverage.findFirst({
      where: {
        branchId: context.branchId!,
        floor,
        waiterMembershipId: dto.waiterMembershipId,
        shiftDefinitionId: dto.shiftDefinitionId ?? null,
      },
    });
    const row = existing
      ? await this.prisma.roomFloorCoverage.update({
          where: { id: existing.id },
          data: {
            waiterMembershipId: dto.waiterMembershipId,
            shiftDefinitionId: dto.shiftDefinitionId ?? null,
          },
          include: {
            waiter: { select: { id: true, employeeDisplayName: true } },
          },
        })
      : await this.prisma.roomFloorCoverage.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            floor,
            waiterMembershipId: dto.waiterMembershipId,
            shiftDefinitionId: dto.shiftDefinitionId ?? null,
          },
          include: {
            waiter: { select: { id: true, employeeDisplayName: true } },
          },
        });
    return {
      data: {
        id: row.id,
        floor: row.floor,
        waiterMembershipId: row.waiterMembershipId,
        waiterName: row.waiter.employeeDisplayName,
        shiftDefinitionId: row.shiftDefinitionId,
      },
    };
  }

  async deleteCoverage(userId: string, coverageId: string) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'manage',
      'Room',
      'Only managers can remove coverage.',
    );
    const existing = await this.prisma.roomFloorCoverage.findFirst({
      where: { id: coverageId, branchId: context.branchId! },
    });
    if (!existing) throw new NotFoundException('Coverage not found.');
    await this.prisma.roomFloorCoverage.delete({ where: { id: existing.id } });
    return { success: true };
  }

  async listMyRooms(userId: string) {
    const context = await this.requireWaiter(userId);
    await this.requireRoomServiceEnabled(context);
    const rooms = await this.prisma.hotelRoom.findMany({
      where: {
        branchId: context.branchId!,
        archivedAt: null,
        status: { not: 'OOO' },
      },
      include: {
        stays: {
          where: { status: 'IN_HOUSE' },
          take: 1,
          orderBy: { checkInAt: 'desc' },
        },
        sessions: {
          where: { status: { not: 'CLOSED' } },
          take: 1,
          orderBy: { openedAt: 'desc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { roomNumber: 'asc' }],
    });

    const floors = [
      ...new Set(
        rooms.map((r) => r.floor).filter((f): f is string => Boolean(f)),
      ),
    ];
    const coverages =
      floors.length > 0
        ? await this.prisma.roomFloorCoverage.findMany({
            where: {
              branchId: context.branchId!,
              floor: { in: floors },
              waiterMembershipId: context.staffMembershipId!,
            },
          })
        : [];
    const coveredFloors = new Set(coverages.map((c) => c.floor));

    const data = rooms
      .filter((room) => {
        if (room.defaultWaiterMembershipId === context.staffMembershipId) {
          return true;
        }
        if (room.floor && coveredFloors.has(room.floor)) return true;
        if (
          room.sessions.some(
            (s) => s.primaryWaiterMembershipId === context.staffMembershipId,
          )
        ) {
          return true;
        }
        return false;
      })
      .map((room) => {
        const stay = room.stays[0] ?? null;
        const session = room.sessions[0] ?? null;
        return {
          hotelRoomId: room.id,
          roomNumber: room.roomNumber,
          floor: room.floor,
          status: room.status,
          stayId: stay?.id ?? null,
          guestName: stay?.guestName ?? null,
          mealPlan: stay?.mealPlan ?? null,
          roomSessionId: session?.id ?? null,
          sessionStatus: session?.status ?? null,
          sessionVersion: session?.version ?? null,
          mine: session
            ? session.primaryWaiterMembershipId === context.staffMembershipId
            : room.defaultWaiterMembershipId === context.staffMembershipId,
        };
      });

    return { data };
  }

  async forceCloseSession(
    userId: string,
    roomSessionId: string,
    dto: ForceCloseRoomSessionDto,
  ) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'manage',
      'Room',
      'Only managers can force-close room sessions.',
    );
    const session = await this.prisma.roomSession.findFirst({
      where: { id: roomSessionId, branchId: context.branchId! },
      include: {
        hotelRoom: true,
        orderItems: {
          where: { cancelledAt: null, state: { not: 'CANCELLED' } },
          select: { id: true, state: true },
        },
        bill: true,
      },
    });
    if (!session) throw new NotFoundException('Room session not found.');
    if (session.status === 'CLOSED' || session.closedAt) {
      throw new UnprocessableEntityException('Room session already closed.');
    }
    if (session.version !== dto.expectedVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: session.version,
      });
    }
    const liveItems = session.orderItems.filter((item) =>
      [
        'QUEUED',
        'ACKNOWLEDGED',
        'IN_PREPARATION',
        'READY',
        'CANNOT_PREPARE',
        'SERVED',
      ].includes(item.state),
    );
    if (liveItems.length > 0 && session.status !== 'PAID') {
      throw new ConflictException({
        status: 409,
        code: 'ROOM_FORCE_CLOSE_BLOCKED',
        errors: {
          session:
            'Cancel kitchen tickets or settle the bill before force-closing.',
        },
      });
    }
    if (
      ['ACTIVE_ORDER', 'BILL_REQUESTED', 'BILL_READY'].includes(session.status)
    ) {
      throw new ConflictException({
        status: 409,
        code: 'ROOM_FORCE_CLOSE_UNPAID',
        errors: {
          session: 'Settle or void unpaid items before force-closing.',
        },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const closed = await tx.roomSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedByMembershipId: context.staffMembershipId,
          closeReason: dto.reason.trim(),
          version: { increment: 1 },
        },
        include: { hotelRoom: true, roomStay: true },
      });
      if (session.status === 'PAID' || session.bill?.status === 'PAID') {
        await tx.bill.updateMany({
          where: { roomSessionId: session.id, status: 'PAID' },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            closedByMembershipId: context.staffMembershipId,
            version: { increment: 1 },
          },
        });
      }
      return closed;
    });

    return {
      data: {
        roomSessionId: updated.id,
        status: updated.status,
        version: updated.version,
        roomNumber: updated.hotelRoom.roomNumber,
        closeReason: updated.closeReason,
      },
    };
  }

  async openSession(userId: string, dto: OpenRoomSessionDto) {
    const context = await this.requireWaiter(userId);
    await this.requireRoomServiceEnabled(context);
    if (!context.staffMembershipId || !context.shiftSessionId) {
      throw new ForbiddenException('Clock in before opening room service.');
    }
    const stay = await this.prisma.roomStay.findFirst({
      where: {
        id: dto.roomStayId,
        branchId: context.branchId!,
        status: 'IN_HOUSE',
      },
      include: { hotelRoom: true },
    });
    if (!stay) throw new NotFoundException('Stay not found.');
    await this.assertWaiterCanServeRoom(context, stay.hotelRoom);

    const existing = await this.prisma.roomSession.findFirst({
      where: {
        roomStayId: stay.id,
        status: { not: 'CLOSED' },
      },
    });
    if (existing) {
      throw new ConflictException({
        status: 409,
        code: 'ROOM_SESSION_OPEN',
        roomSessionId: existing.id,
      });
    }

    const created = await this.prisma.roomSession.create({
      data: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        hotelRoomId: stay.hotelRoomId,
        roomStayId: stay.id,
        businessDate: startOfLocalDay(),
        primaryWaiterMembershipId: context.staffMembershipId,
        primaryWaiterShiftSessionId: context.shiftSessionId,
        guestCount: dto.guestCount ?? stay.adults + stay.kids,
        status: 'OPEN',
      },
      include: {
        hotelRoom: true,
        roomStay: true,
      },
    });

    return {
      data: {
        roomSessionId: created.id,
        hotelRoomId: created.hotelRoomId,
        roomNumber: created.hotelRoom.roomNumber,
        roomStayId: created.roomStayId,
        guestName: created.roomStay.guestName,
        status: created.status,
        version: created.version,
        openedAt: created.openedAt,
      },
    };
  }

  async listEntitlements(userId: string, stayId: string) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'operate',
      'RoomStay',
      'Front desk access required.',
    );
    const stay = await this.prisma.roomStay.findFirst({
      where: { id: stayId, branchId: context.branchId! },
    });
    if (!stay) throw new NotFoundException('Stay not found.');
    const rows = await this.prisma.stayMealEntitlement.findMany({
      where: { roomStayId: stay.id },
      orderBy: { businessDate: 'asc' },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        mealType: row.mealType,
        businessDate: localYmd(row.businessDate),
        qtyAllowed: row.qtyAllowed,
        qtyUsed: row.qtyUsed,
        qtyRemaining: Math.max(0, row.qtyAllowed - row.qtyUsed),
      })),
    };
  }

  async redeemBreakfast(userId: string, dto: RedeemBreakfastDto) {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'operate',
      'RoomStay',
      'Cannot redeem breakfast.',
    );
    await this.requireRoomServiceEnabled(context);
    const settings = await this.ensureSettings(context.tenantId!);
    if (!settings.breakfastEntitlementEnabled) {
      throw new UnprocessableEntityException(
        'Breakfast entitlements are disabled.',
      );
    }
    if (
      !isWithinLocalWindow(
        settings.breakfastValidFromLocal,
        settings.breakfastValidToLocal,
      )
    ) {
      throw new UnprocessableEntityException(
        'Outside breakfast redeem window.',
      );
    }
    const qty = dto.quantity ?? 1;
    const today = startOfLocalDay();
    const entitlement = await this.prisma.stayMealEntitlement.findFirst({
      where: {
        roomStayId: dto.roomStayId,
        mealType: 'BREAKFAST',
        businessDate: today,
        roomStay: { branchId: context.branchId!, status: 'IN_HOUSE' },
      },
    });
    if (!entitlement) {
      throw new NotFoundException('No breakfast entitlement for today.');
    }
    if (entitlement.qtyUsed + qty > entitlement.qtyAllowed) {
      throw new UnprocessableEntityException('Not enough breakfast remaining.');
    }
    const updated = await this.prisma.stayMealEntitlement.update({
      where: { id: entitlement.id },
      data: { qtyUsed: { increment: qty } },
    });
    return {
      data: {
        id: updated.id,
        mealType: updated.mealType,
        businessDate: localYmd(updated.businessDate),
        qtyAllowed: updated.qtyAllowed,
        qtyUsed: updated.qtyUsed,
        qtyRemaining: Math.max(0, updated.qtyAllowed - updated.qtyUsed),
      },
    };
  }

  private async assertWaiterCanServeRoom(
    context: AuthContextDto,
    room: {
      id: string;
      floor: string | null;
      defaultWaiterMembershipId: string | null;
    },
  ) {
    if (room.defaultWaiterMembershipId === context.staffMembershipId) return;
    if (room.floor) {
      const coverage = await this.prisma.roomFloorCoverage.findFirst({
        where: {
          branchId: context.branchId!,
          floor: room.floor,
          waiterMembershipId: context.staffMembershipId!,
        },
      });
      if (coverage) return;
    }
    throw new ForbiddenException('This room is not assigned to you.');
  }

  private async requireRoomServiceEnabled(context: AuthContextDto) {
    const settings = await this.ensureSettings(context.tenantId!);
    // Managers/owners may configure rooms while the feature is off.
    if (
      !settings.roomServiceEnabled &&
      !this.casl.can(context, 'manage', 'Room')
    ) {
      throw new ForbiddenException(
        'Room service is disabled for this restaurant.',
      );
    }
    return settings;
  }

  private async assertRoomServiceOrAdmin(context: AuthContextDto) {
    const settings = await this.ensureSettings(context.tenantId!);
    if (
      !settings.roomServiceEnabled &&
      !this.casl.can(context, 'manage', 'Room')
    ) {
      throw new ForbiddenException(
        'Room service is disabled for this restaurant.',
      );
    }
  }

  private async ensureSettings(tenantId: string) {
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
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
    if (
      !['WAITER', 'MANAGER', 'OWNER_ADMIN'].includes(context.roleCode ?? '')
    ) {
      throw new ForbiddenException('Waiter access required.');
    }
    return context;
  }

  private toRoomDto(row: {
    id: string;
    roomNumber: string;
    floor: string | null;
    wing: string | null;
    status: string;
    sortOrder: number;
    defaultWaiterMembershipId: string | null;
    defaultWaiter: { id: string; employeeDisplayName: string } | null;
    stays: Array<{ id: string; guestName: string; mealPlan: string }>;
  }) {
    const stay = row.stays[0] ?? null;
    return {
      id: row.id,
      roomNumber: row.roomNumber,
      floor: row.floor,
      wing: row.wing,
      status: row.status,
      sortOrder: row.sortOrder,
      defaultWaiterMembershipId: row.defaultWaiterMembershipId,
      defaultWaiterName: row.defaultWaiter?.employeeDisplayName ?? null,
      stayId: stay?.id ?? null,
      guestName: stay?.guestName ?? null,
      mealPlan: stay?.mealPlan ?? null,
    };
  }

  private toStayDto(row: {
    id: string;
    hotelRoomId: string;
    guestName: string;
    guestPhone: string | null;
    adults: number;
    kids: number;
    mealPlan: string;
    status: string;
    checkInAt: Date;
    plannedCheckOutAt: Date;
    checkedOutAt: Date | null;
    hotelRoom: { roomNumber: string; floor: string | null };
    entitlements?: Array<{
      id: string;
      mealType: string;
      businessDate: Date;
      qtyAllowed: number;
      qtyUsed: number;
    }>;
  }) {
    return {
      id: row.id,
      hotelRoomId: row.hotelRoomId,
      roomNumber: row.hotelRoom.roomNumber,
      floor: row.hotelRoom.floor,
      guestName: row.guestName,
      guestPhone: row.guestPhone,
      adults: row.adults,
      kids: row.kids,
      mealPlan: row.mealPlan,
      status: row.status,
      checkInAt: row.checkInAt,
      plannedCheckOutAt: row.plannedCheckOutAt,
      checkedOutAt: row.checkedOutAt,
      entitlements: (row.entitlements ?? []).map((e) => ({
        id: e.id,
        mealType: e.mealType,
        businessDate: localYmd(e.businessDate),
        qtyAllowed: e.qtyAllowed,
        qtyUsed: e.qtyUsed,
        qtyRemaining: Math.max(0, e.qtyAllowed - e.qtyUsed),
      })),
    };
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

function parseCheckout(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0, 0);
    return date;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new UnprocessableEntityException('Invalid checkout date.');
  }
  return parsed;
}

/** Nights from check-in calendar day through the day before planned checkout. */
function eachBusinessNight(checkInAt: Date, plannedCheckOutAt: Date): Date[] {
  const nights: Date[] = [];
  const cursor = startOfLocalDay(checkInAt);
  const lastNight = startOfLocalDay(plannedCheckOutAt);
  lastNight.setDate(lastNight.getDate() - 1);
  while (cursor <= lastNight) {
    nights.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return nights;
}

function isWithinLocalWindow(
  fromHm: string,
  toHm: string,
  now = new Date(),
): boolean {
  const [fh, fm] = fromHm.split(':').map(Number);
  const [th, tm] = toHm.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  if (from <= to) return minutes >= from && minutes <= to;
  return minutes >= from || minutes <= to;
}
