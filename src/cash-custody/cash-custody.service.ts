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
const CASHIER_ROLES = ['CASHIER', 'MANAGER', 'OWNER_ADMIN'];

@Injectable()
export class CashCustodyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
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

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
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
      const payload = toDropDto(drop);
      await this.storeIdempotent(
        tx,
        context,
        INITIATE_COMMAND,
        key,
        dto,
        payload,
        drop.id,
      );
      return payload;
    });
  }

  async listCashierDrops(
    userId: string,
    statusQuery?: string,
  ): Promise<CashDropQueueResponseDto> {
    const context = await this.requireCashier(userId);
    const statuses = parseStatuses(statusQuery) ?? [
      'INITIATED',
      'DISPUTED',
    ];
    const drops = await this.prisma.cashDrop.findMany({
      where: {
        branchId: context.branchId!,
        status: { in: statuses },
      },
      include: {
        waiter: true,
        dispute: true,
      },
      orderBy: { initiatedAt: 'asc' },
      take: 50,
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
    const existing = await this.findIdempotent(
      context,
      RECEIVE_COMMAND,
      key,
      { cashDropId, ...dto },
    );
    if (existing) return existing as unknown as ReceiveCashDropResponseDto;

    const drop = await this.prisma.cashDrop.findFirst({
      where: { id: cashDropId, branchId: context.branchId! },
      include: { dispute: true },
    });
    if (!drop) throw new NotFoundException('Cash drop not found.');
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

    return this.prisma.$transaction(async (tx) => {
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
  }

  async resolveDispute(
    userId: string,
    disputeId: string,
    dto: ResolveCashDropDisputeDto,
    idempotencyKey?: string,
  ): Promise<CashDropDto> {
    const context = await this.requireCashierOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(
      context,
      RESOLVE_COMMAND,
      key,
      { disputeId, ...dto },
    );
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
    const [payments, drops] = await Promise.all([
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
    const undroppedCash = cashCollected
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
    const open = await this.prisma.cashierFinancialSession.findFirst({
      where: {
        shiftSessionId: context.shiftSessionId!,
        status: 'OPEN',
      },
    });
    if (open) return open;

    const shift = await this.prisma.shiftSession.findUnique({
      where: { id: context.shiftSessionId! },
    });
    if (!shift) throw new NotFoundException('Cashier shift not found.');

    return this.prisma.cashierFinancialSession.create({
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
    if (context.roleCode !== 'WAITER') {
      throw new ForbiddenException('Cash pouch is for waiters.');
    }
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
    if (!CASHIER_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Cash drops queue is for cashiers.');
    }
    return context;
  }

  private async requireCashierOnShift(
    userId: string,
  ): Promise<AuthContextDto> {
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
  };
}
