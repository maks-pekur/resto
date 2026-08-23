import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { requireTenantContext } from '@resto/db';
import { OrderId, TenantId } from '@resto/domain';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { Permissions, RequireActiveTenant } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { CurrentOperator } from '../../../identity/interfaces/http/decorators/current-principal.decorator';
import type { OperatorPrincipal } from '../../../identity/domain/principal';
import { CancelOrderInputDto, type CancelOrderInput } from '../../application/dto';
import { CancelOrderService } from '../../application/cancel-order.service';
import { RetryRefundService } from '../../application/retry-refund.service';
import { PAYMENT_REPOSITORY, type PaymentRepository } from '../../domain/ports';
import { mapPaymentError } from './error-mapping';

const wrap = wrapWith(mapPaymentError);

const CancelOrderResponseSchema = z.object({
  canceled: z.literal(true),
  refund: z.object({
    attempted: z.boolean(),
    outcome: z.enum(['succeeded', 'failed', 'none']),
    amountMinor: z.number().int().nullable(),
  }),
});
class CancelOrderResponseDto extends createZodDto(CancelOrderResponseSchema) {}

const RetryRefundResponseSchema = z.object({
  stripeRefundId: z.string(),
  amountMinor: z.number().int(),
  fullyRefunded: z.boolean(),
});
class RetryRefundResponseDto extends createZodDto(RetryRefundResponseSchema) {}

@ApiTags('orders')
@Controller('v1/orders')
export class OrderCancelController {
  constructor(
    @Inject(CancelOrderService) private readonly cancelOrder: CancelOrderService,
    @Inject(RetryRefundService) private readonly retryRefund: RetryRefundService,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: PaymentRepository,
  ) {}

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions({ order: ['cancel'] })
  @RequireActiveTenant()
  @ApiBody({ type: CancelOrderInputDto })
  @ApiOkResponse({ type: CancelOrderResponseDto })
  cancel(
    @CurrentOperator() operator: OperatorPrincipal,
    @Param('orderId') orderId: string,
    @Body(new RestoZodValidationPipe(CancelOrderInputDto)) input: CancelOrderInput,
  ) {
    const tenantId = TenantId.parse(requireTenantContext().tenantId);
    const parsedOrderId = OrderId.parse(orderId);
    return wrap(() =>
      this.cancelOrder.execute({
        orderId: parsedOrderId,
        tenantId,
        reasonCode: input.reasonCode,
        ...(input.cancelNote !== undefined ? { cancelNote: input.cancelNote } : {}),
        actorUserId: operator.userId,
      }),
    );
  }

  @Post(':orderId/refund/retry')
  @HttpCode(HttpStatus.OK)
  @Permissions({ order: ['cancel'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: RetryRefundResponseDto })
  retry(@CurrentOperator() operator: OperatorPrincipal, @Param('orderId') orderId: string) {
    const tenantId = TenantId.parse(requireTenantContext().tenantId);
    const parsedOrderId = OrderId.parse(orderId);
    return wrap(async () => {
      const failedRefunds = await this.paymentRepo.findFailedRefundsForOrders(tenantId, [
        parsedOrderId,
      ]);
      const failedRefund = failedRefunds[0];
      if (!failedRefund) {
        throw new NotFoundException({
          code: 'payments.no_retryable_refund',
          message: `No retryable refund found for order "${parsedOrderId}".`,
        });
      }
      return this.retryRefund.execute({
        orderId: parsedOrderId,
        tenantId,
        refundRequestId: failedRefund.refundRequestId,
        actorUserId: operator.userId,
      });
    });
  }
}
