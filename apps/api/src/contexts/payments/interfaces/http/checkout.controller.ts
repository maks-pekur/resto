import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { BrandNeutral, Public, RequireActiveTenant } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import {
  CreatePaymentIntentInputDto,
  CreatePaymentIntentResponseSchema,
  type CreatePaymentIntentInput,
  type CreatePaymentIntentResponse,
} from '../../application/dto';
import { CreateCheckoutPaymentService } from '../../application/create-checkout-payment.service';
import { mapPaymentError } from './error-mapping';

const wrap = wrapWith(mapPaymentError);

class CreatePaymentIntentResponseDto extends createZodDto(CreatePaymentIntentResponseSchema) {}

@ApiTags('checkout')
@Public()
@BrandNeutral()
@Controller('v1/checkout')
export class CheckoutController {
  constructor(
    @Inject(CreateCheckoutPaymentService)
    private readonly checkoutService: CreateCheckoutPaymentService,
  ) {}

  @Post('payment-intent')
  @HttpCode(HttpStatus.OK)
  @RequireActiveTenant()
  @ApiBody({ type: CreatePaymentIntentInputDto })
  @ApiOkResponse({ type: CreatePaymentIntentResponseDto })
  createPaymentIntent(
    @Body(new RestoZodValidationPipe(CreatePaymentIntentInputDto)) input: CreatePaymentIntentInput,
  ): Promise<CreatePaymentIntentResponse> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    return wrap(() => this.checkoutService.execute({ orderId: input.orderId, tenantId }));
  }
}
