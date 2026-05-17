import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@resto/db';
import { EventEnvelope, type EventEnvelope as EventEnvelopeType } from '../../src/envelope';
import { runDeduped } from '../../src/inbox/run-deduped';
import { isDockerAvailable, startTestEnv, stopTestEnv, type TestEnv } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) {
  console.warn('[run-deduped.integration] Docker not available — skipping.');
}

const TENANT = '11111111-1111-4111-8111-111111111111';

const buildEnvelope = (overrides: Partial<EventEnvelopeType> = {}): EventEnvelopeType =>
  EventEnvelope.parse({
    id: randomUUID(),
    type: 'tenancy.tenant_provisioned.v1',
    version: 1,
    tenantId: TENANT,
    correlationId: randomUUID(),
    causationId: null,
    occurredAt: new Date(),
    payload: { tenantId: TENANT },
    ...overrides,
  });

suite('runDeduped — atomic dedup + handler', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await startTestEnv();
    await env.db.withoutTenant('seed tenant for runDeduped integration', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: TENANT,
        slug: 'rundeduped',
        displayName: 'Run Deduped Test',
        locale: 'en',
        defaultCurrency: 'USD',
      });
    });
  }, 180_000);

  afterAll(async () => {
    await stopTestEnv(env);
  });

  beforeEach(async () => {
    await env.db.withoutTenant('truncate inbox between cases', async (tx) => {
      await tx.execute('TRUNCATE TABLE inbox_processed');
    });
  });

  it('happy path: first call executes handler, second call skips', async () => {
    const envelope = buildEnvelope();
    let calls = 0;
    const handler = async (): Promise<void> => {
      await Promise.resolve();
      calls += 1;
    };
    const first = await runDeduped(env.db, envelope, 'consumer-happy', handler);
    const second = await runDeduped(env.db, envelope, 'consumer-happy', handler);
    expect(first).toBe('executed');
    expect(second).toBe('skipped');
    expect(calls).toBe(1);
  });

  it('rollback on throw: tx rolls back, next call re-invokes handler', async () => {
    const envelope = buildEnvelope();
    let calls = 0;
    await expect(
      runDeduped(env.db, envelope, 'consumer-throw', async () => {
        await Promise.resolve();
        calls += 1;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const second = await runDeduped(env.db, envelope, 'consumer-throw', async () => {
      await Promise.resolve();
      calls += 1;
    });
    expect(second).toBe('executed');
    expect(calls).toBe(2);
  });

  it('concurrent dedup: only one of two parallel calls executes the handler', async () => {
    const envelope = buildEnvelope();
    let calls = 0;
    const handler = async (): Promise<void> => {
      await Promise.resolve();
      calls += 1;
    };
    const results = await Promise.all([
      runDeduped(env.db, envelope, 'consumer-race', handler),
      runDeduped(env.db, envelope, 'consumer-race', handler),
    ]);
    const executed = results.filter((r) => r === 'executed');
    const skipped = results.filter((r) => r === 'skipped');
    expect(executed).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('consumer isolation: same eventId, different consumers both execute', async () => {
    const envelope = buildEnvelope();
    let calls = 0;
    const handler = async (): Promise<void> => {
      await Promise.resolve();
      calls += 1;
    };
    const a = await runDeduped(env.db, envelope, 'consumer-a', handler);
    const b = await runDeduped(env.db, envelope, 'consumer-b', handler);
    expect(a).toBe('executed');
    expect(b).toBe('executed');
    expect(calls).toBe(2);
  });

  it('event isolation: same consumer, different eventIds both execute', async () => {
    const e1 = buildEnvelope();
    const e2 = buildEnvelope();
    let calls = 0;
    const handler = async (): Promise<void> => {
      await Promise.resolve();
      calls += 1;
    };
    const a = await runDeduped(env.db, e1, 'consumer-iso', handler);
    const b = await runDeduped(env.db, e2, 'consumer-iso', handler);
    expect(a).toBe('executed');
    expect(b).toBe('executed');
    expect(calls).toBe(2);
  });
});
