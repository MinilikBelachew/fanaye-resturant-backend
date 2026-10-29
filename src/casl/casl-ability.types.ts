import { MongoAbility } from '@casl/ability';

/**
 * Actions used across Fanaye services.
 * Keep in sync with seeded permission intent + current runtime allowlists.
 */
export type AppAction =
  | 'manage'
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'request'
  | 'generate'
  | 'collect'
  | 'extract'
  | 'initiate'
  | 'receive'
  | 'resolve'
  | 'reconcile'
  | 'prepare'
  | 'approve'
  | 'lock'
  | 'operate'
  | 'acknowledge'
  | 'start_prep'
  | 'mark_ready'
  | 'report_cannot'
  | 'serve'
  | 'send_kitchen'
  | 'override'
  | 'assign'
  | 'issue'
  | 'return';

/**
 * Domain subjects. Prefer coarse subjects so migration stays readable.
 */
export type AppSubject =
  | 'all'
  | 'Menu'
  | 'Catalog'
  | 'Site'
  | 'Inventory'
  | 'Order'
  | 'WaiterMenu'
  | 'Bill'
  | 'BillQueue'
  | 'Payment'
  | 'Receipt'
  | 'CashDrop'
  | 'CashPouch'
  | 'CashierDrawer'
  | 'Table'
  | 'Floor'
  | 'Room'
  | 'RoomStay'
  | 'RoomSession'
  | 'Station'
  | 'Staff'
  | 'Shift'
  | 'Report'
  | 'Dashboard'
  | 'DailyClose'
  | 'Audit'
  | 'WaiterPerformance'
  | 'Approval'
  | 'QrMenuAdmin'
  | 'InventoryMaterial'
  | 'OutsideOrder'
  | 'Finance';

export type AppAbility = MongoAbility<[AppAction, AppSubject]>;
