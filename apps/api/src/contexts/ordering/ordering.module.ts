import { Module } from '@nestjs/common';
import { ORDER_REPOSITORY } from './domain/ports';
import { OrderDrizzleRepository } from './infrastructure/order-drizzle.repository';
import { CreateOrderService } from './application/create-order.service';
import { GetOrderService } from './application/get-order.service';
import { OrdersController } from './interfaces/http/orders.controller';

@Module({
  controllers: [OrdersController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: OrderDrizzleRepository },
    CreateOrderService,
    GetOrderService,
  ],
})
export class OrderingModule {}
