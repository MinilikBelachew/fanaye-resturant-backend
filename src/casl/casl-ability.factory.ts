import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { PLATFORM_ROLE_CODE } from '../identity/identity.constants';
import { AppAbility, AppSubject } from './casl-ability.types';

/**
 * Builds CASL abilities from IdentityContext.
 * Source of truth: DB permission codes on the session (role_permissions).
 * Platform + OWNER_ADMIN keep manage-all.
 */
@Injectable()
export class CaslAbilityFactory {
  createForUser(context: AuthContextDto): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
    const role = context.roleCode ?? 'NONE';

    const platformRoles = new Set([
      PLATFORM_ROLE_CODE,
      'PLATFORM_ADMIN',
      'SUPER_ADMIN',
    ]);

    if (platformRoles.has(role) || role === 'OWNER_ADMIN') {
      can('manage', 'all');
      return build();
    }

    this.applyPermissionStrings(can, context.permissions ?? []);
    return build();
  }

  private applyPermissionStrings(
    can: AbilityBuilder<AppAbility>['can'],
    permissions: string[],
  ) {
    /** Maps DB permission codes (seed) → CASL action/subject. */
    const map: Record<string, [Parameters<typeof can>[0], AppSubject]> = {
      // Tables / floor
      'table.start_session': ['manage', 'Table'],
      'table.view_assigned': ['manage', 'Table'],
      'table.view_all': ['manage', 'Table'],
      'table.reassign': ['manage', 'Table'],
      'table.close_paid': ['manage', 'Table'],
      'floor.manage': ['manage', 'Floor'],
      'rooms.admin': ['manage', 'Room'],
      'rooms.operate': ['operate', 'RoomStay'],
      'rooms.read': ['read', 'Room'],
      // Orders
      'order.create': ['create', 'Order'],
      'order.confirm': ['create', 'Order'],
      'order.change_eligible': ['update', 'Order'],
      'order.cancel_eligible': ['update', 'Order'],
      'order.request_protected_cancel': ['update', 'Order'],
      'order.update': ['update', 'Order'],
      'order.serve': ['serve', 'Order'],
      'order.send_kitchen': ['send_kitchen', 'Order'],
      'waiter_menu.read': ['read', 'WaiterMenu'],
      // Stations
      'station.acknowledge': ['acknowledge', 'Station'],
      'station.start_preparation': ['start_prep', 'Station'],
      'station.mark_ready': ['mark_ready', 'Station'],
      'station.report_cannot_prepare': ['report_cannot', 'Station'],
      'station.operate': ['operate', 'Station'],
      'station.read': ['read', 'Station'],
      'station.manage': ['manage', 'Station'],
      // Billing / payments
      'bill.request': ['request', 'Bill'],
      'bill.generate': ['generate', 'Bill'],
      'bill.queue_read': ['read', 'BillQueue'],
      'payment.collect_cash': ['collect', 'Payment'],
      'payment.verify_transfer': ['collect', 'Payment'],
      'payment.settle': ['collect', 'Payment'],
      'payment.exception_override': ['override', 'Payment'],
      'payment.read': ['read', 'Payment'],
      'receipt.extract': ['extract', 'Receipt'],
      // Cash
      'cash_drop.initiate': ['initiate', 'CashDrop'],
      'cash_drop.receive': ['receive', 'CashDrop'],
      'cash_drop.resolve_dispute': ['resolve', 'CashDrop'],
      'cash_drop.read': ['read', 'CashDrop'],
      'cash_pouch.read': ['read', 'CashPouch'],
      'cashier.reconcile': ['reconcile', 'CashierDrawer'],
      // Management
      'menu.manage': ['manage', 'Menu'],
      'catalog.manage': ['manage', 'Catalog'],
      'site.manage': ['manage', 'Site'],
      'inventory.manage': ['manage', 'Inventory'],
      'inventory.view': ['read', 'Inventory'],
      'inventory.receive_purchase': ['receive', 'Inventory'],
      'inventory.transfer.send': ['initiate', 'Inventory'],
      'inventory.transfer.receive': ['receive', 'Inventory'],
      'inventory.supply.request': ['request', 'Inventory'],
      'inventory.supply.approve': ['approve', 'Inventory'],
      'inventory.produce': ['create', 'Inventory'],
      'inventory.location.manage': ['manage', 'Inventory'],
      'staff.manage': ['manage', 'Staff'],
      'shift.manage': ['manage', 'Shift'],
      'approval.manage': ['manage', 'Approval'],
      'report.view': ['read', 'Report'],
      'report.manage': ['manage', 'Report'],
      'dashboard.manage': ['manage', 'Dashboard'],
      'waiter_performance.manage': ['manage', 'WaiterPerformance'],
      'qr_menu.manage': ['manage', 'QrMenuAdmin'],
      'daily_close.prepare': ['prepare', 'DailyClose'],
      'daily_close.approve': ['approve', 'DailyClose'],
      'daily_close.lock': ['lock', 'DailyClose'],
      'audit.view': ['read', 'Audit'],
      'audit.manage': ['manage', 'Audit'],
    };

    for (const code of permissions) {
      const mapped = map[code];
      if (mapped) {
        can(mapped[0], mapped[1]);
      }
    }
  }
}
