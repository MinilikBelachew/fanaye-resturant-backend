export type RestaurantRoleCode =
  | 'OWNER_ADMIN'
  | 'MANAGER'
  | 'WAITER'
  | 'CASHIER'
  | 'STATION_OPERATOR'
  | 'DISPATCHER'
  | 'STORE_MANAGER'
  | 'RECEPTIONIST';

/**
 * Canonical permission catalog. Codes are what Identity loads into
 * AuthContext.permissions and what CASL maps via applyPermissionStrings.
 * Keep aligned with runtime CASL grants in casl-ability.factory.ts.
 */
export const PERMISSIONS: Array<{ code: string; domain: string }> = [
  // Floor / tables
  { code: 'table.start_session', domain: 'TABLE' },
  { code: 'table.view_assigned', domain: 'TABLE' },
  { code: 'table.view_all', domain: 'TABLE' },
  { code: 'table.reassign', domain: 'TABLE' },
  { code: 'table.close_paid', domain: 'TABLE' },
  { code: 'floor.manage', domain: 'TABLE' },
  // Rooms / lodging
  { code: 'rooms.admin', domain: 'ROOM' },
  { code: 'rooms.operate', domain: 'ROOM' },
  { code: 'rooms.read', domain: 'ROOM' },
  // Orders
  { code: 'order.create', domain: 'ORDER' },
  { code: 'order.confirm', domain: 'ORDER' },
  { code: 'order.change_eligible', domain: 'ORDER' },
  { code: 'order.cancel_eligible', domain: 'ORDER' },
  { code: 'order.request_protected_cancel', domain: 'ORDER' },
  { code: 'order.serve', domain: 'ORDER' },
  { code: 'order.send_kitchen', domain: 'ORDER' },
  { code: 'order.update', domain: 'ORDER' },
  { code: 'waiter_menu.read', domain: 'ORDER' },
  // Stations
  { code: 'station.acknowledge', domain: 'STATION' },
  { code: 'station.start_preparation', domain: 'STATION' },
  { code: 'station.mark_ready', domain: 'STATION' },
  { code: 'station.report_cannot_prepare', domain: 'STATION' },
  { code: 'station.operate', domain: 'STATION' },
  { code: 'station.read', domain: 'STATION' },
  // Billing
  { code: 'bill.request', domain: 'BILL' },
  { code: 'bill.generate', domain: 'BILL' },
  { code: 'bill.queue_read', domain: 'BILL' },
  { code: 'bill.reopen_request', domain: 'BILL' },
  { code: 'bill.reopen_approve', domain: 'BILL' },
  // Payments
  { code: 'payment.collect_cash', domain: 'PAYMENT' },
  { code: 'payment.verify_transfer', domain: 'PAYMENT' },
  { code: 'payment.settle', domain: 'PAYMENT' },
  { code: 'payment.exception_override', domain: 'PAYMENT' },
  { code: 'payment.read', domain: 'PAYMENT' },
  { code: 'receipt.extract', domain: 'PAYMENT' },
  // Cash custody
  { code: 'cash_drop.initiate', domain: 'CASH' },
  { code: 'cash_drop.receive', domain: 'CASH' },
  { code: 'cash_drop.resolve_dispute', domain: 'CASH' },
  { code: 'cash_drop.read', domain: 'CASH' },
  { code: 'cash_pouch.read', domain: 'CASH' },
  { code: 'cashier.reconcile', domain: 'CASH' },
  // Management
  { code: 'menu.manage', domain: 'MANAGEMENT' },
  { code: 'catalog.manage', domain: 'MANAGEMENT' },
  { code: 'site.manage', domain: 'MANAGEMENT' },
  { code: 'inventory.manage', domain: 'MANAGEMENT' },
  { code: 'inventory.view', domain: 'INVENTORY' },
  { code: 'inventory.receive_purchase', domain: 'INVENTORY' },
  { code: 'inventory.transfer.send', domain: 'INVENTORY' },
  { code: 'inventory.transfer.receive', domain: 'INVENTORY' },
  { code: 'inventory.supply.request', domain: 'INVENTORY' },
  { code: 'inventory.supply.approve', domain: 'INVENTORY' },
  { code: 'inventory.produce', domain: 'INVENTORY' },
  { code: 'inventory.location.manage', domain: 'INVENTORY' },
  { code: 'station.manage', domain: 'MANAGEMENT' },
  { code: 'staff.manage', domain: 'MANAGEMENT' },
  { code: 'shift.manage', domain: 'MANAGEMENT' },
  { code: 'approval.manage', domain: 'MANAGEMENT' },
  { code: 'report.view', domain: 'MANAGEMENT' },
  { code: 'report.manage', domain: 'MANAGEMENT' },
  { code: 'dashboard.manage', domain: 'MANAGEMENT' },
  { code: 'waiter_performance.manage', domain: 'MANAGEMENT' },
  { code: 'qr_menu.manage', domain: 'MANAGEMENT' },
  { code: 'daily_close.prepare', domain: 'MANAGEMENT' },
  { code: 'daily_close.approve', domain: 'MANAGEMENT' },
  { code: 'daily_close.lock', domain: 'MANAGEMENT' },
  { code: 'audit.view', domain: 'MANAGEMENT' },
  { code: 'audit.manage', domain: 'MANAGEMENT' },
];

