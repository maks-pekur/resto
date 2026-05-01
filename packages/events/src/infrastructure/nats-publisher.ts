import {
  connect,
  headers as natsHeaders,
  type ConnectionOptions,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
} from 'nats';
import type { EventEnvelope } from '../envelope';
import type { EventPublisher } from '../ports';
import { HEADER_CAUSATION, HEADER_CORRELATION, HEADER_VERSION } from '../outbox/headers';

const HEADER_EVENT_ID = 'event-id';
const HEADER_TENANT = 'tenant-id';

export interface NatsPublisherOptions {
  /** NATS server URL(s) — `nats://host:4222`. */
  readonly servers: string | string[];
  /** JetStream stream name. Created if missing on first connect. */
  readonly stream: string;
  /**
   * Subject patterns the stream should match. Required because JetStream
   * rejects a top-level `>` catch-all stream unless `no_ack: true` (which
   * would disable PubAck and break delivery confirmation). Use per-context
   * prefixes — e.g. `['tenancy.>', 'catalog.>', 'ordering.>']`.
   */
  readonly subjects: string[];
  /** Extra connection options forwarded to `nats.connect`. */
  readonly connectionOptions?: Omit<ConnectionOptions, 'servers'>;
}

/**
 * NATS JetStream publisher. The only place in the codebase that imports
 * the `nats` package outside `infrastructure/` is this file (and its
 * subscriber sibling). Bounded contexts depend on `EventPublisher`
 * (`ports.ts`), not on this class.
 *
 * Idempotent publishes: every JetStream `publish` carries `msgID =
 * envelope.id`, which the broker uses to dedup retries within its
 * configured window.
 */
export class NatsJetStreamPublisher implements EventPublisher {
  private constructor(
    private readonly nc: NatsConnection,
    private readonly js: JetStreamClient,
  ) {}

  static async connect(options: NatsPublisherOptions): Promise<NatsJetStreamPublisher> {
    const nc = await connect({ servers: options.servers, ...options.connectionOptions });
    try {
      const jsm = await nc.jetstreamManager();
      await ensureStream(jsm, options.stream, options.subjects);
      return new NatsJetStreamPublisher(nc, nc.jetstream());
    } catch (err) {
      await nc.close();
      throw err;
    }
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    const h = natsHeaders();
    h.set(HEADER_EVENT_ID, envelope.id);
    h.set(HEADER_VERSION, envelope.version.toString());
    h.set(HEADER_CORRELATION, envelope.correlationId);
    if (envelope.tenantId !== null) {
      h.set(HEADER_TENANT, envelope.tenantId);
    }
    if (envelope.causationId !== null) {
      h.set(HEADER_CAUSATION, envelope.causationId);
    }
    const data = new TextEncoder().encode(JSON.stringify(envelope));
    await this.js.publish(envelope.type, data, { headers: h, msgID: envelope.id });
  }

  async close(): Promise<void> {
    await this.nc.drain();
  }
}

const ensureStream = async (
  jsm: JetStreamManager,
  name: string,
  subjects: string[],
): Promise<void> => {
  try {
    await jsm.streams.info(name);
    return;
  } catch {
    // fall through to add
  }
  await jsm.streams.add({ name, subjects });
};
