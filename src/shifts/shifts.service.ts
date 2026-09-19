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
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import {
  CurrentShiftResponseDto,
  ShiftAssignmentSummaryDto,
  ShiftSessionDto,
} from './dto/current-shift-response.dto';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async getCurrent(userId: string): Promise<CurrentShiftResponseDto> {
    const context = await this.identityContext.getByUserId(userId);
    if (!context.staffMembershipId || !context.branchId) {
      return { clockedIn: false, shiftSession: null, upcomingAssignment: null };
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

    const upcoming = await this.nextAssignment(
      context.staffMembershipId,
      context.branchId,
    );

    return {
      clockedIn: Boolean(open),
      shiftSession: open ? this.toSessionDto(open) : null,
      upcomingAssignment: upcoming,
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

    const assignment = await this.resolveAssignment(
      context.staffMembershipId,
      context.branchId,
      dto.shiftAssignmentId,
    );

    if (dto.shiftAssignmentId && !assignment) {
      throw new NotFoundException('Shift assignment not found.');
    }

    const role = await this.prisma.staffRoleAssignment.findFirst({
      where: {
        staffMembershipId: context.staffMembershipId,
        status: 'ACTIVE',
        revokedAt: null,
      },
    });

    const roleId = dto.roleId ?? assignment?.roleId ?? role?.roleId ?? null;
    const now = new Date();
    const businessDate = new Date(now);
    businessDate.setHours(0, 0, 0, 0);

    let lateByMinutes = 0;
    if (assignment?.scheduledStartAt) {
      lateByMinutes = Math.max(
        0,
        Math.round(
          (now.getTime() - assignment.scheduledStartAt.getTime()) / 60000,
        ),
      );
    }

    try {
      await this.prisma.shiftSession.create({
        data: {
          tenantId: context.tenantId,
          branchId: context.branchId,
          shiftAssignmentId: assignment?.id ?? null,
          staffMembershipId: context.staffMembershipId,
          roleId,
          scheduledStartAtSnapshot: assignment?.scheduledStartAt ?? null,
          scheduledEndAtSnapshot: assignment?.scheduledEndAt ?? null,
          graceMinutesSnapshot: assignment?.graceMinutes ?? 15,
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
}