/**
 * Role → permission codes. Mirrors current runtime CASL grants
 * (casl-ability.factory role helpers). Business rules that stay OUT of
 * permissions: own-table, on-shift, bakery-only cashier ordering, call-pickup
 * dispatcher-only, station assignment.
 */
export const ROLE_PERMISSIONS: Record<RestaurantRoleCode, string[] | '*'> = {
  OWNER_ADMIN: '*',
  MANAGER: [
    'table.start_session',
    'table.view_assigned',
    'table.view_all',
    'table.reassign',
    'table.close_paid',
    'floor.manage',
    'rooms.admin',
    'rooms.operate',
    'rooms.read',
    'order.create',
    'order.confirm',
    'order.change_eligible',
    'order.cancel_eligible',
    'order.request_protected_cancel',
    'order.serve',
    'order.send_kitchen',
    'order.update',
    'waiter_menu.read',
    'bill.request',
    'bill.generate',
    'bill.queue_read',
    'bill.reopen_request',
    'bill.reopen_approve',
    'payment.collect_cash',
    'payment.verify_transfer',
    'payment.settle',
    'payment.exception_override',
    'payment.read',
    'receipt.extract',
    'cash_drop.receive',
    'cash_drop.resolve_dispute',
    'cash_drop.read',
    'cashier.reconcile',
    'menu.manage',
    'catalog.manage',
    'site.manage',
    'inventory.manage',
    'inventory.view',
    'inventory.receive_purchase',
    'inventory.transfer.receive',
    'inventory.supply.request',
    'station.manage',
    'staff.manage',
    'shift.manage',
    'approval.manage',
    'report.view',
    'report.manage',
    'dashboard.manage',
    'waiter_performance.manage',
    'qr_menu.manage',
    'daily_close.prepare',
    'daily_close.approve',
    'daily_close.lock',
    'audit.view',
    'audit.manage',
  ],
  WAITER: [
    'table.start_session',
    'table.view_assigned',
    'table.close_paid',
    'rooms.read',
    'rooms.operate',
    'order.create',
    'order.confirm',
    'order.change_eligible',
    'order.cancel_eligible',
    'order.request_protected_cancel',
    'order.serve',
    'order.send_kitchen',
    'order.update',
    'waiter_menu.read',
    'bill.request',
    'payment.collect_cash',
    'payment.verify_transfer',
    'payment.settle',
    'receipt.extract',
    'cash_drop.initiate',
    'cash_pouch.read',
  ],
  RECEPTIONIST: [
    'rooms.read',
    'rooms.operate',
  ],
  DISPATCHER: [
    'table.start_session',
    'table.view_assigned',
    'table.close_paid',
    'order.create',
    'order.confirm',
    'order.change_eligible',
    'order.cancel_eligible',
    'order.request_protected_cancel',
    'order.serve',
    'order.send_kitchen',
    'order.update',
    'waiter_menu.read',
    'bill.request',
    'bill.generate',
    'payment.collect_cash',
    'payment.verify_transfer',
    'payment.settle',
    'receipt.extract',
    'cash_drop.initiate',
    'cash_pouch.read',
  ],
  CASHIER: [
    'table.view_all',
    'bill.generate',
    'bill.queue_read',
    'bill.reopen_request',
    'payment.collect_cash',
    'payment.verify_transfer',
    'payment.settle',
    'payment.exception_override',
    'payment.read',
    'receipt.extract',
    'cash_drop.receive',
    'cash_drop.resolve_dispute',
    'cash_drop.read',
    'cashier.reconcile',
    'report.view',
    'daily_close.prepare',
    // Bakery counter path; API still requires serviceMode === BAKERY.
    'order.create',
    'waiter_menu.read',
  ],
  STATION_OPERATOR: [
    'station.operate',
    'station.read',
    'station.acknowledge',
    'station.start_preparation',
    'station.mark_ready',
    'station.report_cannot_prepare',
  ],
  // Main warehouse operator (tenant-level main store).
  STORE_MANAGER: [
    'inventory.view',
    'inventory.manage',
    'inventory.receive_purchase',
    'inventory.transfer.send',
    'inventory.transfer.receive',
    'inventory.supply.approve',
    'inventory.produce',
    'inventory.location.manage',
  ],
};

