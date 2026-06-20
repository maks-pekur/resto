import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RequireActiveTenantGuard } from '../../shared/auth/require-active-tenant.guard';
import { MENU_PRICING_PORT, ORDER_REPOSITORY } from './domain/ports';
import { OrderDrizzleRepository } from './infrastructure/order-drizzle.repository';
import { CatalogMenuPricingAdapter } from './infrastructure/catalog-menu-pricing.adapter';
import { CreateOrderService } from './application/create-order.service';
import { GetOrderService } from './application/get-order.service';
import { OrdersController } from './interfaces/http/orders.controller';

@Module({
  imports: [TenancyModule, CatalogModule],
  controllers: [OrdersController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: OrderDrizzleRepository },
    { provide: MENU_PRICING_PORT, useClass: CatalogMenuPricingAdapter },
    CreateOrderService,
    GetOrderService,
    RequireActiveTenantGuard,
  ],
})
export class OrderingModule {}
