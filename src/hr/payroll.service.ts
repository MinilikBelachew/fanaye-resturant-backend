import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CaslService } from '../casl/casl.service';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import type { AuthContextDto } from '../identity/dto/auth-context.dto';
import {
  CreatePayrollRunDto,
  MarkPayrollPaidDto,
  UpdatePayrollLineDto,
} from './dto/payroll.dto';

function dec(n: number | string | Prisma.Decimal | null | undefined): number {
  if (n == null) return 0;
  if (typeof n === 'number') return n;
  if (typeof n === 'string') return Number(n) || 0;
  return n.toNumber();
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly casl: CaslService,
  ) {}

  private async requireManage(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('No restaurant on this account.');
    }
    const allowed =
      this.casl.can(context, 'manage', 'Staff') ||
      this.casl.can(context, 'manage', 'all');
    if (!allowed) {
      throw new ForbiddenException('Payroll is for managers and owners.');
    }
    return context;
  }

  private isOwner(context: AuthContextDto) {
    return context.roleCode === 'OWNER_ADMIN' || context.roleCode === 'OWNER';
  }

  private resolveBranchId(context: AuthContextDto, branchId?: string) {
    if (this.isOwner(context) && branchId) return branchId;
    if (this.isOwner(context) && !branchId) return null;
    if (!context.branchId) {
      throw new ForbiddenException('No branch on this account.');
    }
    return context.branchId;
  }

  private toRunDto(run: {
    id: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    label: string | null;
    currencyCode: string;
    branchId: string | null;
    totalGross: Prisma.Decimal | number;
    totalOt: Prisma.Decimal | number;
    totalTips: Prisma.Decimal | number;
    totalDeductions: Prisma.Decimal | number;
    totalNet: Prisma.Decimal | number;
    approvedAt: Date | null;
    paidAt: Date | null;
    createdAt: Date;
    _count?: { lines: number };
    lines?: unknown[];
  }) {
    return {
      id: run.id,
      status: run.status,
      periodStart: run.periodStart.toISOString().slice(0, 10),
      periodEnd: run.periodEnd.toISOString().slice(0, 10),
      label: run.label,
      currencyCode: run.currencyCode,
      branchId: run.branchId,
      totalGross: dec(run.totalGross),
      totalOt: dec(run.totalOt),
      totalTips: dec(run.totalTips),
      totalDeductions: dec(run.totalDeductions),
      totalNet: dec(run.totalNet),
      approvedAt: run.approvedAt?.toISOString() ?? null,
      paidAt: run.paidAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      lineCount: run._count?.lines ?? run.lines?.length ?? 0,
    };
  }

  private toLineDto(line: {
    id: string;
    runId: string;
    staffMembershipId: string;
    staffName: string;
    roleCode: string | null;
    payType: string | null;
    basePay: Prisma.Decimal | number | null;
    regularHours: Prisma.Decimal | number | null;
    otHours: Prisma.Decimal | number;
    otRate: Prisma.Decimal | number | null;
    otAmount: Prisma.Decimal | number;
    tipAmount: Prisma.Decimal | number;
    baseGross: Prisma.Decimal | number;
    deductions: Prisma.Decimal | number;
    gross: Prisma.Decimal | number;
    net: Prisma.Decimal | number;
    payMethod: string | null;
    paidAt: Date | null;
    notes: string | null;
  }) {
    return {
      id: line.id,
      runId: line.runId,
      staffMembershipId: line.staffMembershipId,
      staffName: line.staffName,
      roleCode: line.roleCode,
      payType: line.payType,
      basePay: line.basePay == null ? null : dec(line.basePay),
      regularHours: line.regularHours == null ? null : dec(line.regularHours),
      otHours: dec(line.otHours),
      otRate: line.otRate == null ? null : dec(line.otRate),
      otAmount: dec(line.otAmount),
      tipAmount: dec(line.tipAmount),
      baseGross: dec(line.baseGross),
      deductions: dec(line.deductions),
      gross: dec(line.gross),
      net: dec(line.net),
      payMethod: line.payMethod,
      paidAt: line.paidAt?.toISOString() ?? null,
      notes: line.notes,
    };
  }

  private computeLineAmounts(input: {
    payType: string | null;
    basePay: number | null;
    regularHours: number | null;
    otHours: number;
    otRate: number | null;
    otAmountOverride?: number | null;
    tipAmount?: number;
    deductions: number;
  }) {
    const basePay = input.basePay ?? 0;
    const regularHours = input.regularHours ?? 0;
    let baseGross = 0;
    if (input.payType === 'HOURLY') {
      baseGross = round2(regularHours * basePay);
    } else {
      // SALARY or unset → treat as monthly salary amount
      baseGross = round2(basePay);
    }

    let otRate = input.otRate;
    if (otRate == null && input.payType === 'HOURLY' && basePay > 0) {
      otRate = round2(basePay * 1.5);
    }

    let otAmount: number;
    if (input.otAmountOverride != null) {
      otAmount = round2(input.otAmountOverride);
    } else if (otRate != null && input.otHours > 0) {
      otAmount = round2(input.otHours * otRate);
    } else {
      otAmount = 0;
    }

    const tipAmount = round2(input.tipAmount ?? 0);
    const deductions = round2(input.deductions);
    const gross = round2(baseGross + otAmount + tipAmount);
    const net = round2(Math.max(0, gross - deductions));

    return {
      baseGross,
      otRate: otRate ?? null,
      otAmount,
      tipAmount,
      deductions,
      gross,
      net,
    };
  }

  private async refreshRunTotals(runId: string) {
    const agg = await this.prisma.payrollLine.aggregate({
      where: { runId },
      _sum: {
        baseGross: true,
        otAmount: true,
        tipAmount: true,
        deductions: true,
        net: true,
        gross: true,
      },
    });
    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        totalGross: agg._sum.gross ?? 0,
        totalOt: agg._sum.otAmount ?? 0,
        totalTips: agg._sum.tipAmount ?? 0,
        totalDeductions: agg._sum.deductions ?? 0,
        totalNet: agg._sum.net ?? 0,
      },
    });
  }

  private async hoursForMember(
    membershipId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const endExclusive = new Date(periodEnd);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    const sessions = await this.prisma.shiftSession.findMany({
      where: {
        staffMembershipId: membershipId,
        clockInAt: { gte: periodStart, lt: endExclusive },
      },
      select: {
        clockInAt: true,
        clockOutAt: true,
      },
    });

    let hours = 0;
    for (const s of sessions) {
      const out = s.clockOutAt ?? new Date();
      const ms = out.getTime() - s.clockInAt.getTime();
      if (ms > 0) hours += ms / 3_600_000;
    }
    return round2(hours);
  }

  async listRuns(userId: string, branchId?: string) {
    const context = await this.requireManage(userId);
    const scopeBranch = this.resolveBranchId(context, branchId);

    const runs = await this.prisma.payrollRun.findMany({
      where: {
        tenantId: context.tenantId!,
        ...(scopeBranch ? { branchId: scopeBranch } : {}),
        status: { not: 'CANCELLED' },
      },
      include: { _count: { select: { lines: true } } },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    });

    return { data: runs.map((r) => this.toRunDto(r)) };
  }

  async getRun(userId: string, runId: string) {
    const context = await this.requireManage(userId);
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenantId: context.tenantId! },
      include: {
        lines: { orderBy: { staffName: 'asc' } },
        _count: { select: { lines: true } },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');

    return {
      data: {
        ...this.toRunDto(run),
        lines: run.lines.map((l) => this.toLineDto(l)),
      },
    };
  }

  async createRun(userId: string, dto: CreatePayrollRunDto) {
    const context = await this.requireManage(userId);
    const branchId = this.resolveBranchId(context, dto.branchId);
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (!(periodStart instanceof Date) || Number.isNaN(periodStart.getTime())) {
      throw new BadRequestException('Invalid periodStart.');
    }
    if (!(periodEnd instanceof Date) || Number.isNaN(periodEnd.getTime())) {
      throw new BadRequestException('Invalid periodEnd.');
    }
    if (periodEnd < periodStart) {
      throw new BadRequestException(
        'periodEnd must be on or after periodStart.',
      );
    }

    const label =
      dto.label?.trim() ||
      `${periodStart.toLocaleString('en', { month: 'long', timeZone: 'UTC' })} ${periodStart.getUTCFullYear()}`;

    const run = await this.prisma.payrollRun.create({
      data: {
        tenantId: context.tenantId!,
        branchId,
        periodStart,
        periodEnd,
        label,
        status: 'DRAFT',
      },
    });

    await this.generateLines(context, run.id, periodStart, periodEnd, branchId);
    return this.getRun(userId, run.id);
  }

  private async generateLines(
    context: AuthContextDto,
    runId: string,
    periodStart: Date,
    periodEnd: Date,
    branchId: string | null,
  ) {
    const memberships = await this.prisma.tenantStaffMembership.findMany({
      where: {
        tenantId: context.tenantId!,
        status: 'ACTIVE',
        ...(branchId
          ? {
              branchAssignments: {
                some: { branchId, status: 'ACTIVE' },
              },
            }
          : {}),
      },
      include: {
        roleAssignments: {
          where: { status: 'ACTIVE' },
          include: { role: true },
          take: 1,
          orderBy: { grantedAt: 'desc' },
        },
      },
      orderBy: { employeeDisplayName: 'asc' },
    });

    for (const member of memberships) {
      const payType = member.payType ?? 'SALARY';
      const basePay = member.basePay == null ? null : dec(member.basePay);
      let regularHours: number | null = null;
      if (payType === 'HOURLY') {
        regularHours = await this.hoursForMember(
          member.id,
          periodStart,
          periodEnd,
        );
      }

      const amounts = this.computeLineAmounts({
        payType,
        basePay,
        regularHours,
        otHours: 0,
        otRate:
          payType === 'HOURLY' && basePay != null
            ? round2(basePay * 1.5)
            : null,
        deductions: 0,
      });

      const roleCode = member.roleAssignments[0]?.role?.code ?? null;

      await this.prisma.payrollLine.create({
        data: {
          tenantId: context.tenantId!,
          runId,
          staffMembershipId: member.id,
          staffName: member.employeeDisplayName,
          roleCode,
          payType,
          basePay: basePay ?? undefined,
          regularHours: regularHours ?? undefined,
          otHours: 0,
          otRate: amounts.otRate ?? undefined,
          otAmount: 0,
          tipAmount: 0,
          baseGross: amounts.baseGross,
          deductions: 0,
          gross: amounts.gross,
          net: amounts.net,
        },
      });
    }

    await this.refreshRunTotals(runId);
  }

  async updateLine(
    userId: string,
    runId: string,
    lineId: string,
    dto: UpdatePayrollLineDto,
  ) {
    const context = await this.requireManage(userId);
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenantId: context.tenantId! },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status === 'PAID' || run.status === 'CANCELLED') {
      throw new ConflictException('Cannot edit a paid or cancelled run.');
    }

    const line = await this.prisma.payrollLine.findFirst({
      where: { id: lineId, runId, tenantId: context.tenantId! },
    });
    if (!line) throw new NotFoundException('Payroll line not found.');
    if (line.paidAt) {
      throw new ConflictException('Line already marked paid.');
    }

    const regularHours =
      dto.regularHours !== undefined
        ? dto.regularHours
        : line.regularHours == null
          ? null
          : dec(line.regularHours);
    const otHours = dto.otHours !== undefined ? dto.otHours : dec(line.otHours);
    const otRate =
      dto.otRate !== undefined
        ? dto.otRate
        : line.otRate == null
          ? null
          : dec(line.otRate);
    const tipAmount =
      dto.tipAmount !== undefined ? dto.tipAmount : dec(line.tipAmount);
    const deductions =
      dto.deductions !== undefined ? dto.deductions : dec(line.deductions);

    const amounts = this.computeLineAmounts({
      payType: line.payType,
      basePay: line.basePay == null ? null : dec(line.basePay),
      regularHours,
      otHours,
      otRate,
      otAmountOverride: dto.otAmount !== undefined ? dto.otAmount : undefined,
      tipAmount,
      deductions,
    });

    // If otAmount not in dto, use computed; if in dto use override (already in amounts)
    const otAmount =
      dto.otAmount !== undefined ? round2(dto.otAmount) : amounts.otAmount;

    const recomputed = this.computeLineAmounts({
      payType: line.payType,
      basePay: line.basePay == null ? null : dec(line.basePay),
      regularHours,
      otHours,
      otRate: amounts.otRate,
      otAmountOverride: otAmount,
      tipAmount,
      deductions,
    });

    const updated = await this.prisma.payrollLine.update({
      where: { id: lineId },
      data: {
        regularHours: regularHours ?? null,
        otHours,
        otRate: recomputed.otRate,
        otAmount: recomputed.otAmount,
        tipAmount: recomputed.tipAmount,
        baseGross: recomputed.baseGross,
        deductions: recomputed.deductions,
        gross: recomputed.gross,
        net: recomputed.net,
        ...(dto.payMethod !== undefined ? { payMethod: dto.payMethod } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
    });

    if (run.status === 'APPROVED') {
      await this.prisma.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'DRAFT',
          approvedAt: null,
          approvedByMembershipId: null,
        },
      });
    }

    await this.refreshRunTotals(runId);
    return { data: this.toLineDto(updated) };
  }

  async approveRun(userId: string, runId: string) {
    const context = await this.requireManage(userId);
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenantId: context.tenantId! },
      include: { _count: { select: { lines: true } } },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status === 'PAID') {
      throw new ConflictException('Run already paid.');
    }
    if (run._count.lines === 0) {
      throw new BadRequestException('Run has no lines.');
    }

    await this.refreshRunTotals(runId);
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedByMembershipId: context.staffMembershipId,
      },
      include: { _count: { select: { lines: true } } },
    });
    return { data: this.toRunDto(updated) };
  }

  async markPaid(userId: string, runId: string, dto: MarkPayrollPaidDto) {
    const context = await this.requireManage(userId);
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenantId: context.tenantId! },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status === 'CANCELLED') {
      throw new ConflictException('Run is cancelled.');
    }
    if (run.status === 'PAID') {
      throw new ConflictException('Run already paid.');
    }

    const method = dto.payMethod ?? 'CASH';
    const now = new Date();

    const lines = await this.prisma.payrollLine.findMany({
      where: {
        runId,
        tenantId: context.tenantId!,
        paidAt: null,
        ...(dto.lineIds?.length ? { id: { in: dto.lineIds } } : {}),
      },
    });

    if (lines.length === 0) {
      throw new BadRequestException('No unpaid lines to mark.');
    }

    await this.prisma.payrollLine.updateMany({
      where: { id: { in: lines.map((l) => l.id) } },
      data: { paidAt: now, payMethod: method },
    });

    const remaining = await this.prisma.payrollLine.count({
      where: { runId, paidAt: null },
    });

    if (remaining === 0) {
      await this.prisma.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'PAID',
          paidAt: now,
          paidByMembershipId: context.staffMembershipId,
          ...(run.status === 'DRAFT'
            ? {
                approvedAt: now,
                approvedByMembershipId: context.staffMembershipId,
              }
            : {}),
        },
      });
    } else if (run.status === 'DRAFT') {
      await this.prisma.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'APPROVED',
          approvedAt: now,
          approvedByMembershipId: context.staffMembershipId,
        },
      });
    }

    return this.getRun(userId, runId);
  }

  async listStaffPayHistory(userId: string, membershipId: string) {
    const context = await this.requireManage(userId);
    const member = await this.prisma.tenantStaffMembership.findFirst({
      where: { id: membershipId, tenantId: context.tenantId! },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Staff member not found.');

    const lines = await this.prisma.payrollLine.findMany({
      where: {
        tenantId: context.tenantId!,
        staffMembershipId: membershipId,
        paidAt: { not: null },
      },
      include: {
        run: {
          select: {
            id: true,
            label: true,
            periodStart: true,
            periodEnd: true,
            status: true,
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: 50,
    });

    return {
      data: lines.map((l) => ({
        ...this.toLineDto(l),
        runLabel: l.run.label,
        periodStart: l.run.periodStart.toISOString().slice(0, 10),
        periodEnd: l.run.periodEnd.toISOString().slice(0, 10),
        runStatus: l.run.status,
      })),
    };
  }
}
