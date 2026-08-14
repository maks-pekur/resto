import { describe, expect, it, vi } from 'vitest';
import type { TenantAwareDb } from '@resto/db';
import {
  buildEnvelope,
  OrderStatusChangedV1,
  PaymentOrderRefundedV1,
  PaymentOrderSucceededV1,
  type DlqPublisher,
  type EventSubscriber,
  type EventSubscription,
  type SubscribeOptions,
} from '@resto/events';
import type { SendGuestNotificationInput as ServiceInput } from '../application/send-guest-notification.service';
import { type SendGuestNotificationService } from '../application/send-guest-notification.service';
import { NatsGuestNotificationSubscriber } from './nats-guest-notification.subscriber';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ORDER_ID = '22222222-2222-2222-2222-222222222222';

const makeSubscriber = () => {
  const capturedOptions: SubscribeOptions[] = [];
  const subscriber: EventSubscriber = {
    subscribe: vi.fn((opts: SubscribeOptions): Promise<EventSubscription> => {
      capturedOptions.push(opts);
      return Promise.resolve({ stop: vi.fn((): Promise<void> => Promise.resolve()) });
    }),
    close: vi.fn((): Promise<void> => Promise.resolve()),
  };
  return { subscriber, capturedOptions };
};

const makeDlq = (): DlqPublisher => ({ publishRaw: vi.fn((): Promise<void> => Promise.resolve()) });

const makeService = () => {
  const calls: ServiceInput[] = [];
  const svc = {
    execute: vi.fn((input: ServiceInput): Promise<void> => {
      calls.push(input);
      return Promise.resolve();
    }),
    calls,
  } as unknown as SendGuestNotificationService & { calls: ServiceInput[] };
  return svc;
};

const makeDb = (): TenantAwareDb => {
  const mockTx = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(
            (): Promise<{ eventId: string }[]> => Promise.resolve([{ eventId: 'mock-event-id' }]),
          ),
        })),
      })),
    })),
  };
  return {
    withoutTenant: vi.fn((_r: string, op: (tx: unknown) => Promise<unknown>) => op(mockTx)),
  } as unknown as TenantAwareDb;
};

const buildSucceededEnvelope = () =>
  buildEnvelope(
    PaymentOrderSucceededV1,
    {
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      paymentIntentId: 'pi_test',
      chargeId: 'ch_test',
      amountMinor: 2500,
      currency: 'EUR',
    },
    { tenantId: TENANT_ID },
  );

const buildRefundedEnvelope = () =>
  buildEnvelope(
    PaymentOrderRefundedV1,
    {
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      refundId: 're_test',
      amountMinor: 1250,
      fullyRefunded: false,
    },
    { tenantId: TENANT_ID },
  );

const buildOrderStatusEnvelope = (newStatus: string) =>
  buildEnvelope(
    OrderStatusChangedV1,
    {
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      locationId: '00000000-0000-0000-0000-000000000099',
      previousStatus: 'paid',
      newStatus,
      actorUserId: null,
    },
    { tenantId: TENANT_ID },
  );

const getOptsForSubject = (
  capturedOptions: SubscribeOptions[],
  subject: string,
): SubscribeOptions => {
  const opts = capturedOptions.find((o) => o.subject === subject);
  if (!opts) throw new Error(`No subscription found for subject: ${subject}`);
  return opts;
};

