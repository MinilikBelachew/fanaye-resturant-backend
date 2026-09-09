import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_BUNA_ID = '11111111-1111-4111-8111-111111111112';
const TENANT_OVEN_ID = '11111111-1111-4111-8111-111111111113';
const TENANT_LAKE_ID = '11111111-1111-4111-8111-111111111114';
const PLAN_STARTER_ID = '66666666-6666-4666-8666-666666666661';
const PLAN_PRO_ID = '66666666-6666-4666-8666-666666666662';
const PLAN_ENTERPRISE_ID = '66666666-6666-4666-8666-666666666663';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const SHIFT_MORNING_ID = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const SHIFT_EVENING_ID = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const STATION_KITCHEN = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
const STATION_BARISTA = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';
const STATION_CAKES = 'dddddddd-dddd-4ddd-8ddd-dddddddddd03';
const STATION_SOFT = 'dddddddd-dddd-4ddd-8ddd-dddddddddd04';
const MENU_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01';
const PERIOD_ALL_DAY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11';
const LOC_GROUND = '33333333-3333-4333-8333-333333333331';
const LOC_TOP = '33333333-3333-4333-8333-333333333332';
const LOC_OUTSIDE = '33333333-3333-4333-8333-333333333333';
const TABLE_1_ID = '44444444-4444-4444-8444-000000000001';
const KARIM_MEMBERSHIP_ID = '77777777-7777-4777-8777-555555555555';
const DAWIT_MEMBERSHIP_ID = '77777777-7777-4777-8777-555555555556';
const KARIM_SHIFT_SESSION_ID = 'ccccccc1-cccc-4ccc-8ccc-555555555555';
const TABLE_SESSION_1_ID = '88888888-8888-4888-8888-888888888801';
const TABLE_ASSIGNMENT_1_ID = '88888888-8888-4888-8888-888888888811';
const ORDER_1_ID = '99999999-9999-4999-8999-999999999901';
const ORDER_ITEM_BURGER_ID = '99999999-9999-4999-8999-999999999911';
const ORDER_ITEM_MACCHIATO_ID = '99999999-9999-4999-8999-999999999912';
const ITEM_CHEESEBURGER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee31';
const ITEM_MACCHIATO_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee34';
const ITEM_PIZZA_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee32';
const ITEM_LATTE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee35';
const ITEM_CAKE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee36';
const ITEM_COLA_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee37';
const TABLE_2_ID = '44444444-4444-4444-8444-000000000002';
const TABLE_3_ID = '44444444-4444-4444-8444-000000000003';
const SARA_MEMBERSHIP_ID = '77777777-7777-4777-8777-555555555554';
const SARA_SHIFT_SESSION_ID = 'ccccccc1-cccc-4ccc-8ccc-555555555554';
const TABLE_SESSION_2_ID = '88888888-8888-4888-8888-888888888802';
const TABLE_SESSION_3_ID = '88888888-8888-4888-8888-888888888803';
const TRANSFER_RECEIPT_FILE_ID = 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1';
const TABLE_2_CASH_PAYMENT_ID = 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c101';
const SARA_CASHIER_SESSION_ID = 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e201';
const KARIM_CASH_DROP_ID = 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e211';
const KARIM_USER_ID = '55555555-5555-4555-8555-555555555555';
const SARA_USER_ID = '55555555-5555-4555-8555-555555555554';
const HANA_USER_ID = '55555555-5555-4555-8555-555555555553';
const HANA_MEMBERSHIP_ID = '77777777-7777-4777-8777-555555555553';
const DAILY_CLOSE_ID = 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f301';
const IDEMPOTENCY_ORDER_ID = 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f311';
const IDEMPOTENCY_DROP_ID = 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f312';
const SELAM_USER_ID = '55555555-5555-4555-8555-555555555551';
const MERON_MEMBERSHIP_ID = '77777777-7777-4777-8777-555555555558';
const ORDER_ITEM_PIZZA_ID = '99999999-9999-4999-8999-999999999931';

type RestaurantRoleCode =
  | 'OWNER_ADMIN'
  | 'MANAGER'
  | 'WAITER'
  | 'CASHIER'
  | 'STATION_OPERATOR';

const DEMO_USERS: Array<{
  id: string;
  email: string;
  phone: string;
  displayName: string;
  platformAdmin?: boolean;
  restaurantRole?: RestaurantRoleCode;
}> = [
  {
    id: '55555555-5555-4555-8555-555555555551',
    email: 'selam@fanaye.et',
    phone: '+251911234567',
    displayName: 'Selam Bekele',
    platformAdmin: true,
  },
  {
    id: '55555555-5555-4555-8555-555555555552',
    email: 'daniel@fanaye.et',
    phone: '+251912345678',
    displayName: 'Daniel Hailu',
    restaurantRole: 'OWNER_ADMIN',
  },
  {
    id: '55555555-5555-4555-8555-555555555553',
    email: 'hana@fanaye.et',
    phone: '+251913456789',
    displayName: 'Hana Tadesse',
    restaurantRole: 'MANAGER',
  },
  {
    id: '55555555-5555-4555-8555-555555555554',
    email: 'sara@fanaye.et',
    phone: '+251914567890',
    displayName: 'Sara Mekonnen',
    restaurantRole: 'CASHIER',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'karim@fanaye.et',
    phone: '+251915678901',
    displayName: 'Karim Tesfaye',
    restaurantRole: 'WAITER',
  },
  {
    id: '55555555-5555-4555-8555-555555555556',
    email: 'dawit@fanaye.et',
    phone: '+251916789012',
    displayName: 'Dawit Alemu',
    restaurantRole: 'WAITER',
  },
  {
    id: '55555555-5555-4555-8555-555555555557',
    email: 'yonas@fanaye.et',
    phone: '+251917890123',
    displayName: 'Yonas Girma',
    restaurantRole: 'STATION_OPERATOR',
  },
  {
    id: '55555555-5555-4555-8555-555555555558',
    email: 'meron@fanaye.et',
    phone: '+251918901234',
    displayName: 'Meron Alemu',
    restaurantRole: 'STATION_OPERATOR',
  },
  {
    id: '55555555-5555-4555-8555-555555555559',
    email: 'abel@fanaye.et',
    phone: '+251919012345',
    displayName: 'Abel Kebede',
    restaurantRole: 'STATION_OPERATOR',
  },
  {
    id: '55555555-5555-4555-8555-555555555560',
    email: 'liya@fanaye.et',
    phone: '+251910123456',
    displayName: 'Liya Mekonnen',
    restaurantRole: 'STATION_OPERATOR',
  },
];

const PERMISSIONS: Array<{ code: string; domain: string }> = [
  { code: 'table.start_session', domain: 'TABLE' },
  { code: 'table.view_assigned', domain: 'TABLE' },
  { code: 'table.view_all', domain: 'TABLE' },
  { code: 'table.reassign', domain: 'TABLE' },
  { code: 'table.close_paid', domain: 'TABLE' },
  { code: 'order.create', domain: 'ORDER' },
  { code: 'order.confirm', domain: 'ORDER' },
  { code: 'order.change_eligible', domain: 'ORDER' },
  { code: 'order.cancel_eligible', domain: 'ORDER' },
  { code: 'order.request_protected_cancel', domain: 'ORDER' },
  { code: 'station.acknowledge', domain: 'STATION' },
  { code: 'station.start_preparation', domain: 'STATION' },
  { code: 'station.mark_ready', domain: 'STATION' },
  { code: 'station.report_cannot_prepare', domain: 'STATION' },
  { code: 'bill.request', domain: 'BILL' },
  { code: 'bill.generate', domain: 'BILL' },
  { code: 'bill.reopen_request', domain: 'BILL' },
  { code: 'bill.reopen_approve', domain: 'BILL' },
  { code: 'payment.collect_cash', domain: 'PAYMENT' },
  { code: 'payment.verify_transfer', domain: 'PAYMENT' },
  { code: 'payment.settle', domain: 'PAYMENT' },
  { code: 'payment.exception_override', domain: 'PAYMENT' },
  { code: 'cash_drop.initiate', domain: 'CASH' },
  { code: 'cash_drop.receive', domain: 'CASH' },
  { code: 'cash_drop.resolve_dispute', domain: 'CASH' },
  { code: 'cashier.reconcile', domain: 'CASH' },
  { code: 'menu.manage', domain: 'MANAGEMENT' },
  { code: 'station.manage', domain: 'MANAGEMENT' },
  { code: 'staff.manage', domain: 'MANAGEMENT' },
  { code: 'shift.manage', domain: 'MANAGEMENT' },
  { code: 'approval.manage', domain: 'MANAGEMENT' },
  { code: 'report.view', domain: 'MANAGEMENT' },
  { code: 'daily_close.prepare', domain: 'MANAGEMENT' },
  { code: 'daily_close.approve', domain: 'MANAGEMENT' },
  { code: 'audit.view', domain: 'MANAGEMENT' },
];

