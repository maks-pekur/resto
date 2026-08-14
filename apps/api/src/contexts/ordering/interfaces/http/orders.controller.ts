import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { BrandNeutral, Public, RequireActiveTenant } from '../../../../shared/auth';
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

// RESEARCH E.17 / CONTEXT.md Claude's Discretion: GET /v1/orders/:id/status
// stays @Public() -- the order id is a randomUUID(), a 122-bit random
// capability token in all but name, and a second signed token would add
// real friction to D-16's entire value ("share this link, watch it
// update") for little extra security. The mitigation for an already-public
// endpoint growing over time (Skeptic MED-7) is NOT authentication, it is
// freezing the response shape: exactly the nine fields below, no guest
// PII, no internal operator identities (customerName/Phone/Email,
// cancelNote, acceptedByUserId/canceledByUserId are all deliberately
// excluded). Do not add a field here without revisiting this posture.
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
@BrandNeutral()
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
        // D-15 / RESEARCH E.16: etaAt is the operator-set ready time
        // (Order.accept()'s etaAt param), never scheduledFor -- that field
        // means "the guest's requested pickup/delivery time" and is null
        // for every ASAP order. The two must never be conflated.
        etaAt: snap.etaAt ? snap.etaAt.toISOString() : null,
        fulfillmentMode: snap.fulfillmentMode,
        cancelReason: snap.cancelReason,
        canceledFromStatus: snap.canceledFromStatus,
      };
    });
  }
}
