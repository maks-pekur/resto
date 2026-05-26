import { execSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { connect, StringCodec, type NatsConnection } from 'nats';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const COMPOSE_FILE = resolve(HERE, 'docker-compose.test.yml');

const PG_HOST = '127.0.0.1';
const PG_PORT = process.env.POSTGRES_TEST_PORT ?? '55432';
const PG_USER = process.env.POSTGRES_USER ?? 'resto';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD ?? 'resto_test_dev_only';
const PG_DB = process.env.POSTGRES_DB ?? 'resto_test';
const PG_URL = `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}`;

const NATS_HOST = '127.0.0.1';
const NATS_PORT = process.env.NATS_TEST_PORT ?? '54222';
const NATS_URL = `nats://${NATS_HOST}:${NATS_PORT}`;

// Mirrors packages/db/test/setup.ts:isDockerAvailable — inlined to avoid
// pulling drizzle/testcontainers into a spec that only needs the daemon probe.
const isDockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const composeUp = (): void => {
  const r = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait'], {
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`compose up failed (status=${r.status ?? 'null'})`);
};

const composeDown = (): void => {
  spawnSync('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v'], { stdio: 'inherit' });
};

const dockerOk = isDockerAvailable();

describe.skipIf(!dockerOk)('test-stack smoke', () => {
  beforeAll(() => {
    composeUp();
  }, 120_000);

  afterAll(() => {
    composeDown();
  }, 60_000);

  it('Postgres accepts a SELECT 1 from the compose-stack instance', async () => {
    const sql = postgres(PG_URL, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      const rows = await sql<{ one: number }[]>`SELECT 1 AS one`;
      expect(rows[0]?.one).toBe(1);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('NATS supports a publish/subscribe round-trip', async () => {
    const sc = StringCodec();
    const subject = `smoke.${Date.now().toString(36)}`;
    let nc: NatsConnection | null = null;
    try {
      nc = await connect({ servers: NATS_URL, timeout: 10_000 });
      const sub = nc.subscribe(subject, { max: 1 });
      const received = (async () => {
        for await (const msg of sub) {
          return sc.decode(msg.data);
        }
        return null;
      })();
      nc.publish(subject, sc.encode('hello'));
      await nc.flush();
      const got = await received;
      expect(got).toBe('hello');
    } finally {
      if (nc) {
        await nc.drain();
        await nc.close();
      }
    }
  });
});

if (!dockerOk) {
  // Surface why the suite is empty when run locally without Docker.
  // eslint-disable-next-line no-console
  console.warn('[test-stack-smoke] Docker daemon not reachable — skipping suite.');
}
