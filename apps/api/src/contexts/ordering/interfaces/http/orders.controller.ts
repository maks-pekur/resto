import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { Public, RequireActiveTenant } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { CreateOrderInputDto, OrderResponseSchema } from '../../application/dto';
import { CreateOrderService } from '../../application/create-order.service';
import { mapOrderError } from './error-mapping';

const wrap = wrapWith(mapOrderError);

class OrderResponseDto extends createZodDto(OrderResponseSchema) {}

@ApiTags('ordering')
@Public()
@Controller('v1/orders')
export class OrdersController {
  // Explicit @Inject: esbuild/tsx omit design:paramtypes, so bare class
  // injection resolves to undefined at runtime (project-wide convention).
  constructor(@Inject(CreateOrderService) private readonly createOrder: CreateOrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireActiveTenant()
  @ApiBody({ type: CreateOrderInputDto })
  @ApiCreatedResponse({ type: OrderResponseDto })
  create(
    @Body(new RestoZodValidationPipe(CreateOrderInputDto)) input: CreateOrderInputDto,
  ): Promise<{ orderId: string; orderNumber: string }> {
    return wrap(() => this.createOrder.execute(input));
  }
}
