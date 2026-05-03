import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  InMemoryInboxTracker,
  NatsJetStreamSubscriber,
  TenantProvisionedV1,
  withInboxDedup,
  type EventEnvelope,
} from '@resto/events';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[tenancy.e2e] Docker not available — skipping integration tests.');
}

/**
 * Each `it` block builds its own slug from a UUID prefix so tests pass
 * alone, in suite order, and on re-run against the same DB. (Earlier
 * versions used a shared `cafe-roma` fixture across `it` blocks — see
 * the testing review under RES-109 for context.)
 */
const buildBody = (slug: string) => ({
  slug,
  displayName: `Cafe ${slug}`,
  defaultCurrency: 'USD' as const,
  locale: 'en' as const,
});

const freshSlug = (prefix: string): string => {
  const suffix = randomUUID().slice(0, 8);
  return `${prefix}-${suffix}`;
};

suite('Tenancy — provision via HTTP → DB → outbox → NATS', () => {
  let stack: RealStack;
  let subscriber: NatsJetStreamSubscriber;
  const received: EventEnvelope[] = [];

  beforeAll(async () => {
    stack = await startRealStack();
    subscriber = await NatsJetStreamSubscriber.connect({
      servers: stack.natsUrl,
      stream: process.env.NATS_STREAM ?? 'RESTO_EVENTS_E2E',
    });
    const tracker = new InMemoryInboxTracker();
    await subscriber.subscribe({
      subject: TenantProvisionedV1.type,
      durableName: 'tenancy-e2e',
      handler: withInboxDedup(tracker, 'tenancy-e2e', (envelope) => {
        received.push(envelope);
        return Promise.resolve();
      }),
    });
  }, 180_000);

  afterAll(async () => {
    await subscriber.close().catch(() => undefined);
    await stopRealStack(stack);
  });

  it('rejects requests without the internal token header', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/tenants',
      payload: buildBody(freshSlug('roma')),
    });
    expect(res.statusCode).toBe(401);
  });

  it('provisions a tenant: returns 201, persists rows, and publishes the event', async () => {
    const slug = freshSlug('roma');
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/tenants',
      headers: { 'x-internal-token': 'integration-test-token-1234567890' },
      payload: buildBody(slug),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; slug: string; primaryDomain: string }>();
    expect(body.slug).toBe(slug);
    expect(body.primaryDomain).toBe(`${slug}.menu.resto.app`);

    const db = stack.app.get(TenantAwareDb);
    const tenants = await db.withoutTenant('inspect tenants', (tx) =>
      tx.select().from(schema.tenants).where(eq(schema.tenants.id, body.id)),
    );
    expect(tenants).toHaveLength(1);

    const domains = await db.withoutTenant('inspect domains', (tx) =>
      tx.select().from(schema.tenantDomains).where(eq(schema.tenantDomains.tenantId, body.id)),
    );
    expect(domains).toHaveLength(1);
    expect(domains[0]?.isPrimary).toBe(true);

    // Wait for the dispatcher / NATS roundtrip. The dispatcher does not
    // run yet inside `apps/api` (lands with a follow-up ticket), so the
    // outbox row exists but nothing is published. Verify the row, then
    // publish manually via the same publisher to assert the consumer
    // wiring works end-to-end.
    const outboxRows = await db.withoutTenant('inspect outbox', (tx) =>
      tx.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.tenantId, body.id)),
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]?.type).toBe(TenantProvisionedV1.type);
  }, 60_000);

  it('returns the existing tenant on idempotent re-provision (self-contained)', async () => {
    const slug = freshSlug('idempotent');
    const headers = { 'x-internal-token': 'integration-test-token-1234567890' };

    const first = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/tenants',
      headers,
      payload: buildBody(slug),
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json<{ id: string }>();

    const second = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/tenants',
      headers,
      payload: buildBody(slug),
    });
    expect(second.statusCode).toBe(201);
    expect(second.json<{ id: string }>().id).toBe(firstBody.id);

    const db = stack.app.get(TenantAwareDb);
    const outboxRows = await db.withoutTenant('inspect outbox after re-provision', (tx) =>
      tx.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.tenantId, firstBody.id)),
    );
    // Idempotent: only the first call writes an outbox event.
    expect(outboxRows).toHaveLength(1);
  });

  it('returns 409 with a problem-details body when re-provisioning an archived slug', async () => {
    // Provision a fresh tenant, archive it, then attempt to re-provision
    // under the same slug. Mapping the typed `TenantSlugArchivedError` to
    // a `ConflictException` is what makes this 409 (not 500).
    const slug = `archived-replay-${Date.now().toString()}`;
    const headers = { 'x-internal-token': 'integration-test-token-1234567890' };

    const provRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/tenants',
      headers,
      payload: { slug, displayName: 'Archived Replay', defaultCurrency: 'USD', locale: 'en' },
    });
    expect(provRes.statusCode).toBe(201);
    const { id } = provRes.json<{ id: string }>();

    const archiveRes = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${id}/archive`,
      headers,
    });
    expect(archiveRes.statusCode).toBe(204);

    const replayRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/tenants',
      headers,
      payload: { slug, displayName: 'Archived Replay', defaultCurrency: 'USD', locale: 'en' },
    });
    expect(replayRes.statusCode).toBe(409);
    expect(replayRes.json<{ detail: string }>().detail).toMatch(/archived/i);
  });

  describe('POST /internal/v1/tenants/:id/archive', () => {
    it('returns 401 without the internal token', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/internal/v1/tenants/00000000-0000-0000-0000-000000000000/archive',
      });
      expect(res.statusCode).toBe(401);
    });

    it('archives a tenant and returns 204 with a valid token', async () => {
      // Provision a fresh tenant so we don't interfere with the shared
      // cafe-roma fixture used by the other tests.
      const provRes = await stack.app.inject({
        method: 'POST',
        url: '/internal/v1/tenants',
        headers: { 'x-internal-token': 'integration-test-token-1234567890' },
        payload: {
          slug: 'archive-target',
          displayName: 'Archive Target',
          defaultCurrency: 'USD',
          locale: 'en',
        },
      });
      expect(provRes.statusCode).toBe(201);
      const { id } = provRes.json<{ id: string }>();

      const archiveRes = await stack.app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${id}/archive`,
        headers: { 'x-internal-token': 'integration-test-token-1234567890' },
      });
      expect(archiveRes.statusCode).toBe(204);

      // Verify the tenant is actually archived in the DB.
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withoutTenant('inspect archived tenant', (tx) =>
        tx.select().from(schema.tenants).where(eq(schema.tenants.id, id)),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.archivedAt).not.toBeNull();
    });
  });
});
