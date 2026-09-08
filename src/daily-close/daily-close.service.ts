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
  CreateDailyCloseDto,
  VersionedDailyCloseDto,
} from './dto/daily-close.dto';
import {
  DailyCloseBlockerDto,
  DailyCloseDto,
  DailyCloseListResponseDto,
  DailyCloseLockResponseDto,
  DailyClosePreviewResponseDto,
  DailyCloseResponseDto,
  DailyCloseStationLineDto,
  DailyCloseSummaryDto,
  DailyCloseWaiterLineDto,
} from './dto/daily-close-response.dto';

const CREATE_COMMAND = 'daily_close.create';
const LOCK_COMMAND = 'daily_close.lock';
const PREPARE_ROLES = ['MANAGER', 'OWNER_ADMIN', 'CASHIER'];
const APPROVE_ROLES = ['OWNER_ADMIN', 'MANAGER'];
const LOCK_ROLES = ['OWNER_ADMIN', 'MANAGER'];

type Snapshot = {
  summary: DailyCloseSummaryDto;
  waiters: DailyCloseWaiterLineDto[];
  stations: DailyCloseStationLineDto[];
  blockers: DailyCloseBlockerDto[];
  tableCount: number;
  orderCount: number;
  itemCount: number;
  managerOverrideCount: number;
  raw: {
    grossOrderValue: Prisma.Decimal;
    cancelledValue: Prisma.Decimal;
    netBilledSales: Prisma.Decimal;
    cashSales: Prisma.Decimal;
    verifiedTransferSales: Prisma.Decimal;
    pendingTransferAmount: Prisma.Decimal;
    suspiciousTransferAmount: Prisma.Decimal;
    cashierExpectedCash: Prisma.Decimal;
    cashierCountedCash: Prisma.Decimal;
    cashierVariance: Prisma.Decimal;
    undroppedWaiterCash: Prisma.Decimal;
  };
};

