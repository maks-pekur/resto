import {
  AckPolicy,
  connect,
  DeliverPolicy,
  type ConnectionOptions,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
} from 'nats';
import { EventEnvelope } from '../envelope';
import type { EventSubscriber, EventSubscription, SubscribeOptions } from '../ports';

export interface NatsSubscriberOptions {
  readonly servers: string | string[];
  /** JetStream stream the consumer reads from. Must already exist. */
  readonly stream: string;
  readonly connectionOptions?: Omit<ConnectionOptions, 'servers'>;
}

/**
 * NATS JetStream subscriber. Pulls messages via durable consumers — one
 * per `(stream, durableName)` pair — so subscribers can restart without
 * losing or replaying events.
 *
 * Handler resolves → `ack`. Handler throws → `nak` and the message is
 * redelivered subject to JetStream's retry policy. The inbox tracker
 * (`InMemoryInboxTracker` for now) is the consumer's own dedup line.
 */
export class NatsJetStreamSubscriber implements EventSubscriber {
  readonly #nc: NatsConnection;
  readonly #jsm: JetStreamManager;
  readonly #js: JetStreamClient;
  readonly #stream: string;
  readonly #subscriptions = new Set<RunningSubscription>();

  private constructor(
    nc: NatsConnection,
    jsm: JetStreamManager,
    js: JetStreamClient,
    stream: string,
  ) {
    this.#nc = nc;
    this.#jsm = jsm;
    this.#js = js;
    this.#stream = stream;
  }

  static async connect(options: NatsSubscriberOptions): Promise<NatsJetStreamSubscriber> {
    const nc = await connect({ servers: options.servers, ...options.connectionOptions });
    try {
      const jsm = await nc.jetstreamManager();
      return new NatsJetStreamSubscriber(nc, jsm, nc.jetstream(), options.stream);
    } catch (err) {
      await nc.close();
      throw err;
    }
  }

  async subscribe(options: SubscribeOptions): Promise<EventSubscription> {
    await this.#jsm.consumers.add(this.#stream, {
      durable_name: options.durableName,
      filter_subject: options.subject,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      max_ack_pending: options.maxInFlight ?? 1,
    });

    const consumer = await this.#js.consumers.get(this.#stream, options.durableName);
    const subscription = new RunningSubscription(consumer, options.handler);
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

interface JsMsgLike {
  data: Uint8Array;
  ack(): void;
  nak(delay?: number): void;
}

class RunningSubscription {
  readonly #consumer: ConsumerLike;
  readonly #handler: (envelope: EventEnvelope) => Promise<void>;
  #messages: (AsyncIterable<JsMsgLike> & { stop(): void }) | null = null;
  #stopped = false;
  #loop: Promise<void> | null = null;

  constructor(consumer: ConsumerLike, handler: (envelope: EventEnvelope) => Promise<void>) {
    this.#consumer = consumer;
    this.#handler = handler;
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

  async #run(): Promise<void> {
    const messages = await this.#consumer.consume();
    this.#messages = messages;
    for await (const msg of messages) {
      if (this.#stopped) {
        msg.nak();
        break;
      }
      try {
        const envelope = EventEnvelope.parse(JSON.parse(new TextDecoder().decode(msg.data)));
        await this.#handler(envelope);
        msg.ack();
      } catch {
        msg.nak();
      }
    }
  }
}
