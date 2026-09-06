import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RequireActiveTenantGuard } from '../../shared/auth/require-active-tenant.guard';
import {
  MENU_PRICING_PORT,
  ORDER_FEED_REPOSITORY,
  ORDER_FEEDBACK_REPOSITORY,
  ORDER_REPOSITORY,
  ORDER_SEQUENCE_PORT,
  ORDER_TABLE_LOOKUP_PORT,
} from './domain/ports';
import { PAYMENT_REPOSITORY } from '../payments/domain/ports';
import { OrderDrizzleRepository } from './infrastructure/order-drizzle.repository';
import { OrderFeedbackDrizzleRepository } from './infrastructure/order-feedback-drizzle.repository';
import { SubmitOrderFeedbackService } from './application/submit-order-feedback.service';
import { OrderSequenceDrizzleRepository } from './infrastructure/order-sequence-drizzle.repository';
import { OrderFeedDrizzleRepository } from './infrastructure/order-feed-drizzle.repository';
import { CatalogMenuPricingAdapter } from './infrastructure/catalog-menu-pricing.adapter';
import { TenancyTableLookupAdapter } from './infrastructure/tenancy-table-lookup.adapter';
import { PaymentDrizzleRepository } from '../payments/infrastructure/payment-drizzle.repository';
import { CreateOrderService } from './application/create-order.service';
import { GetOrderService } from './application/get-order.service';
import { ListMyOrdersService } from './application/list-my-orders.service';
import { AcceptOrderService } from './application/accept-order.service';
import { AdvanceOrderStatusService } from './application/advance-order-status.service';
import { ListOrdersService } from './application/list-orders.service';
import { CountOrdersService } from './application/count-orders.service';
import { GetOrderDetailService } from './application/get-order-detail.service';
import { OrdersController } from './interfaces/http/orders.controller';
import { OperatorOrdersController } from './interfaces/http/operator-orders.controller';

@Module({
  imports: [TenancyModule, CatalogModule],
  controllers: [OrdersController, OperatorOrdersController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: OrderDrizzleRepository },
    { provide: ORDER_FEEDBACK_REPOSITORY, useClass: OrderFeedbackDrizzleRepository },
    SubmitOrderFeedbackService,
    { provide: MENU_PRICING_PORT, useClass: CatalogMenuPricingAdapter },
    { provide: ORDER_TABLE_LOOKUP_PORT, useClass: TenancyTableLookupAdapter },
    { provide: ORDER_SEQUENCE_PORT, useClass: OrderSequenceDrizzleRepository },
    { provide: ORDER_FEED_REPOSITORY, useClass: OrderFeedDrizzleRepository },
    { provide: PAYMENT_REPOSITORY, useClass: PaymentDrizzleRepository },
    CreateOrderService,
    GetOrderService,
    ListMyOrdersService,
    AcceptOrderService,
    AdvanceOrderStatusService,
    ListOrdersService,
    CountOrdersService,
    GetOrderDetailService,
    RequireActiveTenantGuard,
  ],
  exports: [
    ORDER_REPOSITORY,
    GetOrderService,
    ListMyOrdersService,
    AcceptOrderService,
    AdvanceOrderStatusService,
    ListOrdersService,
    GetOrderDetailService,
  ],
})
export class OrderingModule {}
