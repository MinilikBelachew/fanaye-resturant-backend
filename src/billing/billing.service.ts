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
import { ExpectedTableSessionVersionDto } from './dto/expected-table-session-version.dto';
import {
  CashPaymentDto,
  TransferPaymentDto,
} from './dto/payment.dto';
import {
  BillDto,
  BillRequestCreatedDto,
  CashierBillRequestDto,
  CashierBillRequestsResponseDto,
  CashPaymentResponseDto,
  PaymentDto,
  SessionBillResponseDto,
  TransferPaymentResponseDto,
} from './dto/billing-response.dto';

const REQUEST_COMMAND = 'bill.request';
const GENERATE_COMMAND = 'bill.generate';
const CASH_COMMAND = 'payment.cash';
const TRANSFER_COMMAND = 'payment.transfer';

const REQUESTABLE = ['OPEN', 'ACTIVE_ORDER', 'ATTENTION_REQUIRED'];
const GENERATE_ROLES = ['CASHIER', 'MANAGER', 'OWNER_ADMIN'];
const VIEW_PAYMENT_ROLES = ['CASHIER', 'MANAGER', 'OWNER_ADMIN'];
const COLLECT_ROLES = ['WAITER', 'MANAGER', 'OWNER_ADMIN'];
const CHARGEABLE_ITEM = (state: string, cancelledAt: Date | null) =>
  !cancelledAt && state !== 'CANCELLED';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  async requestBill(
    userId: string,
    tableSessionId: string,
    dto: ExpectedTableSessionVersionDto,
    idempotencyKey?: string,
  ): Promise<BillRequestCreatedDto> {
    const context = await this.requireWaiterOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(
      context,
      REQUEST_COMMAND,
      key,
      { tableSessionId, ...dto },
    );
    if (existing) return existing as unknown as BillRequestCreatedDto;

    const session = await this.prisma.tableSession.findFirst({
      where: { id: tableSessionId, branchId: context.branchId! },
      include: {
        orders: {
          include: {
            items: { include: { modifiers: true } },
          },
        },
        bill: true,
        billRequests: {
          where: { status: 'PENDING' },
          orderBy: { requestedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!session) throw new NotFoundException('Table session not found.');

    this.assertPrimaryWaiter(context, session);
    if (session.version !== dto.expectedTableSessionVersion) {
      this.staleVersion(session.version);
    }
    if (!REQUESTABLE.includes(session.status)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'SESSION_NOT_BILLABLE',
        errors: { status: session.status },
      });
    }
    if (session.bill) {
      throw new ConflictException({
        status: 409,
        code: 'BILL_ALREADY_EXISTS',
        errors: { bill: 'BILL_ALREADY_EXISTS' },
      });
    }
    if (session.billRequests.length > 0) {
      throw new ConflictException({
        status: 409,
        code: 'BILL_REQUEST_PENDING',
        errors: { billRequest: 'BILL_REQUEST_PENDING' },
      });
    }

    const chargeable = session.orders.flatMap((order) =>
      order.items.filter((item) =>
        CHARGEABLE_ITEM(item.state, item.cancelledAt),
      ),
    );
    if (chargeable.length === 0) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'BILL_REQUEST_EMPTY',
        errors: { items: 'BILL_REQUEST_EMPTY' },
      });
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.billRequest.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: session.businessDate,
          tableSessionId: session.id,
          requestedByMembershipId: context.staffMembershipId!,
          requestedAt: now,
          status: 'PENDING',
        },
      });
      const updated = await tx.tableSession.update({
        where: { id: session.id },
        data: {
          status: 'BILL_REQUESTED',
          billRequestedAt: now,
          version: { increment: 1 },
        },
      });
      const payload: BillRequestCreatedDto = {
        billRequestId: request.id,
        status: request.status,
        requestedAt: request.requestedAt,
        tableSession: {
          status: updated.status,
          version: updated.version,
        },
      };
      await this.storeIdempotent(
        tx,
        context,
        REQUEST_COMMAND,
        key,
        { tableSessionId, ...dto },
        payload,
        request.id,
      );
      return payload;
    });
  }

  async cancelBillRequest(
    userId: string,
    billRequestId: string,
  ): Promise<BillRequestCreatedDto> {
    const context = await this.requireWaiterOnShift(userId);
    const request = await this.prisma.billRequest.findFirst({
      where: { id: billRequestId, branchId: context.branchId! },
      include: { tableSession: true },
    });
    if (!request) throw new NotFoundException('Bill request not found.');
    this.assertPrimaryWaiter(context, request.tableSession);
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'BILL_REQUEST_NOT_PENDING',
        errors: { status: request.status },
      });
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.billRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      const hasOrders = await tx.order.count({
        where: { tableSessionId: request.tableSessionId },
      });
      const updated = await tx.tableSession.update({
        where: { id: request.tableSessionId },
        data: {
          status: hasOrders > 0 ? 'ACTIVE_ORDER' : 'OPEN',
          billRequestedAt: null,
          version: { increment: 1 },
        },
      });
      return {
        billRequestId: cancelled.id,
        status: cancelled.status,
        requestedAt: cancelled.requestedAt,
        tableSession: {
          status: updated.status,
          version: updated.version,
        },
      };
    });
    return result;
  }

  async listCashierBillRequests(
    userId: string,
  ): Promise<CashierBillRequestsResponseDto> {
    const context = await this.requireBranch(userId);
    if (!GENERATE_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Bill request queue is for cashiers.');
    }

    const requests = await this.prisma.billRequest.findMany({
      where: {
        branchId: context.branchId!,
        status: 'PENDING',
      },
      include: {
        requestedBy: true,
        tableSession: {
          include: {
            table: true,
            orders: {
              include: {
                items: { include: { modifiers: true } },
              },
            },
          },
        },
      },
      orderBy: { requestedAt: 'asc' },
    });

    const now = Date.now();
    const data: CashierBillRequestDto[] = requests.map((request) => {
      const items = request.tableSession.orders.flatMap((order) =>
        order.items.filter((item) =>
          CHARGEABLE_ITEM(item.state, item.cancelledAt),
        ),
      );
      const estimated = items.reduce(
        (sum, item) => sum.plus(lineTotal(item)),
        new Prisma.Decimal(0),
      );
      const warnings: string[] = [];
      if (
        items.some((item) =>
          ['QUEUED', 'ACKNOWLEDGED', 'IN_PREPARATION', 'READY'].includes(
            item.state,
          ),
        )
      ) {
        warnings.push('UNSERVED_ITEMS');
      }
      if (items.some((item) => item.state === 'CANNOT_PREPARE')) {
        warnings.push('PRODUCTION_EXCEPTION');
      }
      const table = request.tableSession.table;
      return {
        billRequestId: request.id,
        tableSessionId: request.tableSessionId,
        tableDisplayName:
          table.displayNumber ??
          table.displayName.replace(/^Table\s+/i, ''),
        waiter: {
          membershipId: request.requestedByMembershipId,
          displayName: request.requestedBy.employeeDisplayName,
        },
        requestedAt: request.requestedAt,
        requestAgeSeconds: Math.max(
          0,
          Math.floor((now - request.requestedAt.getTime()) / 1000),
        ),
        estimatedAmount: money(estimated),
        currencyCode: 'ETB',
        expectedTableSessionVersion: request.tableSession.version,
        warnings,
      };
    });

    return { data };
  }

  async generateBill(
    userId: string,
    billRequestId: string,
    dto: ExpectedTableSessionVersionDto,
    idempotencyKey?: string,
  ): Promise<BillDto> {
    const context = await this.requireBranch(userId);
    if (!GENERATE_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Only cashier or manager can generate bills.');
    }
    if (!context.staffMembershipId) {
      throw new ForbiddenException('No restaurant membership for this account.');
    }
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(
      context,
      GENERATE_COMMAND,
      key,
      { billRequestId, ...dto },
    );
    if (existing) return existing as unknown as BillDto;

    const request = await this.prisma.billRequest.findFirst({
      where: { id: billRequestId, branchId: context.branchId! },
      include: {
        tableSession: {
          include: {
            bill: true,
            table: true,
            orders: {
              include: {
                items: {
                  include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
                  orderBy: { confirmedAt: 'asc' },
                },
              },
              orderBy: { confirmedAt: 'asc' },
            },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Bill request not found.');
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'BILL_REQUEST_NOT_PENDING',
        errors: { status: request.status },
      });
    }
    if (request.tableSession.bill) {
      throw new ConflictException({
        status: 409,
        code: 'BILL_ALREADY_EXISTS',
        errors: { bill: 'BILL_ALREADY_EXISTS' },
      });
    }
    if (
      request.tableSession.version !== dto.expectedTableSessionVersion
    ) {
      this.staleVersion(request.tableSession.version);
    }

    const items = request.tableSession.orders.flatMap((order) =>
      order.items.filter((item) =>
        CHARGEABLE_ITEM(item.state, item.cancelledAt),
      ),
    );
    if (items.length === 0) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'BILL_GENERATION_BLOCKED',
        errors: { items: 'BILL_GENERATION_BLOCKED' },
      });
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: context.branchId! },
    });
    const prefix = (branch?.displayCode || branch?.name || 'BILL')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase();
    const day = localYmd(request.tableSession.businessDate);
    const sequence = await this.prisma.bill.count({
      where: {
        branchId: context.branchId!,
        businessDate: request.tableSession.businessDate,
      },
    });
    const billNumber = `${prefix}-${day}-${String(sequence + 1).padStart(4, '0')}`;

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      let subtotal = new Prisma.Decimal(0);
      const lineData = items.map((item, sortOrder) => {
        const total = lineTotal(item);
        subtotal = subtotal.plus(total);
        const modifierTotal = item.modifiers.reduce(
          (sum, entry) => sum.plus(entry.priceDeltaSnapshot),
          new Prisma.Decimal(0),
        );
        return {
          tenantId: context.tenantId!,
          orderItemId: item.id,
          itemNameSnapshot: item.itemNameSnapshot,
          quantity: item.quantity,
          unitPriceSnapshot: item.unitPriceSnapshot,
          modifierTotalSnapshot: modifierTotal,
          lineTotal: total,
          currencyCode: item.currencyCode,
          chargeStatus: 'CHARGED',
          sortOrder,
        };
      });

      const bill = await tx.bill.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: request.tableSession.businessDate,
          tableSessionId: request.tableSessionId,
          billNumber,
          status: 'GENERATED',
          currencyCode: 'ETB',
          subtotalAmount: subtotal,
          cancelledAmount: 0,
          totalAmount: subtotal,
          amountPaid: 0,
          generatedByMembershipId: context.staffMembershipId!,
          generatedAt: now,
          lines: { create: lineData },
        },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      });

      await tx.billRequest.update({
        where: { id: request.id },
        data: { status: 'FULFILLED', fulfilledAt: now },
      });
      await tx.tableSession.update({
        where: { id: request.tableSessionId },
        data: {
          status: 'BILL_READY',
          version: { increment: 1 },
        },
      });

      const payload = toBillDto(bill);
      await this.storeIdempotent(
        tx,
        context,
        GENERATE_COMMAND,
        key,
        { billRequestId, ...dto },
        payload,
        bill.id,
      );
      return payload;
    });
  }

  async getSessionBill(
    userId: string,
    tableSessionId: string,
  ): Promise<SessionBillResponseDto> {
    const context = await this.requireBranch(userId);
    const session = await this.prisma.tableSession.findFirst({
      where: { id: tableSessionId, branchId: context.branchId! },
      include: {
        bill: { include: { lines: { orderBy: { sortOrder: 'asc' } } } },
        billRequests: {
          orderBy: { requestedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!session) throw new NotFoundException('Table session not found.');

    const payments = session.bill
      ? await this.prisma.payment.findMany({
          where: { billId: session.bill.id },
          orderBy: { initiatedAt: 'asc' },
        })
      : [];

    const latestRequest = session.billRequests[0] ?? null;
    return {
      bill: session.bill ? toBillDto(session.bill) : null,
      billRequest: latestRequest
        ? {
            billRequestId: latestRequest.id,
            status: latestRequest.status,
            requestedAt: latestRequest.requestedAt,
          }
        : null,
      tableSession: {
        tableSessionId: session.id,
        status: session.status,
        version: session.version,
      },
      payments: payments.map(toPaymentDto),
    };
  }

  async getBill(userId: string, billId: string): Promise<BillDto> {
    const context = await this.requireBranch(userId);
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, branchId: context.branchId! },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!bill) throw new NotFoundException('Bill not found.');
    return toBillDto(bill);
  }

  async payCash(
    userId: string,
    billId: string,
    dto: CashPaymentDto,
    idempotencyKey?: string,
  ): Promise<CashPaymentResponseDto> {
    const context = await this.requireCollectorOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(
      context,
      CASH_COMMAND,
      key,
      { billId, ...dto },
    );
    if (existing) return existing as unknown as CashPaymentResponseDto;

    const bill = await this.loadPayableBill(context, billId);
    this.assertCollectorForBill(context, bill);
    if (bill.version !== dto.expectedBillVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: bill.version,
      });
    }

    const due = new Prisma.Decimal(bill.totalAmount).minus(bill.amountPaid);
    const amount = new Prisma.Decimal(dto.amount);
    const tendered = new Prisma.Decimal(dto.cashTendered);
    if (!amount.equals(due) || due.lte(0)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'PAYMENT_AMOUNT_INVALID',
        errors: { amount: money(due) },
      });
    }
    if (tendered.lt(amount)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CASH_TENDERED_INSUFFICIENT',
        errors: { cashTendered: 'CASH_TENDERED_INSUFFICIENT' },
      });
    }
    const change = tendered.minus(amount);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: bill.businessDate,
          billId: bill.id,
          method: 'CASH',
          status: 'SETTLED',
          currencyCode: bill.currencyCode,
          amount,
          collectorMembershipId: context.staffMembershipId!,
          collectorShiftSessionId: context.shiftSessionId!,
          cashTenderedAmount: tendered,
          cashChangeAmount: change,
          collectedAt: now,
          settledAt: now,
        },
      });
      const updatedBill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          status: 'PAID',
          amountPaid: bill.totalAmount,
          paidAt: now,
          version: { increment: 1 },
        },
      });
      const session = await tx.tableSession.update({
        where: { id: bill.tableSessionId },
        data: {
          status: 'PAID',
          version: { increment: 1 },
        },
      });
      const payload: CashPaymentResponseDto = {
        payment: toPaymentDto(payment),
        change: money(change),
        bill: {
          billId: updatedBill.id,
          status: updatedBill.status,
          amountPaid: money(updatedBill.amountPaid),
          version: updatedBill.version,
        },
        tableSession: {
          status: session.status,
          version: session.version,
        },
      };
      await this.storeIdempotent(
        tx,
        context,
        CASH_COMMAND,
        key,
        { billId, ...dto },
        payload,
        payment.id,
      );
      return payload;
    });
  }

  async payTransfer(
    userId: string,
    billId: string,
    dto: TransferPaymentDto,
    idempotencyKey?: string,
  ): Promise<TransferPaymentResponseDto> {
    const context = await this.requireCollectorOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(
      context,
      TRANSFER_COMMAND,
      key,
      { billId, ...dto },
    );
    if (existing) return existing as unknown as TransferPaymentResponseDto;

    const bill = await this.loadPayableBill(context, billId);
    this.assertCollectorForBill(context, bill);
    if (bill.version !== dto.expectedBillVersion) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: bill.version,
      });
    }

    const file = await this.prisma.file.findUnique({
      where: { id: dto.fileId },
    });
    if (!file) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'RECEIPT_FILE_MISSING',
        errors: { fileId: 'RECEIPT_FILE_MISSING' },
      });
    }

    const due = new Prisma.Decimal(bill.totalAmount).minus(bill.amountPaid);
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.equals(due) || due.lte(0)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'PAYMENT_AMOUNT_INVALID',
        errors: { amount: money(due) },
      });
    }

    const pending = await this.prisma.payment.findFirst({
      where: {
        billId: bill.id,
        method: 'TRANSFER',
        status: { in: ['SETTLED', 'VERIFIED'] },
      },
    });
    if (pending) {
      throw new ConflictException({
        status: 409,
        code: 'TRANSFER_ALREADY_RECORDED',
        errors: { payment: 'TRANSFER_ALREADY_RECORDED' },
      });
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate: bill.businessDate,
          billId: bill.id,
          method: 'TRANSFER',
          transferChannel: dto.transferChannel,
          status: 'SETTLED',
          currencyCode: bill.currencyCode,
          amount,
          collectorMembershipId: context.staffMembershipId!,
          collectorShiftSessionId: context.shiftSessionId!,
          collectedAt: now,
          settledAt: now,
          receipt: {
            create: {
              tenantId: context.tenantId!,
              fileId: dto.fileId,
              capturedByMembershipId: context.staffMembershipId!,
              capturedAt: now,
            },
          },
        },
      });
      const updatedBill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          status: 'PAID',
          amountPaid: bill.totalAmount,
          paidAt: now,
          version: { increment: 1 },
        },
      });
      const session = await tx.tableSession.update({
        where: { id: bill.tableSessionId },
        data: {
          status: 'PAID',
          version: { increment: 1 },
        },
      });
      const payload: TransferPaymentResponseDto = {
        payment: toPaymentDto(payment),
        bill: {
          billId: updatedBill.id,
          status: updatedBill.status,
          amountPaid: money(updatedBill.amountPaid),
          version: updatedBill.version,
        },
        tableSession: {
          status: session.status,
          version: session.version,
        },
      };
      await this.storeIdempotent(
        tx,
        context,
        TRANSFER_COMMAND,
        key,
        { billId, ...dto },
        payload,
        payment.id,
      );
      return payload;
    });
  }

  async listPayments(userId: string): Promise<{
    data: Array<
      PaymentDto & {
        billId: string;
        billNumber: string;
        tableSessionId: string;
        tableDisplayName: string;
        waiterName: string;
        sessionStatus: string;
        tableClosed: boolean;
      }
    >;
  }> {
    const context = await this.requireBranch(userId);
    if (!VIEW_PAYMENT_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Payment log is for cashiers.');
    }
    const payments = await this.prisma.payment.findMany({
      where: {
        branchId: context.branchId!,
        status: 'SETTLED',
      },
      include: {
        collector: true,
        bill: {
          include: {
            tableSession: { include: { table: true } },
          },
        },
      },
      orderBy: { settledAt: 'desc' },
      take: 100,
    });
    return {
      data: payments.map((payment) => {
        const table = payment.bill.tableSession.table;
        const session = payment.bill.tableSession;
        return {
          ...toPaymentDto(payment),
          billId: payment.billId,
          billNumber: payment.bill.billNumber,
          tableSessionId: payment.bill.tableSessionId,
          tableDisplayName:
            table.displayNumber ??
            table.displayName.replace(/^Table\s+/i, ''),
          waiterName: payment.collector.employeeDisplayName,
          sessionStatus: session.status,
          tableClosed: session.status === 'CLOSED' || Boolean(session.closedAt),
        };
      }),
    };
  }

  private async loadPayableBill(context: AuthContextDto, billId: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, branchId: context.branchId! },
      include: { tableSession: true },
    });
    if (!bill) throw new NotFoundException('Bill not found.');
    if (!['GENERATED', 'PAYMENT_PENDING'].includes(bill.status)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'BILL_NOT_PAYABLE',
        errors: { status: bill.status },
      });
    }
    return bill;
  }

  private assertCollectorForBill(
    context: AuthContextDto,
    bill: { tableSession: { primaryWaiterMembershipId: string } },
  ) {
    if (context.roleCode === 'WAITER') {
      if (
        bill.tableSession.primaryWaiterMembershipId !==
        context.staffMembershipId
      ) {
        throw new ForbiddenException('This is not your table.');
      }
    }
  }

  private assertPrimaryWaiter(
    context: AuthContextDto,
    session: { primaryWaiterMembershipId: string },
  ) {
    if (
      session.primaryWaiterMembershipId !== context.staffMembershipId &&
      context.roleCode === 'WAITER'
    ) {
      throw new ForbiddenException('This is not your table.');
    }
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
      throw new ForbiddenException('Only the waiter can request the bill.');
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

  private async requireCollectorOnShift(
    userId: string,
  ): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (!COLLECT_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Only the waiter can collect payment.');
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

  private staleVersion(expectedVersion: number): never {
    throw new ConflictException({
      status: 409,
      errors: { version: 'stale' },
      expectedVersion,
    });
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
        resourceType: commandType.split('.')[0],
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

function lineTotal(item: {
  quantity: number;
  unitPriceSnapshot: Prisma.Decimal;
  modifiers: Array<{ priceDeltaSnapshot: Prisma.Decimal }>;
}): Prisma.Decimal {
  const modifiers = item.modifiers.reduce(
    (sum, entry) => sum.plus(entry.priceDeltaSnapshot),
    new Prisma.Decimal(0),
  );
  return new Prisma.Decimal(item.unitPriceSnapshot)
    .plus(modifiers)
    .mul(item.quantity);
}

function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function toBillDto(bill: {
  id: string;
  tableSessionId: string;
  billNumber: string;
  status: string;
  currencyCode: string;
  subtotalAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  generatedAt: Date;
  paidAt: Date | null;
  version: number;
  lines: Array<{
    id: string;
    orderItemId: string | null;
    itemNameSnapshot: string;
    quantity: number;
    unitPriceSnapshot: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    chargeStatus: string;
  }>;
}): BillDto {
  return {
    billId: bill.id,
    tableSessionId: bill.tableSessionId,
    billNumber: bill.billNumber,
    status: bill.status,
    currencyCode: bill.currencyCode,
    subtotal: money(bill.subtotalAmount),
    total: money(bill.totalAmount),
    amountPaid: money(bill.amountPaid),
    generatedAt: bill.generatedAt,
    paidAt: bill.paidAt,
    version: bill.version,
    lines: bill.lines.map((line) => ({
      billLineId: line.id,
      orderItemId: line.orderItemId,
      itemName: line.itemNameSnapshot,
      quantity: line.quantity,
      unitPrice: money(line.unitPriceSnapshot),
      lineTotal: money(line.lineTotal),
      chargeStatus: line.chargeStatus,
    })),
  };
}

function toPaymentDto(payment: {
  id: string;
  method: string;
  status: string;
  amount: Prisma.Decimal;
  currencyCode: string;
  transferChannel: string | null;
  collectorMembershipId: string;
  collectedAt: Date | null;
  verifiedAt: Date | null;
  settledAt: Date | null;
}): PaymentDto {
  return {
    paymentId: payment.id,
    method: payment.method,
    status: payment.status,
    amount: money(payment.amount),
    currencyCode: payment.currencyCode,
    transferChannel: payment.transferChannel,
    collectorMembershipId: payment.collectorMembershipId,
    collectedAt: payment.collectedAt,
    verifiedAt: payment.verifiedAt,
    settledAt: payment.settledAt,
  };
}