@Injectable()
export class DailyCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async preview(
    userId: string,
    businessDateRaw?: string,
  ): Promise<DailyClosePreviewResponseDto> {
    const context = await this.requirePrepare(userId);
    const businessDate = this.parseBusinessDate(
      businessDateRaw ?? ymd(new Date()),
    );
    const snapshot = await this.buildSnapshot(context.branchId!, businessDate);
    const existing = await this.prisma.operationalDailyClose.findUnique({
      where: {
        branchId_businessDate: {
          branchId: context.branchId!,
          businessDate,
        },
      },
    });

    return {
      data: {
        businessDate: ymd(businessDate),
        currencyCode: 'ETB',
        readiness: {
          ready: snapshot.blockers.length === 0,
          blockers: snapshot.blockers,
        },
        summary: snapshot.summary,
        waiters: snapshot.waiters,
        stations: snapshot.stations,
        existingDailyCloseId: existing?.id ?? null,
        existingStatus: existing?.status ?? null,
        existingVersion: existing?.version ?? null,
      },
    };
  }

  async create(
    userId: string,
    dto: CreateDailyCloseDto,
    idempotencyKey?: string,
  ): Promise<DailyCloseResponseDto> {
    const context = await this.requirePrepare(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existingIdempotent = await this.findIdempotent(
      context,
      CREATE_COMMAND,
      key,
      dto,
    );
    if (existingIdempotent) {
      return existingIdempotent as unknown as DailyCloseResponseDto;
    }

    const businessDate = this.parseBusinessDate(dto.businessDate);
    const already = await this.prisma.operationalDailyClose.findUnique({
      where: {
        branchId_businessDate: {
          branchId: context.branchId!,
          businessDate,
        },
      },
    });
    if (already) {
      throw new ConflictException({
        status: 409,
        code: 'DAILY_CLOSE_ALREADY_EXISTS',
        errors: { dailyCloseId: already.id },
      });
    }

    const snapshot = await this.buildSnapshot(context.branchId!, businessDate);
    const status =
      snapshot.blockers.length === 0 ? 'READY_FOR_REVIEW' : 'DRAFT';

    const payload = await this.prisma.$transaction(async (tx) => {
      const close = await tx.operationalDailyClose.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate,
          status,
          currencyCode: 'ETB',
          generatedByMembershipId: context.staffMembershipId!,
          ...this.totalsData(snapshot),
          tableCount: snapshot.tableCount,
          orderCount: snapshot.orderCount,
          itemCount: snapshot.itemCount,
          managerOverrideCount: snapshot.managerOverrideCount,
          blockingIssuesJson: snapshot.blockers as unknown as Prisma.InputJsonValue,
        },
      });
      await this.replaceLines(tx, context, close.id, snapshot);
      const dtoOut = await this.toDtoFromId(tx, close.id);
      const wrapped = { data: dtoOut };
      await this.storeIdempotent(
        tx,
        context,
        CREATE_COMMAND,
        key,
        dto,
        wrapped,
        close.id,
      );
      return wrapped;
    });

    return payload;
  }

  async refresh(
    userId: string,
    dailyCloseId: string,
  ): Promise<DailyCloseResponseDto> {
    const context = await this.requirePrepare(userId);
    const close = await this.requireClose(context, dailyCloseId);
    if (close.status === 'LOCKED') {
      throw new ConflictException({
        status: 409,
        code: 'DAILY_CLOSE_ALREADY_LOCKED',
        errors: { status: close.status },
      });
    }
    if (!['DRAFT', 'READY_FOR_REVIEW', 'APPROVED'].includes(close.status)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'DAILY_CLOSE_NOT_REFRESHABLE',
        errors: { status: close.status },
      });
    }

    const snapshot = await this.buildSnapshot(
      context.branchId!,
      close.businessDate,
    );
    const status =
      close.status === 'APPROVED'
        ? 'APPROVED'
        : snapshot.blockers.length === 0
          ? 'READY_FOR_REVIEW'
          : 'DRAFT';

    await this.prisma.$transaction(async (tx) => {
      await tx.operationalDailyClose.update({
        where: { id: close.id },
        data: {
          status,
          ...this.totalsData(snapshot),
          tableCount: snapshot.tableCount,
          orderCount: snapshot.orderCount,
          itemCount: snapshot.itemCount,
          managerOverrideCount: snapshot.managerOverrideCount,
          blockingIssuesJson:
            snapshot.blockers as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      await this.replaceLines(tx, context, close.id, snapshot);
    });

    return { data: await this.toDtoFromId(this.prisma, close.id) };
  }

  async approve(
    userId: string,
    dailyCloseId: string,
    dto: VersionedDailyCloseDto,
  ): Promise<DailyCloseResponseDto> {
    const context = await this.requireApprove(userId);
    const close = await this.requireClose(context, dailyCloseId);
    if (close.version !== dto.expectedVersion) {
      throw new ConflictException({
        status: 409,
        code: 'VERSION_CONFLICT',
        errors: { expectedVersion: close.version },
      });
    }
    if (close.status === 'LOCKED') {
      throw new ConflictException({
        status: 409,
        code: 'DAILY_CLOSE_ALREADY_LOCKED',
        errors: { status: close.status },
      });
    }
    if (!['READY_FOR_REVIEW', 'DRAFT', 'APPROVED'].includes(close.status)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'DAILY_CLOSE_NOT_APPROVABLE',
        errors: { status: close.status },
      });
    }

    await this.prisma.operationalDailyClose.update({
      where: { id: close.id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedByMembershipId: context.staffMembershipId!,
        version: { increment: 1 },
      },
    });

    return { data: await this.toDtoFromId(this.prisma, close.id) };
  }

  async lock(
    userId: string,
    dailyCloseId: string,
    dto: VersionedDailyCloseDto,
    idempotencyKey?: string,
  ): Promise<DailyCloseLockResponseDto> {
    const context = await this.requireLock(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existingIdempotent = await this.findIdempotent(
      context,
      LOCK_COMMAND,
      key,
      { dailyCloseId, ...dto },
    );
    if (existingIdempotent) {
      return existingIdempotent as unknown as DailyCloseLockResponseDto;
    }

    const close = await this.requireClose(context, dailyCloseId);
    if (close.version !== dto.expectedVersion) {
      throw new ConflictException({
        status: 409,
        code: 'VERSION_CONFLICT',
        errors: { expectedVersion: close.version },
      });
    }
    if (close.status === 'LOCKED') {
      throw new ConflictException({
        status: 409,
        code: 'DAILY_CLOSE_ALREADY_LOCKED',
        errors: { status: close.status },
      });
    }

    const snapshot = await this.buildSnapshot(
      context.branchId!,
      close.businessDate,
    );
    if (snapshot.blockers.length > 0) {
      throw new ConflictException({
        status: 409,
        code: 'DAILY_CLOSE_BLOCKED',
        errors: { blockers: snapshot.blockers },
      });
    }

    const now = new Date();
    const payload = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.operationalDailyClose.update({
        where: { id: close.id },
        data: {
          status: 'LOCKED',
          lockedAt: now,
          lockedByMembershipId: context.staffMembershipId!,
          approvedAt: close.approvedAt ?? now,
          approvedByMembershipId:
            close.approvedByMembershipId ?? context.staffMembershipId!,
          ...this.totalsData(snapshot),
          tableCount: snapshot.tableCount,
          orderCount: snapshot.orderCount,
          itemCount: snapshot.itemCount,
          managerOverrideCount: snapshot.managerOverrideCount,
          blockingIssuesJson: [] as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      await this.replaceLines(tx, context, close.id, snapshot);
      const wrapped: DailyCloseLockResponseDto = {
        data: {
          dailyCloseId: updated.id,
          status: updated.status,
          businessDate: ymd(updated.businessDate),
          lockedAt: updated.lockedAt,
          lockedByMembershipId: updated.lockedByMembershipId,
          version: updated.version,
        },
      };
      await this.storeIdempotent(
        tx,
        context,
        LOCK_COMMAND,
        key,
        { dailyCloseId, ...dto },
        wrapped,
        updated.id,
      );
      return wrapped;
    });

    return payload;
  }

  async list(
    userId: string,
    query: { from?: string; to?: string; status?: string },
  ): Promise<DailyCloseListResponseDto> {
    const context = await this.requirePrepare(userId);
    const where: Prisma.OperationalDailyCloseWhereInput = {
      branchId: context.branchId!,
    };
    if (query.from || query.to) {
      where.businessDate = {};
      if (query.from) where.businessDate.gte = this.parseBusinessDate(query.from);
      if (query.to) where.businessDate.lte = this.parseBusinessDate(query.to);
    }
    if (query.status?.trim()) {
      where.status = {
        in: query.status
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      };
    }

    const rows = await this.prisma.operationalDailyClose.findMany({
      where,
      orderBy: { businessDate: 'desc' },
      take: 30,
      include: {
        waiterLines: { include: { waiter: true } },
        stationLines: true,
      },
    });

    return {
      data: rows.map((row) => this.mapClose(row)),
    };
  }

  async getOne(
    userId: string,
    dailyCloseId: string,
  ): Promise<DailyCloseResponseDto> {
    const context = await this.requirePrepare(userId);
    await this.requireClose(context, dailyCloseId);
    return { data: await this.toDtoFromId(this.prisma, dailyCloseId) };
  }

  private async buildSnapshot(
    branchId: string,
    businessDate: Date,
  ): Promise<Snapshot> {
    const [
      bills,
      payments,
      openSessions,
      openDrops,
      cashierSessions,
      reconciliations,
      waiterShifts,
      orderItems,
      stations,
    ] = await Promise.all([
      this.prisma.bill.findMany({
        where: { branchId, businessDate },
      }),
      this.prisma.payment.findMany({
        where: { branchId, businessDate },
        include: {
          bill: { include: { tableSession: { include: { table: true } } } },
        },
      }),
      this.prisma.tableSession.findMany({
        where: {
          branchId,
          businessDate,
          status: { not: 'CLOSED' },
        },
        include: { table: true },
      }),
      this.prisma.cashDrop.findMany({
        where: {
          branchId,
          businessDate,
          status: { in: ['INITIATED', 'DISPUTED'] },
        },
        include: { waiter: true },
      }),
      this.prisma.cashierFinancialSession.findMany({
        where: { branchId, businessDate },
        include: { cashier: true, reconciliation: true },
      }),
      this.prisma.cashierReconciliation.findMany({
        where: { branchId, businessDate },
      }),
      this.prisma.shiftSession.findMany({
        where: {
          branchId,
          businessDate,
          OR: [
            { role: { code: 'WAITER' } },
            { payments: { some: {} } },
            { waiterCashDrops: { some: {} } },
            { orders: { some: {} } },
          ],
        },
        include: { membership: true },
      }),
      this.prisma.orderItem.findMany({
        where: { branchId, businessDate },
      }),
      this.prisma.preparationStation.findMany({
        where: { branchId },
      }),
    ]);

    const shifts = waiterShifts;

    let grossOrderValue = new Prisma.Decimal(0);
    let cancelledValue = new Prisma.Decimal(0);
    for (const bill of bills) {
      grossOrderValue = grossOrderValue.plus(bill.subtotalAmount);
      cancelledValue = cancelledValue.plus(bill.cancelledAmount);
    }
    const netBilledSales = bills.reduce(
      (sum, bill) => sum.plus(bill.totalAmount),
      new Prisma.Decimal(0),
    );

    let cashSales = new Prisma.Decimal(0);
    let verifiedTransferSales = new Prisma.Decimal(0);
    let pendingTransferAmount = new Prisma.Decimal(0);
    let suspiciousTransferAmount = new Prisma.Decimal(0);

    for (const payment of payments) {
      if (payment.method === 'CASH' && payment.status === 'SETTLED') {
        cashSales = cashSales.plus(payment.amount);
      }
      if (payment.method === 'TRANSFER') {
        if (['SETTLED', 'VERIFIED'].includes(payment.status)) {
          verifiedTransferSales = verifiedTransferSales.plus(payment.amount);
        } else if (
          ['VERIFICATION_PENDING', 'PENDING', 'SUBMITTED'].includes(
            payment.status,
          )
        ) {
          pendingTransferAmount = pendingTransferAmount.plus(payment.amount);
        } else if (
          ['REJECTED', 'SUSPICIOUS', 'FLAGGED'].includes(payment.status)
        ) {
          suspiciousTransferAmount = suspiciousTransferAmount.plus(
            payment.amount,
          );
        }
      }
    }

    let cashierExpectedCash = new Prisma.Decimal(0);
    let cashierCountedCash = new Prisma.Decimal(0);
    for (const session of cashierSessions) {
      const expected = await this.sessionExpected(session);
      cashierExpectedCash = cashierExpectedCash.plus(expected);
      if (session.reconciliation) {
        cashierCountedCash = cashierCountedCash.plus(
          session.reconciliation.countedCashAmount,
        );
      }
    }
    const cashierVariance = cashierCountedCash.minus(cashierExpectedCash);

    const waiters: DailyCloseWaiterLineDto[] = [];
    let undroppedWaiterCash = new Prisma.Decimal(0);

    for (const shift of shifts) {
      const line = await this.waiterLineForShift(
        branchId,
        shift.id,
        shift.staffMembershipId,
        shift.membership.employeeDisplayName,
      );
      waiters.push(line);
      undroppedWaiterCash = undroppedWaiterCash.plus(line.undroppedCash);
    }

    const stationsOut: DailyCloseStationLineDto[] = stations.map((station) => {
      const items = orderItems.filter(
        (item) => item.currentPreparationStationId === station.id,
      );
      return {
        stationId: station.id,
        stationName: station.name,
        itemsHandledCount: items.filter((item) =>
          ['READY', 'SERVED', 'COMPLETED'].includes(item.state),
        ).length,
        delayedItemCount: items.filter((item) => item.state === 'DELAYED')
          .length,
        cannotPrepareCount: items.filter(
          (item) => item.state === 'CANNOT_PREPARE',
        ).length,
      };
    });

    const blockers: DailyCloseBlockerDto[] = [];

    for (const session of openSessions) {
      if (session.status === 'CLOSED') continue;
      blockers.push({
        code: 'OPEN_TABLE_SESSION',
        message: `${session.table.displayName} is still ${session.status}.`,
        entityId: session.id,
      });
    }

    for (const payment of payments) {
      if (
        payment.method === 'TRANSFER' &&
        ['VERIFICATION_PENDING', 'PENDING', 'SUBMITTED'].includes(
          payment.status,
        )
      ) {
        const tableName =
          payment.bill.tableSession.table.displayName ?? 'a table';
        blockers.push({
          code: 'PENDING_TRANSFER',
          message: `${tableName} has a pending transfer of ${money(payment.amount)}.`,
          entityId: payment.id,
        });
      }
    }

    for (const drop of openDrops) {
      blockers.push({
        code:
          drop.status === 'DISPUTED'
            ? 'DISPUTED_CASH_DROP'
            : 'OPEN_CASH_DROP',
        message: `${drop.waiter.employeeDisplayName} has a ${drop.status.toLowerCase()} cash drop.`,
        entityId: drop.id,
      });
    }

    for (const session of cashierSessions) {
      if (!session.reconciliation) {
        blockers.push({
          code: 'CASHIER_RECONCILIATION_MISSING',
          message: `${session.cashier.employeeDisplayName} has not submitted reconciliation.`,
          entityId: session.id,
        });
      } else if (
        !['APPROVED', 'SUBMITTED'].includes(session.reconciliation.status) &&
        session.reconciliation.status === 'FLAGGED'
      ) {
        blockers.push({
          code: 'CASHIER_RECONCILIATION_FLAGGED',
          message: `${session.cashier.employeeDisplayName} reconciliation is flagged.`,
          entityId: session.reconciliation.id,
        });
      }
    }

    // Require zero variance or approved recon — FLAGGED already blocked.
    // SUBMITTED with variance is OK for lock if manager approved? Seed treats missing only.
    // For lock readiness: require recon exists and not FLAGGED.
    for (const recon of reconciliations) {
      if (recon.status === 'FLAGGED') {
        blockers.push({
          code: 'CASHIER_RECONCILIATION_FLAGGED',
          message: 'A cashier reconciliation is flagged.',
          entityId: recon.id,
        });
      }
    }

    for (const waiter of waiters) {
      if (new Prisma.Decimal(waiter.undroppedCash).gt(0)) {
        blockers.push({
          code: 'UNDROPPED_WAITER_CASH',
          message: `${waiter.waiterName} still holds ${waiter.undroppedCash} ETB.`,
          entityId: waiter.shiftSessionId,
        });
      }
    }

    const raw = {
      grossOrderValue,
      cancelledValue,
      netBilledSales,
      cashSales,
      verifiedTransferSales,
      pendingTransferAmount,
      suspiciousTransferAmount,
      cashierExpectedCash,
      cashierCountedCash,
      cashierVariance,
      undroppedWaiterCash,
    };

    return {
      summary: {
        grossOrderValue: money(grossOrderValue),
        cancelledValue: money(cancelledValue),
        netBilledSales: money(netBilledSales),
        cashSales: money(cashSales),
        verifiedTransferSales: money(verifiedTransferSales),
        pendingTransferAmount: money(pendingTransferAmount),
        suspiciousTransferAmount: money(suspiciousTransferAmount),
        cashierExpectedCash: money(cashierExpectedCash),
        cashierCountedCash: money(cashierCountedCash),
        cashierVariance: money(cashierVariance),
        undroppedWaiterCash: money(undroppedWaiterCash),
      },
      waiters,
      stations: stationsOut,
      blockers,
      tableCount: await this.prisma.tableSession.count({
        where: { branchId, businessDate },
      }),
      orderCount: await this.prisma.order.count({
        where: { branchId, businessDate },
      }),
      itemCount: orderItems.length,
      managerOverrideCount: 0,
      raw,
    };
  }

  private async sessionExpected(session: {
    id: string;
    openingFloatAmount: Prisma.Decimal;
  }) {
    const entries = await this.prisma.cashLedgerEntry.findMany({
      where: {
        cashierFinancialSessionId: session.id,
        holderType: 'CASHIER_SESSION',
      },
    });
    let drops = new Prisma.Decimal(0);
    let other = new Prisma.Decimal(0);
    for (const entry of entries) {
      if (entry.entryType === 'CASH_DROP_IN') {
        drops = drops.plus(entry.amountDelta);
      } else if (entry.entryType !== 'OPENING_FLOAT') {
        other = other.plus(entry.amountDelta);
      }
    }
    if (drops.equals(0)) {
      const received = await this.prisma.cashDrop.findMany({
        where: {
          cashierFinancialSessionId: session.id,
          status: { in: ['RECEIVED', 'RESOLVED'] },
        },
      });
      drops = received.reduce(
        (sum, drop) =>
          sum.plus(
            drop.resolutionAmount ?? drop.countedAmount ?? drop.declaredAmount,
          ),
        new Prisma.Decimal(0),
      );
    }
    return new Prisma.Decimal(session.openingFloatAmount).plus(drops).plus(other);
  }

  private async waiterLineForShift(
    branchId: string,
    shiftSessionId: string,
    waiterMembershipId: string,
    waiterName: string,
  ): Promise<DailyCloseWaiterLineDto> {
    const [orders, payments, drops, tables] = await Promise.all([
      this.prisma.order.findMany({
        where: { waiterShiftSessionId: shiftSessionId },
        include: { items: true },
      }),
      this.prisma.payment.findMany({
        where: {
          branchId,
          collectorShiftSessionId: shiftSessionId,
        },
      }),
      this.prisma.cashDrop.findMany({
        where: { waiterShiftSessionId: shiftSessionId },
      }),
      this.prisma.tableSession.findMany({
        where: { primaryWaiterShiftSessionId: shiftSessionId },
      }),
    ]);

    let netAttributedSales = new Prisma.Decimal(0);
    for (const order of orders) {
      for (const item of order.items) {
        if (['CANCELLED', 'VOIDED'].includes(item.state)) continue;
        netAttributedSales = netAttributedSales.plus(
          new Prisma.Decimal(item.unitPriceSnapshot).mul(item.quantity),
        );
      }
    }

    const cashCollected = payments
      .filter((p) => p.method === 'CASH' && p.status === 'SETTLED')
      .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const verifiedTransferAmount = payments
      .filter(
        (p) =>
          p.method === 'TRANSFER' &&
          ['SETTLED', 'VERIFIED'].includes(p.status),
      )
      .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const cashDropped = drops
      .filter((d) => d.status === 'RECEIVED' || d.status === 'RESOLVED')
      .reduce(
        (sum, d) =>
          sum.plus(d.resolutionAmount ?? d.countedAmount ?? d.declaredAmount),
        new Prisma.Decimal(0),
      );
    const pending = drops
      .filter((d) => d.status === 'INITIATED' || d.status === 'DISPUTED')
      .reduce((sum, d) => sum.plus(d.declaredAmount), new Prisma.Decimal(0));
    const undroppedCash = Prisma.Decimal.max(
      cashCollected.minus(cashDropped).minus(pending),
      0,
    );

    return {
      waiterMembershipId,
      waiterName,
      shiftSessionId,
      ordersCreatedCount: orders.length,
      tablesServedCount: tables.length,
      netAttributedSales: money(netAttributedSales),
      cashCollected: money(cashCollected),
      cashDropped: money(cashDropped),
      undroppedCash: money(undroppedCash),
      verifiedTransferAmount: money(verifiedTransferAmount),
    };
  }

  private totalsData(snapshot: Snapshot) {
    return {
      grossOrderValue: snapshot.raw.grossOrderValue,
      cancelledValue: snapshot.raw.cancelledValue,
      netBilledSales: snapshot.raw.netBilledSales,
      cashSales: snapshot.raw.cashSales,
      verifiedTransferSales: snapshot.raw.verifiedTransferSales,
      pendingTransferAmount: snapshot.raw.pendingTransferAmount,
      suspiciousTransferAmount: snapshot.raw.suspiciousTransferAmount,
      cashierExpectedCash: snapshot.raw.cashierExpectedCash,
      cashierCountedCash: snapshot.raw.cashierCountedCash,
      cashierVariance: snapshot.raw.cashierVariance,
      undroppedWaiterCash: snapshot.raw.undroppedWaiterCash,
    };
  }

  private async replaceLines(
    tx: Prisma.TransactionClient,
    context: AuthContextDto,
    dailyCloseId: string,
    snapshot: Snapshot,
  ) {
    await tx.dailyCloseWaiterLine.deleteMany({ where: { dailyCloseId } });
    await tx.dailyCloseStationLine.deleteMany({ where: { dailyCloseId } });

    for (const waiter of snapshot.waiters) {
      await tx.dailyCloseWaiterLine.create({
        data: {
          tenantId: context.tenantId!,
          dailyCloseId,
          waiterMembershipId: waiter.waiterMembershipId,
          shiftSessionId: waiter.shiftSessionId,
          ordersCreatedCount: waiter.ordersCreatedCount,
          tablesServedCount: waiter.tablesServedCount,
          grossAttributedSales: waiter.netAttributedSales,
          cancelledAttributedValue: 0,
          netAttributedSales: waiter.netAttributedSales,
          cashCollected: waiter.cashCollected,
          cashDropped: waiter.cashDropped,
          undroppedCash: waiter.undroppedCash,
          verifiedTransferAmount: waiter.verifiedTransferAmount,
          rejectedOrSuspiciousTransferCount: 0,
          paymentExceptionCount: 0,
        },
      });
    }

    for (const station of snapshot.stations) {
      await tx.dailyCloseStationLine.create({
        data: {
          tenantId: context.tenantId!,
          dailyCloseId,
          stationId: station.stationId,
          stationNameSnapshot: station.stationName,
          itemsHandledCount: station.itemsHandledCount,
          delayedItemCount: station.delayedItemCount,
          cannotPrepareCount: station.cannotPrepareCount,
        },
      });
    }
  }

  private async toDtoFromId(
    db: Prisma.TransactionClient | PrismaService,
    id: string,
  ): Promise<DailyCloseDto> {
    const row = await db.operationalDailyClose.findUnique({
      where: { id },
      include: {
        waiterLines: { include: { waiter: true } },
        stationLines: true,
      },
    });
    if (!row) throw new NotFoundException('Daily close not found.');
    return this.mapClose(row);
  }

  private mapClose(row: {
    id: string;
    businessDate: Date;
    status: string;
    currencyCode: string;
    grossOrderValue: Prisma.Decimal;
    cancelledValue: Prisma.Decimal;
    netBilledSales: Prisma.Decimal;
    cashSales: Prisma.Decimal;
    verifiedTransferSales: Prisma.Decimal;
    pendingTransferAmount: Prisma.Decimal;
    suspiciousTransferAmount: Prisma.Decimal;
    cashierExpectedCash: Prisma.Decimal;
    cashierCountedCash: Prisma.Decimal;
    cashierVariance: Prisma.Decimal;
    undroppedWaiterCash: Prisma.Decimal;
    blockingIssuesJson: Prisma.JsonValue | null;
    approvedAt: Date | null;
    lockedAt: Date | null;
    version: number;
    waiterLines: Array<{
      waiterMembershipId: string;
      shiftSessionId: string;
      ordersCreatedCount: number;
      tablesServedCount: number;
      netAttributedSales: Prisma.Decimal;
      cashCollected: Prisma.Decimal;
      cashDropped: Prisma.Decimal;
      undroppedCash: Prisma.Decimal;
      verifiedTransferAmount: Prisma.Decimal;
      waiter: { employeeDisplayName: string };
    }>;
    stationLines: Array<{
      stationId: string;
      stationNameSnapshot: string;
      itemsHandledCount: number;
      delayedItemCount: number;
      cannotPrepareCount: number;
    }>;
  }): DailyCloseDto {
    const blockers = parseBlockers(row.blockingIssuesJson);
    return {
      dailyCloseId: row.id,
      businessDate: ymd(row.businessDate),
      status: row.status,
      currencyCode: row.currencyCode,
      summary: {
        grossOrderValue: money(row.grossOrderValue),
        cancelledValue: money(row.cancelledValue),
        netBilledSales: money(row.netBilledSales),
        cashSales: money(row.cashSales),
        verifiedTransferSales: money(row.verifiedTransferSales),
        pendingTransferAmount: money(row.pendingTransferAmount),
        suspiciousTransferAmount: money(row.suspiciousTransferAmount),
        cashierExpectedCash: money(row.cashierExpectedCash),
        cashierCountedCash: money(row.cashierCountedCash),
        cashierVariance: money(row.cashierVariance),
        undroppedWaiterCash: money(row.undroppedWaiterCash),
      },
      waiters: row.waiterLines.map((line) => ({
        waiterMembershipId: line.waiterMembershipId,
        waiterName: line.waiter.employeeDisplayName,
        shiftSessionId: line.shiftSessionId,
        ordersCreatedCount: line.ordersCreatedCount,
        tablesServedCount: line.tablesServedCount,
        netAttributedSales: money(line.netAttributedSales),
        cashCollected: money(line.cashCollected),
        cashDropped: money(line.cashDropped),
        undroppedCash: money(line.undroppedCash),
        verifiedTransferAmount: money(line.verifiedTransferAmount),
      })),
      stations: row.stationLines.map((line) => ({
        stationId: line.stationId,
        stationName: line.stationNameSnapshot,
        itemsHandledCount: line.itemsHandledCount,
        delayedItemCount: line.delayedItemCount,
        cannotPrepareCount: line.cannotPrepareCount,
      })),
      readiness: {
        ready: blockers.length === 0,
        blockers,
      },
      approvedAt: row.approvedAt,
      lockedAt: row.lockedAt,
      version: row.version,
    };
  }

  private async requireClose(context: AuthContextDto, dailyCloseId: string) {
    const close = await this.prisma.operationalDailyClose.findFirst({
      where: { id: dailyCloseId, branchId: context.branchId! },
    });
    if (!close) throw new NotFoundException('Daily close not found.');
    return close;
  }

  private parseBusinessDate(raw: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { businessDate: 'invalid' },
      });
    }
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { businessDate: 'invalid' },
      });
    }
    return date;
  }

  private async requireBranch(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId || !context.staffMembershipId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    return context;
  }

  private async requirePrepare(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (!PREPARE_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Daily close is for managers/cashiers.');
    }
    return context;
  }

  private async requireApprove(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (!APPROVE_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Approve daily close is for managers.');
    }
    return context;
  }

  private async requireLock(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (!LOCK_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Lock daily close is for managers.');
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
        resourceType: 'operational_daily_close',
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

function parseBlockers(json: Prisma.JsonValue | null): DailyCloseBlockerDto[] {
  if (!json || !Array.isArray(json)) return [];
  return json.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      code: String(row.code ?? 'UNKNOWN'),
      message: String(
        row.message ??
          row.tableName ??
          row.code ??
          'Blocking issue',
      ),
      entityId:
        (row.entityId as string) ??
        (row.tableId as string) ??
        (row.cashierSessionId as string) ??
        null,
    };
  });
}
