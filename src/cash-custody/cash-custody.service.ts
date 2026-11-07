import { CashCustodyOverviewResponseDto } from './dto/cash-custody-overview.dto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { CaslService } from '../casl/casl.service';
import { DailyCloseService } from '../daily-close/daily-close.service';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  addCalendarDays,
  businessDateUtc,
  calendarYmd,
  localDayRange,
} from '../common/business-date';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { OpsEventType } from '../realtime/ops-events';
import { OpsNotifyService } from '../realtime/ops-notify.service';
import {
  InitiateCashDropDto,
  ReceiveCashDropDto,
  ResolveCashDropDisputeDto,
} from './dto/cash-drop.dto';
import {
  CashDropDto,
  CashDropQueueResponseDto,
  ReceiveCashDropResponseDto,
  WaiterCashSummaryDto,
} from './dto/cash-drop-response.dto';

const INITIATE_COMMAND = 'cash_drop.initiate';
const RECEIVE_COMMAND = 'cash_drop.receive';
const RESOLVE_COMMAND = 'cash_drop.resolve_dispute';

@Injectable()
export class CashCustodyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly opsNotify: OpsNotifyService,
    private readonly dailyClose: DailyCloseService,
    private readonly casl: CaslService,
  ) {}

  async waiterCashSummary(userId: string): Promise<WaiterCashSummaryDto> {
    const context = await this.requireWaiterOnShift(userId);
    return this.summaryForShift(
      context.branchId!,
      context.staffMembershipId!,
      context.shiftSessionId!,
    );
  }

  async initiateDrop(
    userId: string,
    dto: InitiateCashDropDto,
    idempotencyKey?: string,
  ): Promise<CashDropDto> {
    const context = await this.requireWaiterOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(
      context,
      INITIATE_COMMAND,
      key,
      dto,
    );
    if (existing) return existing as unknown as CashDropDto;

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CASH_DROP_AMOUNT_INVALID',
        errors: { amount: 'CASH_DROP_AMOUNT_INVALID' },
      });
    }

    const summary = await this.summaryForShift(
      context.branchId!,
      context.staffMembershipId!,
      context.shiftSessionId!,
    );
    if (amount.gt(new Prisma.Decimal(summary.undroppedCash))) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CASH_DROP_EXCEEDS_UNDROPPED',
        errors: {
          amount: 'CASH_DROP_EXCEEDS_UNDROPPED',
          undroppedCash: summary.undroppedCash,
        },
      });
    }

    const shift = await this.prisma.shiftSession.findUnique({
      where: { id: context.shiftSessionId! },
    });
    if (!shift) throw new NotFoundException('Shift not found.');

    await this.dailyClose.assertBusinessDayNotLocked(
      context.branchId!,
      shift.businessDate,
    );

    const now = new Date();
    const payload = await this.prisma.$transaction(async (tx) => {
      const drop = await tx.cashDrop.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: shift.businessDate,
          waiterMembershipId: context.staffMembershipId!,
          waiterShiftSessionId: context.shiftSessionId!,
          declaredAmount: amount,
          currencyCode: 'ETB',
          status: 'INITIATED',
          initiatedAt: now,
        },
      });
      const created = toDropDto(drop);
      await this.storeIdempotent(
        tx,
        context,
        INITIATE_COMMAND,
        key,
        dto,
        created,
        drop.id,
      );
      return created;
    });

    await this.opsNotify.notifyCashiers({
      type: OpsEventType.CASH_DROP_PENDING,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: 'ATTENTION',
      title: 'Cash drop pending',
      body: `${payload.declaredAmount} ETB from waiter awaiting count.`,
      relatedEntityType: 'CashDrop',
      relatedEntityId: payload.cashDropId,
      payload: {
        cashDropId: payload.cashDropId,
        declaredAmount: payload.declaredAmount,
        waiterMembershipId: context.staffMembershipId,
      },
    });

    return payload;
  }

  async listCashierDrops(
    userId: string,
    statusQuery?: string,
    dateFilter?: string,
  ): Promise<CashDropQueueResponseDto> {
    const context = await this.requireCashier(userId);
    let statuses: string[] = ['INITIATED', 'DISPUTED'];
    if (statusQuery) {
      if (statusQuery.toUpperCase() === 'ALL') {
        statuses = ['INITIATED', 'DISPUTED', 'RECEIVED', 'RESOLVED'];
      } else {
        statuses = parseStatuses(statusQuery) ?? statuses;
      }
    }

    const pendingStatuses = ['INITIATED', 'DISPUTED'];
    const closedStatuses = ['RECEIVED', 'RESOLVED'];
    const pendingRequested = statuses.filter((s) =>
      pendingStatuses.includes(s),
    );
    const closedRequested = statuses.filter((s) => closedStatuses.includes(s));

    const df = (dateFilter || '').trim().toUpperCase();
    const todayYmd = calendarYmd();
    let fromYmd: string | null = null;
    let toYmd: string | null = null;
    if (df === 'TODAY') {
      fromYmd = todayYmd;
      toYmd = todayYmd;
    } else if (df === 'YESTERDAY') {
      fromYmd = addCalendarDays(todayYmd, -1);
      toYmd = fromYmd;
    } else if (df === 'LAST_7_DAYS') {
      fromYmd = addCalendarDays(todayYmd, -6);
      toYmd = todayYmd;
    }

    const or: Prisma.CashDropWhereInput[] = [];
    if (pendingRequested.length > 0) {
      or.push({ status: { in: pendingRequested } });
    }
    if (closedRequested.length > 0) {
      const closed: Prisma.CashDropWhereInput = {
        status: { in: closedRequested },
      };
      if (fromYmd && toYmd) {
        const fromDate = businessDateUtc(new Date(`${fromYmd}T12:00:00.000Z`));
        const toDate = businessDateUtc(new Date(`${toYmd}T12:00:00.000Z`));
        const fromRange = localDayRange(fromYmd);
        const toRange = localDayRange(toYmd);
        closed.AND = [
          {
            OR: [
              { businessDate: { gte: fromDate, lte: toDate } },
              {
                initiatedAt: {
                  gte: fromRange.start,
                  lte: toRange.end,
                },
              },
            ],
          },
        ];
      }
      or.push(closed);
    }

    const drops = await this.prisma.cashDrop.findMany({
      where: {
        branchId: context.branchId!,
        ...(or.length === 1 ? or[0] : { OR: or }),
      },
      include: {
        waiter: true,
        dispute: true,
      },
      orderBy: { initiatedAt: 'desc' },
      take: 200,
    });
    return {
      data: drops.map((drop) => ({
        ...toDropDto(drop),
        waiterName: drop.waiter.employeeDisplayName,
        variance: drop.dispute ? money(drop.dispute.variance) : null,
        disputeId: drop.dispute?.id ?? null,
        disputeStatus: drop.dispute?.status ?? null,
      })),
    };
  }

  async listWaiterDrops(userId: string): Promise<CashDropQueueResponseDto> {
    const context = await this.requireWaiterOnShift(userId);
    const drops = await this.prisma.cashDrop.findMany({
      where: {
        waiterShiftSessionId: context.shiftSessionId!,
      },
      include: { dispute: true },
      orderBy: { initiatedAt: 'desc' },
      take: 20,
    });
    return {
      data: drops.map((drop) => ({
        ...toDropDto(drop),
        variance: drop.dispute ? money(drop.dispute.variance) : null,
        disputeId: drop.dispute?.id ?? null,
        disputeStatus: drop.dispute?.status ?? null,
      })),
    };
  }

  async receiveDrop(
    userId: string,
    cashDropId: string,
    dto: ReceiveCashDropDto,
    idempotencyKey?: string,
  ): Promise<ReceiveCashDropResponseDto> {
    const context = await this.requireCashierOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(context, RECEIVE_COMMAND, key, {
      cashDropId,
      ...dto,
    });
    if (existing) return existing as unknown as ReceiveCashDropResponseDto;

    const drop = await this.prisma.cashDrop.findFirst({
      where: { id: cashDropId, branchId: context.branchId! },
      include: { dispute: true },
    });
    if (!drop) throw new NotFoundException('Cash drop not found.');
    await this.dailyClose.assertBusinessDayNotLocked(
      context.branchId!,
      drop.businessDate,
    );
    if (drop.status !== 'INITIATED') {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CASH_DROP_NOT_RECEIVABLE',
        errors: { status: drop.status },
      });
    }
    if (drop.version !== dto.expectedVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: drop.version,
      });
    }

    const counted = new Prisma.Decimal(dto.countedAmount);
    if (counted.lt(0)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'COUNTED_AMOUNT_INVALID',
        errors: { countedAmount: 'COUNTED_AMOUNT_INVALID' },
      });
    }

    const financialSession = await this.ensureCashierFinancialSession(context);
    const now = new Date();
    const matches = counted.equals(drop.declaredAmount);

    const result = await this.prisma.$transaction(async (tx) => {
      if (matches) {
        const updated = await tx.cashDrop.update({
          where: { id: drop.id },
          data: {
            status: 'RECEIVED',
            countedAmount: counted,
            receivedAt: now,
            resolutionAmount: counted,
            resolvedAt: now,
            cashierFinancialSessionId: financialSession.id,
            receivedByCashierMembershipId: context.staffMembershipId!,
            version: { increment: 1 },
          },
        });
        await this.writeReceiveLedger(
          tx,
          context,
          updated,
          counted,
          financialSession.id,
        );
        const payload: ReceiveCashDropResponseDto = {
          cashDropId: updated.id,
          status: updated.status,
          declaredAmount: money(updated.declaredAmount),
          countedAmount: money(counted),
          acceptedCustodyAmount: money(counted),
          variance: null,
          disputeId: null,
          receivedAt: updated.receivedAt,
          version: updated.version,
        };
        await this.storeIdempotent(
          tx,
          context,
          RECEIVE_COMMAND,
          key,
          { cashDropId, ...dto },
          payload,
          drop.id,
        );
        return payload;
      }

      const variance = counted.minus(drop.declaredAmount);
      const updated = await tx.cashDrop.update({
        where: { id: drop.id },
        data: {
          status: 'DISPUTED',
          countedAmount: counted,
          receivedAt: now,
          cashierFinancialSessionId: financialSession.id,
          receivedByCashierMembershipId: context.staffMembershipId!,
          version: { increment: 1 },
        },
      });
      const dispute = await tx.cashDropDispute.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          cashDropId: drop.id,
          declaredAmount: drop.declaredAmount,
          countedAmount: counted,
          variance,
          status: 'OPEN',
        },
      });
      const payload: ReceiveCashDropResponseDto = {
        cashDropId: updated.id,
        status: updated.status,
        declaredAmount: money(updated.declaredAmount),
        countedAmount: money(counted),
        acceptedCustodyAmount: null,
        variance: money(variance),
        disputeId: dispute.id,
        receivedAt: updated.receivedAt,
        version: updated.version,
      };
      await this.storeIdempotent(
        tx,
        context,
        RECEIVE_COMMAND,
        key,
        { cashDropId, ...dto },
        payload,
        drop.id,
      );
      return payload;
    });

    await this.opsNotify.notify({
      type: OpsEventType.CASH_DROP_RESOLVED,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: result.status === 'DISPUTED' ? 'URGENT' : 'INFO',
      title:
        result.status === 'DISPUTED'
          ? 'Cash drop disputed'
          : 'Cash drop received',
      body:
        result.status === 'DISPUTED'
          ? `Variance ${result.variance} ETB on your drop.`
          : `Cashier accepted ${result.countedAmount} ETB.`,
      recipientMembershipId: drop.waiterMembershipId,
      relatedEntityType: 'CashDrop',
      relatedEntityId: result.cashDropId,
      payload: {
        cashDropId: result.cashDropId,
        status: result.status,
        variance: result.variance,
      },
    });

    return result;
  }

  async resolveDispute(
    userId: string,
    disputeId: string,
    dto: ResolveCashDropDisputeDto,
    idempotencyKey?: string,
  ): Promise<CashDropDto> {
    const context = await this.requireCashierOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(context, RESOLVE_COMMAND, key, {
      disputeId,
      ...dto,
    });
    if (existing) return existing as unknown as CashDropDto;

    const dispute = await this.prisma.cashDropDispute.findFirst({
      where: { id: disputeId, branchId: context.branchId! },
      include: { cashDrop: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    if (dispute.status !== 'OPEN') {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'DISPUTE_NOT_OPEN',
        errors: { status: dispute.status },
      });
    }
    if (dispute.cashDrop.status !== 'DISPUTED') {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CASH_DROP_NOT_DISPUTED',
        errors: { status: dispute.cashDrop.status },
      });
    }

    let resolution: Prisma.Decimal;
    if (dto.resolution === 'ACCEPT_COUNTED') {
      resolution = dispute.countedAmount;
    } else if (dto.resolution === 'ACCEPT_DECLARED') {
      resolution = dispute.declaredAmount;
    } else {
      if (!dto.resolutionAmount) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'RESOLUTION_AMOUNT_REQUIRED',
          errors: { resolutionAmount: 'RESOLUTION_AMOUNT_REQUIRED' },
        });
      }
      resolution = new Prisma.Decimal(dto.resolutionAmount);
      if (resolution.lt(0)) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'RESOLUTION_AMOUNT_INVALID',
          errors: { resolutionAmount: 'RESOLUTION_AMOUNT_INVALID' },
        });
      }
    }

    const financialSessionId =
      dispute.cashDrop.cashierFinancialSessionId ??
      (await this.ensureCashierFinancialSession(context)).id;
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.cashDropDispute.update({
        where: { id: dispute.id },
        data: {
          status: 'RESOLVED',
          resolutionAmount: resolution,
          resolutionNote: dto.resolutionNote?.trim() || null,
          resolvedByMembershipId: context.staffMembershipId!,
          resolvedAt: now,
        },
      });
      const updated = await tx.cashDrop.update({
        where: { id: dispute.cashDropId },
        data: {
          status: 'RECEIVED',
          resolutionAmount: resolution,
          resolvedAt: now,
          cashierFinancialSessionId: financialSessionId,
          version: { increment: 1 },
        },
        include: { dispute: true, waiter: true },
      });
      await this.writeReceiveLedger(
        tx,
        context,
        updated,
        resolution,
        financialSessionId,
      );
      const payload: CashDropDto = {
        ...toDropDto(updated),
        waiterName: updated.waiter.employeeDisplayName,
        variance: money(dispute.variance),
        disputeId: dispute.id,
        disputeStatus: 'RESOLVED',
      };
      await this.storeIdempotent(
        tx,
        context,
        RESOLVE_COMMAND,
        key,
        { disputeId, ...dto },
        payload,
        dispute.id,
      );
      return payload;
    });
  }

  private async summaryForShift(
    branchId: string,
    waiterMembershipId: string,
    shiftSessionId: string,
  ): Promise<WaiterCashSummaryDto> {
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

    return {
      shiftSessionId,
      currencyCode: 'ETB',
      cashCollected: money(cashCollected),
      cashDropped: money(cashDropped),
      undroppedCash: money(Prisma.Decimal.max(undroppedCash, 0)),
      pendingCashDropAmount: money(pendingCashDropAmount),
      disputedCashDropAmount: money(disputedCashDropAmount),
    };
  }

  private async ensureCashierFinancialSession(context: AuthContextDto) {
    const existing = await this.prisma.cashierFinancialSession.findFirst({
      where: {
        shiftSessionId: context.shiftSessionId!,
      },
    });
    if (existing) {
      if (existing.status !== 'OPEN') {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'CASHIER_DRAWER_CLOSED',
          errors: { status: existing.status },
        });
      }
      return existing;
    }

    const shift = await this.prisma.shiftSession.findUnique({
      where: { id: context.shiftSessionId! },
    });
    if (!shift) throw new NotFoundException('Cashier shift not found.');

    try {
      return await this.prisma.cashierFinancialSession.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: shift.businessDate,
          cashierMembershipId: context.staffMembershipId!,
          shiftSessionId: context.shiftSessionId!,
          status: 'OPEN',
          openingFloatAmount: 0,
          currencyCode: 'ETB',
        },
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        const found = await this.prisma.cashierFinancialSession.findFirst({
          where: { shiftSessionId: context.shiftSessionId! },
        });
        if (found) {
          if (found.status !== 'OPEN') {
            throw new UnprocessableEntityException({
              status: 422,
              code: 'CASHIER_DRAWER_CLOSED',
              errors: { status: found.status },
            });
          }
          return found;
        }
      }
      throw err;
    }
  }

  private async writeReceiveLedger(
    tx: Prisma.TransactionClient,
    context: AuthContextDto,
    drop: {
      id: string;
      businessDate: Date;
      waiterShiftSessionId: string;
    },
    amount: Prisma.Decimal,
    cashierFinancialSessionId: string,
  ) {
    await tx.cashLedgerEntry.create({
      data: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        businessDate: drop.businessDate,
        holderType: 'WAITER_SHIFT',
        waiterShiftSessionId: drop.waiterShiftSessionId,
        entryType: 'CASH_DROP_OUT',
        amountDelta: amount.negated(),
        currencyCode: 'ETB',
        sourceType: 'CASH_DROP',
        sourceId: drop.id,
        createdByMembershipId: context.staffMembershipId!,
      },
    });
    await tx.cashLedgerEntry.create({
      data: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        businessDate: drop.businessDate,
        holderType: 'CASHIER_SESSION',
        cashierFinancialSessionId,
        entryType: 'CASH_DROP_IN',
        amountDelta: amount,
        currencyCode: 'ETB',
        sourceType: 'CASH_DROP',
        sourceId: drop.id,
        createdByMembershipId: context.staffMembershipId!,
      },
    });
  }

  private async requireBranch(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    return context;
  }

  private async requireWaiterOnShift(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'read',
      'CashPouch',
      'Cash pouch is for waiters.',
    );
    if (!context.staffMembershipId || !context.shiftSessionId) {
      throw new ForbiddenException({
        status: 403,
        code: 'SHIFT_REQUIRED',
        errors: { shift: 'SHIFT_REQUIRED' },
      });
    }
    return context;
  }

  private async requireCashier(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    this.casl.assertCan(
      context,
      'read',
      'CashDrop',
      'Cash drops queue is for cashiers.',
    );
    return context;
  }

  private async requireCashierOnShift(userId: string): Promise<AuthContextDto> {
    const context = await this.requireCashier(userId);
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

  private requestHash(body: unknown): string {
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

  async getCashCustodyOverview(
    userId: string,
    targetBranchId?: string,
    dateFilter?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<CashCustodyOverviewResponseDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId) {
      throw new ForbiddenException('Tenant required.');
    }

    const isOwner =
      context.roleCode === 'OWNER_ADMIN' ||
      context.roleCode === 'STORE_MANAGER';

    if (!isOwner && context.roleCode !== 'MANAGER') {
      throw new ForbiddenException(
        'Manager or Owner access required for cash custody overview.',
      );
    }

    const allBranches = await this.prisma.branch.findMany({
      where: { tenantId: context.tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, displayCode: true },
      orderBy: { name: 'asc' },
    });

    let activeBranchIds: string[] = [];
    let currentBranchId: string | null = null;

    if (isOwner) {
      if (targetBranchId && targetBranchId !== 'ALL') {
        const found = allBranches.find((b) => b.id === targetBranchId);
        if (found) {
          activeBranchIds = [found.id];
          currentBranchId = found.id;
        } else {
          activeBranchIds = allBranches.map((b) => b.id);
          currentBranchId = null;
        }
      } else {
        activeBranchIds = allBranches.map((b) => b.id);
        currentBranchId = null;
      }
    } else {
      const mgrBranchId = context.branchId || allBranches[0]?.id;
      if (mgrBranchId) {
        activeBranchIds = [mgrBranchId];
        currentBranchId = mgrBranchId;
      } else {
        activeBranchIds = [];
      }
    }

    if (activeBranchIds.length === 0) {
      return {
        summary: {
          totalWaiterUndropped: '0.00',
          totalCashierDrawer: '0.00',
          totalDroppedToday: '0.00',
          activeDisputesCount: 0,
          activeWaitersCount: 0,
          activeCashiersCount: 0,
        },
        waiters: [],
        cashiers: [],
        recentDrops: [],
        branches: allBranches.map((b) => ({
          id: b.id,
          name: b.name,
          displayCode: b.displayCode,
        })),
        currentBranchId,
        isOwner,
      };
    }

    // 1. Find all active/open waiter shifts
    const openWaiterShifts = await this.prisma.shiftSession.findMany({
      where: {
        branchId: { in: activeBranchIds },
        state: 'OPEN',
        membership: {
          roleAssignments: {
            some: {
              role: { code: 'WAITER' },
              status: 'ACTIVE',
            },
          },
        },
      },
      include: {
        membership: {
          include: {
            user: {
              include: { photo: { select: { path: true } } },
            },
          },
        },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { clockInAt: 'desc' },
    });

    const waitersList = await Promise.all(
      openWaiterShifts.map(async (shift) => {
        const summary = await this.summaryForShift(
          shift.branchId,
          shift.staffMembershipId,
          shift.id,
        );
        const undroppedNum = parseFloat(summary.undroppedCash);
        let riskLevel: 'NORMAL' | 'ELEVATED' | 'CRITICAL' = 'NORMAL';
        if (undroppedNum >= 5000) {
          riskLevel = 'CRITICAL';
        } else if (undroppedNum >= 2000) {
          riskLevel = 'ELEVATED';
        }

        return {
          membershipId: shift.staffMembershipId,
          waiterName: shift.membership.employeeDisplayName,
          photoUrl: shift.membership.user?.photo?.path ?? null,
          branchId: shift.branchId,
          branchName: shift.branch.name,
          shiftSessionId: shift.id,
          clockInAt: shift.clockInAt.toISOString(),
          cashCollected: summary.cashCollected,
          cashDropped: summary.cashDropped,
          pendingDropAmount: summary.pendingCashDropAmount,
          undroppedCash: summary.undroppedCash,
          riskLevel,
        };
      }),
    );

    // 2. Find active cashiers & drawers
    const openCashierShifts = await this.prisma.shiftSession.findMany({
      where: {
        branchId: { in: activeBranchIds },
        state: 'OPEN',
        membership: {
          roleAssignments: {
            some: {
              role: { code: 'CASHIER' },
              status: 'ACTIVE',
            },
          },
        },
      },
      include: {
        membership: true,
        branch: { select: { id: true, name: true } },
        cashierSession: {
          include: {
            cashDrops: {
              where: { status: 'RECEIVED' },
            },
          },
        },
        payments: {
          where: {
            method: 'CASH',
            status: 'SETTLED',
          },
        },
      },
      orderBy: { clockInAt: 'desc' },
    });

    const cashiersList = openCashierShifts.map((shift) => {
      const session = shift.cashierSession;
      const openingFloat = session
        ? session.openingFloatAmount
        : new Prisma.Decimal(0);

      const dropsReceived = (session?.cashDrops ?? []).reduce(
        (sum, d) => sum.plus(d.resolutionAmount ?? d.countedAmount ?? 0),
        new Prisma.Decimal(0),
      );

      const directCashSales = (shift.payments ?? []).reduce(
        (sum, p) => sum.plus(p.amount),
        new Prisma.Decimal(0),
      );

      const expectedDrawerCash = openingFloat
        .plus(dropsReceived)
        .plus(directCashSales);

      return {
        sessionId: session?.id ?? shift.id,
        cashierName: shift.membership.employeeDisplayName,
        branchId: shift.branchId,
        branchName: shift.branch.name,
        openedAt: session?.openedAt?.toISOString() ?? shift.clockInAt.toISOString(),
        openingFloat: money(openingFloat),
        dropsReceived: money(dropsReceived),
        directCashSales: money(directCashSales),
        expectedDrawerCash: money(expectedDrawerCash),
      };
    });

    // 3. Date window for cash drops stream
    const df = (dateFilter || 'TODAY').trim().toUpperCase();
    const todayYmd = calendarYmd();
    let fromYmd: string = todayYmd;
    let toYmd: string = todayYmd;
    if (fromDate && toDate) {
      fromYmd = fromDate;
      toYmd = toDate;
    } else if (fromDate && !toDate) {
      fromYmd = fromDate;
      toYmd = fromDate;
    } else if (df.startsWith('CUSTOM:') || (df.includes(':') && df.length > 10)) {
      const parts = df.replace('CUSTOM:', '').split(':');
      fromYmd = parts[0] || todayYmd;
      toYmd = parts[1] || fromYmd || todayYmd;
    } else if (df === 'YESTERDAY') {
      fromYmd = addCalendarDays(todayYmd, -1);
      toYmd = fromYmd;
    } else if (df === 'LAST_7_DAYS' || df === 'WEEK') {
      fromYmd = addCalendarDays(todayYmd, -6);
      toYmd = todayYmd;
    } else if (df === 'ALL') {
      fromYmd = '2000-01-01';
      toYmd = '2099-12-31';
    }

    const fromRange = localDayRange(fromYmd);
    const toRange = localDayRange(toYmd);

    const drops = await this.prisma.cashDrop.findMany({
      where: {
        branchId: { in: activeBranchIds },
        initiatedAt: {
          gte: fromRange.start,
          lte: toRange.end,
        },
      },
      include: {
        waiter: { select: { employeeDisplayName: true } },
        receivedBy: { select: { employeeDisplayName: true } },
        dispute: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { initiatedAt: 'desc' },
      take: 100,
    });

    const recentDrops = drops.map((drop) => ({
      id: drop.id,
      branchId: drop.branchId,
      branchName: drop.branch.name,
      waiterName: drop.waiter?.employeeDisplayName ?? 'Unknown Waiter',
      cashierName: drop.receivedBy?.employeeDisplayName ?? null,
      declaredAmount: money(drop.declaredAmount),
      countedAmount: drop.countedAmount ? money(drop.countedAmount) : null,
      variance: drop.dispute ? money(drop.dispute.variance) : null,
      status: drop.status,
      initiatedAt: drop.initiatedAt.toISOString(),
      receivedAt: drop.receivedAt?.toISOString() ?? null,
      disputeId: drop.dispute?.id ?? null,
      disputeStatus: drop.dispute?.status ?? null,
      disputeReason: drop.dispute?.cashierComment || drop.dispute?.waiterComment || null,
    }));

    // 4. Calculate summary totals
    const totalWaiterUndropped = waitersList.reduce(
      (sum, w) => sum.plus(new Prisma.Decimal(w.undroppedCash)),
      new Prisma.Decimal(0),
    );

    const totalCashierDrawer = cashiersList.reduce(
      (sum, c) => sum.plus(new Prisma.Decimal(c.expectedDrawerCash)),
      new Prisma.Decimal(0),
    );

    const totalDroppedToday = drops
      .filter((d) => d.status === 'RECEIVED')
      .reduce(
        (sum, d) => sum.plus(d.resolutionAmount ?? d.countedAmount ?? 0),
        new Prisma.Decimal(0),
      );

    const activeDisputesCount = drops.filter(
      (d) => d.status === 'DISPUTED' || d.dispute?.status === 'OPEN',
    ).length;

    return {
      summary: {
        totalWaiterUndropped: money(totalWaiterUndropped),
        totalCashierDrawer: money(totalCashierDrawer),
        totalDroppedToday: money(totalDroppedToday),
        activeDisputesCount,
        activeWaitersCount: waitersList.length,
        activeCashiersCount: cashiersList.length,
      },
      waiters: waitersList,
      cashiers: cashiersList,
      recentDrops,
      branches: allBranches.map((b) => ({
        id: b.id,
        name: b.name,
        displayCode: b.displayCode,
      })),
      currentBranchId,
      isOwner,
    };
  }

  private async storeIdempotent(
    db: Prisma.TransactionClient,
    context: AuthContextDto,
    commandType: string,
    key: string,
    body: unknown,
    response: unknown,
    resourceId: string,
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
        resourceType: 'cash_drop',
        resourceId,
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

function parseStatuses(raw?: string): string[] | null {
  if (!raw?.trim()) return null;
  const statuses = raw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  return statuses.length > 0 ? statuses : null;
}

function toDropDto(drop: {
  id: string;
  declaredAmount: Prisma.Decimal;
  currencyCode: string;
  status: string;
  initiatedAt: Date;
  countedAmount: Prisma.Decimal | null;
  receivedAt: Date | null;
  resolutionAmount: Prisma.Decimal | null;
  version: number;
  businessDate?: Date;
}): CashDropDto {
  return {
    cashDropId: drop.id,
    declaredAmount: money(drop.declaredAmount),
    currencyCode: drop.currencyCode,
    status: drop.status,
    initiatedAt: drop.initiatedAt,
    countedAmount: drop.countedAmount ? money(drop.countedAmount) : null,
    receivedAt: drop.receivedAt,
    resolutionAmount: drop.resolutionAmount
      ? money(drop.resolutionAmount)
      : null,
    version: drop.version,
    businessDate: drop.businessDate
      ? drop.businessDate.toISOString().slice(0, 10)
      : undefined,
  };
}
