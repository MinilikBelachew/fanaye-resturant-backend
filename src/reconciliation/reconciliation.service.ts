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
  ReviewReconciliationDto,
  SubmitReconciliationDto,
} from './dto/reconciliation.dto';
import {
  ReconciliationDto,
  ReconciliationListResponseDto,
  ReconciliationPreviewResponseDto,
  ReconciliationSubmitResponseDto,
} from './dto/reconciliation-response.dto';

const SUBMIT_COMMAND = 'cashier.reconcile.submit';
const CASHIER_ROLES = ['CASHIER', 'MANAGER', 'OWNER_ADMIN'];
const REVIEWER_ROLES = ['MANAGER', 'OWNER_ADMIN'];

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async preview(userId: string): Promise<ReconciliationPreviewResponseDto> {
    const context = await this.requireCashierOnShift(userId);
    const session = await this.ensureOpenSession(context);
    const totals = await this.computeExpected(
      session.id,
      session.openingFloatAmount,
    );
    const existing = await this.prisma.cashierReconciliation.findUnique({
      where: { cashierFinancialSessionId: session.id },
    });

    return {
      data: {
        cashierFinancialSessionId: session.id,
        openingFloat: money(totals.openingFloat),
        cashDropsReceived: money(totals.cashDropsReceived),
        otherInflows: money(totals.otherInflows),
        otherOutflows: money(totals.otherOutflows),
        expectedCash: money(totals.expectedCash),
        currencyCode: session.currencyCode,
        existingReconciliationId: existing?.id ?? null,
        existingStatus: existing?.status ?? null,
        existingCountedCash: existing
          ? money(existing.countedCashAmount)
          : null,
        existingVariance: existing ? money(existing.varianceAmount) : null,
      },
    };
  }

  async submit(
    userId: string,
    dto: SubmitReconciliationDto,
    idempotencyKey?: string,
  ): Promise<ReconciliationSubmitResponseDto> {
    const context = await this.requireCashierOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existingIdempotent = await this.findIdempotent(
      context,
      SUBMIT_COMMAND,
      key,
      dto,
    );
    if (existingIdempotent) {
      return existingIdempotent as unknown as ReconciliationSubmitResponseDto;
    }

    const session = await this.prisma.cashierFinancialSession.findFirst({
      where: {
        id: dto.cashierFinancialSessionId,
        branchId: context.branchId!,
        cashierMembershipId: context.staffMembershipId!,
      },
    });
    if (!session) throw new NotFoundException('Cashier session not found.');
    if (!['OPEN', 'RECONCILIATION_PENDING'].includes(session.status)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CASHIER_SESSION_NOT_RECONCILABLE',
        errors: { status: session.status },
      });
    }

    const already = await this.prisma.cashierReconciliation.findUnique({
      where: { cashierFinancialSessionId: session.id },
    });
    if (already) {
      throw new ConflictException({
        status: 409,
        code: 'RECONCILIATION_ALREADY_SUBMITTED',
        errors: { reconciliationId: already.id },
      });
    }

    const totals = await this.computeExpected(
      session.id,
      session.openingFloatAmount,
    );
    const counted = new Prisma.Decimal(dto.countedCash);
    if (counted.lt(0)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'COUNTED_CASH_INVALID',
        errors: { countedCash: 'COUNTED_CASH_INVALID' },
      });
    }
    const variance = counted.minus(totals.expectedCash);
    const comment = dto.comment?.trim() || null;
    if (!variance.equals(0) && !comment) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'RECONCILIATION_VARIANCE_EXPLANATION_REQUIRED',
        errors: { comment: 'RECONCILIATION_VARIANCE_EXPLANATION_REQUIRED' },
      });
    }

    const sessionStatus = variance.equals(0)
      ? 'RECONCILED'
      : 'RECONCILIATION_PENDING';

    const payload = await this.prisma.$transaction(async (tx) => {
      const row = await tx.cashierReconciliation.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: session.businessDate,
          cashierFinancialSessionId: session.id,
          currencyCode: session.currencyCode,
          expectedCashAmount: totals.expectedCash,
          countedCashAmount: counted,
          varianceAmount: variance,
          cashierComment: comment,
          status: 'SUBMITTED',
        },
      });
      await tx.cashierFinancialSession.update({
        where: { id: session.id },
        data: {
          status: sessionStatus,
          version: { increment: 1 },
          closedAt: variance.equals(0) ? new Date() : null,
        },
      });
      const dtoOut = toReconciliationDto(row);
      const wrapped = { data: dtoOut };
      await this.storeIdempotent(
        tx,
        context,
        SUBMIT_COMMAND,
        key,
        dto,
        wrapped,
        row.id,
      );
      return wrapped;
    });

    return payload;
  }

  async listForReview(userId: string): Promise<ReconciliationListResponseDto> {
    const context = await this.requireReviewer(userId);
    const rows = await this.prisma.cashierReconciliation.findMany({
      where: {
        branchId: context.branchId!,
        status: { in: ['SUBMITTED', 'FLAGGED'] },
      },
      include: {
        cashierSession: { include: { cashier: true } },
      },
      orderBy: { submittedAt: 'asc' },
      take: 50,
    });
    return {
      data: rows.map((row) => ({
        ...toReconciliationDto(row),
        cashierName: row.cashierSession.cashier.employeeDisplayName,
        businessDate: ymd(row.businessDate),
      })),
    };
  }

  async approve(
    userId: string,
    reconciliationId: string,
    dto: ReviewReconciliationDto,
  ): Promise<ReconciliationSubmitResponseDto> {
    return this.review(userId, reconciliationId, 'APPROVED', dto);
  }

  async flag(
    userId: string,
    reconciliationId: string,
    dto: ReviewReconciliationDto,
  ): Promise<ReconciliationSubmitResponseDto> {
    return this.review(userId, reconciliationId, 'FLAGGED', dto);
  }

  private async review(
    userId: string,
    reconciliationId: string,
    status: 'APPROVED' | 'FLAGGED',
    dto: ReviewReconciliationDto,
  ): Promise<ReconciliationSubmitResponseDto> {
    const context = await this.requireReviewer(userId);
    const row = await this.prisma.cashierReconciliation.findFirst({
      where: { id: reconciliationId, branchId: context.branchId! },
    });
    if (!row) throw new NotFoundException('Reconciliation not found.');
    if (!['SUBMITTED', 'FLAGGED'].includes(row.status)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'RECONCILIATION_NOT_REVIEWABLE',
        errors: { status: row.status },
      });
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.cashierReconciliation.update({
        where: { id: row.id },
        data: {
          status,
          reviewedByMembershipId: context.staffMembershipId!,
          reviewedAt: now,
          reviewComment: dto.reviewComment?.trim() || null,
          version: { increment: 1 },
        },
      });
      if (status === 'APPROVED') {
        await tx.cashierFinancialSession.update({
          where: { id: row.cashierFinancialSessionId },
          data: {
            status: 'RECONCILED',
            closedAt: now,
            version: { increment: 1 },
          },
        });
      }
      return next;
    });

    return { data: toReconciliationDto(updated) };
  }

  private async computeExpected(
    cashierFinancialSessionId: string,
    openingFloatAmount: Prisma.Decimal,
  ) {
    const entries = await this.prisma.cashLedgerEntry.findMany({
      where: {
        cashierFinancialSessionId,
        holderType: 'CASHIER_SESSION',
      },
    });

    let cashDropsReceived = new Prisma.Decimal(0);
    let otherInflows = new Prisma.Decimal(0);
    let otherOutflows = new Prisma.Decimal(0);

    for (const entry of entries) {
      if (entry.entryType === 'CASH_DROP_IN') {
        cashDropsReceived = cashDropsReceived.plus(entry.amountDelta);
      } else if (entry.entryType === 'OPENING_FLOAT') {
        // Prefer session float; ignore duplicate ledger float if present.
      } else if (entry.amountDelta.gt(0)) {
        otherInflows = otherInflows.plus(entry.amountDelta);
      } else if (entry.amountDelta.lt(0)) {
        otherOutflows = otherOutflows.plus(entry.amountDelta.abs());
      }
    }

    // Fallback if ledger missing but drops received on session.
    if (cashDropsReceived.equals(0)) {
      const drops = await this.prisma.cashDrop.findMany({
        where: {
          cashierFinancialSessionId,
          status: { in: ['RECEIVED', 'RESOLVED'] },
        },
      });
      cashDropsReceived = drops.reduce(
        (sum, drop) =>
          sum.plus(
            drop.resolutionAmount ?? drop.countedAmount ?? drop.declaredAmount,
          ),
        new Prisma.Decimal(0),
      );
    }

    const openingFloat = new Prisma.Decimal(openingFloatAmount);
    const expectedCash = openingFloat
      .plus(cashDropsReceived)
      .plus(otherInflows)
      .minus(otherOutflows);

    return {
      openingFloat,
      cashDropsReceived,
      otherInflows,
      otherOutflows,
      expectedCash,
    };
  }

  private async ensureOpenSession(context: AuthContextDto) {
    const open = await this.prisma.cashierFinancialSession.findFirst({
      where: {
        shiftSessionId: context.shiftSessionId!,
      },
      orderBy: { openedAt: 'desc' },
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

  private async requireBranch(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    return context;
  }

  private async requireCashierOnShift(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (!CASHIER_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Reconciliation is for cashiers.');
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

  private async requireReviewer(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (!REVIEWER_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Reconciliation review is for managers.');
    }
    if (!context.staffMembershipId) {
      throw new ForbiddenException('Staff membership required.');
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
        resourceType: 'cashier_reconciliation',
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

function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toReconciliationDto(row: {
  id: string;
  cashierFinancialSessionId: string;
  expectedCashAmount: Prisma.Decimal;
  countedCashAmount: Prisma.Decimal;
  varianceAmount: Prisma.Decimal;
  currencyCode: string;
  status: string;
  cashierComment: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewComment: string | null;
  reviewedByMembershipId: string | null;
  version: number;
}): ReconciliationDto {
  return {
    reconciliationId: row.id,
    cashierFinancialSessionId: row.cashierFinancialSessionId,
    expectedCash: money(row.expectedCashAmount),
    countedCash: money(row.countedCashAmount),
    variance: money(row.varianceAmount),
    currencyCode: row.currencyCode,
    status: row.status,
    cashierComment: row.cashierComment,
    submittedAt: row.submittedAt,
    review:
      row.reviewedAt || row.reviewComment || row.reviewedByMembershipId
        ? {
            reviewedAt: row.reviewedAt,
            reviewComment: row.reviewComment,
            reviewedByMembershipId: row.reviewedByMembershipId,
          }
        : null,
    version: row.version,
  };
}
