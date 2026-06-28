import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import { schema, TenantAwareDb } from '@resto/db';
import { OutboxDispatcher, type EventEnvelope, type EventPublisher } from '@resto/events';
import { isNull, min } from 'drizzle-orm';
import type { ReservedSql, Sql } from 'postgres';

import { DIRECT_DB_CONNECTION } from './direct-db-connection.token';
import { EVENT_PUBLISHER } from './event-publisher.token';

/**
 * Stable bigint key for the dispatcher's Postgres advisory lock. Picked
 * to be recognizable in `pg_locks` (the trailing 115 matches RES-115).
 */
const ADVISORY_LOCK_KEY = 4815115;
const ACQUIRE_RETRY_MS = 5000;

/**
 * Run `OutboxDispatcher` as a single in-process leader, elected via a
 * Postgres session-level advisory lock held on a reserved connection.
 *
 * Why leader-locked at all (the underlying dispatcher is concurrency-safe
 * via `FOR UPDATE SKIP LOCKED`): predictable metrics, no wasted polling
 * from N replicas, simple visibility-timeout reasoning. If the leader
 * dies the lock is released by Postgres on the connection's death and
 * any other replica's retry loop picks it up.
 *
 * The service no-ops gracefully when the publisher is null
 * (`NATS_DISABLED=true` for tests/CI without a broker).
 */
