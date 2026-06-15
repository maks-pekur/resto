import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RequireActiveTenantGuard } from '../../shared/auth/require-active-tenant.guard';
import { ORDER_REPOSITORY } from './domain/ports';
import { OrderDrizzleRepository } from './infrastructure/order-drizzle.repository';
import { CreateOrderService } from './application/create-order.service';
import { GetOrderService } from './application/get-order.service';
import { OrdersController } from './interfaces/http/orders.controller';

@Module({
  imports: [TenancyModule],
  controllers: [OrdersController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: OrderDrizzleRepository },
    CreateOrderService,
    GetOrderService,
    RequireActiveTenantGuard,
  ],
})
export class OrderingModule {}
