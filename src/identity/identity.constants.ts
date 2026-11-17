export const RESTAURANT_ROLE_CODES = [
  'OWNER_ADMIN',
  'MANAGER',
  'WAITER',
  'CASHIER',
  'STATION_OPERATOR',
  'DISPATCHER',
  'STORE_MANAGER',
  'DRIVER',
] as const;

export type RestaurantRoleCode = (typeof RESTAURANT_ROLE_CODES)[number];

export const PLATFORM_ROLE_CODE = 'PLATFORM_SUPER_ADMIN' as const;
export type PlatformRoleCode = typeof PLATFORM_ROLE_CODE;

export const MARKET_REPORTER_ROLE_CODE = 'MARKET_REPORTER' as const;
export type MarketReporterRoleCode = typeof MARKET_REPORTER_ROLE_CODE;
