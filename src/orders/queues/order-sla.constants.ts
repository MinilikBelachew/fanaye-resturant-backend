export const ORDER_SLA_QUEUE_NAME = 'order-sla';

export const ORDER_SLA_JOB = {
  CHECK_UNACKNOWLEDGED: 'check-unacknowledged',
  CHECK_PREPARATION_DELAY: 'check-prep-delay',
} as const;

export type OrderSlaJobType =
  (typeof ORDER_SLA_JOB)[keyof typeof ORDER_SLA_JOB];

export interface ScheduleOrderSlaJobDto {
  orderItemId: string;
  tenantId: string;
  branchId: string;
  tableSessionId?: string;
  stationId?: string;
  expectedPrepMinutes: number;
  unacknowledgedMinutes?: number;
}

export function getUnackJobId(orderItemId: string): string {
  return `unack:${orderItemId}`;
}

export function getDelayJobId(orderItemId: string): string {
  return `delay:${orderItemId}`;
}
