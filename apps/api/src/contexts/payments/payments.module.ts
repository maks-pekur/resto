import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OrderingModule } from '../ordering/ordering.module';
import { PAYMENT_REPOSITORY } from './domain/ports';
import { PaymentDrizzleRepository } from './infrastructure/payment-drizzle.repository';
import { HandleStripeEventService } from './application/handle-stripe-event.service';
import { CreateCheckoutPaymentService } from './application/create-checkout-payment.service';
import { StripeWebhookController } from './interfaces/http/stripe-webhook.controller';
import { CheckoutController } from './interfaces/http/checkout.controller';

@Module({
  imports: [TenancyModule, OrderingModule],
  controllers: [StripeWebhookController, CheckoutController],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: PaymentDrizzleRepository },
    HandleStripeEventService,
    CreateCheckoutPaymentService,
  ],
})
export class PaymentsModule {}
