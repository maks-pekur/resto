import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboxDispatcher } from '../../src/outbox/dispatcher';
import type { EventPublisher } from '../../src/ports';
import { isDockerAvailable, startTestEnv, stopTestEnv, type TestEnv } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) {
  console.warn('[dispatcher-stop-idempotent] Docker not available — skipping integration tests.');
}

const noopPublisher: EventPublisher = {
  publish: () => Promise.resolve(),
  close: () => Promise.resolve(),
};

suite('OutboxDispatcher.stop() — idempotency under concurrent callers (TEN-16)', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await startTestEnv();
  }, 180_000);

  afterAll(async () => {
    await stopTestEnv(env);
  });

  it('returns immediately when not running', async () => {
    const dispatcher = new OutboxDispatcher({ db: env.db, publisher: noopPublisher });
    await expect(dispatcher.stop()).resolves.toBeUndefined();
  });

  it('resolves both promises when called concurrently', async () => {
    const dispatcher = new OutboxDispatcher({
      db: env.db,
      publisher: noopPublisher,
      tickIntervalMs: 25,
    });
    dispatcher.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const [a, b] = await Promise.all([dispatcher.stop(), dispatcher.stop()]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(a).toBe(b);
  });

  it('returns the same cached promise reference for every concurrent caller', async () => {
    const dispatcher = new OutboxDispatcher({
      db: env.db,
      publisher: noopPublisher,
      tickIntervalMs: 25,
    });
    dispatcher.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const p1 = dispatcher.stop();
    const p2 = dispatcher.stop();
    const p3 = dispatcher.stop();
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
    await Promise.all([p1, p2, p3]);

    await expect(dispatcher.stop()).resolves.toBeUndefined();
  });
});