describe('NatsGuestNotificationSubscriber', () => {
  describe('B4 / AUTH-10: subscription configuration', () => {
    it('subscribes with explicit maxDeliver and passes dlqPublisher', async () => {
      const { subscriber, capturedOptions } = makeSubscriber();
      const dlq = makeDlq();
      const sub = new NatsGuestNotificationSubscriber(subscriber, dlq, makeDb(), makeService());
      await sub.onApplicationBootstrap();

      expect(capturedOptions.length).toBeGreaterThanOrEqual(1);
      for (const opts of capturedOptions) {
        expect(opts.maxDeliver).toBeDefined();
        expect(typeof opts.maxDeliver).toBe('number');
        expect(opts.maxDeliver ?? 0).toBeGreaterThan(0);
        expect(opts.dlqPublisher).toBe(dlq);
      }
    });

    it('subscribes to payments.> subject', async () => {
      const { subscriber, capturedOptions } = makeSubscriber();
      const sub = new NatsGuestNotificationSubscriber(
        subscriber,
        makeDlq(),
        makeDb(),
        makeService(),
      );
      await sub.onApplicationBootstrap();

      expect(capturedOptions.map((o) => o.subject)).toContain('payments.>');
    });

    it('subscribes to ordering.order_status_changed.v1', async () => {
      const { subscriber, capturedOptions } = makeSubscriber();
      const sub = new NatsGuestNotificationSubscriber(
        subscriber,
        makeDlq(),
        makeDb(),
        makeService(),
      );
      await sub.onApplicationBootstrap();

      expect(capturedOptions.map((o) => o.subject)).toContain('ordering.order_status_changed.v1');
    });

    it('does nothing when subscriber is null', async () => {
      const svc = makeService();
      const sub = new NatsGuestNotificationSubscriber(null, makeDlq(), makeDb(), svc);
      await expect(sub.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(svc.execute).not.toHaveBeenCalled();
    });
  });

  describe('GNOTIF-01: payment succeeded → order_confirmation', () => {
    it('calls service with transition=order_confirmation and orderId', async () => {
      const { subscriber, capturedOptions } = makeSubscriber();
      const svc = makeService();
      const sub = new NatsGuestNotificationSubscriber(subscriber, makeDlq(), makeDb(), svc);
      await sub.onApplicationBootstrap();

      await getOptsForSubject(capturedOptions, 'payments.>').handler(buildSucceededEnvelope());

      expect(svc.execute).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: ORDER_ID, transition: 'order_confirmation' }),
      );
    });
  });

  describe('GNOTIF-03: payment refunded → order_refunded', () => {
    it('calls service with transition=order_refunded and refundAmountMinor', async () => {
      const { subscriber, capturedOptions } = makeSubscriber();
      const svc = makeService();
      const sub = new NatsGuestNotificationSubscriber(subscriber, makeDlq(), makeDb(), svc);
      await sub.onApplicationBootstrap();

      await getOptsForSubject(capturedOptions, 'payments.>').handler(buildRefundedEnvelope());

      expect(svc.execute).toHaveBeenCalledWith(
        expect.objectContaining({ transition: 'order_refunded', refundAmountMinor: 1250 }),
      );
    });
  });

  describe('GNOTIF-02: order_status_changed (Phase-10 machinery)', () => {
    it('fires order_accepted when newStatus=accepted', async () => {
      const { subscriber, capturedOptions } = makeSubscriber();
      const svc = makeService();
      const sub = new NatsGuestNotificationSubscriber(subscriber, makeDlq(), makeDb(), svc);
      await sub.onApplicationBootstrap();

      await getOptsForSubject(capturedOptions, 'ordering.order_status_changed.v1').handler(
        buildOrderStatusEnvelope('accepted'),
      );

      expect(svc.execute).toHaveBeenCalledWith(
        expect.objectContaining({ transition: 'order_accepted' }),
      );
    });

    it('fires order_ready when newStatus=ready', async () => {
      const { subscriber, capturedOptions } = makeSubscriber();
      const svc = makeService();
      const sub = new NatsGuestNotificationSubscriber(subscriber, makeDlq(), makeDb(), svc);
      await sub.onApplicationBootstrap();

      await getOptsForSubject(capturedOptions, 'ordering.order_status_changed.v1').handler(
        buildOrderStatusEnvelope('ready'),
      );

      expect(svc.execute).toHaveBeenCalledWith(
        expect.objectContaining({ transition: 'order_ready' }),
      );
    });

    it('does not call service for unhandled statuses', async () => {
      const { subscriber, capturedOptions } = makeSubscriber();
      const svc = makeService();
      const sub = new NatsGuestNotificationSubscriber(subscriber, makeDlq(), makeDb(), svc);
      await sub.onApplicationBootstrap();

      await getOptsForSubject(capturedOptions, 'ordering.order_status_changed.v1').handler(
        buildOrderStatusEnvelope('preparing'),
      );

      expect(svc.execute).not.toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('stops all subscriptions on shutdown', async () => {
      const { subscriber } = makeSubscriber();
      const sub = new NatsGuestNotificationSubscriber(
        subscriber,
        makeDlq(),
        makeDb(),
        makeService(),
      );
      await sub.onApplicationBootstrap();
      await sub.onApplicationShutdown();

      for (const result of vi.mocked(subscriber.subscribe).mock.results) {
        const resolved = await (result.value as Promise<EventSubscription>);
        expect(resolved.stop).toHaveBeenCalled();
      }
    });
  });
});