export const PLAN_STARTER_ID = idPlan(1);
export const PLAN_PRO_ID = idPlan(2);
export const PLAN_ENTERPRISE_ID = idPlan(3);

function idPlan(n: number) {
  return `66666666-6666-4666-8666-66666666666${n}`;
}

export const TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const TENANT_SLUG = 'mamas-kitchen';

export const BRANCHES = [
  {
    key: 'bole',
    id: '22222222-2222-4222-8222-222222222221',
    name: 'Bole',
    displayCode: 'BOLE',
  },
  {
    key: 'piassa',
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Piassa',
    displayCode: 'PIASSA',
  },
  {
    key: 'cmc',
    id: '22222222-2222-4222-8222-222222222223',
    name: 'CMC',
    displayCode: 'CMC',
  },
] as const;

export type BranchKey = (typeof BRANCHES)[number]['key'];

/** Platform + Mama's Kitchen staff. PIN is also the email-login password for restaurant staff. */
export const STAFF: Array<{
  id: string;
  email: string;
  phone: string;
  displayName: string;
  pin: string;
  platformAdmin?: boolean;
  restaurantRole?: RestaurantRoleCode;
  branchKey?: BranchKey | 'ALL';
}> = [
  {
    id: '55555555-5555-4555-8555-555555555551',
    email: 'selam@fanaye.et',
    phone: '+251911000001',
    displayName: 'Selam Bekele',
    pin: '0000',
    platformAdmin: true,
  },
  {
    id: '55555555-5555-4555-8555-555555555552',
    email: 'mama@mamas.et',
    phone: '+251911000002',
    displayName: 'Mama Abebe',
    pin: '1001',
    restaurantRole: 'OWNER_ADMIN',
    branchKey: 'ALL',
  },
  // Bole
  {
    id: '55555555-5555-4555-8555-555555555561',
    email: 'hana.bole@mamas.et',
    phone: '+251911000011',
    displayName: 'Hana Tadesse',
    pin: '2101',
    restaurantRole: 'MANAGER',
    branchKey: 'bole',
  },
  {
    id: '55555555-5555-4555-8555-555555555562',
    email: 'sara.bole@mamas.et',
    phone: '+251911000012',
    displayName: 'Sara Mekonnen',
    pin: '2102',
    restaurantRole: 'CASHIER',
    branchKey: 'bole',
  },
  {
    id: '55555555-5555-4555-8555-555555555563',
    email: 'karim.bole@mamas.et',
    phone: '+251911000013',
    displayName: 'Karim Tesfaye',
    pin: '2103',
    restaurantRole: 'WAITER',
    branchKey: 'bole',
  },
  {
    id: '55555555-5555-4555-8555-555555555564',
    email: 'dawit.bole@mamas.et',
    phone: '+251911000014',
    displayName: 'Dawit Alemu',
    pin: '2104',
    restaurantRole: 'WAITER',
    branchKey: 'bole',
  },
  {
    id: '55555555-5555-4555-8555-555555555565',
    email: 'yonas.bole@mamas.et',
    phone: '+251911000015',
    displayName: 'Yonas Girma',
    pin: '2105',
    restaurantRole: 'STATION_OPERATOR',
    branchKey: 'bole',
  },
  {
    id: '55555555-5555-4555-8555-555555555566',
    email: 'meron.bole@mamas.et',
    phone: '+251911000016',
    displayName: 'Meron Alemu',
    pin: '2106',
    restaurantRole: 'STATION_OPERATOR',
    branchKey: 'bole',
  },
  {
    id: '55555555-5555-4555-8555-555555555567',
    email: 'helen.bole@mamas.et',
    phone: '+251911000017',
    displayName: 'Helen Tadesse',
    pin: '2107',
    restaurantRole: 'DISPATCHER',
    branchKey: 'bole',
  },
  // Piassa
  {
    id: '55555555-5555-4555-8555-555555555571',
    email: 'liya.piassa@mamas.et',
    phone: '+251911000021',
    displayName: 'Liya Mekonnen',
    pin: '2201',
    restaurantRole: 'MANAGER',
    branchKey: 'piassa',
  },
  {
    id: '55555555-5555-4555-8555-555555555572',
    email: 'abel.piassa@mamas.et',
    phone: '+251911000022',
    displayName: 'Abel Kebede',
    pin: '2202',
    restaurantRole: 'CASHIER',
    branchKey: 'piassa',
  },
  {
    id: '55555555-5555-4555-8555-555555555573',
    email: 'nina.piassa@mamas.et',
    phone: '+251911000023',
    displayName: 'Nina Worku',
    pin: '2203',
    restaurantRole: 'WAITER',
    branchKey: 'piassa',
  },
  {
    id: '55555555-5555-4555-8555-555555555574',
    email: 'samuel.piassa@mamas.et',
    phone: '+251911000024',
    displayName: 'Samuel Bekele',
    pin: '2204',
    restaurantRole: 'WAITER',
    branchKey: 'piassa',
  },
  {
    id: '55555555-5555-4555-8555-555555555575',
    email: 'teddy.piassa@mamas.et',
    phone: '+251911000025',
    displayName: 'Teddy Hailu',
    pin: '2205',
    restaurantRole: 'STATION_OPERATOR',
    branchKey: 'piassa',
  },
  {
    id: '55555555-5555-4555-8555-555555555576',
    email: 'betty.piassa@mamas.et',
    phone: '+251911000026',
    displayName: 'Betty Assefa',
    pin: '2206',
    restaurantRole: 'STATION_OPERATOR',
    branchKey: 'piassa',
  },
  // CMC
  {
    id: '55555555-5555-4555-8555-555555555581',
    email: 'helen.cmc@mamas.et',
    phone: '+251911000031',
    displayName: 'Helen Desta',
    pin: '2301',
    restaurantRole: 'MANAGER',
    branchKey: 'cmc',
  },
  {
    id: '55555555-5555-4555-8555-555555555582',
    email: 'michael.cmc@mamas.et',
    phone: '+251911000032',
    displayName: 'Michael Getachew',
    pin: '2302',
    restaurantRole: 'CASHIER',
    branchKey: 'cmc',
  },
  {
    id: '55555555-5555-4555-8555-555555555583',
    email: 'Ruth.cmc@mamas.et'.toLowerCase(),
    phone: '+251911000033',
    displayName: 'Ruth Solomon',
    pin: '2303',
    restaurantRole: 'WAITER',
    branchKey: 'cmc',
  },
  {
    id: '55555555-5555-4555-8555-555555555584',
    email: 'jonas.cmc@mamas.et',
    phone: '+251911000034',
    displayName: 'Jonas Mulugeta',
    pin: '2304',
    restaurantRole: 'WAITER',
    branchKey: 'cmc',
  },
  {
    id: '55555555-5555-4555-8555-555555555585',
    email: 'kira.cmc@mamas.et',
    phone: '+251911000035',
    displayName: 'Kira Teshome',
    pin: '2305',
    restaurantRole: 'STATION_OPERATOR',
    branchKey: 'cmc',
  },
  {
    id: '55555555-5555-4555-8555-555555555586',
    email: 'omar.cmc@mamas.et',
    phone: '+251911000036',
    displayName: 'Omar Yusuf',
    pin: '2306',
    restaurantRole: 'STATION_OPERATOR',
    branchKey: 'cmc',
  },
];

