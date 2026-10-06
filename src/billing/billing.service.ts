import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { basename, join } from 'path';
import { Prisma } from '@prisma/client';
import { DailyCloseService } from '../daily-close/daily-close.service';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { businessDateUtc } from '../common/business-date';
import { OpsEventType } from '../realtime/ops-events';
import { OpsNotifyService } from '../realtime/ops-notify.service';
import { VerifyEtService } from '../verify-et/verify-et.service';
import { VerifyEtBank } from '../verify-et/verify-et.types';
import { ExpectedTableSessionVersionDto } from './dto/expected-table-session-version.dto';
import { CashPaymentDto, TransferPaymentDto } from './dto/payment.dto';
import { CounterSaleDto } from './dto/counter-sale.dto';
import {
  BillDto,
  BillRequestCreatedDto,
  CashierBillRequestDto,
  CashierBillRequestsResponseDto,
  CashPaymentResponseDto,
  PaymentDto,
  PublicReceiptDto,
  SessionBillResponseDto,
  TransferPaymentResponseDto,
} from './dto/billing-response.dto';

const REQUEST_COMMAND = 'bill.request';
const GENERATE_COMMAND = 'bill.generate';
const CASH_COMMAND = 'payment.cash';
const TRANSFER_COMMAND = 'payment.transfer';

