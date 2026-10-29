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
  MENU_ITEM_AVAILABILITY: 'menu.item.availability',
  TICKET_UNACKNOWLEDGED: 'ticket.unacknowledged',
  ITEM_DELAYED: 'item.delayed',
  TICKET_STALE: 'ticket.stale',
  SESSION_IDLE: 'session.idle',
  RUSH_MODE_TOGGLED: 'branch.rush_mode.toggled',
  LEAVE_REQUEST_CREATED: 'leave.request.created',
  LEAVE_REQUEST_DECIDED: 'leave.request.decided',
  INVENTORY_SUPPLY_REQUEST_CREATED: 'inventory.supply_request.created',
  INVENTORY_SUPPLY_REQUEST_APPROVED: 'inventory.supply_request.approved',
  INVENTORY_SUPPLY_REQUEST_PREPARING: 'inventory.supply_request.preparing',
  INVENTORY_SUPPLY_REQUEST_DISPATCHED: 'inventory.supply_request.dispatched',
  INVENTORY_SUPPLY_REQUEST_REJECTED: 'inventory.supply_request.rejected',
  INVENTORY_TRANSFER_SENT: 'inventory.transfer.sent',
  INVENTORY_TRANSFER_RECEIVED: 'inventory.transfer.received',
  INVENTORY_TRANSFER_REJECTED: 'inventory.transfer.rejected',
  INVENTORY_MATERIAL_CREATED: 'inventory.material.created',
  MATERIAL_ISSUE_PENDING: 'material.issue.pending',
  MATERIAL_ISSUE_ISSUED: 'material.issue.issued',
  MATERIAL_ISSUE_RETURNED: 'material.issue.returned',
  MATERIAL_ISSUE_APPROVED: 'material.issue.approved',
  MATERIAL_ISSUE_DISPUTED: 'material.issue.disputed',
  OUTSIDE_ORDER_OPENED: 'outside_order.opened',
  OUTSIDE_ORDER_CLOSED: 'outside_order.closed',
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