export const MENU_DISHES = [
  {
    key: 'tibs',
    name: 'Beef Tibs',
    category: 'Kitchen',
    price: 320,
    station: 'KITCHEN',
    prep: 18,
  },
  {
    key: 'kitfo',
    name: 'Kitfo',
    category: 'Kitchen',
    price: 380,
    station: 'KITCHEN',
    prep: 12,
  },
  {
    key: 'shiro',
    name: 'Shiro',
    category: 'Kitchen',
    price: 180,
    station: 'KITCHEN',
    prep: 14,
  },
  {
    key: 'burger',
    name: 'House Burger',
    category: 'Kitchen',
    price: 260,
    station: 'KITCHEN',
    prep: 15,
  },
  {
    key: 'macchiato',
    name: 'Macchiato',
    category: 'Barista',
    price: 60,
    station: 'BARISTA',
    prep: 4,
  },
  {
    key: 'latte',
    name: 'Latte',
    category: 'Barista',
    price: 80,
    station: 'BARISTA',
    prep: 5,
  },
  {
    key: 'cake',
    name: 'Chocolate Cake',
    category: 'Cakes',
    price: 120,
    station: 'CAKES',
    prep: 3,
  },
  {
    key: 'cola',
    name: 'Cola',
    category: 'Soft Drinks',
    price: 45,
    station: 'SOFT_DRINKS',
    prep: 2,
  },
] as const;
