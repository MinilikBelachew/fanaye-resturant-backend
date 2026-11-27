export interface SyncTableConfig {
  table: string;
  pkColumns: string[];
  hasTenantId: boolean;
  allowPushToCloud: boolean;
  allowPullToDesktop: boolean;
  /** Optional parent lookup for tables without a direct tenant_id column */
  tenantLookup?: {
    parentTable: string;
    fkCol: string;
    parentPkCol?: string;
  };
}

/**
 * Single source of truth for two-way offline <-> cloud database synchronization.
 * Ordered strictly parent-before-child so PostgreSQL foreign keys succeed on insert/upsert,
 * and reversed automatically for deletes.
 */
export const SYNC_TABLE_REGISTRY: SyncTableConfig[] = [
  // 1. Files & branches
  {
    table: 'file',
    pkColumns: ['id'],
    hasTenantId: false,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'branches',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'tenant_sites',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },

  // 2. Staff, credentials & permissions
  {
    table: 'app_users',
    pkColumns: ['id'],
    hasTenantId: false,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'user_credentials',
    pkColumns: ['id'],
    hasTenantId: false,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'tenant_staff_memberships',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'branch_staff_assignments',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'staff_role_assignments',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'shift_definitions',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'shift_assignments',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'staff_day_shifts',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'leave_types',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'staff_leave_balances',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'staff_leave_requests',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'payroll_runs',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'payroll_lines',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },

  // 3. Kitchen stations
  {
    table: 'preparation_stations',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'station_staff_assignments',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'station_fallback_configurations',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },

  // 4. Menus, categories, modifiers & items
  {
    table: 'menus',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'menu_periods',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'menu_categories',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'modifier_groups',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'modifier_options',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'menu_items',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'menu_item_period_assignments',
    pkColumns: ['menu_item_id', 'menu_period_id'],
    hasTenantId: false,
    allowPushToCloud: true,
    allowPullToDesktop: true,
    tenantLookup: {
      parentTable: 'menu_items',
      fkCol: 'menu_item_id',
      parentPkCol: 'id',
    },
  },
  {
    table: 'menu_item_modifier_assignments',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'item_availability_overrides',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'tenant_settings',
    pkColumns: ['tenant_id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'branch_settings',
    pkColumns: ['branch_id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },

  // 5. Floor, tables & rooms
  {
    table: 'table_locations',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'dining_tables',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'hotel_rooms',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'room_stays',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'stay_meal_entitlements',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },

  // 6. Drivers, vendors & inventory setup
  {
    table: 'drivers',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'vendors',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_units',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_unit_conversions',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_locations',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_categories',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_ingredients',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_materials',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'menu_item_recipe_lines',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_yield_tests',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_stock_balances',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_material_balances',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_supply_requests',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_supply_request_lines',
    pkColumns: ['id'],
    hasTenantId: false,
    allowPushToCloud: true,
    allowPullToDesktop: true,
    tenantLookup: {
      parentTable: 'inventory_supply_requests',
      fkCol: 'request_id',
      parentPkCol: 'id',
    },
  },
  {
    table: 'inventory_push_drops',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_transfers',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_transfer_lines',
    pkColumns: ['id'],
    hasTenantId: false,
    allowPushToCloud: true,
    allowPullToDesktop: true,
    tenantLookup: {
      parentTable: 'inventory_transfers',
      fkCol: 'transfer_id',
      parentPkCol: 'id',
    },
  },
  {
    table: 'inventory_production_batches',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_production_inputs',
    pkColumns: ['id'],
    hasTenantId: false,
    allowPushToCloud: true,
    allowPullToDesktop: true,
    tenantLookup: {
      parentTable: 'inventory_production_batches',
      fkCol: 'batch_id',
      parentPkCol: 'id',
    },
  },
  {
    table: 'inventory_count_sessions',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_count_lines',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },

  // 7. Operational sessions & floor coverage (depends on shift_sessions)
  {
    table: 'shift_sessions',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'dining_table_shift_coverages',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'room_floor_coverages',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'cashier_financial_sessions',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'table_sessions',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'table_assignments',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'room_sessions',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'outside_orders',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },

  // 8. Orders & kitchen execution
  {
    table: 'orders',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'order_items',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'order_item_modifiers',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'order_change_requests',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'cancellation_requests',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'production_exceptions',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'order_material_issues',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'order_material_issue_lines',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'inventory_ledger_entries',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },

  // 9. Billing, cash, finance & daily close
  {
    table: 'bill_requests',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'bills',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'bill_lines',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'bill_reopen_requests',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'payments',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'transfer_receipts',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'finance_categories',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'manual_finance_entries',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'cash_drops',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'cash_drop_disputes',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'cash_ledger_entries',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'cashier_reconciliations',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'operational_daily_closes',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'daily_close_waiter_lines',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'daily_close_station_lines',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },

  // 10. Feedback, biometrics, marketing, notifications, audit & cloud-controlled entitlements
  {
    table: 'customer_feedback',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'staff_biometric_profiles',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'customer_biometric_profiles',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'customer_visit_logs',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'marketing_campaigns',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'notifications',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  {
    table: 'audit_events',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: true,
    allowPullToDesktop: true,
  },
  // Cloud-controlled billing/license tables: pull-only (desktop cannot overwrite Cloud entitlements)
  {
    table: 'tenant_entitlements',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: false,
    allowPullToDesktop: true,
  },
  {
    table: 'tenant_subscriptions',
    pkColumns: ['id'],
    hasTenantId: true,
    allowPushToCloud: false,
    allowPullToDesktop: true,
  },
];

export const SYNC_TABLE_MAP = new Map<string, SyncTableConfig>(
  SYNC_TABLE_REGISTRY.map((entry) => [entry.table, entry]),
);

export const SYNC_TABLE_ORDER_INDEX = new Map<string, number>(
  SYNC_TABLE_REGISTRY.map((entry, idx) => [entry.table, idx]),
);

export function classifySyncTableCategory(
  tableName: string,
): 'menusAndCatalog' | 'ordersAndBills' | 'filesAndMedia' | 'other' {
  if (tableName === 'file') return 'filesAndMedia';
  if (
    tableName.startsWith('menu') ||
    tableName.startsWith('modifier') ||
    tableName === 'item_availability_overrides'
  ) {
    return 'menusAndCatalog';
  }
  if (
    tableName.startsWith('order') ||
    tableName.startsWith('bill') ||
    tableName === 'payments' ||
    tableName === 'transfer_receipts' ||
    tableName === 'outside_orders' ||
    tableName === 'table_sessions' ||
    tableName === 'room_sessions' ||
    tableName === 'shift_sessions'
  ) {
    return 'ordersAndBills';
  }
  return 'other';
}
