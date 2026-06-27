import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OrderingModule } from '../ordering/ordering.module';
import { PAYMENT_REPOSITORY } from './domain/ports';
import { PaymentDrizzleRepository } from './infrastructure/payment-drizzle.repository';
import { HandleStripeEventService } from './application/handle-stripe-event.service';
import { StripeWebhookController } from './interfaces/http/stripe-webhook.controller';

@Module({
  imports: [TenancyModule, OrderingModule],
  controllers: [StripeWebhookController],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: PaymentDrizzleRepository },
    HandleStripeEventService,
  ],
})
export class PaymentsModule {}
