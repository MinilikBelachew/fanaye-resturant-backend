import { Module } from '@nestjs/common';
import { DailyCloseModule } from '../daily-close/daily-close.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OrderItemsServedController } from './order-items-served.controller';
import {
  CancellationRequestsController,
  ChangeRequestsController,
  OrderApprovalsController,
  OrderItemMutationsController,
} from './order-item-mutations.controller';
import { OrderItemMutationsService } from './order-item-mutations.service';
import { OrdersController } from './orders.controller';
import { OrderSlaMonitorService } from './order-sla-monitor.service';
import { OrdersService } from './orders.service';
import { TableSessionOrdersController } from './table-session-orders.controller';
import { WaiterMenuController } from './waiter-menu.controller';

@Module({
  imports: [IdentityModule, RealtimeModule, DailyCloseModule, InventoryModule],
  controllers: [
    WaiterMenuController,
    OrdersController,
    TableSessionOrdersController,
    OrderItemsServedController,
    OrderItemMutationsController,
    OrderApprovalsController,
    CancellationRequestsController,
    ChangeRequestsController,
  ],
  providers: [OrdersService, OrderItemMutationsService, OrderSlaMonitorService],
  exports: [OrdersService, OrderItemMutationsService, OrderSlaMonitorService],
})
export class OrdersModule {}
