import pino from 'pino';
import {
  AckPolicy,
  connect,
  DeliverPolicy,
  type ConnectionOptions,
  type ConsumerConfig,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
} from 'nats';
import type { TenantAwareDb } from '@resto/db';
import { EventEnvelope, buildEnvelope } from '../envelope';
import {
  IdentityEmailDispatchFailedV1,
  type IdentityEmailDispatchFailedV1Payload,
} from '../contracts/identity';
import { appendToOutbox } from '../outbox/repository';
import type { DlqPublisher, EventSubscriber, EventSubscription, SubscribeOptions } from '../ports';

const logger = pino({
  name: 'events.nats-subscriber',
  level: process.env.LOG_LEVEL ?? 'info',
  base: { pkg: '@resto/events' },
});

/** AUTH-10 D-19 defaults from packages/events/CLAUDE.md. */
const DEFAULT_MAX_DELIVER = 5;
const DEFAULT_ACK_WAIT_MS = 30_000;
const DEFAULT_MAX_IN_FLIGHT = 10;
const NS_PER_MS = 1_000_000;

/** Whether the inner DLQ decision routes to DLQ or NAKs for retry. */
export type DlqDecision = 'ROUTE_TO_DLQ' | 'NAK';

/**
 * AUTH-10: compute the DLQ decision from the broker's delivery count
 * and the configured `maxDeliver`. Terminal redelivery (`deliveryCount
 * >= maxDeliver`) routes to DLQ; everything else NAKs for redelivery.
 *
 * Pure function for testability — no `msg`, no `subject`, no side effects.
 */
export const computeDlqAction = (input: {
  readonly deliveryCount: number;
  readonly maxDeliver: number;
}): DlqDecision => {
  return input.deliveryCount >= input.maxDeliver ? 'ROUTE_TO_DLQ' : 'NAK';
};

/**
 * AUTH-10 D-19 / RESEARCH Open Q3 RESOLVED: one DLQ subject per source
 * subject (NOT a single bucket). Prefix the original subject literally.
 */
export const buildDlqSubject = (originalSubject: string): string => {
  return `dlq.${originalSubject}`;
};

/**
 * Build the JetStream `ConsumerConfig` for `consumers.add()` from the
 * caller's `SubscribeOptions`. Exposed as a pure function so the DLQ /
 * ack-wait / max-deliver defaults can be asserted from a unit test
 * without spinning up a NATS container.
 */
export const buildConsumerConfig = (
  options: Pick<
    SubscribeOptions,
    'durableName' | 'subject' | 'maxInFlight' | 'maxDeliver' | 'ackWaitMs'
  >,
): Pick<
  ConsumerConfig,
  | 'durable_name'
  | 'filter_subject'
  | 'ack_policy'
  | 'deliver_policy'
  | 'max_ack_pending'
  | 'max_deliver'
  | 'ack_wait'
> => {
  const maxDeliver = options.maxDeliver ?? DEFAULT_MAX_DELIVER;
  const ackWaitMs = options.ackWaitMs ?? DEFAULT_ACK_WAIT_MS;
  const maxInFlight = options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
  return {
    durable_name: options.durableName,
    filter_subject: options.subject,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    max_ack_pending: maxInFlight,
    max_deliver: maxDeliver,
    // ConsumerConfig.ack_wait is in nanoseconds.
    ack_wait: ackWaitMs * NS_PER_MS,
  };
};

export interface NatsSubscriberOptions {
  readonly servers: string | string[];
  /** JetStream stream the consumer reads from. Must already exist. */
  readonly stream: string;
  readonly connectionOptions?: Omit<ConnectionOptions, 'servers'>;
  /**
   * AUTH-10: optional db handle so the subscriber can write the
   * platform-level alert envelope (`identity.email_dispatch_failed.v1`)
   * onto the outbox when the DLQ branch fires. Passed once at connect
   * time so every subscribe() call shares it. Omit in test setups that
   * do not care about the alert tail.
   */
  readonly db?: TenantAwareDb;
}

