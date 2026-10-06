import { PrismaClient } from '@prisma/client';
import {
  BRANCHES,
  MENU_DISHES,
  STAFF,
  TENANT_ID,
  type BranchKey,
} from './catalog';
import {
  addDays,
  atTime,
  businessDateOnly,
  id,
  mulberry32,
  startOfDay,
} from './ids';

export type BranchRuntime = {
  key: BranchKey;
  branchId: string;
  tableIds: string[];
  waiterMembershipIds: string[];
  cashierMembershipId: string;
  menuItems: Array<{
    id: string;
    name: string;
    price: number;
    stationId: string;
    stationName: string;
    prep: number;
  }>;
  morningShiftId: string;
  eveningShiftId: string;
};

const HISTORY_DAYS = 730;
const BATCH = 400;

async function flushChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await insert(rows.slice(i, i + BATCH));
  }
}

export async function seedTwoYearHistory(
  prisma: PrismaClient,
  branches: BranchRuntime[],
) {
  console.log(
    `Seeding ~${HISTORY_DAYS} days of ops history across ${branches.length} branches...`,
  );

  const today = startOfDay(new Date());
  const start = addDays(today, -HISTORY_DAYS);

  type ShiftRow = {
    id: string;
    tenantId: string;
    branchId: string;
    staffMembershipId: string;
    roleId: number;
    clockInAt: Date;
    clockOutAt: Date;
    state: string;
    businessDate: Date;
    lateByMinutes: number;
    graceMinutesSnapshot: number;
  };

  type SessionRow = {
    id: string;
    tenantId: string;
    branchId: string;
    tableId: string;
    businessDate: Date;
    primaryWaiterMembershipId: string;
    primaryWaiterShiftSessionId: string;
    guestCount: number;
    status: string;
    openedAt: Date;
    billRequestedAt: Date;
    closedAt: Date;
    closedByMembershipId: string;
  };

  type AssignmentRow = {
    id: string;
    tenantId: string;
    branchId: string;
    tableSessionId: string;
    waiterMembershipId: string;
    shiftSessionId: string;
    assignedAt: Date;
    releasedAt: Date;
    assignedByMembershipId: string;
    reason: string;
  };

  type OrderRow = {
    id: string;
    tenantId: string;
    branchId: string;
    businessDate: Date;
    tableSessionId: string;
    createdByWaiterMembershipId: string;
    waiterShiftSessionId: string;
    status: string;
    confirmedAt: Date;
  };

  type ItemRow = {
    id: string;
    tenantId: string;
    branchId: string;
    businessDate: Date;
    orderId: string;
    tableSessionId: string;
    menuItemId: string;
    itemNameSnapshot: string;
    unitPriceSnapshot: number;
    currencyCode: string;
    quantity: number;
    originalPreparationStationId: string;
    currentPreparationStationId: string;
    stationNameSnapshot: string;
    expectedPrepMinutesSnapshot: number;
    state: string;
    confirmedAt: Date;
    queuedAt: Date;
    acknowledgedAt: Date;
    preparationStartedAt: Date;
    readyAt: Date;
    servedAt: Date;
  };

  type BillRow = {
    id: string;
    tenantId: string;
    branchId: string;
    businessDate: Date;
    tableSessionId: string;
    billNumber: string;
    status: string;
    currencyCode: string;
    subtotalAmount: number;
    cancelledAmount: number;
    totalAmount: number;
    amountPaid: number;
    generatedByMembershipId: string;
    generatedAt: Date;
    paidAt: Date;
    closedAt: Date;
    closedByMembershipId: string;
  };

  type BillLineRow = {
    id: string;
    tenantId: string;
    billId: string;
    orderItemId: string;
    itemNameSnapshot: string;
    quantity: number;
    unitPriceSnapshot: number;
    modifierTotalSnapshot: number;
    lineTotal: number;
    currencyCode: string;
    chargeStatus: string;
    sortOrder: number;
    createdAt: Date;
  };

  type PaymentRow = {
    id: string;
    tenantId: string;
    branchId: string;
    businessDate: Date;
    billId: string;
    method: string;
    transferChannel: string | null;
    status: string;
    currencyCode: string;
    amount: number;
    collectorMembershipId: string;
    collectorShiftSessionId: string;
    cashTenderedAmount: number | null;
    cashChangeAmount: number | null;
    initiatedAt: Date;
    collectedAt: Date;
    verifiedAt: Date | null;
    settledAt: Date;
  };

  const shifts: ShiftRow[] = [];
  const sessions: SessionRow[] = [];
  const assignments: AssignmentRow[] = [];
  const orders: OrderRow[] = [];
  const items: ItemRow[] = [];
  const bills: BillRow[] = [];
  const billLines: BillLineRow[] = [];
  const payments: PaymentRow[] = [];

  const roleWaiter = 3;
  const roleCashier = 4;

  for (let dayOffset = 0; dayOffset < HISTORY_DAYS; dayOffset++) {
    const day = addDays(start, dayOffset);
    const biz = businessDateOnly(day);
    const dow = day.getDay(); // 0 Sun
    const isWeekend = dow === 0 || dow === 6;
    const rand = mulberry32(dayOffset * 9973 + 42);

    for (const branch of branches) {
      const branchSeed = branch.key.charCodeAt(0);
      const visitsBase = isWeekend ? 10 : 7;
      const visits = visitsBase + Math.floor(rand() * 4);

      const waiterA = branch.waiterMembershipIds[0];
      const waiterB = branch.waiterMembershipIds[1];
      const morningShiftSessionId = id(
        `shift:${branch.key}:${dayOffset}:morning:${waiterA}`,
      );
      const eveningShiftSessionId = id(
        `shift:${branch.key}:${dayOffset}:evening:${waiterB}`,
      );
      const cashierShiftSessionId = id(
        `shift:${branch.key}:${dayOffset}:cashier:${branch.cashierMembershipId}`,
      );

      const morningIn = atTime(day, 7, 5);
      const morningOut = atTime(day, 15, 5);
      const eveningIn = atTime(day, 15, 5);
      const eveningOut = atTime(day, 23, 0);
      const cashierIn = atTime(day, 8, 0);
      const cashierOut = atTime(day, 22, 30);

      shifts.push(
        {
          id: morningShiftSessionId,
          tenantId: TENANT_ID,
          branchId: branch.branchId,
          staffMembershipId: waiterA,
          roleId: roleWaiter,
          clockInAt: morningIn,
          clockOutAt: morningOut,
          state: 'CLOSED',
          businessDate: biz,
          lateByMinutes: 5,
          graceMinutesSnapshot: 15,
        },
        {
          id: eveningShiftSessionId,
          tenantId: TENANT_ID,
          branchId: branch.branchId,
          staffMembershipId: waiterB,
          roleId: roleWaiter,
          clockInAt: eveningIn,
          clockOutAt: eveningOut,
          state: 'CLOSED',
          businessDate: biz,
          lateByMinutes: 0,
          graceMinutesSnapshot: 15,
        },
        {
          id: cashierShiftSessionId,
          tenantId: TENANT_ID,
          branchId: branch.branchId,
          staffMembershipId: branch.cashierMembershipId,
          roleId: roleCashier,
          clockInAt: cashierIn,
          clockOutAt: cashierOut,
          state: 'CLOSED',
          businessDate: biz,
          lateByMinutes: 0,
          graceMinutesSnapshot: 15,
        },
      );

      for (let v = 0; v < visits; v++) {
        const useMorning = v < Math.ceil(visits / 2);
        const waiterMembershipId = useMorning ? waiterA : waiterB;
        const shiftSessionId = useMorning
          ? morningShiftSessionId
          : eveningShiftSessionId;
        const hour = useMorning ? 8 + (v % 6) : 16 + (v % 6);
        const openedAt = atTime(day, hour, Math.floor(rand() * 50));
        const closedAt = new Date(openedAt.getTime() + 35 * 60 * 1000);
        const tableId =
          branch.tableIds[Math.floor(rand() * branch.tableIds.length)];
        const dish =
          branch.menuItems[
            Math.floor(rand() * branch.menuItems.length)
          ];
        const qty = 1 + (rand() > 0.7 ? 1 : 0);
        const lineTotal = dish.price * qty;
        // Weekends skew cash; midweek skews digital — clearer mix chart.
        const cashBias =
          isWeekend ? 0.62 : dow === 5 ? 0.48 : 0.38;
        const method = rand() < cashBias ? 'CASH' : 'TRANSFER';
        const transferChannel =
          method === 'TRANSFER'
            ? rand() > 0.55
              ? 'TELEBIRR'
              : 'BANK'
            : null;

        const sessionId = id(
          `ts:${branch.key}:${dayOffset}:${v}:${branchSeed}`,
        );
        const assignmentId = id(`ta:${sessionId}`);
        const orderId = id(`ord:${sessionId}`);
        const itemId = id(`oi:${sessionId}`);
        const billId = id(`bill:${sessionId}`);
        const billLineId = id(`bl:${sessionId}`);
        const paymentId = id(`pay:${sessionId}`);
        const billNumber = `MK-${branch.key.toUpperCase()}-${String(
          dayOffset,
        ).padStart(4, '0')}-${String(v + 1).padStart(2, '0')}`;

        sessions.push({
          id: sessionId,
          tenantId: TENANT_ID,
          branchId: branch.branchId,
          tableId,
          businessDate: biz,
          primaryWaiterMembershipId: waiterMembershipId,
          primaryWaiterShiftSessionId: shiftSessionId,
          guestCount: 1 + Math.floor(rand() * 4),
          status: 'CLOSED',
          openedAt,
          billRequestedAt: closedAt,
          closedAt,
          closedByMembershipId: waiterMembershipId,
        });

        assignments.push({
          id: assignmentId,
          tenantId: TENANT_ID,
          branchId: branch.branchId,
          tableSessionId: sessionId,
          waiterMembershipId,
          shiftSessionId,
          assignedAt: openedAt,
          releasedAt: closedAt,
          assignedByMembershipId: waiterMembershipId,
          reason: 'History seed',
        });

        orders.push({
          id: orderId,
          tenantId: TENANT_ID,
          branchId: branch.branchId,
          businessDate: biz,
          tableSessionId: sessionId,
          createdByWaiterMembershipId: waiterMembershipId,
          waiterShiftSessionId: shiftSessionId,
          status: 'CONFIRMED',
          confirmedAt: openedAt,
        });

        items.push({
          id: itemId,
          tenantId: TENANT_ID,
          branchId: branch.branchId,
          businessDate: biz,
          orderId,
          tableSessionId: sessionId,
          menuItemId: dish.id,
          itemNameSnapshot: dish.name,
          unitPriceSnapshot: dish.price,
          currencyCode: 'ETB',
          quantity: qty,
          originalPreparationStationId: dish.stationId,
          currentPreparationStationId: dish.stationId,
          stationNameSnapshot: dish.stationName,
          expectedPrepMinutesSnapshot: dish.prep,
          state: 'SERVED',
          confirmedAt: openedAt,
          queuedAt: openedAt,
          acknowledgedAt: new Date(openedAt.getTime() + 2 * 60 * 1000),
          preparationStartedAt: new Date(openedAt.getTime() + 4 * 60 * 1000),
          readyAt: new Date(openedAt.getTime() + 15 * 60 * 1000),
          servedAt: new Date(openedAt.getTime() + 20 * 60 * 1000),
        });

        bills.push({
          id: billId,
          tenantId: TENANT_ID,
          branchId: branch.branchId,
          businessDate: biz,
          tableSessionId: sessionId,
          billNumber,
          status: 'CLOSED',
          currencyCode: 'ETB',
          subtotalAmount: lineTotal,
          cancelledAmount: 0,
          totalAmount: lineTotal,
          amountPaid: lineTotal,
          generatedByMembershipId: branch.cashierMembershipId,
          generatedAt: closedAt,
          paidAt: closedAt,
          closedAt,
          closedByMembershipId: branch.cashierMembershipId,
        });

        billLines.push({
          id: billLineId,
          tenantId: TENANT_ID,
          billId,
          orderItemId: itemId,
          itemNameSnapshot: dish.name,
          quantity: qty,
          unitPriceSnapshot: dish.price,
          modifierTotalSnapshot: 0,
          lineTotal,
          currencyCode: 'ETB',
          chargeStatus: 'CHARGED',
          sortOrder: 0,
          createdAt: closedAt,
        });

        payments.push({
          id: paymentId,
          tenantId: TENANT_ID,
          branchId: branch.branchId,
          businessDate: biz,
          billId,
          method,
          transferChannel,
          status: 'SETTLED',
          currencyCode: 'ETB',
          amount: lineTotal,
          collectorMembershipId:
            method === 'CASH'
              ? waiterMembershipId
              : branch.cashierMembershipId,
          collectorShiftSessionId:
            method === 'CASH' ? shiftSessionId : cashierShiftSessionId,
          cashTenderedAmount:
            method === 'CASH' ? lineTotal + 20 : null,
          cashChangeAmount: method === 'CASH' ? 20 : null,
          initiatedAt: closedAt,
          collectedAt: closedAt,
          verifiedAt: method === 'TRANSFER' ? closedAt : null,
          settledAt: closedAt,
        });
      }
    }

    if ((dayOffset + 1) % 60 === 0) {
      console.log(`  history built through day ${dayOffset + 1}/${HISTORY_DAYS}`);
    }
  }

  console.log(
    `Inserting history rows: shifts=${shifts.length} sessions=${sessions.length} orders=${orders.length}`,
  );

  await flushChunks(shifts, (data) =>
    prisma.shiftSession.createMany({ data, skipDuplicates: true }),
  );
  await flushChunks(sessions, (data) =>
    prisma.tableSession.createMany({ data, skipDuplicates: true }),
  );
  await flushChunks(assignments, (data) =>
    prisma.tableAssignment.createMany({ data, skipDuplicates: true }),
  );
  await flushChunks(orders, (data) =>
    prisma.order.createMany({ data, skipDuplicates: true }),
  );
  await flushChunks(items, (data) =>
    prisma.orderItem.createMany({ data, skipDuplicates: true }),
  );
  await flushChunks(bills, (data) =>
    prisma.bill.createMany({ data, skipDuplicates: true }),
  );
  await flushChunks(billLines, (data) =>
    prisma.billLine.createMany({ data, skipDuplicates: true }),
  );
  await flushChunks(payments, (data) =>
    prisma.payment.createMany({ data, skipDuplicates: true }),
  );

  console.log('Two-year history seeded.');
}

export function membershipIdForUser(userId: string) {
  return id(`membership:${TENANT_ID}:${userId}`);
}

export function buildBranchRuntime(
  branchKey: BranchKey,
  branchId: string,
  tableIds: string[],
  menuItems: BranchRuntime['menuItems'],
  morningShiftId: string,
  eveningShiftId: string,
): BranchRuntime {
  const waiters = STAFF.filter(
    (s) => s.branchKey === branchKey && s.restaurantRole === 'WAITER',
  );
  const cashier = STAFF.find(
    (s) => s.branchKey === branchKey && s.restaurantRole === 'CASHIER',
  );
  if (!cashier || waiters.length < 2) {
    throw new Error(`Missing staff for branch ${branchKey}`);
  }
  return {
    key: branchKey,
    branchId,
    tableIds,
    waiterMembershipIds: waiters.map((w) => membershipIdForUser(w.id)),
    cashierMembershipId: membershipIdForUser(cashier.id),
    menuItems,
    morningShiftId,
    eveningShiftId,
  };
}

export { MENU_DISHES, BRANCHES };