const ROLE_PERMISSIONS: Record<RestaurantRoleCode, string[] | '*'> = {
  OWNER_ADMIN: '*',
  MANAGER: [
    'table.start_session',
    'table.view_assigned',
    'table.view_all',
    'table.reassign',
    'table.close_paid',
    'order.create',
    'order.confirm',
    'order.change_eligible',
    'order.cancel_eligible',
    'order.request_protected_cancel',
    'bill.request',
    'bill.generate',
    'bill.reopen_request',
    'bill.reopen_approve',
    'payment.exception_override',
    'cash_drop.resolve_dispute',
    'menu.manage',
    'station.manage',
    'staff.manage',
    'shift.manage',
    'approval.manage',
    'report.view',
    'daily_close.prepare',
    'audit.view',
  ],
  WAITER: [
    'table.start_session',
    'table.view_assigned',
    'table.close_paid',
    'order.create',
    'order.confirm',
    'order.change_eligible',
    'order.cancel_eligible',
    'order.request_protected_cancel',
    'bill.request',
    'payment.collect_cash',
    'payment.verify_transfer',
    'payment.settle',
    'cash_drop.initiate',
  ],
  CASHIER: [
    'table.view_all',
    'bill.generate',
    'bill.reopen_request',
    'payment.collect_cash',
    'payment.verify_transfer',
    'payment.settle',
    'payment.exception_override',
    'cash_drop.receive',
    'cash_drop.resolve_dispute',
    'cashier.reconcile',
    'report.view',
  ],
  STATION_OPERATOR: [
    'station.acknowledge',
    'station.start_preparation',
    'station.mark_ready',
    'station.report_cannot_prepare',
  ],
};

const TABLE_LAYOUT: Array<{
  locationId: string;
  numbers: string[];
}> = [
  { locationId: LOC_GROUND, numbers: ['1', '2', '3', '4', '5', '6'] },
  { locationId: LOC_TOP, numbers: ['7', '8', '9', '10', '11', '12'] },
  { locationId: LOC_OUTSIDE, numbers: ['13', '14', '15', '16'] },
];

function localYmd(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
}

