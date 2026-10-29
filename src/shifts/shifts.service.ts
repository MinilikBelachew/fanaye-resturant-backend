import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { businessDateUtc } from '../common/business-date';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import {
  CurrentShiftResponseDto,
  ShiftAssignmentSummaryDto,
  ShiftSessionDto,
  ShiftTableSummaryDto,
  WeeklyShiftPlanItemDto,
} from './dto/current-shift-response.dto';

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
/** JS Date#getDay() index → dayCode used by StaffDayShift */
const DAY_CODES_JS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type ClockInWindow = {
  assignment: {
    id: string;
    roleId: number | null;
    graceMinutes: number;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
    definition: { name: string } | null;
  } | null;
  startAt: Date | null;
  endAt: Date | null;
  graceMinutes: number;
  definitionName: string;
};

function emptyClockInWindow(): ClockInWindow {
  return {
    assignment: null,
    startAt: null,
    endAt: null,
    graceMinutes: 15,
    definitionName: 'Shift',
  };
}
import {
  HandoverCandidateDto,
  ShiftHandoverDto,
  ShiftHandoverResponseDto,
  WaiterShiftHandoverDto,
  WaiterShiftHandoverResponseDto,
} from './dto/shift-handover.dto';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async getCurrent(userId: string): Promise<CurrentShiftResponseDto> {
    const context = await this.identityContext.getByUserId(userId);
    if (!context.staffMembershipId || !context.branchId) {
      return {
        clockedIn: false,
        shiftSession: null,
        upcomingAssignment: null,
        weeklyPlan: [],
        upcomingAssignments: [],
      };
    }

    const open = await this.prisma.shiftSession.findFirst({
      where: {
        staffMembershipId: context.staffMembershipId,
        branchId: context.branchId,
        state: 'OPEN',
        clockOutAt: null,
      },
      include: {
        assignment: { include: { definition: true, role: true } },
        role: true,
      },
      orderBy: { clockInAt: 'desc' },
    });

    const [upcoming, weeklyPlan, upcomingAssignments] = await Promise.all([
      this.nextAssignment(context.staffMembershipId, context.branchId),
      this.getWeeklyPlan(context.staffMembershipId),
      this.listUpcomingAssignments(context.staffMembershipId, context.branchId),
    ]);

    const todayDayIndex = (new Date().getDay() + 6) % 7;
    const todayDayCode = DAY_ORDER[todayDayIndex];
    const todayPlan = weeklyPlan.find((item) => item.dayCode === todayDayCode);
    let assignedTables: ShiftTableSummaryDto[] = todayPlan?.tables ?? [];

    if (open) {
      const openShiftDefinitionId = open.assignment?.definition?.id;
      if (
        openShiftDefinitionId &&
        openShiftDefinitionId !== todayPlan?.shiftDefinitionId
      ) {
        const matchingPlan = weeklyPlan.find(
          (item) =>
            item.shiftDefinitionId === openShiftDefinitionId &&
            item.dayCode === todayDayCode,
        );
        if (matchingPlan?.tables && matchingPlan.tables.length > 0) {
          assignedTables = matchingPlan.tables;
        }
      }
    }

    return {
      clockedIn: Boolean(open),
      shiftSession: open ? this.toSessionDto(open) : null,
      upcomingAssignment: upcoming,
      weeklyPlan,
      upcomingAssignments,
      assignedTables,
    };
  }

  async clockIn(
    userId: string,
    dto: ClockInDto,
  ): Promise<CurrentShiftResponseDto> {
    const context = await this.identityContext.getByUserId(userId);
    if (!context.staffMembershipId || !context.tenantId || !context.branchId) {
      throw new ForbiddenException(
        'No restaurant membership for this account.',
      );
    }

    const current = await this.getCurrent(userId);
    if (current.clockedIn) {
      return current;
    }

    const now = new Date();
    const window = await this.resolveClockInWindow(
      context.staffMembershipId,
      context.branchId,
      now,
      dto.shiftAssignmentId,
    );

    if (dto.shiftAssignmentId && !window.assignment) {
      throw new NotFoundException('Shift assignment not found.');
    }

    this.assertWithinClockInWindow(window, now);
    // Guaranteed non-null after assertWithinClockInWindow
    const scheduledStartAt = window.startAt!;
    const scheduledEndAt = window.endAt!;

    const role = await this.prisma.staffRoleAssignment.findFirst({
      where: {
        staffMembershipId: context.staffMembershipId,
        status: 'ACTIVE',
        revokedAt: null,
      },
    });

    const roleId =
      dto.roleId ?? window.assignment?.roleId ?? role?.roleId ?? null;
    const businessDate = businessDateUtc(now);

    const lateByMinutes = Math.max(
      0,
      Math.round((now.getTime() - scheduledStartAt.getTime()) / 60000),
    );

    try {
      await this.prisma.shiftSession.create({
        data: {
          tenantId: context.tenantId,
          branchId: context.branchId,
          shiftAssignmentId: window.assignment?.id ?? null,
          staffMembershipId: context.staffMembershipId,
          roleId,
          scheduledStartAtSnapshot: scheduledStartAt,
          scheduledEndAtSnapshot: scheduledEndAt,
          graceMinutesSnapshot: window.graceMinutes,
          clockInAt: now,
          lateByMinutes,
          state: 'OPEN',
          businessDate,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.getCurrent(userId);
      }
      throw error;
    }

    const opened = await this.getCurrent(userId);
    if (
      opened.shiftSession &&
      context.roleCode === 'CASHIER' &&
      context.tenantId &&
      context.branchId &&
      context.staffMembershipId
    ) {
      await this.ensureCashierDrawer(
        opened.shiftSession.id,
        {
          tenantId: context.tenantId,
          branchId: context.branchId,
          staffMembershipId: context.staffMembershipId,
        },
        businessDate,
      );
    }
    return opened;
  }

  /** Opening float is always 0 — no set-float flow. */
  private async ensureCashierDrawer(
    shiftSessionId: string,
    context: {
      tenantId: string;
      branchId: string;
      staffMembershipId: string;
    },
    businessDate: Date,
  ) {
    const existing = await this.prisma.cashierFinancialSession.findFirst({
      where: { shiftSessionId },
    });
    if (existing) return;
    try {
      await this.prisma.cashierFinancialSession.create({
        data: {
          tenantId: context.tenantId,
          branchId: context.branchId,
          businessDate,
          cashierMembershipId: context.staffMembershipId,
          shiftSessionId,
          status: 'OPEN',
          openingFloatAmount: 0,
          currencyCode: 'ETB',
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  async clockOut(
    userId: string,
    shiftSessionId: string,
    dto: ClockOutDto,
  ): Promise<CurrentShiftResponseDto> {
    const context = await this.identityContext.getByUserId(userId);
    if (!context.staffMembershipId) {
      throw new ForbiddenException(
        'No restaurant membership for this account.',
      );
    }

    const session = await this.prisma.shiftSession.findFirst({
      where: {
        id: shiftSessionId,
        staffMembershipId: context.staffMembershipId,
      },
    });

    if (!session) {
      throw new NotFoundException('Shift session not found.');
    }

    if (session.state !== 'OPEN' || session.clockOutAt) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { shift: 'alreadyClosed' },
      });
    }

    if (session.version !== dto.expectedVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: session.version,
      });
    }

    const openTables = await this.prisma.tableSession.count({
      where: {
        primaryWaiterMembershipId: context.staffMembershipId,
        closedAt: null,
        status: { not: 'CLOSED' },
      },
    });

    if (openTables > 0) {
      throw new ConflictException({
        status: 409,
        errors: { shift: 'openTables' },
        openTables,
      });
    }

    await this.closeCashierDrawerIfNeeded(session.id);

    await this.prisma.shiftSession.update({
      where: { id: session.id },
      data: {
        clockOutAt: new Date(),
        state: 'CLOSED',
        version: { increment: 1 },
      },
    });

    return this.getCurrent(userId);
  }

  /**
   * Ending a cashier shift closes the financial drawer session.
   * Empty drawers auto-close. Drawers with cash need a matching
   * reconciliation (or an approved one that still matches expected).
   */
  private async closeCashierDrawerIfNeeded(shiftSessionId: string) {
    const financial = await this.prisma.cashierFinancialSession.findFirst({
      where: { shiftSessionId },
    });
    if (!financial) return;

    const recon = await this.prisma.cashierReconciliation.findUnique({
      where: { cashierFinancialSessionId: financial.id },
    });

    if (financial.status === 'RECONCILED' || financial.status === 'CLOSED') {
      if (!financial.closedAt) {
        await this.prisma.cashierFinancialSession.update({
          where: { id: financial.id },
          data: { closedAt: new Date() },
        });
      }
      return;
    }

    if (recon?.status === 'APPROVED') {
      const liveExpected = await this.liveExpectedCash(financial);
      if (!liveExpected.equals(recon.expectedCashAmount)) {
        throw new ConflictException({
          status: 409,
          errors: { shift: 'drawerStale' },
        });
      }
      await this.prisma.cashierFinancialSession.update({
        where: { id: financial.id },
        data: {
          status: 'RECONCILED',
          closedAt: new Date(),
        },
      });
      return;
    }

    if (financial.status === 'RECONCILIATION_PENDING') {
      throw new ConflictException({
        status: 409,
        errors: { shift: 'drawerPending' },
      });
    }

    if (financial.status === 'OPEN') {
      if (
        recon &&
        recon.status === 'SUBMITTED' &&
        new Prisma.Decimal(recon.varianceAmount).equals(0)
      ) {
        const liveExpected = await this.liveExpectedCash(financial);
        if (!liveExpected.equals(recon.expectedCashAmount)) {
          throw new ConflictException({
            status: 409,
            errors: { shift: 'drawerStale' },
          });
        }
        await this.prisma.cashierFinancialSession.update({
          where: { id: financial.id },
          data: {
            status: 'RECONCILED',
            closedAt: new Date(),
          },
        });
        return;
      }

      const receivedDrops = await this.prisma.cashDrop.count({
        where: {
          cashierFinancialSessionId: financial.id,
          status: { in: ['RECEIVED', 'RESOLVED'] },
        },
      });
      const float = new Prisma.Decimal(financial.openingFloatAmount);
      const hasCash = float.gt(0) || receivedDrops > 0;

      if (hasCash) {
        throw new ConflictException({
          status: 409,
          errors: { shift: 'drawerOpen' },
        });
      }

      await this.prisma.cashierFinancialSession.update({
        where: { id: financial.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
        },
      });
    }
  }

  private async liveExpectedCash(financial: {
    id: string;
    openingFloatAmount: Prisma.Decimal;
  }) {
    const entries = await this.prisma.cashLedgerEntry.findMany({
      where: {
        cashierFinancialSessionId: financial.id,
        holderType: 'CASHIER_SESSION',
      },
    });
    let drops = new Prisma.Decimal(0);
    let otherIn = new Prisma.Decimal(0);
    let otherOut = new Prisma.Decimal(0);
    for (const entry of entries) {
      if (entry.entryType === 'CASH_DROP_IN') {
        drops = drops.plus(entry.amountDelta);
      } else if (entry.entryType === 'OPENING_FLOAT') {
        // session float is source of truth
      } else if (entry.amountDelta.gt(0)) {
        otherIn = otherIn.plus(entry.amountDelta);
      } else if (entry.amountDelta.lt(0)) {
        otherOut = otherOut.plus(entry.amountDelta.abs());
      }
    }
    return new Prisma.Decimal(financial.openingFloatAmount)
      .plus(drops)
      .plus(otherIn)
      .minus(otherOut);
  }

  private async resolveAssignment(
    membershipId: string,
    branchId: string,
    shiftAssignmentId?: string,
  ) {
    const include = { definition: true, role: true } as const;
    if (shiftAssignmentId) {
      return this.prisma.shiftAssignment.findFirst({
        where: {
          id: shiftAssignmentId,
          staffMembershipId: membershipId,
          branchId,
        },
        include,
      });
    }

    const now = new Date();
    const covering = await this.prisma.shiftAssignment.findFirst({
      where: {
        staffMembershipId: membershipId,
        branchId,
        status: 'SCHEDULED',
        scheduledStartAt: { lte: now },
        scheduledEndAt: { gte: now },
      },
      include,
    });
    if (covering) return covering;

    const upcoming = await this.prisma.shiftAssignment.findFirst({
      where: {
        staffMembershipId: membershipId,
        branchId,
        status: 'SCHEDULED',
        scheduledStartAt: { gte: now },
      },
      include,
      orderBy: { scheduledStartAt: 'asc' },
    });
    if (upcoming) return upcoming;

    return this.prisma.shiftAssignment.findFirst({
      where: {
        staffMembershipId: membershipId,
        branchId,
        status: 'SCHEDULED',
      },
      include,
      orderBy: { scheduledStartAt: 'desc' },
    });
  }

  private async nextAssignment(
    membershipId: string,
    branchId: string,
  ): Promise<ShiftAssignmentSummaryDto | null> {
    const assignment = await this.resolveAssignment(membershipId, branchId);
    if (!assignment) return null;
    return {
      id: assignment.id,
      definitionName: assignment.definition?.name ?? 'Shift',
      scheduledStartAt: assignment.scheduledStartAt,
      scheduledEndAt: assignment.scheduledEndAt,
      roleCode: assignment.role?.code ?? null,
    };
  }

  /**
   * Clock-in is only allowed during today's assigned window (± grace).
   * Weekly StaffDayShift is preferred; ShiftAssignment is the fallback.
   */
  private async resolveClockInWindow(
    membershipId: string,
    branchId: string,
    now: Date,
    shiftAssignmentId?: string,
  ): Promise<ClockInWindow> {
    const include = { definition: true, role: true } as const;

    if (shiftAssignmentId) {
      const assigned = await this.prisma.shiftAssignment.findFirst({
        where: {
          id: shiftAssignmentId,
          staffMembershipId: membershipId,
          branchId,
        },
        include,
      });
      if (!assigned) {
        return emptyClockInWindow();
      }
      return {
        assignment: assigned,
        startAt: assigned.scheduledStartAt,
        endAt: assigned.scheduledEndAt,
        graceMinutes: assigned.graceMinutes ?? 15,
        definitionName: assigned.definition?.name ?? 'Shift',
      };
    }

    const dayCode = DAY_CODES_JS[now.getDay()];
    const dayPlan = await this.prisma.staffDayShift.findFirst({
      where: { staffMembershipId: membershipId, dayCode },
      include: { shiftDefinition: true },
    });

    if (dayPlan?.shiftDefinition) {
      const { startAt, endAt } = computeShiftWindowForDay(
        dayPlan.shiftDefinition.startLocalTime,
        dayPlan.shiftDefinition.endLocalTime,
        now,
      );
      const graceMinutes = dayPlan.shiftDefinition.graceMinutes ?? 15;
      const assignment = await this.prisma.shiftAssignment.findFirst({
        where: {
          staffMembershipId: membershipId,
          branchId,
          status: 'SCHEDULED',
          shiftDefinitionId: dayPlan.shiftDefinitionId,
          scheduledStartAt: {
            gte: new Date(startAt.getTime() - 12 * 60 * 60 * 1000),
            lte: new Date(endAt.getTime() + 12 * 60 * 60 * 1000),
          },
        },
        include,
        orderBy: { scheduledStartAt: 'asc' },
      });
      return {
        assignment,
        startAt,
        endAt,
        graceMinutes,
        definitionName: dayPlan.shiftDefinition.name,
      };
    }

    const gracePadMs = 4 * 60 * 60 * 1000;
    const covering = await this.prisma.shiftAssignment.findFirst({
      where: {
        staffMembershipId: membershipId,
        branchId,
        status: 'SCHEDULED',
        scheduledStartAt: { lte: new Date(now.getTime() + gracePadMs) },
        scheduledEndAt: { gte: new Date(now.getTime() - gracePadMs) },
      },
      include,
      orderBy: { scheduledStartAt: 'asc' },
    });
    if (!covering) {
      return emptyClockInWindow();
    }
    return {
      assignment: covering,
      startAt: covering.scheduledStartAt,
      endAt: covering.scheduledEndAt,
      graceMinutes: covering.graceMinutes ?? 15,
      definitionName: covering.definition?.name ?? 'Shift',
    };
  }

  private assertWithinClockInWindow(window: ClockInWindow, now: Date): void {
    if (!window.startAt || !window.endAt) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'NO_SHIFT_TODAY',
        errors: { shift: 'noAssignmentToday' },
        message: 'You have no shift assigned for today.',
      });
    }

    const graceMs = Math.max(0, window.graceMinutes) * 60_000;
    const earliest = window.startAt.getTime() - graceMs;
    const latest = window.endAt.getTime() + graceMs;
    if (now.getTime() < earliest || now.getTime() > latest) {
      const startLabel = formatClockLabel(window.startAt);
      const endLabel = formatClockLabel(window.endAt);
      throw new UnprocessableEntityException({
        status: 422,
        code: 'SHIFT_OUTSIDE_WINDOW',
        errors: { shift: 'outsideWindow' },
        message: `Clock-in is only allowed during ${window.definitionName} (${startLabel}–${endLabel}, ±${window.graceMinutes} min grace).`,
      });
    }
  }

  private async getWeeklyPlan(
    membershipId: string,
  ): Promise<WeeklyShiftPlanItemDto[]> {
    const [rows, coverages] = await Promise.all([
      this.prisma.staffDayShift.findMany({
        where: { staffMembershipId: membershipId },
        include: { shiftDefinition: true },
      }),
      this.prisma.diningTableShiftCoverage.findMany({
        where: {
          waiterMembershipId: membershipId,
          table: { archivedAt: null },
        },
        include: {
          table: {
            include: { location: true },
          },
        },
      }),
    ]);

    const tablesByShiftDay = new Map<string, ShiftTableSummaryDto[]>();
    for (const cov of coverages) {
      if (!cov.table) continue;
      const tableDto: ShiftTableSummaryDto = {
        tableId: cov.table.id,
        displayName: cov.table.displayName,
        displayNumber: cov.table.displayNumber,
        locationName: cov.table.location?.name ?? 'Main Floor',
      };
      if (cov.dayCode) {
        const key = `${cov.shiftDefinitionId}:${cov.dayCode}`;
        if (!tablesByShiftDay.has(key)) tablesByShiftDay.set(key, []);
        tablesByShiftDay.get(key)!.push(tableDto);
      } else {
        for (const day of DAY_ORDER) {
          const key = `${cov.shiftDefinitionId}:${day}`;
          if (!tablesByShiftDay.has(key)) tablesByShiftDay.set(key, []);
          tablesByShiftDay.get(key)!.push(tableDto);
        }
      }
    }

    for (const list of tablesByShiftDay.values()) {
      list.sort((a, b) =>
        (a.displayNumber || a.displayName).localeCompare(
          b.displayNumber || b.displayName,
          undefined,
          { numeric: true },
        ),
      );
    }

    return rows
      .map((row) => {
        const key = `${row.shiftDefinitionId}:${row.dayCode}`;
        const shiftTables = tablesByShiftDay.get(key) ?? [];
        return {
          dayCode: row.dayCode,
          definitionName: row.shiftDefinition?.name ?? 'Shift',
          startLocalTime: formatShiftLocalTime(
            row.shiftDefinition.startLocalTime,
          ),
          endLocalTime: formatShiftLocalTime(row.shiftDefinition.endLocalTime),
          shiftDefinitionId: row.shiftDefinitionId,
          tables: shiftTables,
        };
      })
      .sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.dayCode as (typeof DAY_ORDER)[number]) -
          DAY_ORDER.indexOf(b.dayCode as (typeof DAY_ORDER)[number]),
      );
  }

  private async listUpcomingAssignments(
    membershipId: string,
    branchId: string,
  ): Promise<ShiftAssignmentSummaryDto[]> {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 14);

    const rows = await this.prisma.shiftAssignment.findMany({
      where: {
        staffMembershipId: membershipId,
        branchId,
        status: 'SCHEDULED',
        scheduledEndAt: { gte: now },
        scheduledStartAt: { lte: horizon },
      },
      include: { definition: true, role: true },
      orderBy: { scheduledStartAt: 'asc' },
      take: 21,
    });

    return rows.map((row) => ({
      id: row.id,
      definitionName: row.definition?.name ?? 'Shift',
      scheduledStartAt: row.scheduledStartAt,
      scheduledEndAt: row.scheduledEndAt,
      roleCode: row.role?.code ?? null,
    }));
  }

  private toSessionDto(session: {
    id: string;
    state: string;
    version: number;
    clockInAt: Date;
    clockOutAt: Date | null;
    scheduledStartAtSnapshot: Date | null;
    scheduledEndAtSnapshot: Date | null;
    branchId: string;
    shiftAssignmentId: string | null;
    assignment: {
      definition: { name: string } | null;
      role: { code: string } | null;
    } | null;
    role: { code: string } | null;
  }): ShiftSessionDto {
    return {
      id: session.id,
      state: session.state,
      version: session.version,
      clockInAt: session.clockInAt,
      clockOutAt: session.clockOutAt,
      scheduledStartAt: session.scheduledStartAtSnapshot,
      scheduledEndAt: session.scheduledEndAtSnapshot,
      definitionName: session.assignment?.definition?.name ?? null,
      roleCode: session.role?.code ?? session.assignment?.role?.code ?? null,
      branchId: session.branchId,
      assignmentId: session.shiftAssignmentId,
    };
  }

  async getHandoverCandidates(userId: string): Promise<HandoverCandidateDto[]> {
    const context = await this.identityContext.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      return [];
    }

    const members = await this.prisma.tenantStaffMembership.findMany({
      where: {
        tenantId: context.tenantId,
        status: 'ACTIVE',
        id: { not: context.staffMembershipId ?? '' },
        branchAssignments: {
          some: {
            branchId: context.branchId,
            status: 'ACTIVE',
            releasedAt: null,
          },
        },
        roleAssignments: {
          some: {
            status: 'ACTIVE',
            revokedAt: null,
            role: { code: 'CASHIER' },
          },
        },
      },
      include: {
        user: { include: { photo: true } },
        roleAssignments: {
          where: { status: 'ACTIVE', revokedAt: null },
          include: { role: true },
        },
      },
      orderBy: { employeeDisplayName: 'asc' },
    });

    return members.map((m) => ({
      membershipId: m.id,
      displayName:
        m.user?.displayName || m.employeeDisplayName || 'Staff Member',
      roleCode: m.roleAssignments[0]?.role?.code ?? 'CASHIER',
      photoUrl: m.user?.photo?.path ?? null,
    }));
  }

  async handover(
    userId: string,
    dto: ShiftHandoverDto,
  ): Promise<ShiftHandoverResponseDto> {
    const context = await this.identityContext.getByUserId(userId);
    if (!context.staffMembershipId || !context.tenantId || !context.branchId) {
      throw new ForbiddenException(
        'No restaurant membership for this account.',
      );
    }

    const openShift = await this.prisma.shiftSession.findFirst({
      where: {
        staffMembershipId: context.staffMembershipId,
        branchId: context.branchId,
        state: 'OPEN',
        clockOutAt: null,
      },
    });

    if (!openShift) {
      throw new NotFoundException('Active shift session not found.');
    }

    if (openShift.version !== dto.expectedVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: openShift.version,
      });
    }

    const financial = await this.prisma.cashierFinancialSession.findFirst({
      where: { shiftSessionId: openShift.id },
    });

    if (!financial || financial.status !== 'OPEN') {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { drawer: 'notOpen' },
      });
    }

    const incoming = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: dto.incomingCashierMembershipId,
        tenantId: context.tenantId,
        status: 'ACTIVE',
        branchAssignments: {
          some: {
            branchId: context.branchId,
            status: 'ACTIVE',
            releasedAt: null,
          },
        },
      },
      include: {
        user: { include: { credential: true } },
        roleAssignments: {
          where: { status: 'ACTIVE', revokedAt: null },
          include: { role: true },
        },
      },
    });

    if (!incoming || !incoming.user) {
      throw new NotFoundException('Incoming cashier not found in this branch.');
    }

    const hasCashierRole = incoming.roleAssignments.some(
      (ra) => ra.role?.code === 'CASHIER',
    );
    if (!hasCashierRole) {
      throw new ForbiddenException(
        'Incoming staff member must have the CASHIER role.',
      );
    }

    if (!incoming.user.credential?.passwordHash) {
      throw new ForbiddenException(
        'Incoming cashier has no PIN or password configured.',
      );
    }

    const isPinMatch = await bcrypt.compare(
      dto.incomingCashierPin.trim(),
      incoming.user.credential.passwordHash,
    );
    if (!isPinMatch) {
      throw new UnauthorizedException('Invalid PIN for incoming cashier.');
    }

    const incomingActiveShift = await this.prisma.shiftSession.findFirst({
      where: {
        staffMembershipId: incoming.id,
        branchId: context.branchId,
        state: 'OPEN',
        clockOutAt: null,
      },
    });
    if (incomingActiveShift) {
      throw new ConflictException(
        'Incoming cashier is already clocked in on another active shift.',
      );
    }

    const counted = new Prisma.Decimal(dto.countedAmount);
    const floatNext = new Prisma.Decimal(dto.floatForNextCashier);
    if (floatNext.gt(counted)) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: {
          floatForNextCashier:
            'Opening float cannot exceed total physical cash counted.',
        },
      });
    }

    const safeDrop = counted.minus(floatNext);
    const expected = await this.liveExpectedCash(financial);
    const variance = counted.minus(expected);
    const now = new Date();
    const incomingBusinessDate = businessDateUtc(now);
    const incomingRoleId = incoming.roleAssignments[0]?.roleId ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.cashierReconciliation.upsert({
        where: { cashierFinancialSessionId: financial.id },
        create: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: financial.businessDate,
          cashierFinancialSessionId: financial.id,
          expectedCashAmount: expected,
          countedCashAmount: counted,
          varianceAmount: variance,
          cashierComment: dto.notes
            ? `Handover to ${incoming.user.displayName}: ${dto.notes}`
            : `Shift handover to ${incoming.user.displayName}`,
          status: variance.equals(0) ? 'APPROVED' : 'SUBMITTED',
        },
        update: {
          expectedCashAmount: expected,
          countedCashAmount: counted,
          varianceAmount: variance,
          cashierComment: dto.notes
            ? `Handover to ${incoming.user.displayName}: ${dto.notes}`
            : `Shift handover to ${incoming.user.displayName}`,
          status: variance.equals(0) ? 'APPROVED' : 'SUBMITTED',
        },
      });

      if (safeDrop.gt(0)) {
        await tx.cashLedgerEntry.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            businessDate: financial.businessDate,
            holderType: 'CASHIER_SESSION',
            cashierFinancialSessionId: financial.id,
            entryType: 'SAFE_DROP_OUT',
            amountDelta: safeDrop.negated(),
            sourceType: 'SHIFT_HANDOVER',
            sourceId: financial.id,
            createdByMembershipId: context.staffMembershipId,
          },
        });
      }

      if (floatNext.gt(0)) {
        await tx.cashLedgerEntry.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            businessDate: financial.businessDate,
            holderType: 'CASHIER_SESSION',
            cashierFinancialSessionId: financial.id,
            entryType: 'HANDOVER_OUT',
            amountDelta: floatNext.negated(),
            sourceType: 'SHIFT_HANDOVER',
            sourceId: financial.id,
            createdByMembershipId: context.staffMembershipId,
          },
        });
      }

      await tx.cashierFinancialSession.update({
        where: { id: financial.id },
        data: {
          status: 'RECONCILED',
          closedAt: now,
        },
      });

      await tx.shiftSession.update({
        where: { id: openShift.id },
        data: {
          state: 'CLOSED',
          clockOutAt: now,
          version: { increment: 1 },
        },
      });

      const newShift = await tx.shiftSession.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          staffMembershipId: incoming.id,
          roleId: incomingRoleId,
          clockInAt: now,
          state: 'OPEN',
          businessDate: incomingBusinessDate,
        },
      });

      const newDrawer = await tx.cashierFinancialSession.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: incomingBusinessDate,
          cashierMembershipId: incoming.id,
          shiftSessionId: newShift.id,
          status: 'OPEN',
          openingFloatAmount: floatNext,
          currencyCode: 'ETB',
          openedAt: now,
        },
      });

      if (floatNext.gt(0)) {
        await tx.cashLedgerEntry.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            businessDate: incomingBusinessDate,
            holderType: 'CASHIER_SESSION',
            cashierFinancialSessionId: newDrawer.id,
            entryType: 'OPENING_FLOAT',
            amountDelta: floatNext,
            sourceType: 'SHIFT_HANDOVER',
            sourceId: financial.id,
            createdByMembershipId: incoming.id,
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          branchId: context.branchId,
          actorUserId: String(userId),
          actorStaffMembershipId: context.staffMembershipId,
          action: 'SHIFT_HANDOVER',
          entityType: 'CASHIER_FINANCIAL_SESSION',
          entityId: financial.id,
          metadataJson: {
            outgoingCashier: context.displayName ?? 'Cashier',
            incomingCashier: incoming.user.displayName,
            countedAmount: counted.toString(),
            floatForNextCashier: floatNext.toString(),
            safeDropAmount: safeDrop.toString(),
            varianceAmount: variance.toString(),
          },
        },
      });
    });

    return {
      outgoingCashierName: context.displayName ?? 'Cashier',
      incomingCashierName: incoming.user.displayName,
      countedAmountFormatted: `ETB ${counted.toFixed(2)}`,
      expectedAmountFormatted: `ETB ${expected.toFixed(2)}`,
      varianceAmountFormatted: `ETB ${variance.toFixed(2)}`,
      floatTransferredFormatted: `ETB ${floatNext.toFixed(2)}`,
      safeDropAmountFormatted: `ETB ${safeDrop.toFixed(2)}`,
      handedOverAt: now,
      status: variance.equals(0) ? 'COMPLETED' : 'DISCREPANCY_SUBMITTED',
    };
  }

  private async calculateWaiterUndroppedCash(
    branchId: string,
    waiterMembershipId: string,
    shiftSessionId: string,
  ): Promise<Prisma.Decimal> {
    const [payments, drops, handoverEntries] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          branchId,
          collectorMembershipId: waiterMembershipId,
          collectorShiftSessionId: shiftSessionId,
          method: 'CASH',
          status: 'SETTLED',
        },
      }),
      this.prisma.cashDrop.findMany({
        where: {
          waiterShiftSessionId: shiftSessionId,
        },
      }),
      this.prisma.cashLedgerEntry.findMany({
        where: {
          waiterShiftSessionId: shiftSessionId,
          holderType: 'WAITER_SHIFT',
          entryType: { in: ['WAITER_HANDOVER_IN', 'WAITER_HANDOVER_OUT'] },
        },
      }),
    ]);

    const cashCollected = payments.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    const cashDropped = drops
      .filter((drop) => drop.status === 'RECEIVED')
      .reduce(
        (sum, drop) =>
          sum.plus(drop.resolutionAmount ?? drop.countedAmount ?? 0),
        new Prisma.Decimal(0),
      );
    const pendingCashDropAmount = drops
      .filter((drop) => drop.status === 'INITIATED')
      .reduce(
        (sum, drop) => sum.plus(drop.declaredAmount),
        new Prisma.Decimal(0),
      );
    const disputedCashDropAmount = drops
      .filter((drop) => drop.status === 'DISPUTED')
      .reduce(
        (sum, drop) => sum.plus(drop.declaredAmount),
        new Prisma.Decimal(0),
      );
    const handoverNet = handoverEntries.reduce(
      (sum, e) => sum.plus(e.amountDelta),
      new Prisma.Decimal(0),
    );
    const undroppedCash = cashCollected
      .plus(handoverNet)
      .minus(cashDropped)
      .minus(pendingCashDropAmount)
      .minus(disputedCashDropAmount);

    return Prisma.Decimal.max(undroppedCash, new Prisma.Decimal(0));
  }

  async getWaiterHandoverCandidates(
    userId: string,
  ): Promise<HandoverCandidateDto[]> {
    const context = await this.identityContext.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      return [];
    }

    const members = await this.prisma.tenantStaffMembership.findMany({
      where: {
        tenantId: context.tenantId,
        status: 'ACTIVE',
        id: { not: context.staffMembershipId ?? '' },
        branchAssignments: {
          some: {
            branchId: context.branchId,
            status: 'ACTIVE',
            releasedAt: null,
          },
        },
        roleAssignments: {
          some: {
            status: 'ACTIVE',
            revokedAt: null,
            role: { code: 'WAITER' },
          },
        },
      },
      include: {
        user: { include: { photo: true } },
        roleAssignments: {
          where: { status: 'ACTIVE', revokedAt: null },
          include: { role: true },
        },
      },
      orderBy: { employeeDisplayName: 'asc' },
    });

    return members.map((m) => ({
      membershipId: m.id,
      displayName:
        m.user?.displayName || m.employeeDisplayName || 'Staff Member',
      roleCode: m.roleAssignments[0]?.role?.code ?? 'WAITER',
      photoUrl: m.user?.photo?.path ?? null,
    }));
  }

  async waiterHandover(
    userId: string,
    dto: WaiterShiftHandoverDto,
  ): Promise<WaiterShiftHandoverResponseDto> {
    const context = await this.identityContext.getByUserId(userId);
    if (!context.staffMembershipId || !context.tenantId || !context.branchId) {
      throw new ForbiddenException(
        'No restaurant membership for this account.',
      );
    }

    const openShift = await this.prisma.shiftSession.findFirst({
      where: {
        staffMembershipId: context.staffMembershipId,
        branchId: context.branchId,
        state: 'OPEN',
        clockOutAt: null,
      },
    });

    if (!openShift) {
      throw new NotFoundException('Active shift session not found.');
    }

    if (openShift.version !== dto.expectedVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: openShift.version,
      });
    }

    if (dto.incomingWaiterMembershipId === context.staffMembershipId) {
      throw new UnprocessableEntityException(
        'Cannot hand over shift to yourself.',
      );
    }

    const incoming = await this.prisma.tenantStaffMembership.findFirst({
      where: {
        id: dto.incomingWaiterMembershipId,
        tenantId: context.tenantId,
        status: 'ACTIVE',
        branchAssignments: {
          some: {
            branchId: context.branchId,
            status: 'ACTIVE',
            releasedAt: null,
          },
        },
      },
      include: {
        user: { include: { credential: true } },
        roleAssignments: {
          where: { status: 'ACTIVE', revokedAt: null },
          include: { role: true },
        },
      },
    });

    if (!incoming || !incoming.user) {
      throw new NotFoundException('Incoming waiter not found in this branch.');
    }

    const hasWaiterRole = incoming.roleAssignments.some(
      (ra) => ra.role?.code === 'WAITER',
    );
    if (!hasWaiterRole) {
      throw new ForbiddenException(
        'Incoming staff member must have the WAITER role.',
      );
    }

    if (!incoming.user.credential?.passwordHash) {
      throw new ForbiddenException(
        'Incoming waiter has no PIN or password configured.',
      );
    }

    const isPinMatch = await bcrypt.compare(
      dto.incomingWaiterPin.trim(),
      incoming.user.credential.passwordHash,
    );
    if (!isPinMatch) {
      throw new UnauthorizedException('Invalid PIN for incoming waiter.');
    }

    const transferAmount = new Prisma.Decimal(dto.transferredCashAmount || 0);
    if (transferAmount.lt(0)) {
      throw new UnprocessableEntityException(
        'Transferred cash amount cannot be negative.',
      );
    }

    if (transferAmount.gt(0)) {
      const undropped = await this.calculateWaiterUndroppedCash(
        context.branchId,
        context.staffMembershipId,
        openShift.id,
      );
      if (transferAmount.gt(undropped)) {
        throw new UnprocessableEntityException({
          status: 422,
          errors: {
            transferredCashAmount: `Transferred cash (${transferAmount.toFixed(2)} ETB) exceeds available cash on hand (${undropped.toFixed(2)} ETB).`,
          },
        });
      }
    }

    const now = new Date();
    const incomingBusinessDate = businessDateUtc(now);
    const incomingRoleId = incoming.roleAssignments[0]?.roleId ?? null;

    const incomingShift = await this.prisma.shiftSession.findFirst({
      where: {
        staffMembershipId: incoming.id,
        branchId: context.branchId,
        state: 'OPEN',
        clockOutAt: null,
      },
    });

    return this.prisma.$transaction(async (tx) => {
      let targetShift = incomingShift;
      if (!targetShift) {
        targetShift = await tx.shiftSession.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            staffMembershipId: incoming.id,
            roleId: incomingRoleId,
            clockInAt: now,
            state: 'OPEN',
            businessDate: incomingBusinessDate,
          },
        });
      }

      const openTableSessions = await tx.tableSession.findMany({
        where: {
          primaryWaiterMembershipId: context.staffMembershipId!,
          closedAt: null,
          status: { not: 'CLOSED' },
        },
        include: {
          table: true,
        },
      });

      for (const session of openTableSessions) {
        await tx.tableSession.update({
          where: { id: session.id },
          data: {
            primaryWaiterMembershipId: incoming.id,
            primaryWaiterShiftSessionId: targetShift.id,
            version: { increment: 1 },
          },
        });

        await tx.tableAssignment.updateMany({
          where: {
            tableSessionId: session.id,
            releasedAt: null,
          },
          data: {
            releasedAt: now,
          },
        });

        await tx.tableAssignment.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            tableSessionId: session.id,
            waiterMembershipId: incoming.id,
            shiftSessionId: targetShift.id,
            assignedAt: now,
            assignedByMembershipId: context.staffMembershipId,
            reason: 'SHIFT_HANDOVER',
          },
        });

        if (
          session.table.assignedWaiterMembershipId === context.staffMembershipId
        ) {
          await tx.diningTable.update({
            where: { id: session.tableId },
            data: {
              assignedWaiterMembershipId: incoming.id,
              version: { increment: 1 },
            },
          });
        }
      }

      if (transferAmount.gt(0)) {
        await tx.cashLedgerEntry.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            businessDate: openShift.businessDate,
            holderType: 'WAITER_SHIFT',
            waiterShiftSessionId: openShift.id,
            entryType: 'WAITER_HANDOVER_OUT',
            amountDelta: transferAmount.negated(),
            sourceType: 'WAITER_SHIFT_HANDOVER',
            sourceId: openShift.id,
            createdByMembershipId: context.staffMembershipId,
          },
        });

        await tx.cashLedgerEntry.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            businessDate: targetShift.businessDate,
            holderType: 'WAITER_SHIFT',
            waiterShiftSessionId: targetShift.id,
            entryType: 'WAITER_HANDOVER_IN',
            amountDelta: transferAmount,
            sourceType: 'WAITER_SHIFT_HANDOVER',
            sourceId: openShift.id,
            createdByMembershipId: incoming.id,
          },
        });
      }

      await tx.shiftSession.update({
        where: { id: openShift.id },
        data: {
          state: 'CLOSED',
          clockOutAt: now,
          version: { increment: 1 },
        },
      });

      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          branchId: context.branchId,
          actorUserId: String(userId),
          actorStaffMembershipId: context.staffMembershipId,
          action: 'WAITER_SHIFT_HANDOVER',
          entityType: 'SHIFT_SESSION',
          entityId: openShift.id,
          metadataJson: {
            outgoingWaiter: context.displayName ?? 'Waiter',
            incomingWaiter: incoming.user.displayName,
            transferredCashAmount: transferAmount.toString(),
            tablesTransferredCount: openTableSessions.length,
            tablesTransferred: openTableSessions.map(
              (s) => s.table.displayName,
            ),
            notes: dto.notes,
          },
        },
      });

      return {
        outgoingWaiterName: context.displayName ?? 'Waiter',
        incomingWaiterName: incoming.user.displayName,
        tablesTransferredCount: openTableSessions.length,
        tablesTransferredNames: openTableSessions.map(
          (s) => s.table.displayName,
        ),
        cashTransferredFormatted: `ETB ${transferAmount.toFixed(2)}`,
        handedOverAt: now,
        status: 'COMPLETED',
      };
    });
  }
}

function formatShiftLocalTime(value: Date): string {
  const hours = value.getUTCHours().toString().padStart(2, '0');
  const minutes = value.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatClockLabel(value: Date): string {
  const hours = value.getHours().toString().padStart(2, '0');
  const minutes = value.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** Build today's start/end from a ShiftDefinition Time field (stored as UTC clock). */
function computeShiftWindowForDay(
  startLocalTime: Date,
  endLocalTime: Date,
  day: Date,
): { startAt: Date; endAt: Date } {
  const startH = startLocalTime.getUTCHours();
  const startM = startLocalTime.getUTCMinutes();
  const endH = endLocalTime.getUTCHours();
  const endM = endLocalTime.getUTCMinutes();

  const startAt = new Date(day);
  startAt.setHours(startH, startM, 0, 0);

  const endAt = new Date(day);
  endAt.setHours(endH, endM, 0, 0);

  if (endAt <= startAt) {
    endAt.setDate(endAt.getDate() + 1);
  }
  return { startAt, endAt };
}
