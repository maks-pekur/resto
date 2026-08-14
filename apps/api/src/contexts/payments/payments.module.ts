import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OrderingModule } from '../ordering/ordering.module';
import { PAYMENT_REPOSITORY } from './domain/ports';
import { PaymentDrizzleRepository } from './infrastructure/payment-drizzle.repository';
import { HandleStripeEventService } from './application/handle-stripe-event.service';
import { CreateCheckoutPaymentService } from './application/create-checkout-payment.service';
import { RefundOrderService } from './application/refund-order.service';
import { CancelOrderService } from './application/cancel-order.service';
import { RetryRefundService } from './application/retry-refund.service';
import { StripeWebhookController } from './interfaces/http/stripe-webhook.controller';
import { CheckoutController } from './interfaces/http/checkout.controller';
import { RefundsController } from './interfaces/http/refunds.controller';

@Module({
  imports: [TenancyModule, OrderingModule],
  controllers: [StripeWebhookController, CheckoutController, RefundsController],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: PaymentDrizzleRepository },
    HandleStripeEventService,
    CreateCheckoutPaymentService,
    RefundOrderService,
    CancelOrderService,
    RetryRefundService,
  ],
  exports: [CancelOrderService, RefundOrderService, RetryRefundService],
})
export class PaymentsModule {}
