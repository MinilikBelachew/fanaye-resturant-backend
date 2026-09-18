export const OPS_NOTIFY_EVENT = 'ops.notify' as const;

export const OpsEventType = {
  ITEM_READY: 'item.ready',
  TICKET_QUEUED: 'ticket.queued',
  TICKET_UPDATED: 'ticket.updated',
  BILL_REQUEST_CREATED: 'bill.request.created',
  BILL_READY: 'bill.ready',
  CASH_DROP_PENDING: 'cash_drop.pending',
  CASH_DROP_RESOLVED: 'cash_drop.resolved',
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_DECIDED: 'approval.decided',
  PRODUCTION_EXCEPTION: 'production.exception',
  GUEST_ORDER_PLACED: 'guest.order_placed',
  GUEST_SERVICE_REQUEST: 'guest.service_request',
  FLOOR_UPDATED: 'floor.updated',
  STATION_STATUS_CHANGED: 'station.status.changed',
} as const;

export type OpsEventTypeName = (typeof OpsEventType)[keyof typeof OpsEventType];

export type OpsSeverity = 'INFO' | 'ATTENTION' | 'URGENT';

export interface OpsNotifyPayload {
  type: OpsEventTypeName;
  tenantId: string;
  branchId: string;
  severity: OpsSeverity;
  title: string;
  body?: string | null;
  /** Persist a Notification row for this recipient when set. */
  recipientMembershipId?: string | null;
  /** Extra socket fan-out beyond the recipient. */
  rooms?: string[];
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  payload?: Record<string, unknown> | null;
  /** When set, skip DB write (already persisted). */
  notificationId?: string | null;
  createdAt?: string;
}
