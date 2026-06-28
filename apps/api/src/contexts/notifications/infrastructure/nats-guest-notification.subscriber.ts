import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import {
  runDeduped,
  PaymentOrderSucceededV1,
  PaymentOrderRefundedV1,
  OrderStatusChangedV1,
  type DlqPublisher,
  type EventEnvelope,
  type EventSubscriber,
  type EventSubscription,
} from '@resto/events';
import { EVENT_PUBLISHER, EVENT_SUBSCRIBER } from '../../../infrastructure/nats.module';
import { SendGuestNotificationService } from '../application/send-guest-notification.service';

const PAYMENTS_CONSUMER = 'guest-notifications-payments';
const PAYMENTS_SUBJECT = 'payments.>';

const ORDER_STATUS_CONSUMER = 'guest-notifications-order-status';
const ORDER_STATUS_SUBJECT = 'ordering.order_status_changed.v1';

const MAX_DELIVER = 5;
const ACK_WAIT_MS = 30_000;
const MAX_IN_FLIGHT = 1;

@Injectable()
export class NatsGuestNotificationSubscriber
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NatsGuestNotificationSubscriber.name);
  private subscriptions: EventSubscription[] = [];

  constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber | null,
    @Inject(EVENT_PUBLISHER) private readonly dlqPublisher: DlqPublisher | null,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(SendGuestNotificationService)
    private readonly service: SendGuestNotificationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.subscriber) {
      this.logger.warn('NATS subscriber unavailable — guest notification pipeline disabled');
      return;
    }

    const paymentsHandler = async (envelope: EventEnvelope): Promise<void> => {
      await runDeduped(this.db, envelope, PAYMENTS_CONSUMER, async () => {
        await this.handlePaymentEvent(envelope);
      });
    };

    const orderStatusHandler = async (envelope: EventEnvelope): Promise<void> => {
      await runDeduped(this.db, envelope, ORDER_STATUS_CONSUMER, async () => {
        await this.handleOrderStatusEvent(envelope);
      });
    };

    for (const cfg of [
      { subject: PAYMENTS_SUBJECT, durableName: PAYMENTS_CONSUMER, handler: paymentsHandler },
      {
        subject: ORDER_STATUS_SUBJECT,
        durableName: ORDER_STATUS_CONSUMER,
        handler: orderStatusHandler,
      },
    ]) {
      const subscription = await this.subscriber.subscribe({
        subject: cfg.subject,
        durableName: cfg.durableName,
        maxInFlight: MAX_IN_FLIGHT,
        maxDeliver: MAX_DELIVER,
        ackWaitMs: ACK_WAIT_MS,
        ...(this.dlqPublisher ? { dlqPublisher: this.dlqPublisher } : {}),
        handler: cfg.handler,
      });
      this.subscriptions.push(subscription);
      this.logger.log(
        { subject: cfg.subject, durableName: cfg.durableName, maxDeliver: MAX_DELIVER },
        'Guest notification subscription started',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const subs = this.subscriptions;
    this.subscriptions = [];
    for (const sub of subs) {
      try {
        await sub.stop();
      } catch (err) {
        this.logger.warn({ err }, 'Guest notification subscription was already stopped');
      }
    }
  }

  private async handlePaymentEvent(envelope: EventEnvelope): Promise<void> {
    const succeededResult = PaymentOrderSucceededV1.payloadSchema.safeParse(envelope.payload);
    if (succeededResult.success) {
      await this.service.execute({
        orderId: succeededResult.data.orderId,
        tenantId: succeededResult.data.tenantId,
        transition: 'order_confirmation',
      });
      return;
    }

    const refundedResult = PaymentOrderRefundedV1.payloadSchema.safeParse(envelope.payload);
    if (refundedResult.success) {
      await this.service.execute({
        orderId: refundedResult.data.orderId,
        tenantId: refundedResult.data.tenantId,
        transition: 'order_refunded',
        refundAmountMinor: refundedResult.data.amountMinor,
      });
      return;
    }

    this.logger.log({ type: envelope.type }, 'Unhandled payments event type — ignoring');
  }

  private async handleOrderStatusEvent(envelope: EventEnvelope): Promise<void> {
    const result = OrderStatusChangedV1.payloadSchema.safeParse(envelope.payload);
    if (!result.success) {
      this.logger.warn({ type: envelope.type }, 'Failed to parse order_status_changed payload');
      return;
    }

    const { orderId, tenantId, newStatus } = result.data;

    if (newStatus === 'accepted') {
      await this.service.execute({ orderId, tenantId, transition: 'order_accepted' });
    } else if (newStatus === 'ready') {
      await this.service.execute({ orderId, tenantId, transition: 'order_ready' });
    }
  }
}
