import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OrderingModule } from '../ordering/ordering.module';
import { PAYMENT_REPOSITORY, TRANSACTION_READER } from './domain/ports';
import { PaymentDrizzleRepository } from './infrastructure/payment-drizzle.repository';
import { TransactionDrizzleReader } from './infrastructure/transaction-drizzle.reader';
import { ListTransactionsService } from './application/list-transactions.service';
import { CountFailedRefundsService } from './application/count-failed-refunds.service';
import { TransactionsController } from './interfaces/http/transactions.controller';
import { HandleStripeEventService } from './application/handle-stripe-event.service';
import { CreateCheckoutPaymentService } from './application/create-checkout-payment.service';
import { RefundOrderService } from './application/refund-order.service';
import { CancelOrderService } from './application/cancel-order.service';
import { RetryRefundService } from './application/retry-refund.service';
import { StripeWebhookController } from './interfaces/http/stripe-webhook.controller';
import { CheckoutController } from './interfaces/http/checkout.controller';
import { RefundsController } from './interfaces/http/refunds.controller';
import { OrderCancelController } from './interfaces/http/order-cancel.controller';

@Module({
  imports: [TenancyModule, OrderingModule],
  controllers: [
    StripeWebhookController,
    CheckoutController,
    RefundsController,
    OrderCancelController,
    TransactionsController,
  ],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: PaymentDrizzleRepository },
    { provide: TRANSACTION_READER, useClass: TransactionDrizzleReader },
    ListTransactionsService,
    CountFailedRefundsService,
    HandleStripeEventService,
    CreateCheckoutPaymentService,
    RefundOrderService,
    CancelOrderService,
    RetryRefundService,
  ],
  exports: [CancelOrderService, RefundOrderService, RetryRefundService],
})
export class PaymentsModule {}