@Injectable()
export class OutboxDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly meter = metrics.getMeter('resto.api.outbox');
  private readonly deliveredCounter = this.meter.createCounter('outbox.delivered', {
    description: 'Outbox events successfully published to the broker',
  });
  private readonly lagHistogram = this.meter.createHistogram('outbox.delivery_lag_ms', {
    description: 'Latency between event occurredAt and broker publish ack',
    unit: 'ms',
  });
  private readonly claimFailuresCounter = this.meter.createCounter('outbox.claim_failures', {
    description: 'Outbox dispatcher tick failures (publish or claim)',
  });
  private readonly isLeaderGauge = this.meter.createObservableGauge('outbox.is_leader', {
    description: 'Whether this instance holds the outbox dispatcher advisory lock (1/0)',
  });

  private dispatcher: OutboxDispatcher | null = null;
  private leaderConn: ReservedSql | null = null;
  private acquireTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;
  private lastDispatchAt: Date | null = null;

  constructor(
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher | null,
    @Optional() @Inject(DIRECT_DB_CONNECTION) private readonly directConn: Sql | null,
  ) {
    this.isLeaderGauge.addCallback((result) => {
      result.observe(this.isLeader() ? 1 : 0, { 'tenant.id': 'platform' });
    });
  }

  onApplicationBootstrap(): void {
    if (this.publisher === null) {
      this.logger.warn('NATS publisher not available — outbox dispatcher will not start');
      return;
    }
    void this.tryAcquireLeadership();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.acquireTimer !== null) {
      clearTimeout(this.acquireTimer);
      this.acquireTimer = null;
    }
    if (this.dispatcher !== null) {
      await this.dispatcher.stop();
      this.dispatcher = null;
    }
    await this.releaseLeadership();
  }

  /** Returns true when this instance holds the advisory lock (is outbox leader). */
  isLeader(): boolean {
    return this.leaderConn !== null;
  }

  /** Returns the minimal leader-liveness signal consumed by /readyz (G-03). */
  getOutboxLeaderHealth(): {
    isLeader: boolean;
    lastDispatchAt: Date | null;
    staleMs: number | null;
  } {
    const isLeader = this.isLeader();
    const staleMs =
      this.lastDispatchAt !== null ? Date.now() - this.lastDispatchAt.getTime() : null;
    return { isLeader, lastDispatchAt: this.lastDispatchAt, staleMs };
  }

  private async tryAcquireLeadership(): Promise<void> {
    if (this.shuttingDown || this.publisher === null) return;
    let reserved: ReservedSql | null = null;
    try {
      // D-05: use the dedicated direct (unpooled) connection when provided so
      // the session-level advisory lock is not at the mercy of a pooler in
      // transaction mode (Neon PgBouncer footgun). Falls back to the pooled
      // connection in dev/test where DATABASE_DIRECT_URL is not set.
      const lockSource = this.directConn ?? this.db.connection.raw;
      reserved = await lockSource.reserve();
      const rows = await reserved<
        { got: boolean }[]
      >`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS got`;
      const got = rows[0]?.got ?? false;
      if (!got) {
        reserved.release();
        this.scheduleRetry();
        return;
      }
      this.leaderConn = reserved;
      // D-14: seed the staleness clock at acquisition so a leader that has
      // not yet dispatched does not read as stale from t=0.
      this.lastDispatchAt = new Date();
      this.logger.log('Acquired outbox dispatcher leadership');
      this.startDispatcher(this.publisher);
    } catch (err) {
      this.logger.error({ err }, 'Failed to acquire outbox dispatcher leadership');
      if (reserved !== null) {
        try {
          reserved.release();
        } catch {
          /* swallow */
        }
      }
      this.scheduleRetry();
    }
  }

  private startDispatcher(publisher: EventPublisher): void {
    const wrapped = this.wrapPublisherForMetrics(publisher);
    this.dispatcher = new OutboxDispatcher({
      db: this.db,
      publisher: wrapped,
      onError: (err) => {
        // TEN-10 / D-05: claim/tick failures are pre-publish — no envelope is in hand, so the
        // 'tenant.id' label degrades to 'platform'. The label is still emitted so dashboards can
        // group all three outbox metrics uniformly.
        this.claimFailuresCounter.add(1, { 'tenant.id': 'platform' });
        this.logger.error({ err }, 'Outbox dispatcher tick failed');
      },
    });
    this.dispatcher.start();
  }

  private wrapPublisherForMetrics(publisher: EventPublisher): EventPublisher {
    const deliveredCounter = this.deliveredCounter;
    const lagHistogram = this.lagHistogram;
    return {
      publish: async (envelope: EventEnvelope): Promise<void> => {
        await publisher.publish(envelope);
        const lagMs = Date.now() - new Date(envelope.occurredAt).getTime();
        // TEN-10 / D-05: 'tenant.id' label enables per-tenant outbox observability. Cardinality
        // ceiling: 50+ tenants is a known scaling gate; revisit metric series shape at that point.
        deliveredCounter.add(1, {
          'event.type': envelope.type,
          'tenant.id': envelope.tenantId ?? 'platform',
        });
        lagHistogram.record(lagMs, {
          'event.type': envelope.type,
          'tenant.id': envelope.tenantId ?? 'platform',
        });
        // G-03: record heartbeat so /readyz can detect a stalled leader.
        this.lastDispatchAt = new Date();
      },
      close: () => publisher.close(),
    };
  }

  async getOldestUndeliveredOutboxAgeMs(): Promise<number | null> {
    return this.db.withoutTenant('outbox backlog age probe', async (tx) => {
      const rows = await tx
        .select({ oldest: min(schema.outboxEvents.occurredAt) })
        .from(schema.outboxEvents)
        .where(isNull(schema.outboxEvents.deliveredAt));
      const oldest = rows[0]?.oldest;
      if (!oldest) return null;
      return Date.now() - oldest.getTime();
    });
  }

  private scheduleRetry(): void {
    if (this.shuttingDown) return;
    this.acquireTimer = setTimeout(() => {
      void this.tryAcquireLeadership();
    }, ACQUIRE_RETRY_MS);
  }

  private async releaseLeadership(): Promise<void> {
    if (this.leaderConn === null) return;
    try {
      await this.leaderConn`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    } catch (err) {
      this.logger.warn({ err }, 'Failed to release outbox advisory lock');
    }
    try {
      this.leaderConn.release();
    } catch {
      /* swallow */
    }
    this.leaderConn = null;
  }
}