async function seedBilledVisit(params: {
  tableId: string;
  tableStatus: string;
  sessionId: string;
  assignmentId: string;
  orderId: string;
  sessionStatus: 'PAID' | 'PAYMENT_PENDING' | 'CLOSED';
  guestCount: number;
  closedAt?: Date;
  billRequestId: string;
  billId: string;
  billNumber: string;
  billStatus: 'PAID' | 'PAYMENT_PENDING' | 'CLOSED';
  amountPaid: number;
  paidAt?: Date;
  items: Array<{
    id: string;
    billLineId: string;
    menuItemId: string;
    name: string;
    price: number;
    stationId: string;
    stationName: string;
    prep: number;
  }>;
  payment: {
    id: string;
    method: 'CASH' | 'TRANSFER';
    status: string;
    transferChannel?: 'TELEBIRR' | 'BANK';
    cashTendered?: number;
    cashChange?: number;
    receipt?: { id: string; fileId: string };
  };
  businessDate: Date;
  at: Date;
}) {
  const total = params.items.reduce((sum, item) => sum + item.price, 0);

  await prisma.diningTable.update({
    where: { id: params.tableId },
    data: { status: params.tableStatus },
  });

  await prisma.tableSession.upsert({
    where: { id: params.sessionId },
    update: {},
    create: {
      id: params.sessionId,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      tableId: params.tableId,
      businessDate: params.businessDate,
      primaryWaiterMembershipId: KARIM_MEMBERSHIP_ID,
      primaryWaiterShiftSessionId: KARIM_SHIFT_SESSION_ID,
      guestCount: params.guestCount,
      status: params.sessionStatus,
      openedAt: params.at,
      billRequestedAt: params.at,
      closedAt: params.closedAt,
      closedByMembershipId: params.closedAt ? KARIM_MEMBERSHIP_ID : undefined,
    },
  });

  await prisma.tableAssignment.upsert({
    where: { id: params.assignmentId },
    update: {},
    create: {
      id: params.assignmentId,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      tableSessionId: params.sessionId,
      waiterMembershipId: KARIM_MEMBERSHIP_ID,
      shiftSessionId: KARIM_SHIFT_SESSION_ID,
      assignedAt: params.at,
      assignedByMembershipId: KARIM_MEMBERSHIP_ID,
      reason: 'Opened table',
      releasedAt: params.closedAt,
    },
  });

  await prisma.order.upsert({
    where: { id: params.orderId },
    update: {},
    create: {
      id: params.orderId,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: params.businessDate,
      tableSessionId: params.sessionId,
      createdByWaiterMembershipId: KARIM_MEMBERSHIP_ID,
      waiterShiftSessionId: KARIM_SHIFT_SESSION_ID,
      status: 'SERVED',
      confirmedAt: params.at,
      items: {
        create: params.items.map((item) => ({
          id: item.id,
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          businessDate: params.businessDate,
          tableSessionId: params.sessionId,
          menuItemId: item.menuItemId,
          itemNameSnapshot: item.name,
          unitPriceSnapshot: item.price,
          currencyCode: 'ETB',
          quantity: 1,
          originalPreparationStationId: item.stationId,
          currentPreparationStationId: item.stationId,
          stationNameSnapshot: item.stationName,
          expectedPrepMinutesSnapshot: item.prep,
          state: 'SERVED',
          confirmedAt: params.at,
          queuedAt: params.at,
          acknowledgedAt: params.at,
          preparationStartedAt: params.at,
          readyAt: params.at,
          servedAt: params.at,
        })),
      },
    },
  });

  await prisma.billRequest.upsert({
    where: { id: params.billRequestId },
    update: {},
    create: {
      id: params.billRequestId,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: params.businessDate,
      tableSessionId: params.sessionId,
      requestedByMembershipId: KARIM_MEMBERSHIP_ID,
      requestedAt: params.at,
      status: 'FULFILLED',
      fulfilledAt: params.at,
    },
  });

  await prisma.bill.upsert({
    where: { id: params.billId },
    update: {},
    create: {
      id: params.billId,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: params.businessDate,
      tableSessionId: params.sessionId,
      billNumber: params.billNumber,
      status: params.billStatus,
      currencyCode: 'ETB',
      subtotalAmount: total,
      cancelledAmount: 0,
      totalAmount: total,
      amountPaid: params.amountPaid,
      generatedByMembershipId: SARA_MEMBERSHIP_ID,
      generatedAt: params.at,
      paidAt: params.paidAt,
      closedAt: params.closedAt,
      closedByMembershipId: params.closedAt ? KARIM_MEMBERSHIP_ID : undefined,
      lines: {
        create: params.items.map((item, index) => ({
          id: item.billLineId,
          tenantId: TENANT_ID,
          orderItemId: item.id,
          itemNameSnapshot: item.name,
          quantity: 1,
          unitPriceSnapshot: item.price,
          modifierTotalSnapshot: 0,
          lineTotal: item.price,
          currencyCode: 'ETB',
          chargeStatus: 'CHARGED',
          sortOrder: index,
        })),
      },
    },
  });

  await prisma.payment.upsert({
    where: { id: params.payment.id },
    update: {},
    create: {
      id: params.payment.id,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: params.businessDate,
      billId: params.billId,
      method: params.payment.method,
      transferChannel: params.payment.transferChannel,
      status: params.payment.status,
      currencyCode: 'ETB',
      amount: total,
      collectorMembershipId: KARIM_MEMBERSHIP_ID,
      collectorShiftSessionId: KARIM_SHIFT_SESSION_ID,
      cashTenderedAmount: params.payment.cashTendered,
      cashChangeAmount: params.payment.cashChange,
      initiatedAt: params.at,
      collectedAt: params.at,
      settledAt: params.payment.status === 'SETTLED' ? params.at : undefined,
      receipt: params.payment.receipt
        ? {
            create: {
              id: params.payment.receipt.id,
              tenantId: TENANT_ID,
              fileId: params.payment.receipt.fileId,
              capturedByMembershipId: KARIM_MEMBERSHIP_ID,
              capturedAt: params.at,
            },
          }
        : undefined,
    },
  });
}

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('demo123', 10);

  for (const person of DEMO_USERS) {
    await prisma.appUser.upsert({
      where: { id: person.id },
      update: {},
      create: {
        id: person.id,
        email: person.email,
        phone: person.phone,
        displayName: person.displayName,
        accountStatus: 'ACTIVE',
        authProvider: 'email',
        credential: {
          create: {
            passwordHash,
            authProvider: 'email',
          },
        },
        platformRoles: person.platformAdmin
          ? {
              create: {
                roleCode: 'PLATFORM_SUPER_ADMIN',
                status: 'ACTIVE',
              },
            }
          : undefined,
      },
    });
  }
  console.log('App users seeded. Password for all demo accounts: demo123');

  const roles = [
    { id: 1, code: 'OWNER_ADMIN' as const, name: 'Owner' },
    { id: 2, code: 'MANAGER' as const, name: 'Manager' },
    { id: 3, code: 'WAITER' as const, name: 'Waiter' },
    { id: 4, code: 'CASHIER' as const, name: 'Cashier' },
    { id: 5, code: 'STATION_OPERATOR' as const, name: 'Station operator' },
  ];

  for (const role of roles) {
    await prisma.restaurantRole.upsert({
      where: { id: role.id },
      update: {},
      create: role,
    });
  }

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: permission,
    });
  }

  const permissionRows = await prisma.permission.findMany();
  const permissionIdByCode = new Map(permissionRows.map((row) => [row.code, row.id]));

  for (const role of roles) {
    const granted = ROLE_PERMISSIONS[role.code];
    const codes = granted === '*' ? PERMISSIONS.map((entry) => entry.code) : granted;
    for (const code of codes) {
      const permissionId = permissionIdByCode.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId,
          allowed: true,
        },
      });
    }
  }
  console.log('Restaurant roles and permissions seeded.');

  const plans = [
    {
      id: PLAN_STARTER_ID,
      code: 'STARTER',
      name: 'Starter',
      entitlements: {
        'branch.max_count': 1,
        'station.custom_enabled': false,
        'reporting.advanced_enabled': false,
      },
    },
    {
      id: PLAN_PRO_ID,
      code: 'PRO',
      name: 'Pro',
      entitlements: {
        'branch.max_count': 3,
        'station.custom_enabled': true,
        'reporting.advanced_enabled': true,
      },
    },
    {
      id: PLAN_ENTERPRISE_ID,
      code: 'ENTERPRISE',
      name: 'Enterprise',
      entitlements: {
        'branch.max_count': 20,
        'station.custom_enabled': true,
        'reporting.advanced_enabled': true,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      update: {},
      create: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        status: 'ACTIVE',
        version: 1,
        entitlements: {
          create: Object.entries(plan.entitlements).map(([key, value]) => ({
            entitlementKey: key,
            valueJson: value,
          })),
        },
      },
    });
  }
  console.log('Subscription plans seeded.');

  const companies: Array<{
    id: string;
    displayName: string;
    legalName: string;
    status: 'ACTIVE' | 'SUSPENDED';
    planId: string;
    subscriptionStatus: 'ACTIVE' | 'SUSPENDED';
  }> = [
    {
      id: TENANT_ID,
      displayName: 'Fanaye Coffee',
      legalName: 'Fanaye Coffee PLC',
      status: 'ACTIVE',
      planId: PLAN_PRO_ID,
      subscriptionStatus: 'ACTIVE',
    },
    {
      id: TENANT_BUNA_ID,
      displayName: 'Buna House',
      legalName: 'Buna House PLC',
      status: 'ACTIVE',
      planId: PLAN_STARTER_ID,
      subscriptionStatus: 'ACTIVE',
    },
    {
      id: TENANT_OVEN_ID,
      displayName: 'Oven & Vine',
      legalName: 'Oven and Vine PLC',
      status: 'ACTIVE',
      planId: PLAN_ENTERPRISE_ID,
      subscriptionStatus: 'ACTIVE',
    },
    {
      id: TENANT_LAKE_ID,
      displayName: 'Lake Terrace',
      legalName: 'Lake Terrace PLC',
      status: 'SUSPENDED',
      planId: PLAN_PRO_ID,
      subscriptionStatus: 'SUSPENDED',
    },
  ];

  for (const company of companies) {
    await prisma.tenant.upsert({
      where: { id: company.id },
      update: {},
      create: {
        id: company.id,
        displayName: company.displayName,
        legalName: company.legalName,
        status: company.status,
        defaultTimezone: 'Africa/Addis_Ababa',
        currencyCode: 'ETB',
        settingsVersion: 1,
        activatedAt: company.status === 'ACTIVE' ? new Date() : null,
        suspendedAt: company.status === 'SUSPENDED' ? new Date() : null,
        settings: {
          create: {
            defaultShiftGraceMinutes: 15,
            waiterMayClosePaidTable: true,
            cashierMayCollectCustomerPayment: false,
            protectedCancellationPolicy: 'MANAGER_APPROVAL',
            unresolvedProductionBillPolicy: 'BLOCK',
            settingsVersion: 1,
          },
        },
        subscriptions: {
          create: {
            planId: company.planId,
            subscriptionStatus: company.subscriptionStatus,
            effectiveFrom: new Date(),
          },
        },
      },
    });
  }
  console.log('Tenants, settings, and subscriptions seeded.');

  await prisma.branch.upsert({
    where: { id: BRANCH_ID },
    update: {},
    create: {
      id: BRANCH_ID,
      tenantId: TENANT_ID,
      name: 'Bole',
      displayCode: 'BOLE',
      timezone: 'Africa/Addis_Ababa',
      status: 'ACTIVE',
      openingTime: new Date('1970-01-01T07:00:00.000Z'),
      closingTime: new Date('1970-01-01T23:00:00.000Z'),
      businessDayCutoff: new Date('1970-01-01T03:00:00.000Z'),
      settings: {
        create: {
          tenantId: TENANT_ID,
          shiftEndWarningMinutes: 15,
          settingsVersion: 1,
        },
      },
    },
  });

  await prisma.branchSettings.upsert({
    where: { branchId: BRANCH_ID },
    update: {},
    create: {
      branchId: BRANCH_ID,
      tenantId: TENANT_ID,
      shiftEndWarningMinutes: 15,
      settingsVersion: 1,
    },
  });

  const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));

  for (const person of DEMO_USERS) {
    if (!person.restaurantRole) continue;

    const membershipId = `77777777-7777-4777-8777-${person.id.slice(-12)}`;
    const membership = await prisma.tenantStaffMembership.upsert({
      where: {
        tenantId_userId: {
          tenantId: TENANT_ID,
          userId: person.id,
        },
      },
      update: {},
      create: {
        id: membershipId,
        tenantId: TENANT_ID,
        userId: person.id,
        employeeDisplayName: person.displayName,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    if (person.restaurantRole !== 'OWNER_ADMIN') {
      await prisma.branchStaffAssignment.upsert({
        where: { id: `88888888-8888-4888-8888-${person.id.slice(-12)}` },
        update: {},
        create: {
          id: `88888888-8888-4888-8888-${person.id.slice(-12)}`,
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          staffMembershipId: membership.id,
          status: 'ACTIVE',
        },
      });
    }

    const roleId = roleIdByCode.get(person.restaurantRole);
    if (!roleId) continue;

    await prisma.staffRoleAssignment.upsert({
      where: { id: `99999999-9999-4999-8999-${person.id.slice(-12)}` },
      update: {},
      create: {
        id: `99999999-9999-4999-8999-${person.id.slice(-12)}`,
        tenantId: TENANT_ID,
        staffMembershipId: membership.id,
        roleId,
        branchId: person.restaurantRole === 'OWNER_ADMIN' ? null : BRANCH_ID,
        status: 'ACTIVE',
      },
    });
  }
  console.log('Fanaye Coffee staff seeded. Selam stays platform-only.');

  await prisma.shiftDefinition.upsert({
    where: { id: SHIFT_MORNING_ID },
    update: {},
    create: {
      id: SHIFT_MORNING_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: 'Morning',
      startLocalTime: new Date('1970-01-01T07:00:00.000Z'),
      endLocalTime: new Date('1970-01-01T15:00:00.000Z'),
      graceMinutes: 15,
      status: 'ACTIVE',
    },
  });

  await prisma.shiftDefinition.upsert({
    where: { id: SHIFT_EVENING_ID },
    update: {},
    create: {
      id: SHIFT_EVENING_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: 'Evening',
      startLocalTime: new Date('1970-01-01T15:00:00.000Z'),
      endLocalTime: new Date('1970-01-01T23:00:00.000Z'),
      graceMinutes: 15,
      status: 'ACTIVE',
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const morningStart = new Date(today);
  morningStart.setHours(7, 0, 0, 0);
  const morningEnd = new Date(today);
  morningEnd.setHours(15, 0, 0, 0);
  const eveningStart = new Date(today);
  eveningStart.setHours(15, 0, 0, 0);
  const eveningEnd = new Date(today);
  eveningEnd.setHours(23, 0, 0, 0);

  const eveningUserIds = new Set([
    '55555555-5555-4555-8555-555555555556',
    '55555555-5555-4555-8555-555555555559',
  ]);

  for (const person of DEMO_USERS) {
    if (!person.restaurantRole) continue;

    const membershipId = `77777777-7777-4777-8777-${person.id.slice(-12)}`;
    const isEvening = eveningUserIds.has(person.id);
    const definitionId = isEvening ? SHIFT_EVENING_ID : SHIFT_MORNING_ID;
    const assignmentId = `bbbbbbb1-bbbb-4bbb-8bbb-${person.id.slice(-12)}`;
    const sessionId = `ccccccc1-cccc-4ccc-8ccc-${person.id.slice(-12)}`;
    const roleId = roleIdByCode.get(person.restaurantRole);

    await prisma.shiftAssignment.upsert({
      where: { id: assignmentId },
      update: {},
      create: {
        id: assignmentId,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        staffMembershipId: membershipId,
        shiftDefinitionId: definitionId,
        scheduledStartAt: isEvening ? eveningStart : morningStart,
        scheduledEndAt: isEvening ? eveningEnd : morningEnd,
        graceMinutes: 15,
        roleId,
        status: 'SCHEDULED',
      },
    });

    if (!isEvening) {
      await prisma.shiftSession.upsert({
        where: { id: sessionId },
        update: {},
        create: {
          id: sessionId,
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          shiftAssignmentId: assignmentId,
          staffMembershipId: membershipId,
          roleId,
          scheduledStartAtSnapshot: morningStart,
          scheduledEndAtSnapshot: morningEnd,
          graceMinutesSnapshot: 15,
          clockInAt: morningStart,
          lateByMinutes: 0,
          state: 'OPEN',
          businessDate: today,
        },
      });
    }
  }
  console.log('Shift definitions, today roster, and morning clock-ins seeded.');

  const locations = [
    {
      id: LOC_GROUND,
      name: 'Ground Floor',
      code: 'GROUND',
      sortOrder: 0,
    },
    {
      id: LOC_TOP,
      name: 'Top Floor',
      code: 'TOP_FLOOR',
      sortOrder: 1,
    },
    {
      id: LOC_OUTSIDE,
      name: 'Outside',
      code: 'OUTSIDE',
      sortOrder: 2,
    },
  ];

  for (const location of locations) {
    await prisma.tableLocation.upsert({
      where: { id: location.id },
      update: {},
      create: {
        id: location.id,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        name: location.name,
        code: location.code,
        sortOrder: location.sortOrder,
        status: 'ACTIVE',
      },
    });
  }

  let sortOrder = 0;
  for (const group of TABLE_LAYOUT) {
    for (const number of group.numbers) {
      const id = `44444444-4444-4444-8444-0000000000${number.padStart(2, '0')}`;
      const n = Number(number);
      const assignedWaiterMembershipId =
        n <= 8 ? KARIM_MEMBERSHIP_ID : DAWIT_MEMBERSHIP_ID;
      await prisma.diningTable.upsert({
        where: { id },
        update: {
          assignedWaiterMembershipId,
        },
        create: {
          id,
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          locationId: group.locationId,
          displayName: `Table ${number}`,
          displayNumber: number,
          status: 'AVAILABLE',
          sortOrder,
          assignedWaiterMembershipId,
        },
      });
      sortOrder += 1;
    }
  }

  console.log(
    'Fanaye Bole branch, table locations, dining tables, and waiter assignments seeded.',
  );

  const stations = [
    { id: STATION_KITCHEN, name: 'Kitchen', code: 'KITCHEN', sortOrder: 0, delay: 11 },
    { id: STATION_BARISTA, name: 'Barista', code: 'BARISTA', sortOrder: 1, delay: 4 },
    { id: STATION_CAKES, name: 'Cakes', code: 'CAKES', sortOrder: 2, delay: 3 },
    { id: STATION_SOFT, name: 'Soft Drinks', code: 'SOFT_DRINKS', sortOrder: 3, delay: 2 },
  ];

  for (const station of stations) {
    await prisma.preparationStation.upsert({
      where: { id: station.id },
      update: {},
      create: {
        id: station.id,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        name: station.name,
        code: station.code,
        status: 'ACTIVE',
        defaultDelayThresholdMinutes: station.delay,
        sortOrder: station.sortOrder,
      },
    });
  }

  const stationOperators = [
    { userId: '55555555-5555-4555-8555-555555555557', stationId: STATION_KITCHEN },
    { userId: '55555555-5555-4555-8555-555555555558', stationId: STATION_BARISTA },
    { userId: '55555555-5555-4555-8555-555555555559', stationId: STATION_CAKES },
    { userId: '55555555-5555-4555-8555-555555555560', stationId: STATION_SOFT },
  ];

  for (const operator of stationOperators) {
    const membershipId = `77777777-7777-4777-8777-${operator.userId.slice(-12)}`;
    await prisma.stationStaffAssignment.upsert({
      where: { id: `abcdabcd-abcd-4bcd-8bcd-${operator.userId.slice(-12)}` },
      update: {},
      create: {
        id: `abcdabcd-abcd-4bcd-8bcd-${operator.userId.slice(-12)}`,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        stationId: operator.stationId,
        staffMembershipId: membershipId,
        status: 'ACTIVE',
      },
    });
  }

  await prisma.menu.upsert({
    where: { id: MENU_ID },
    update: {},
    create: {
      id: MENU_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: 'All day',
      status: 'ACTIVE',
    },
  });

  await prisma.menuPeriod.upsert({
    where: { id: PERIOD_ALL_DAY },
    update: {},
    create: {
      id: PERIOD_ALL_DAY,
      tenantId: TENANT_ID,
      menuId: MENU_ID,
      name: 'All day',
      startLocalTime: new Date('1970-01-01T07:00:00.000Z'),
      endLocalTime: new Date('1970-01-01T23:00:00.000Z'),
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
      sortOrder: 0,
    },
  });

  const categories = [
    { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee21', name: 'Kitchen', sortOrder: 0 },
    { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee22', name: 'Barista', sortOrder: 1 },
    { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee23', name: 'Cakes', sortOrder: 2 },
    { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee24', name: 'Soft Drinks', sortOrder: 3 },
  ];

  for (const category of categories) {
    await prisma.menuCategory.upsert({
      where: { id: category.id },
      update: {},
      create: {
        ...category,
        tenantId: TENANT_ID,
        menuId: MENU_ID,
        status: 'ACTIVE',
      },
    });
  }

  const categoryIdByName = new Map(categories.map((entry) => [entry.name, entry.id]));

  const modifierGroups = [
    {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffff01',
      name: 'Burger hold',
      min: 0,
      max: 3,
      required: false,
      options: [
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff11', name: 'No tomato', delta: 0 },
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff12', name: 'No onion', delta: 0 },
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff13', name: 'No pickle', delta: 0 },
      ],
    },
    {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffff02',
      name: 'Burger add',
      min: 0,
      max: 2,
      required: false,
      options: [
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff21', name: 'Extra cheese', delta: 30 },
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff22', name: 'Extra patty', delta: 80 },
      ],
    },
    {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffff03',
      name: 'Milk',
      min: 1,
      max: 1,
      required: true,
      options: [
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff31', name: 'Regular milk', delta: 0 },
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff32', name: 'Oat milk', delta: 15 },
      ],
    },
    {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffff04',
      name: 'Sugar',
      min: 1,
      max: 1,
      required: true,
      options: [
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff41', name: 'No sugar', delta: 0 },
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff42', name: 'Normal sugar', delta: 0 },
        { id: 'ffffffff-ffff-4fff-8fff-ffffffffff43', name: 'Extra sugar', delta: 0 },
      ],
    },
  ];

  for (const group of modifierGroups) {
    await prisma.modifierGroup.upsert({
      where: { id: group.id },
      update: {},
      create: {
        id: group.id,
        tenantId: TENANT_ID,
        menuId: MENU_ID,
        name: group.name,
        requiredDefault: group.required,
        minSelections: group.min,
        maxSelections: group.max,
        status: 'ACTIVE',
        options: {
          create: group.options.map((option, index) => ({
            id: option.id,
            tenantId: TENANT_ID,
            name: option.name,
            priceDelta: option.delta,
            currencyCode: 'ETB',
            status: 'ACTIVE',
            sortOrder: index,
          })),
        },
      },
    });
  }

  const dishes = [
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee31',
      name: 'Cheeseburger',
      description: 'Double patty, cheddar, house sauce',
      category: 'Kitchen',
      price: 280,
      stationId: STATION_KITCHEN,
      prep: 12,
      groups: ['ffffffff-ffff-4fff-8fff-ffffffffff01', 'ffffffff-ffff-4fff-8fff-ffffffffff02'],
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee32',
      name: 'Fire pizza',
      description: 'Mozzarella, peppers, wood-fired crust',
      category: 'Kitchen',
      price: 320,
      stationId: STATION_KITCHEN,
      prep: 14,
      groups: [],
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee33',
      name: 'Spaghetti pomodoro',
      description: 'Tomato, broccoli, parmesan',
      category: 'Kitchen',
      price: 240,
      stationId: STATION_KITCHEN,
      prep: 11,
      groups: [],
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee34',
      name: 'Macchiato',
      description: 'Double shot, steamed milk',
      category: 'Barista',
      price: 90,
      stationId: STATION_BARISTA,
      prep: 5,
      groups: ['ffffffff-ffff-4fff-8fff-ffffffffff03', 'ffffffff-ffff-4fff-8fff-ffffffffff04'],
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee35',
      name: 'Latte',
      description: 'Espresso with steamed milk',
      category: 'Barista',
      price: 110,
      stationId: STATION_BARISTA,
      prep: 5,
      groups: ['ffffffff-ffff-4fff-8fff-ffffffffff03', 'ffffffff-ffff-4fff-8fff-ffffffffff04'],
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee36',
      name: 'Cheesecake',
      description: 'New York style slice',
      category: 'Cakes',
      price: 150,
      stationId: STATION_CAKES,
      prep: 4,
      groups: [],
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee37',
      name: 'Cola',
      description: 'Chilled bottle',
      category: 'Soft Drinks',
      price: 45,
      stationId: STATION_SOFT,
      prep: 2,
      groups: [],
    },
  ];

  for (const [index, dish] of dishes.entries()) {
    await prisma.menuItem.upsert({
      where: { id: dish.id },
      update: {},
      create: {
        id: dish.id,
        tenantId: TENANT_ID,
        menuId: MENU_ID,
        menuCategoryId: categoryIdByName.get(dish.category),
        name: dish.name,
        description: dish.description,
        currentPrice: dish.price,
        currencyCode: 'ETB',
        preparationStationId: dish.stationId,
        expectedPrepMinutes: dish.prep,
        status: 'ACTIVE',
        soldOut: false,
        sortOrder: index,
        periods: {
          create: { menuPeriodId: PERIOD_ALL_DAY },
        },
        modifiers: {
          create: dish.groups.map((groupId, groupIndex) => ({
            tenantId: TENANT_ID,
            modifierGroupId: groupId,
            sortOrder: groupIndex,
          })),
        },
      },
    });
  }

  console.log('Stations, menu, dishes, and modifiers seeded.');

  const now = new Date();

  await prisma.diningTable.update({
    where: { id: TABLE_1_ID },
    data: { status: 'OCCUPIED' },
  });

  await prisma.tableSession.upsert({
    where: { id: TABLE_SESSION_1_ID },
    update: {},
    create: {
      id: TABLE_SESSION_1_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      tableId: TABLE_1_ID,
      businessDate: today,
      primaryWaiterMembershipId: KARIM_MEMBERSHIP_ID,
      primaryWaiterShiftSessionId: KARIM_SHIFT_SESSION_ID,
      guestCount: 2,
      status: 'ACTIVE_ORDER',
      openedAt: now,
    },
  });

  await prisma.tableAssignment.upsert({
    where: { id: TABLE_ASSIGNMENT_1_ID },
    update: {},
    create: {
      id: TABLE_ASSIGNMENT_1_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      tableSessionId: TABLE_SESSION_1_ID,
      waiterMembershipId: KARIM_MEMBERSHIP_ID,
      shiftSessionId: KARIM_SHIFT_SESSION_ID,
      assignedAt: now,
      assignedByMembershipId: KARIM_MEMBERSHIP_ID,
      reason: 'Opened table',
    },
  });

  await prisma.order.upsert({
    where: { id: ORDER_1_ID },
    update: {},
    create: {
      id: ORDER_1_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: today,
      tableSessionId: TABLE_SESSION_1_ID,
      createdByWaiterMembershipId: KARIM_MEMBERSHIP_ID,
      waiterShiftSessionId: KARIM_SHIFT_SESSION_ID,
      status: 'IN_FULFILLMENT',
      confirmedAt: now,
      items: {
        create: [
          {
            id: ORDER_ITEM_BURGER_ID,
            tenantId: TENANT_ID,
            branchId: BRANCH_ID,
            businessDate: today,
            tableSessionId: TABLE_SESSION_1_ID,
            menuItemId: ITEM_CHEESEBURGER_ID,
            itemNameSnapshot: 'Cheeseburger',
            unitPriceSnapshot: 280,
            currencyCode: 'ETB',
            quantity: 1,
            originalPreparationStationId: STATION_KITCHEN,
            currentPreparationStationId: STATION_KITCHEN,
            stationNameSnapshot: 'Kitchen',
            expectedPrepMinutesSnapshot: 12,
            specialInstruction: 'No rush',
            state: 'QUEUED',
            confirmedAt: now,
            queuedAt: now,
            modifiers: {
              create: [
                {
                  id: '99999999-9999-4999-8999-999999999921',
                  tenantId: TENANT_ID,
                  modifierGroupId: 'ffffffff-ffff-4fff-8fff-ffffffffff02',
                  modifierOptionId: 'ffffffff-ffff-4fff-8fff-ffffffffff21',
                  groupNameSnapshot: 'Burger add',
                  optionNameSnapshot: 'Extra cheese',
                  priceDeltaSnapshot: 30,
                  currencyCode: 'ETB',
                  sortOrder: 0,
                },
              ],
            },
          },
          {
            id: ORDER_ITEM_MACCHIATO_ID,
            tenantId: TENANT_ID,
            branchId: BRANCH_ID,
            businessDate: today,
            tableSessionId: TABLE_SESSION_1_ID,
            menuItemId: ITEM_MACCHIATO_ID,
            itemNameSnapshot: 'Macchiato',
            unitPriceSnapshot: 90,
            currencyCode: 'ETB',
            quantity: 1,
            originalPreparationStationId: STATION_BARISTA,
            currentPreparationStationId: STATION_BARISTA,
            stationNameSnapshot: 'Barista',
            expectedPrepMinutesSnapshot: 5,
            state: 'QUEUED',
            confirmedAt: now,
            queuedAt: now,
            modifiers: {
              create: [
                {
                  id: '99999999-9999-4999-8999-999999999922',
                  tenantId: TENANT_ID,
                  modifierGroupId: 'ffffffff-ffff-4fff-8fff-ffffffffff03',
                  modifierOptionId: 'ffffffff-ffff-4fff-8fff-ffffffffff31',
                  groupNameSnapshot: 'Milk',
                  optionNameSnapshot: 'Regular milk',
                  priceDeltaSnapshot: 0,
                  currencyCode: 'ETB',
                  sortOrder: 0,
                },
                {
                  id: '99999999-9999-4999-8999-999999999923',
                  tenantId: TENANT_ID,
                  modifierGroupId: 'ffffffff-ffff-4fff-8fff-ffffffffff04',
                  modifierOptionId: 'ffffffff-ffff-4fff-8fff-ffffffffff42',
                  groupNameSnapshot: 'Sugar',
                  optionNameSnapshot: 'Normal sugar',
                  priceDeltaSnapshot: 0,
                  currencyCode: 'ETB',
                  sortOrder: 1,
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log('Table 1 session and confirmed order seeded for Karim.');

  await prisma.file.upsert({
    where: { id: TRANSFER_RECEIPT_FILE_ID },
    update: {},
    create: {
      id: TRANSFER_RECEIPT_FILE_ID,
      path: 'demo/transfer-receipts/table-3-telebirr.jpg',
    },
  });

  const billDate = localYmd(today);

  await seedBilledVisit({
    tableId: TABLE_2_ID,
    tableStatus: 'AVAILABLE',
    sessionId: TABLE_SESSION_2_ID,
    assignmentId: '88888888-8888-4888-8888-888888888812',
    orderId: '99999999-9999-4999-8999-999999999902',
    sessionStatus: 'CLOSED',
    guestCount: 2,
    closedAt: now,
    billRequestId: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b111',
    billId: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b101',
    billNumber: `BOLE-${billDate}-0001`,
    billStatus: 'CLOSED',
    amountPaid: 365,
    paidAt: now,
    items: [
      {
        id: '99999999-9999-4999-8999-999999999931',
        billLineId: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b121',
        menuItemId: ITEM_PIZZA_ID,
        name: 'Fire pizza',
        price: 320,
        stationId: STATION_KITCHEN,
        stationName: 'Kitchen',
        prep: 14,
      },
      {
        id: '99999999-9999-4999-8999-999999999932',
        billLineId: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b122',
        menuItemId: ITEM_COLA_ID,
        name: 'Cola',
        price: 45,
        stationId: STATION_SOFT,
        stationName: 'Soft Drinks',
        prep: 2,
      },
    ],
    payment: {
      id: TABLE_2_CASH_PAYMENT_ID,
      method: 'CASH',
      status: 'SETTLED',
      cashTendered: 400,
      cashChange: 35,
    },
    businessDate: today,
    at: now,
  });

  await seedBilledVisit({
    tableId: TABLE_3_ID,
    tableStatus: 'OCCUPIED',
    sessionId: TABLE_SESSION_3_ID,
    assignmentId: '88888888-8888-4888-8888-888888888813',
    orderId: '99999999-9999-4999-8999-999999999903',
    sessionStatus: 'PAYMENT_PENDING',
    guestCount: 1,
    billRequestId: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b112',
    billId: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b102',
    billNumber: `BOLE-${billDate}-0002`,
    billStatus: 'PAYMENT_PENDING',
    amountPaid: 0,
    items: [
      {
        id: '99999999-9999-4999-8999-999999999933',
        billLineId: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b123',
        menuItemId: ITEM_CAKE_ID,
        name: 'Cheesecake',
        price: 150,
        stationId: STATION_CAKES,
        stationName: 'Cakes',
        prep: 4,
      },
      {
        id: '99999999-9999-4999-8999-999999999934',
        billLineId: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b124',
        menuItemId: ITEM_LATTE_ID,
        name: 'Latte',
        price: 110,
        stationId: STATION_BARISTA,
        stationName: 'Barista',
        prep: 5,
      },
    ],
    payment: {
      id: 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c102',
      method: 'TRANSFER',
      status: 'VERIFICATION_PENDING',
      transferChannel: 'TELEBIRR',
      receipt: {
        id: 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d101',
        fileId: TRANSFER_RECEIPT_FILE_ID,
      },
    },
    businessDate: today,
    at: now,
  });

  console.log('Bills and payments seeded. Transfer photo stored; Fanaye verify comes later.');

  await prisma.cashierFinancialSession.upsert({
    where: { id: SARA_CASHIER_SESSION_ID },
    update: {},
    create: {
      id: SARA_CASHIER_SESSION_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: today,
      cashierMembershipId: SARA_MEMBERSHIP_ID,
      shiftSessionId: SARA_SHIFT_SESSION_ID,
      status: 'OPEN',
      openingFloatAmount: 0,
      currencyCode: 'ETB',
      openedAt: now,
    },
  });

  await prisma.cashLedgerEntry.upsert({
    where: { id: 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e221' },
    update: {},
    create: {
      id: 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e221',
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: today,
      holderType: 'WAITER_SHIFT',
      waiterShiftSessionId: KARIM_SHIFT_SESSION_ID,
      entryType: 'CASH_PAYMENT_COLLECTED',
      amountDelta: 365,
      currencyCode: 'ETB',
      sourceType: 'PAYMENT',
      sourceId: TABLE_2_CASH_PAYMENT_ID,
      createdByMembershipId: KARIM_MEMBERSHIP_ID,
    },
  });

  await prisma.cashDrop.upsert({
    where: { id: KARIM_CASH_DROP_ID },
    update: {},
    create: {
      id: KARIM_CASH_DROP_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: today,
      waiterMembershipId: KARIM_MEMBERSHIP_ID,
      waiterShiftSessionId: KARIM_SHIFT_SESSION_ID,
      declaredAmount: 365,
      currencyCode: 'ETB',
      status: 'RECEIVED',
      initiatedAt: now,
      cashierFinancialSessionId: SARA_CASHIER_SESSION_ID,
      receivedByCashierMembershipId: SARA_MEMBERSHIP_ID,
      countedAmount: 365,
      receivedAt: now,
      resolutionAmount: 365,
      resolvedAt: now,
    },
  });

  await prisma.cashLedgerEntry.upsert({
    where: { id: 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e222' },
    update: {},
    create: {
      id: 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e222',
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: today,
      holderType: 'WAITER_SHIFT',
      waiterShiftSessionId: KARIM_SHIFT_SESSION_ID,
      entryType: 'CASH_DROP_OUT',
      amountDelta: -365,
      currencyCode: 'ETB',
      sourceType: 'CASH_DROP',
      sourceId: KARIM_CASH_DROP_ID,
      createdByMembershipId: SARA_MEMBERSHIP_ID,
    },
  });

  await prisma.cashLedgerEntry.upsert({
    where: { id: 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e223' },
    update: {},
    create: {
      id: 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e223',
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: today,
      holderType: 'CASHIER_SESSION',
      cashierFinancialSessionId: SARA_CASHIER_SESSION_ID,
      entryType: 'CASH_DROP_IN',
      amountDelta: 365,
      currencyCode: 'ETB',
      sourceType: 'CASH_DROP',
      sourceId: KARIM_CASH_DROP_ID,
      createdByMembershipId: SARA_MEMBERSHIP_ID,
    },
  });

  console.log('Cash custody seeded: Karim collected 365, Sara received the drop.');

  await prisma.operationalDailyClose.upsert({
    where: { id: DAILY_CLOSE_ID },
    update: {},
    create: {
      id: DAILY_CLOSE_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      businessDate: today,
      status: 'READY_FOR_REVIEW',
      currencyCode: 'ETB',
      generatedAt: now,
      generatedByMembershipId: HANA_MEMBERSHIP_ID,
      grossOrderValue: 1025,
      cancelledValue: 0,
      netBilledSales: 625,
      cashSales: 365,
      verifiedTransferSales: 0,
      pendingTransferAmount: 260,
      suspiciousTransferAmount: 0,
      cashierExpectedCash: 365,
      cashierCountedCash: 0,
      cashierVariance: -365,
      undroppedWaiterCash: 0,
      tableCount: 3,
      orderCount: 3,
      itemCount: 6,
      managerOverrideCount: 0,
      blockingIssuesJson: [
        {
          code: 'OPEN_TABLE_SESSION',
          tableId: TABLE_1_ID,
          tableName: 'Table 1',
          status: 'ACTIVE_ORDER',
        },
        {
          code: 'PENDING_TRANSFER',
          tableId: TABLE_3_ID,
          tableName: 'Table 3',
          amount: 260,
        },
        {
          code: 'CASHIER_RECONCILIATION_MISSING',
          cashierSessionId: SARA_CASHIER_SESSION_ID,
          expectedCash: 365,
        },
      ],
      waiterLines: {
        create: {
          id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f321',
          tenantId: TENANT_ID,
          waiterMembershipId: KARIM_MEMBERSHIP_ID,
          shiftSessionId: KARIM_SHIFT_SESSION_ID,
          ordersCreatedCount: 3,
          tablesServedCount: 3,
          grossAttributedSales: 1025,
          cancelledAttributedValue: 0,
          netAttributedSales: 1025,
          cashCollected: 365,
          cashDropped: 365,
          undroppedCash: 0,
          verifiedTransferAmount: 0,
          rejectedOrSuspiciousTransferCount: 0,
          paymentExceptionCount: 1,
        },
      },
      stationLines: {
        create: [
          {
            id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f331',
            tenantId: TENANT_ID,
            stationId: STATION_KITCHEN,
            stationNameSnapshot: 'Kitchen',
            itemsHandledCount: 2,
            delayedItemCount: 0,
            cannotPrepareCount: 0,
          },
          {
            id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f332',
            tenantId: TENANT_ID,
            stationId: STATION_BARISTA,
            stationNameSnapshot: 'Barista',
            itemsHandledCount: 2,
            delayedItemCount: 0,
            cannotPrepareCount: 0,
          },
          {
            id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f333',
            tenantId: TENANT_ID,
            stationId: STATION_CAKES,
            stationNameSnapshot: 'Cakes',
            itemsHandledCount: 1,
            delayedItemCount: 0,
            cannotPrepareCount: 0,
          },
          {
            id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f334',
            tenantId: TENANT_ID,
            stationId: STATION_SOFT,
            stationNameSnapshot: 'Soft Drinks',
            itemsHandledCount: 1,
            delayedItemCount: 0,
            cannotPrepareCount: 0,
          },
        ],
      },
    },
  });

  const notifications = [
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f341',
      recipientId: HANA_MEMBERSHIP_ID,
      type: 'DAILY_CLOSE_BLOCKED',
      severity: 'ATTENTION',
      relatedType: 'OPERATIONAL_DAILY_CLOSE',
      relatedId: DAILY_CLOSE_ID,
      title: 'Bole cannot lock the day yet',
      body: 'Table 1 is still open, Table 3 transfer is unverified, and Sara has not reconciled the drawer.',
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f342',
      recipientId: SARA_MEMBERSHIP_ID,
      type: 'CASH_DROP_RECEIVED',
      severity: 'INFO',
      relatedType: 'CASH_DROP',
      relatedId: KARIM_CASH_DROP_ID,
      title: 'Cash drop received from Karim',
      body: '365 ETB counted and accepted. Drawer expected cash is 365 ETB.',
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f343',
      recipientId: KARIM_MEMBERSHIP_ID,
      type: 'STATION_ITEM_QUEUED',
      severity: 'INFO',
      relatedType: 'TABLE_SESSION',
      relatedId: TABLE_SESSION_1_ID,
      title: 'Table 1 still has kitchen tickets',
      body: 'Cheeseburger and Macchiato are queued. Close is blocked until this visit is finished.',
    },
  ];

  for (const note of notifications) {
    await prisma.notification.upsert({
      where: { id: note.id },
      update: {},
      create: {
        id: note.id,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        recipientStaffMembershipId: note.recipientId,
        type: note.type,
        severity: note.severity,
        relatedEntityType: note.relatedType,
        relatedEntityId: note.relatedId,
        title: note.title,
        body: note.body,
      },
    });
  }

  const auditEvents = [
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f351',
      actorUserId: KARIM_USER_ID,
      actorStaffId: KARIM_MEMBERSHIP_ID,
      role: 'WAITER',
      shiftId: KARIM_SHIFT_SESSION_ID,
      entityType: 'ORDER',
      entityId: ORDER_1_ID,
      action: 'CONFIRM_ORDER',
      newState: {
        status: 'IN_FULFILLMENT',
        summary: 'Items dispatched to Kitchen and Barista',
        tableDisplayName: 'Table 1',
      },
      commandId: IDEMPOTENCY_ORDER_ID,
      minutesAgo: 25,
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f352',
      actorUserId: KARIM_USER_ID,
      actorStaffId: KARIM_MEMBERSHIP_ID,
      role: 'WAITER',
      shiftId: KARIM_SHIFT_SESSION_ID,
      entityType: 'PAYMENT',
      entityId: TABLE_2_CASH_PAYMENT_ID,
      action: 'CONFIRM_CASH_PAYMENT',
      newState: {
        status: 'SETTLED',
        amount: 365,
        tableDisplayName: 'Table 2',
      },
      minutesAgo: 40,
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f353',
      actorUserId: SARA_USER_ID,
      actorStaffId: SARA_MEMBERSHIP_ID,
      role: 'CASHIER',
      shiftId: SARA_SHIFT_SESSION_ID,
      entityType: 'CASH_DROP',
      entityId: KARIM_CASH_DROP_ID,
      action: 'CONFIRM_CASH_DROP_RECEIPT',
      newState: { status: 'RECEIVED', amount: 365 },
      commandId: IDEMPOTENCY_DROP_ID,
      minutesAgo: 35,
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f354',
      actorUserId: HANA_USER_ID,
      actorStaffId: HANA_MEMBERSHIP_ID,
      role: 'MANAGER',
      shiftId: null,
      entityType: 'OPERATIONAL_DAILY_CLOSE',
      entityId: DAILY_CLOSE_ID,
      action: 'GENERATE_DAILY_CLOSE',
      newState: { status: 'READY_FOR_REVIEW', blockingIssueCount: 3 },
      minutesAgo: 120,
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f355',
      actorUserId: '55555555-5555-4555-8555-555555555557',
      actorStaffId: '77777777-7777-4777-8777-555555555557',
      role: 'STATION_OPERATOR',
      shiftId: null,
      entityType: 'ORDER_ITEM',
      entityId: ORDER_ITEM_BURGER_ID,
      action: 'MARK_ITEM_READY',
      newState: {
        itemName: 'Cheeseburger (x2)',
        stationName: 'Kitchen',
        summary: 'Ticket completed',
      },
      minutesAgo: 18,
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f356',
      actorUserId: '55555555-5555-4555-8555-555555555558',
      actorStaffId: MERON_MEMBERSHIP_ID,
      role: 'STATION_OPERATOR',
      shiftId: null,
      entityType: 'ORDER_ITEM',
      entityId: ORDER_ITEM_MACCHIATO_ID,
      action: 'MARK_ITEM_READY',
      newState: {
        itemName: 'Caramel Macchiato',
        stationName: 'Barista',
      },
      minutesAgo: 50,
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f357',
      actorUserId: KARIM_USER_ID,
      actorStaffId: KARIM_MEMBERSHIP_ID,
      role: 'WAITER',
      shiftId: KARIM_SHIFT_SESSION_ID,
      entityType: 'PAYMENT',
      entityId: TABLE_2_CASH_PAYMENT_ID,
      action: 'TINAVERIFY_SCAN',
      newState: {
        summary: 'Fiscal tax QR check submitted',
        tableDisplayName: 'Table 12',
        amount: 1480,
      },
      minutesAgo: 12,
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f358',
      actorUserId: HANA_USER_ID,
      actorStaffId: HANA_MEMBERSHIP_ID,
      role: 'MANAGER',
      shiftId: null,
      entityType: 'DINING_TABLE',
      entityId: TABLE_1_ID,
      action: 'ASSIGN_TABLE_COVERAGE',
      newState: {
        summary: 'Tables 1–4 assigned to Karim Tesfaye for morning shift',
      },
      minutesAgo: 90,
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f359',
      actorUserId: SARA_USER_ID,
      actorStaffId: SARA_MEMBERSHIP_ID,
      role: 'CASHIER',
      shiftId: SARA_SHIFT_SESSION_ID,
      entityType: 'CASHIER_SESSION',
      entityId: SARA_CASHIER_SESSION_ID,
      action: 'OPEN_CASHIER_SESSION',
      newState: {
        summary: 'Opening float verified: ETB 2,500.00',
      },
      minutesAgo: 180,
    },
    {
      id: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f360',
      actorUserId: HANA_USER_ID,
      actorStaffId: HANA_MEMBERSHIP_ID,
      role: 'MANAGER',
      shiftId: null,
      entityType: 'SYSTEM',
      entityId: null,
      action: 'SYSTEM_HEALTH_CHECK',
      newState: {
        summary: 'Local offline queues synchronized with cloud database',
      },
      minutesAgo: 240,
    },
  ];

  for (const event of auditEvents) {
    const occurredAt = new Date(now.getTime() - event.minutesAgo * 60_000);
    await prisma.auditEvent.upsert({
      where: { id: event.id },
      update: {
        action: event.action,
        entityType: event.entityType,
        newStateJson: event.newState,
        occurredAt,
      },
      create: {
        id: event.id,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        actorUserId: event.actorUserId,
        actorStaffMembershipId: event.actorStaffId,
        actorRestaurantRole: event.role,
        actorShiftSessionId: event.shiftId,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        newStateJson: event.newState,
        idempotencyCommandId: event.commandId,
        occurredAt,
      },
    });
  }

  await prisma.idempotencyCommand.upsert({
    where: { id: IDEMPOTENCY_ORDER_ID },
    update: {},
    create: {
      id: IDEMPOTENCY_ORDER_ID,
      tenantId: TENANT_ID,
      actorUserId: KARIM_USER_ID,
      actorStaffMembershipId: KARIM_MEMBERSHIP_ID,
      commandType: 'CONFIRM_ORDER',
      idempotencyKey: 'karim-table-1-confirm-order',
      requestHash: '1111111111111111111111111111111111111111111111111111111111111111',
      status: 'SUCCEEDED',
      resourceType: 'ORDER',
      resourceId: ORDER_1_ID,
      responseStatusCode: 201,
      responseBodyJson: { orderId: ORDER_1_ID, status: 'IN_FULFILLMENT' },
      startedAt: now,
      completedAt: now,
    },
  });

  await prisma.idempotencyCommand.upsert({
    where: { id: IDEMPOTENCY_DROP_ID },
    update: {},
    create: {
      id: IDEMPOTENCY_DROP_ID,
      tenantId: TENANT_ID,
      actorUserId: SARA_USER_ID,
      actorStaffMembershipId: SARA_MEMBERSHIP_ID,
      commandType: 'CONFIRM_CASH_DROP_RECEIPT',
      idempotencyKey: 'sara-receive-karim-365',
      requestHash: '2222222222222222222222222222222222222222222222222222222222222222',
      status: 'SUCCEEDED',
      resourceType: 'CASH_DROP',
      resourceId: KARIM_CASH_DROP_ID,
      responseStatusCode: 200,
      responseBodyJson: { cashDropId: KARIM_CASH_DROP_ID, status: 'RECEIVED' },
      startedAt: now,
      completedAt: now,
    },
  });

  console.log('Daily close snapshot, notifications, audit, and idempotency seeded. Day is not locked.');

  await prisma.platformSupportSession.upsert({
    where: { id: 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a401' },
    update: {},
    create: {
      id: 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a401',
      platformUserId: SELAM_USER_ID,
      tenantId: TENANT_ID,
      reason: 'Review Table 3 Telebirr receipt. Selam does not become Owner.',
      scopeJson: {
        branchId: BRANCH_ID,
        permissions: ['audit.view', 'report.view'],
      },
      status: 'CLOSED',
      startedAt: now,
      endedAt: now,
    },
  });

  await prisma.orderChangeRequest.upsert({
    where: { id: 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a411' },
    update: {},
    create: {
      id: 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a411',
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      orderItemId: ORDER_ITEM_BURGER_ID,
      requestedByMembershipId: KARIM_MEMBERSHIP_ID,
      requestedAt: now,
      reason: 'Guest asked to hold tomato after the ticket was sent.',
      requestedChangeJson: {
        addModifiers: [
          {
            groupId: 'ffffffff-ffff-4fff-8fff-ffffffffff01',
            optionId: 'ffffffff-ffff-4fff-8fff-ffffffffff11',
            name: 'No tomato',
          },
        ],
      },
      stateAtRequest: 'QUEUED',
      status: 'PENDING',
    },
  });

  await prisma.cancellationRequest.upsert({
    where: { id: 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a421' },
    update: {},
    create: {
      id: 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a421',
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      orderItemId: ORDER_ITEM_PIZZA_ID,
      requestedByMembershipId: KARIM_MEMBERSHIP_ID,
      reason: 'Guest said they did not order pizza.',
      stateAtRequest: 'IN_PREPARATION',
      status: 'REJECTED',
      requestedAt: now,
      decidedByMembershipId: HANA_MEMBERSHIP_ID,
      decidedAt: now,
      decisionReason: 'Kitchen had already started. Serve and charge.',
    },
  });

  await prisma.productionException.upsert({
    where: { id: 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a431' },
    update: {},
    create: {
      id: 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a431',
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      orderItemId: ORDER_ITEM_MACCHIATO_ID,
      stationId: STATION_BARISTA,
      reportedByMembershipId: MERON_MEMBERSHIP_ID,
      reasonCode: 'EQUIPMENT_FAILURE',
      reasonDetail: 'Espresso machine steam wand is down.',
      status: 'OPEN',
    },
  });

  console.log('Support session, change, cancel, and cannot-prepare seeded.');
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
