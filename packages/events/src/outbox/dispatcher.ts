import type { TenantAwareDb } from '@resto/db';
import type { EventPublisher } from '../ports';
import { claimOutboxBatch, markOutboxDelivered, releaseOutboxClaim } from './repository';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_TICK_INTERVAL_MS = 250;

export interface DispatcherOptions {
  readonly db: TenantAwareDb;
  readonly publisher: EventPublisher;
  readonly batchSize?: number;
  readonly visibilityTimeoutSeconds?: number;
  readonly tickIntervalMs?: number;
  readonly onError?: (err: unknown) => void;
}

export interface TickResult {
  readonly claimed: number;
  readonly delivered: number;
  readonly failed: number;
}

/**
 * Polls the outbox, publishes claimed events to the broker, and marks
 * them delivered. Runs as a single long-lived process per environment;
 * multiple instances may run concurrently — `FOR UPDATE SKIP LOCKED`
 * keeps them from contending.
 *
 * The dispatcher does not parse the broker response or retry on its own;
 * a failed publish leaves the row claimed, the visibility timeout makes
 * it reclaimable, and the next tick retries. End-to-end idempotency is
 * via the envelope id (broker-side `msgID` dedup + consumer-side inbox
 * tracker).
 */
export class OutboxDispatcher {
  readonly #db: TenantAwareDb;
  readonly #publisher: EventPublisher;
  readonly #batchSize: number;
  readonly #visibilityTimeoutSeconds: number | undefined;
  readonly #tickIntervalMs: number;
  readonly #onError: (err: unknown) => void;

  #running = false;
  #stopped = false;
  #stopResolver: (() => void) | null = null;

  constructor(options: DispatcherOptions) {
    this.#db = options.db;
    this.#publisher = options.publisher;
    this.#batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.#visibilityTimeoutSeconds = options.visibilityTimeoutSeconds;
    this.#tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
    this.#onError =
      options.onError ??
      ((err) => {
        // Default: surface to stderr without crashing the loop. Callers
        // wiring the dispatcher into apps/api should pass a logger-backed
        // hook so failures show up in the platform's observability stack.
        console.error('[OutboxDispatcher]', err);
      });
  }

  /**
   * Run a single poll cycle. Exposed primarily for tests; production
   * callers use `start()`.
   */
  async tick(): Promise<TickResult> {
    const claimed = await this.#db.withoutTenant('outbox dispatcher claim', (tx) =>
      claimOutboxBatch(tx, {
        batchSize: this.#batchSize,
        ...(this.#visibilityTimeoutSeconds !== undefined
          ? { visibilityTimeoutSeconds: this.#visibilityTimeoutSeconds }
          : {}),
      }),
    );
    if (claimed.length === 0) {
      return { claimed: 0, delivered: 0, failed: 0 };
    }

    const deliveredIds: string[] = [];
    let failed = 0;

    for (const { envelope } of claimed) {
      try {
        await this.#publisher.publish(envelope);
        deliveredIds.push(envelope.id);
      } catch (err) {
        failed += 1;
        this.#onError(err);
        await this.#db
          .withoutTenant('outbox dispatcher release claim', (tx) =>
            releaseOutboxClaim(tx, envelope.id),
          )
          .catch((releaseErr: unknown) => {
            this.#onError(releaseErr);
          });
      }
    }

    if (deliveredIds.length > 0) {
      await this.#db.withoutTenant('outbox dispatcher mark delivered', (tx) =>
        markOutboxDelivered(tx, deliveredIds),
      );
    }

    return { claimed: claimed.length, delivered: deliveredIds.length, failed };
  }

  /** Start the polling loop. Idempotent; calling twice has no extra effect. */
  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#stopped = false;
    void this.#runLoop();
  }

  /** Stop the polling loop, awaiting the in-flight tick to finish. */
  async stop(): Promise<void> {
    if (!this.#running) return;
    this.#stopped = true;
    await new Promise<void>((resolve) => {
      this.#stopResolver = resolve;
    });
  }

  async #runLoop(): Promise<void> {
    while (!this.#stopped) {
      try {
        const result = await this.tick();
        if (result.claimed === 0) {
          await this.#sleep(this.#tickIntervalMs);
        }
      } catch (err) {
        this.#onError(err);
        await this.#sleep(this.#tickIntervalMs);
      }
    }
    this.#running = false;
    this.#stopResolver?.();
    this.#stopResolver = null;
  }

  async #sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