const REQUESTABLE = ['OPEN', 'ACTIVE_ORDER', 'ATTENTION_REQUIRED'];
const GENERATE_ROLES = ['CASHIER', 'MANAGER', 'OWNER_ADMIN', 'DISPATCHER'];
const CASHIER_QUEUE_ROLES = ['CASHIER', 'MANAGER', 'OWNER_ADMIN'];
const VIEW_PAYMENT_ROLES = ['CASHIER', 'MANAGER', 'OWNER_ADMIN'];
const COLLECT_ROLES = ['WAITER', 'DISPATCHER', 'MANAGER', 'OWNER_ADMIN'];
const SHIFT_OWNER_ROLES = ['WAITER', 'DISPATCHER'];
const CHARGEABLE_ITEM = (state: string, cancelledAt: Date | null) =>
  !cancelledAt && state !== 'CANCELLED';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly opsNotify: OpsNotifyService,
    private readonly dailyClose: DailyCloseService,
    private readonly verifyEt: VerifyEtService,
  ) {}

  async requestBill(
    userId: string,
    tableSessionId: string,
    dto: ExpectedTableSessionVersionDto,
    idempotencyKey?: string,
  ): Promise<BillRequestCreatedDto> {
    const context = await this.requireWaiterOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(context, REQUEST_COMMAND, key, {
      tableSessionId,
      ...dto,
    });
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
    const payload = await this.prisma.$transaction(async (tx) => {
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
      const created: BillRequestCreatedDto = {
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
        created,
        request.id,
      );
      return created;
    });

    const table = await this.prisma.diningTable.findUnique({
      where: { id: session.tableId },
      select: { displayName: true, displayNumber: true },
    });
    const tableLabel = table?.displayNumber ?? table?.displayName ?? 'Table';

    await this.opsNotify.notifyCashiers({
      type: OpsEventType.BILL_REQUEST_CREATED,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: 'URGENT',
      title: `Bill request · ${tableLabel}`,
      body: 'Waiter requested a bill at cashier.',
      relatedEntityType: 'BillRequest',
      relatedEntityId: payload.billRequestId,
      payload: {
        billRequestId: payload.billRequestId,
        tableSessionId: session.id,
        tableId: session.tableId,
      },
    });

    return payload;
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
    if (!CASHIER_QUEUE_ROLES.includes(context.roleCode)) {
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
          table.displayNumber ?? table.displayName.replace(/^Table\s+/i, ''),
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

  async createCounterSale(
    userId: string,
    dto: CounterSaleDto,
    idempotencyKey?: string,
  ): Promise<BillDto> {
    const context = await this.requireCashierOnShift(userId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: context.branchId! },
    });
    if (branch?.serviceMode !== 'BAKERY') {
      throw new ForbiddenException('Counter sale is only for bakery branches.');
    }
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(
      context,
      'bill.counter_sale',
      key,
      dto,
    );
    if (existing) return existing as unknown as BillDto;

    const table = await this.prisma.diningTable.findFirst({
      where: { branchId: context.branchId!, status: { not: 'RETIRED' } },
      orderBy: { sortOrder: 'asc' },
    });
    if (!table) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'COUNTER_TABLE_MISSING',
        errors: { table: 'COUNTER_TABLE_MISSING' },
      });
    }

    const menuItemIds = [...new Set(dto.items.map((line) => line.menuItemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        tenantId: context.tenantId!,
        status: 'ACTIVE',
      },
      include: { station: true },
    });
    if (menuItems.length !== menuItemIds.length) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { items: 'MENU_ITEM_NOT_FOUND' },
      });
    }
    const menuById = new Map(menuItems.map((item) => [item.id, item]));
    for (const line of dto.items) {
      const item = menuById.get(line.menuItemId);
      if (!item?.station || item.station.status !== 'ACTIVE') {
        throw new UnprocessableEntityException({
          status: 422,
          errors: { items: 'MENU_ITEM_STATION_MISSING' },
        });
      }
    }
    const businessDate = businessDateUtc();
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      // One open session per table is enforced in DB. Bakery reuses the same
      // Counter table for every sale, so close any leftover open session first.
      await tx.tableSession.updateMany({
        where: {
          tableId: table.id,
          closedAt: null,
          status: { not: 'CLOSED' },
        },
        data: {
          status: 'CLOSED',
          closedAt: now,
          closedByMembershipId: context.staffMembershipId,
          version: { increment: 1 },
        },
      });

      const session = await tx.tableSession.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          tableId: table.id,
          businessDate,
          primaryWaiterMembershipId: context.staffMembershipId!,
          primaryWaiterShiftSessionId: context.shiftSessionId!,
          sessionKind: 'COUNTER',
          status: 'OPEN',
          openedAt: now,
        },
      });

      const order = await tx.order.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          businessDate,
          tableSessionId: session.id,
          createdByWaiterMembershipId: context.staffMembershipId!,
          waiterShiftSessionId: context.shiftSessionId!,
          status: 'CONFIRMED',
          confirmedAt: now,
          items: {
            create: dto.items.map((line) => {
              const item = menuById.get(line.menuItemId)!;
              return {
                tenantId: context.tenantId!,
                branchId: context.branchId!,
                businessDate,
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
                state: 'SERVED',
                confirmedAt: now,
                servedAt: now,
              };
            }),
          },
        },
        include: { items: { include: { modifiers: true } } },
      });

      const prefix = (branch.displayCode || branch.name || 'BILL')
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 8)
        .toUpperCase();
      const day = localYmd(businessDate);
      const sequence = await tx.bill.count({
        where: { branchId: context.branchId!, businessDate },
      });
      const billNumber = `${prefix}-${day}-${String(sequence + 1).padStart(4, '0')}`;

      let subtotal = new Prisma.Decimal(0);
      const lineData = order.items.map((item, sortOrder) => {
        const total = lineTotal(item);
        subtotal = subtotal.plus(total);
        return {
          tenantId: context.tenantId!,
          orderItemId: item.id,
          itemNameSnapshot: item.itemNameSnapshot,
          quantity: item.quantity,
          unitPriceSnapshot: item.unitPriceSnapshot,
          modifierTotalSnapshot: 0,
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
          businessDate,
          tableSessionId: session.id,
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

      const payload = toBillDto(bill);
      await this.storeIdempotent(
        tx,
        context,
        'bill.counter_sale',
        key,
        dto,
        payload,
        bill.id,
      );
      return payload;
    });

    return created;
  }

  async generateBill(
    userId: string,
    billRequestId: string,
    dto: ExpectedTableSessionVersionDto,
    idempotencyKey?: string,
  ): Promise<BillDto> {
    const context = await this.requireBranch(userId);
    if (!GENERATE_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException(
        'Only cashier or manager can generate bills.',
      );
    }
    if (!context.staffMembershipId) {
      throw new ForbiddenException(
        'No restaurant membership for this account.',
      );
    }
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(context, GENERATE_COMMAND, key, {
      billRequestId,
      ...dto,
    });
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
    if (context.roleCode === 'DISPATCHER') {
      if (
        request.tableSession.sessionKind !== 'CALL_PICKUP' ||
        request.tableSession.primaryWaiterMembershipId !==
          context.staffMembershipId
      ) {
        throw new ForbiddenException(
          'Dispatchers can only generate bills for their call pickup orders.',
        );
      }
    }
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
    if (request.tableSession.version !== dto.expectedTableSessionVersion) {
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

  /** Guest-facing receipt for QR scan — no auth, safe fields only. */
  async getPublicReceipt(billId: string): Promise<PublicReceiptDto> {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId },
      include: {
        tenant: true,
        branch: true,
        lines: {
          where: { chargeStatus: { not: 'CANCELLED_NO_CHARGE' } },
          orderBy: { sortOrder: 'asc' },
        },
        payments: {
          orderBy: { initiatedAt: 'asc' },
        },
        tableSession: {
          include: { table: true },
        },
      },
    });
    if (!bill) throw new NotFoundException('Receipt not found.');

    return {
      billId: bill.id,
      billNumber: bill.billNumber,
      status: bill.status,
      currencyCode: bill.currencyCode,
      restaurantName: bill.tenant.displayName,
      branchName: bill.branch.name,
      tableName: bill.tableSession.table.displayName ?? null,
      subtotal: money(bill.subtotalAmount),
      total: money(bill.totalAmount),
      amountPaid: money(bill.amountPaid),
      generatedAt: bill.generatedAt,
      paidAt: bill.paidAt,
      lines: bill.lines.map((line) => ({
        itemName: line.itemNameSnapshot,
        quantity: line.quantity,
        unitPrice: money(line.unitPriceSnapshot),
        lineTotal: money(line.lineTotal),
      })),
      payments: bill.payments.map((payment) => ({
        method: payment.method,
        amount: money(payment.amount),
        channel: payment.transferChannel,
        status: payment.status,
      })),
    };
  }

  async sendBillToWaiter(
    userId: string,
    billId: string,
  ): Promise<{ success: boolean; message: string }> {
    const context = await this.requireBranch(userId);

    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, branchId: context.branchId! },
      include: {
        tableSession: {
          include: {
            table: true,
            primaryWaiter: true,
          },
        },
      },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found.');
    }

    const waiterId = bill.tableSession.primaryWaiterMembershipId;
    if (!waiterId) {
      throw new UnprocessableEntityException(
        'No waiter assigned to this table session.',
      );
    }

    const tableName = bill.tableSession.table.displayName;
    const created = await this.prisma.notification.create({
      data: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        recipientStaffMembershipId: waiterId,
        type: 'BILL_READY',
        severity: 'URGENT',
        title: `Bill Ready · ${tableName}`,
        body: `Bill #${bill.billNumber} for ${money(bill.totalAmount)} ETB is ready at the cashier. Please deliver to guest.`,
        payloadJson: {
          billId: bill.id,
          billNumber: bill.billNumber,
          tableSessionId: bill.tableSessionId,
          total: money(bill.totalAmount),
        },
      },
    });

    await this.opsNotify.notify({
      type: OpsEventType.BILL_READY,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: 'URGENT',
      title: `Bill Ready · ${tableName}`,
      body: `Bill #${bill.billNumber} for ${money(bill.totalAmount)} ETB is ready at the cashier.`,
      recipientMembershipId: waiterId,
      notificationId: created.id,
      relatedEntityType: 'Bill',
      relatedEntityId: bill.id,
      payload: {
        billId: bill.id,
        billNumber: bill.billNumber,
        tableSessionId: bill.tableSessionId,
        total: money(bill.totalAmount),
      },
    });

    return {
      success: true,
      message: `Bill notification sent to ${bill.tableSession.primaryWaiter?.employeeDisplayName || 'waiter'}.`,
    };
  }

  async payCash(
    userId: string,
    billId: string,
    dto: CashPaymentDto,
    idempotencyKey?: string,
  ): Promise<CashPaymentResponseDto> {
    const context = await this.requireCollectorOnShift(userId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.findIdempotent(context, CASH_COMMAND, key, {
      billId,
      ...dto,
    });
    if (existing) return existing as unknown as CashPaymentResponseDto;

    const bill = await this.loadPayableBill(context, billId);
    this.assertCollectorForBill(context, bill);
    await this.dailyClose.assertBusinessDayNotLocked(
      context.branchId!,
      bill.businessDate,
    );
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
        data:
          bill.tableSession.sessionKind === 'COUNTER'
            ? {
                status: 'CLOSED',
                closedAt: now,
                closedByMembershipId: context.staffMembershipId,
                version: { increment: 1 },
              }
            : {
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
    const existing = await this.findIdempotent(context, TRANSFER_COMMAND, key, {
      billId,
      ...dto,
    });
    if (existing) return existing as unknown as TransferPaymentResponseDto;

    const bill = await this.loadPayableBill(context, billId);
    this.assertCollectorForBill(context, bill);
    await this.dailyClose.assertBusinessDayNotLocked(
      context.branchId!,
      bill.businessDate,
    );
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
    if (due.lte(0)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'PAYMENT_AMOUNT_INVALID',
        errors: { amount: money(due) },
      });
    }

    // Without bank verify, client must still post the full due.
    // With Verify.ET, the bank amount is the source of truth (tip / under-due).
    if (!this.verifyEt.isEnabled()) {
      const claimed = new Prisma.Decimal(dto.amount);
      if (!claimed.equals(due)) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'PAYMENT_AMOUNT_INVALID',
          errors: { amount: money(due) },
        });
      }
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

    let settleAmount = due;
    let tipAmount: Prisma.Decimal | null = null;
    let verifiedAmountLabel: string | undefined;
    let verifiedAt: Date | null = null;

    const reference = dto.reference?.trim();
    if (this.verifyEt.isEnabled()) {
      const bank = resolveVerifyBank(dto);
      if (!reference && bank === 'cbebirr' && !dto.phoneNumber?.trim()) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'VERIFY_PHONE_REQUIRED',
          errors: { phoneNumber: 'VERIFY_PHONE_REQUIRED' },
        });
      }
      if (!reference && bank === 'boa' && !dto.accountSuffix?.trim()) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'VERIFY_SUFFIX_REQUIRED',
          errors: { accountSuffix: 'VERIFY_SUFFIX_REQUIRED' },
        });
      }

      const verified = await this.verifyEt.verifyPayment({
        bank,
        reference,
        accountSuffix: dto.accountSuffix,
        phoneNumber: dto.phoneNumber,
        idempotencyKey: `transfer:${bill.id}:${key}`,
        image: await loadReceiptImage(file.path),
      });

      if (!verified.verified) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'TRANSFER_NOT_VERIFIED',
          message: verified.message || 'Bank could not verify this transfer.',
          errors: { reference: 'TRANSFER_NOT_VERIFIED' },
          verifyRequestId: verified.requestId,
          verifyStatus: verified.status,
        });
      }

      if (verified.amount == null || !Number.isFinite(verified.amount)) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'TRANSFER_AMOUNT_UNKNOWN',
          message:
            'Bank verified the transfer but did not return an amount. Type a clearer reference or try again.',
          errors: { amount: 'TRANSFER_AMOUNT_UNKNOWN' },
          verifyRequestId: verified.requestId,
        });
      }

      const verifiedAmount = new Prisma.Decimal(
        verified.amount,
      ).toDecimalPlaces(2);
      verifiedAmountLabel = money(verifiedAmount);
      verifiedAt = new Date();

      if (verifiedAmount.lt(due)) {
        const remaining = due.minus(verifiedAmount);
        throw new UnprocessableEntityException({
          status: 422,
          code: 'TRANSFER_UNDER_DUE',
          message: `Verified ${money(verifiedAmount)} ETB. Bill still needs ${money(remaining)} ETB — collect cash or another transfer.`,
          errors: { amount: 'TRANSFER_UNDER_DUE' },
          verifiedAmount: money(verifiedAmount),
          dueAmount: money(due),
          remainingAmount: money(remaining),
          verifyRequestId: verified.requestId,
        });
      }

      settleAmount = due;
      if (verifiedAmount.gt(due)) {
        tipAmount = verifiedAmount.minus(due);
      }
    } else {
      settleAmount = due;
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
          amount: settleAmount,
          collectorMembershipId: context.staffMembershipId!,
          collectorShiftSessionId: context.shiftSessionId!,
          collectedAt: now,
          verifiedAt,
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
        tipAmount: tipAmount ? money(tipAmount) : undefined,
        verifiedAmount: verifiedAmountLabel,
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

  async listPayments(
    userId: string,
    range?: { from?: string; to?: string },
  ): Promise<{
    data: Array<
      PaymentDto & {
        businessDate: string;
        billId: string;
        billNumber: string;
        tableSessionId: string;
        tableDisplayName: string;
        waiterName: string;
        sessionStatus: string;
        tableClosed: boolean;
        hasTransferReceipt: boolean;
        receiptImagePath: string | null;
      }
    >;
  }> {
    const context = await this.requireBranch(userId);
    if (!VIEW_PAYMENT_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Payment log is for cashiers.');
    }
    const fromYmd = (range?.from || '').trim().slice(0, 10);
    const toYmd = (range?.to || range?.from || '').trim().slice(0, 10);
    const dateFilter =
      /^\d{4}-\d{2}-\d{2}$/.test(fromYmd) && /^\d{4}-\d{2}-\d{2}$/.test(toYmd)
        ? {
            businessDate: {
              gte: new Date(`${fromYmd}T00:00:00.000Z`),
              lte: new Date(`${toYmd}T00:00:00.000Z`),
            },
          }
        : {};
    const payments = await this.prisma.payment.findMany({
      where: {
        branchId: context.branchId!,
        status: 'SETTLED',
        ...dateFilter,
      },
      include: {
        collector: true,
        receipt: { include: { file: true } },
        bill: {
          include: {
            tableSession: { include: { table: true } },
          },
        },
      },
      orderBy: { settledAt: 'desc' },
      take: dateFilter.businessDate ? 500 : 100,
    });
    return {
      data: payments.map((payment) => {
        const table = payment.bill.tableSession.table;
        const session = payment.bill.tableSession;
        const receiptPath = payment.receipt?.file?.path ?? null;
        return {
          ...toPaymentDto(payment),
          businessDate: payment.businessDate.toISOString().slice(0, 10),
          billId: payment.billId,
          billNumber: payment.bill.billNumber,
          tableSessionId: payment.bill.tableSessionId,
          tableDisplayName:
            table.displayNumber ?? table.displayName.replace(/^Table\s+/i, ''),
          waiterName: payment.collector.employeeDisplayName,
          sessionStatus: session.status,
          tableClosed: session.status === 'CLOSED' || Boolean(session.closedAt),
          hasTransferReceipt: Boolean(receiptPath),
          receiptImagePath: receiptPath,
        };
      }),
    };
  }

  async getPaymentDetail(userId: string, paymentId: string) {
    const context = await this.requireBranch(userId);
    if (!VIEW_PAYMENT_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Payment detail is for cashiers.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        branchId: context.branchId!,
        status: 'SETTLED',
      },
      include: {
        collector: true,
        receipt: { include: { file: true } },
        bill: {
          include: {
            lines: { orderBy: { sortOrder: 'asc' } },
            tableSession: { include: { table: true } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found.');

    const table = payment.bill.tableSession.table;
    const session = payment.bill.tableSession;
    const receiptPath = payment.receipt?.file?.path ?? null;

    return {
      payment: {
        ...toPaymentDto(payment),
        billId: payment.billId,
        billNumber: payment.bill.billNumber,
        tableSessionId: payment.bill.tableSessionId,
        tableDisplayName:
          table.displayNumber ?? table.displayName.replace(/^Table\s+/i, ''),
        waiterName: payment.collector.employeeDisplayName,
        sessionStatus: session.status,
        tableClosed: session.status === 'CLOSED' || Boolean(session.closedAt),
        hasTransferReceipt: Boolean(receiptPath),
        receiptImagePath: receiptPath,
        receiptCapturedAt: payment.receipt?.capturedAt ?? null,
      },
      bill: toBillDto(payment.bill),
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
    bill: {
      tableSession: {
        primaryWaiterMembershipId: string;
        sessionKind: string;
      };
    },
  ) {
    if (context.roleCode === 'CASHIER') {
      return;
    }
    if (SHIFT_OWNER_ROLES.includes(context.roleCode)) {
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
      SHIFT_OWNER_ROLES.includes(context.roleCode)
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
    if (!SHIFT_OWNER_ROLES.includes(context.roleCode)) {
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

  private async requireCashierOnShift(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (!['CASHIER', 'MANAGER', 'OWNER_ADMIN'].includes(context.roleCode)) {
      throw new ForbiddenException(
        'Only the cashier can start a counter sale.',
      );
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
    if (
      !COLLECT_ROLES.includes(context.roleCode) &&
      context.roleCode !== 'CASHIER'
    ) {
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

function resolveVerifyBank(dto: TransferPaymentDto): VerifyEtBank {
  if (dto.bankProvider) return dto.bankProvider;
  if (dto.transferChannel === 'TELEBIRR') return 'telebirr';
  return 'cbe';
}

async function loadReceiptImage(
  storedPath: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | undefined> {
  if (/^https?:\/\//i.test(storedPath)) {
    const response = await fetch(storedPath);
    if (!response.ok) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    const mimeType =
      response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    return {
      buffer: bytes,
      mimeType,
      filename: basename(new URL(storedPath).pathname) || 'receipt.jpg',
    };
  }

  const filename = basename(storedPath);
  const candidates = [
    join(process.cwd(), 'files', filename),
    join(process.cwd(), storedPath.replace(/^[/\\]+/, '')),
  ];
  const diskPath = candidates.find((candidate) => existsSync(candidate));
  if (!diskPath) return undefined;

  const buffer = await readFile(diskPath);
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeType =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { buffer, mimeType, filename };
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
