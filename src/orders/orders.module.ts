import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OrderItemsServedController } from './order-items-served.controller';
import {
  CancellationRequestsController,
  ChangeRequestsController,
  OrderApprovalsController,
  OrderItemMutationsController,
} from './order-item-mutations.controller';
import { OrderItemMutationsService } from './order-item-mutations.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TableSessionOrdersController } from './table-session-orders.controller';
import { WaiterMenuController } from './waiter-menu.controller';

@Module({
  imports: [IdentityModule],
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
  providers: [OrdersService, OrderItemMutationsService],
  exports: [OrdersService, OrderItemMutationsService],
})
export class OrdersModule {}
