import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInTenantContext, schema } from '@resto/db';
import { eq } from 'drizzle-orm';
import { DrizzleInboxTracker } from '../../src/inbox/drizzle-tracker';
import { isDockerAvailable, startTestEnv, stopTestEnv, type TestEnv } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) {
  console.warn('[inbox-tracker.integration] Docker not available — skipping.');
}

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

suite('DrizzleInboxTracker — persistent dedup', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await startTestEnv();
    // Seed two tenants so the tenant_id we stash on inbox rows points at
    // real rows (no FK on inbox_processed.tenant_id today, but keeps the
    // shape honest with the rest of the schema).
    await env.db.withoutTenant('seed tenants for inbox tracker integration', async (tx) => {
      await tx.insert(schema.tenants).values([
        {
          id: TENANT_A,
          slug: 'inbox-a',
          displayName: 'Inbox A',
          locale: 'en',
          defaultCurrency: 'USD',
        },
        {
          id: TENANT_B,
          slug: 'inbox-b',
          displayName: 'Inbox B',
          locale: 'en',
          defaultCurrency: 'USD',
        },
      ]);
    });
  }, 180_000);

  afterAll(async () => {
    await stopTestEnv(env);
  });

  it('returns true on first markProcessed and persists the row', async () => {
    const tracker = new DrizzleInboxTracker(env.db);
    const eventId = randomUUID();

    expect(await tracker.markProcessed('consumer-x', eventId, TENANT_A)).toBe(true);
    expect(await tracker.hasSeen('consumer-x', eventId)).toBe(true);
  });

  it('returns false on a second markProcessed for the same key', async () => {
    const tracker = new DrizzleInboxTracker(env.db);
    const eventId = randomUUID();

    expect(await tracker.markProcessed('consumer-y', eventId, TENANT_A)).toBe(true);
    expect(await tracker.markProcessed('consumer-y', eventId, TENANT_A)).toBe(false);
  });

  it('exactly one row inserted when two trackers race on the same key', async () => {
    const trackerA = new DrizzleInboxTracker(env.db);
    const trackerB = new DrizzleInboxTracker(env.db);
    const eventId = randomUUID();
    const consumer = 'consumer-race';

    const [a, b] = await Promise.all([
      trackerA.markProcessed(consumer, eventId, TENANT_A),
      trackerB.markProcessed(consumer, eventId, TENANT_A),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);

    const rows = await env.db.withoutTenant('verify inbox row count', (tx) =>
      tx.select().from(schema.inboxProcessed).where(eq(schema.inboxProcessed.eventId, eventId)),
    );
    expect(rows).toHaveLength(1);
  });

  it('survives a tracker restart — a fresh tracker still sees the row', async () => {
    const eventId = randomUUID();
    {
      const tracker = new DrizzleInboxTracker(env.db);
      await tracker.markProcessed('consumer-restart', eventId, TENANT_A);
    }
    // Simulate a restart by constructing a brand-new tracker over the
    // same database. The dedup window is persisted, not in-memory.
    const reborn = new DrizzleInboxTracker(env.db);
    expect(await reborn.hasSeen('consumer-restart', eventId)).toBe(true);
    expect(await reborn.markProcessed('consumer-restart', eventId, TENANT_A)).toBe(false);
  });

  it('refuses tenant-context reads of inbox_processed (RLS system-only)', async () => {
    const tracker = new DrizzleInboxTracker(env.db);
    const eventId = randomUUID();
    await tracker.markProcessed('consumer-rls', eventId, TENANT_A);

    // Tenant-bound transactions cannot SELECT (no policy for that role
    // path). Resolves to an empty result rather than the row.
    const visible = await runInTenantContext({ tenantId: TENANT_A }, () =>
      env.db.withTenant((tx) =>
        tx.select().from(schema.inboxProcessed).where(eq(schema.inboxProcessed.eventId, eventId)),
      ),
    );
    expect(visible).toHaveLength(0);
  });
});