/**
 * NATS JetStream subscriber. Pulls messages via durable consumers — one
 * per `(stream, durableName)` pair — so subscribers can restart without
 * losing or replaying events.
 *
 * Handler resolves → `ack`. Handler throws → `nak` and the message is
 * redelivered subject to JetStream's retry policy bounded by
 * `max_deliver`. On terminal redelivery (handler still throws after
 * `max_deliver` attempts) the subscriber routes the raw bytes to
 * `dlq.<originalSubject>` via the optional `dlqPublisher`, emits a
 * platform-level `identity.email_dispatch_failed.v1` alert envelope
 * onto the outbox under `db.withoutTenant(...)`, and ACKs the poison
 * message so the consumer moves on.
 */
export class NatsJetStreamSubscriber implements EventSubscriber {
  readonly #nc: NatsConnection;
  readonly #jsm: JetStreamManager;
  readonly #js: JetStreamClient;
  readonly #stream: string;
  readonly #db: TenantAwareDb | undefined;
  readonly #subscriptions = new Set<RunningSubscription>();

  private constructor(
    nc: NatsConnection,
    jsm: JetStreamManager,
    js: JetStreamClient,
    stream: string,
    db: TenantAwareDb | undefined,
  ) {
    this.#nc = nc;
    this.#jsm = jsm;
    this.#js = js;
    this.#stream = stream;
    this.#db = db;
  }

  static async connect(options: NatsSubscriberOptions): Promise<NatsJetStreamSubscriber> {
    const nc = await connect({ servers: options.servers, ...options.connectionOptions });
    try {
      const jsm = await nc.jetstreamManager();
      return new NatsJetStreamSubscriber(nc, jsm, nc.jetstream(), options.stream, options.db);
    } catch (err) {
      await nc.close();
      throw err;
    }
  }

  async subscribe(options: SubscribeOptions): Promise<EventSubscription> {
    await this.#jsm.consumers.add(this.#stream, buildConsumerConfig(options));

    const consumer = await this.#js.consumers.get(this.#stream, options.durableName);
    const subscription = new RunningSubscription({
      consumer,
      handler: options.handler,
      subject: options.subject,
      maxDeliver: options.maxDeliver ?? DEFAULT_MAX_DELIVER,
      dlqPublisher: options.dlqPublisher,
      db: this.#db,
    });
    this.#subscriptions.add(subscription);
    subscription.start();
    return {
      stop: async () => {
        await subscription.stop();
        this.#subscriptions.delete(subscription);
      },
    };
  }

  async close(): Promise<void> {
    for (const sub of this.#subscriptions) {
      await sub.stop();
    }
    this.#subscriptions.clear();
    await this.#nc.drain();
  }
}

interface ConsumerLike {
  consume(opts?: { max_messages?: number }): Promise<AsyncIterable<JsMsgLike> & { stop(): void }>;
}

interface JsMsgInfoLike {
  /** Current NATS field; `redeliveryCount` is the deprecated alias. */
  deliveryCount: number;
}

interface JsMsgLike {
  data: Uint8Array;
  info: JsMsgInfoLike;
  subject: string;
  ack(): void;
  nak(delay?: number): void;
}

interface RunningSubscriptionOptions {
  readonly consumer: ConsumerLike;
  readonly handler: (envelope: EventEnvelope) => Promise<void>;
  readonly subject: string;
  readonly maxDeliver: number;
  readonly dlqPublisher: DlqPublisher | undefined;
  readonly db: TenantAwareDb | undefined;
}

class RunningSubscription {
  readonly #consumer: ConsumerLike;
  readonly #handler: (envelope: EventEnvelope) => Promise<void>;
  readonly #subject: string;
  readonly #maxDeliver: number;
  readonly #dlqPublisher: DlqPublisher | undefined;
  readonly #db: TenantAwareDb | undefined;
  #messages: (AsyncIterable<JsMsgLike> & { stop(): void }) | null = null;
  #stopped = false;
  #loop: Promise<void> | null = null;

