import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { requireTenantContext } from '@resto/db';
import { OrderId, TenantId } from '@resto/domain';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { Permissions, RequireActiveTenant } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { RefundInputDto, type RefundInput } from '../../application/dto';
import { RefundOrderService } from '../../application/refund-order.service';
import { mapPaymentError } from './error-mapping';

const wrap = wrapWith(mapPaymentError);

@ApiTags('orders')
@Controller('v1/orders')
export class RefundsController {
  constructor(@Inject(RefundOrderService) private readonly refundService: RefundOrderService) {}

  @Post(':orderId/refund')
  @HttpCode(HttpStatus.OK)
  @Permissions({ billing: ['update'] })
  @RequireActiveTenant()
  @ApiBody({ type: RefundInputDto })
  refundOrder(
    @Param('orderId') orderId: string,
    @Body(new RestoZodValidationPipe(RefundInputDto)) input: RefundInput,
  ) {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const parsedOrderId = OrderId.parse(orderId);
    return wrap(() =>
      this.refundService.execute({
        orderId: parsedOrderId,
        tenantId,
        ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
        reason: input.reason,
      }),
    );
  }
}
