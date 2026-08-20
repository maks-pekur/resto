import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { LocationNeutral, Public, RequireActiveTenant } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import {
  CreateOrderInputDto,
  OrderResponseSchema,
  type OrderResponse,
} from '../../application/dto';
import { CreateOrderService } from '../../application/create-order.service';
import { GetOrderService } from '../../application/get-order.service';
import { mapOrderError } from './error-mapping';

const wrap = wrapWith(mapOrderError);

class OrderResponseDto extends createZodDto(OrderResponseSchema) {}

const OrderStatusResponseSchema = z.object({
  status: z.string(),
  shortNumber: z.number().int().nullable(),
  orderNumber: z.string(),
  total: z.string(),
  currency: z.string(),
  etaAt: z.string().datetime({ offset: true }).nullable(),
  fulfillmentMode: z.enum(['dine_in', 'pickup', 'delivery']),
  cancelReason: z.string().nullable(),
  canceledFromStatus: z.string().nullable(),
});
type OrderStatusResponse = z.infer<typeof OrderStatusResponseSchema>;
class OrderStatusResponseDto extends createZodDto(OrderStatusResponseSchema) {}

@ApiTags('ordering')
@Public()
@LocationNeutral()
@Controller('v1/orders')
export class OrdersController {
  constructor(
    @Inject(CreateOrderService) private readonly createOrder: CreateOrderService,
    @Inject(GetOrderService) private readonly getOrder: GetOrderService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireActiveTenant()
  @ApiBody({ type: CreateOrderInputDto })
  @ApiCreatedResponse({ type: OrderResponseDto })
  create(
    @Body(new RestoZodValidationPipe(CreateOrderInputDto)) input: CreateOrderInputDto,
  ): Promise<OrderResponse> {
    return wrap(() => this.createOrder.execute(input));
  }

  @Get(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequireActiveTenant()
  @ApiOkResponse({ type: OrderStatusResponseDto })
  getStatus(@Param('id') id: string): Promise<OrderStatusResponse> {
    return wrap(async () => {
      const snap = await this.getOrder.execute({ orderId: id });
      return {
        status: snap.status,
        shortNumber: snap.shortNumber,
        orderNumber: snap.orderNumber,
        total: snap.total,
        currency: snap.currency,
        etaAt: snap.etaAt ? snap.etaAt.toISOString() : null,
        fulfillmentMode: snap.fulfillmentMode,
        cancelReason: snap.cancelReason,
        canceledFromStatus: snap.canceledFromStatus,
      };
    });
  }
}