  constructor(opts: RunningSubscriptionOptions) {
    this.#consumer = opts.consumer;
    this.#handler = opts.handler;
    this.#subject = opts.subject;
    this.#maxDeliver = opts.maxDeliver;
    this.#dlqPublisher = opts.dlqPublisher;
    this.#db = opts.db;
  }

  start(): void {
    this.#loop = this.#run();
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    this.#messages?.stop();
    if (this.#loop) {
      await this.#loop.catch(() => undefined);
    }
  }

  // packages/events/CLAUDE.md rule: the `for await` loop MUST be wrapped
  // in an outer try/catch. If the iterator itself throws (broker
  // disconnect, stream deletion), the rejection escapes the fire-and-
  // forget `void this.#run()` and becomes an unhandled rejection —
  // process crash under `--unhandled-rejections=strict`.
  async #run(): Promise<void> {
    try {
      const messages = await this.#consumer.consume();
      this.#messages = messages;
      for await (const msg of messages) {
        if (this.#stopped) {
          msg.nak();
          break;
        }
        await this.#dispatch(msg);
      }
    } catch (err) {
      logger.error(
        { err, subject: this.#subject },
        'NATS subscriber iterator failed (broker disconnect or stream deletion); subscription stopped.',
      );
    }
  }

  async #dispatch(msg: JsMsgLike): Promise<void> {
    try {
      const envelope = EventEnvelope.parse(JSON.parse(new TextDecoder().decode(msg.data)));
      await this.#handler(envelope);
      msg.ack();
    } catch (err) {
      // The broker's delivery count is the source of truth for retries.
      // `info.deliveryCount` is the live counter; `redeliveryCount` is a
      // deprecated alias retained for older NATS clients.
      const deliveryCount = msg.info.deliveryCount;
      const decision = computeDlqAction({ deliveryCount, maxDeliver: this.#maxDeliver });
      if (decision === 'ROUTE_TO_DLQ') {
        await this.#routeToDlq(msg, err, deliveryCount);
        msg.ack();
      } else {
        msg.nak();
      }
    }
  }

  async #routeToDlq(msg: JsMsgLike, err: unknown, deliveryCount: number): Promise<void> {
    // Source subject: prefer the broker-reported subject (covers
    // wildcard subscriptions where this.#subject is e.g. `identity.>`),
    // fall back to the configured filter subject.
    const originalSubject = msg.subject || this.#subject;
    const dlqSubject = buildDlqSubject(originalSubject);
    const errorMessage = String(err).slice(0, 2048);

    logger.error(
      { subject: originalSubject, dlqSubject, deliveryCount, err: errorMessage },
      'NATS subscriber: poison message exhausted max_deliver; routing to DLQ.',
    );

    if (this.#dlqPublisher) {
      try {
        await this.#dlqPublisher.publishRaw(dlqSubject, msg.data);
      } catch (publishErr) {
        logger.error(
          { subject: originalSubject, dlqSubject, err: String(publishErr) },
          'NATS subscriber: DLQ publish FAILED; alert envelope will still attempt to land.',
        );
      }
    }

    if (this.#db) {
      const payload: IdentityEmailDispatchFailedV1Payload = {
        reason: 'dlq_routed',
        originalSubject,
        redeliveryCount: deliveryCount,
        errorMessage,
      };
      const envelope = buildEnvelope(IdentityEmailDispatchFailedV1, payload, {
        tenantId: null,
      });
      try {
        // ADR-0020 I-6 / TEN-11: subscriber code fires outside HTTP
        // middleware, so no ALS tenant is bound. Platform-level alert.
        // Allowlist entry: WITHOUT_TENANT_ALLOWLIST registers this file
        // (TEN-11 + matching ESLint override in
        // packages/events/eslint.config.mjs).
        await this.#db.withoutTenant(
          'NATS DLQ alert — poison envelope, no tenant context',
          async (tx) => {
            await appendToOutbox(tx, { envelope });
          },
        );
      } catch (alertErr) {
        logger.error(
          { subject: originalSubject, err: String(alertErr) },
          'NATS subscriber: DLQ alert envelope append FAILED; ops blind to this poison.',
        );
      }
    }
  }
}
