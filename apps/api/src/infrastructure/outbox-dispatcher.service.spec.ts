import { describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import type { TenantAwareDb } from '@resto/db';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

const makeTaggedReserved = () => {
  const fn = vi.fn().mockResolvedValue([{ got: false }]);
  (fn as unknown as { release: () => void }).release = vi.fn();
  return fn as unknown as Awaited<ReturnType<Sql['reserve']>>;
};

const makeSqlClient = (): Sql => {
  const reserved = makeTaggedReserved();
  const reserveSpy = vi.fn().mockResolvedValue(reserved);
  return { reserve: reserveSpy } as unknown as Sql;
};

const makeDb = (pooledSql: Sql): TenantAwareDb =>
  ({
    connection: { raw: pooledSql },
  }) as unknown as TenantAwareDb;

describe('OutboxDispatcherService', () => {
  it('isLeader() returns false before lock acquisition', () => {
    const db = makeDb(makeSqlClient());
    const svc = new OutboxDispatcherService(db, null, null);
    expect(svc.isLeader()).toBe(false);
  });

  it('uses the direct connection for the advisory lock when directConn is provided (D-05)', async () => {
    const directSql = makeSqlClient();
    const pooledSql = makeSqlClient();
    const db = makeDb(pooledSql);
    const directReserveSpy = directSql.reserve as ReturnType<typeof vi.fn>;
    const pooledReserveSpy = pooledSql.reserve as ReturnType<typeof vi.fn>;

    const publisher = { publish: vi.fn(), close: vi.fn() };
    const svc = new OutboxDispatcherService(db, publisher, directSql);
    svc.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));

    expect(directReserveSpy).toHaveBeenCalled();
    expect(pooledReserveSpy).not.toHaveBeenCalled();
  });

  it('falls back to pooled connection when directConn is null (dev/test)', async () => {
    const pooledSql = makeSqlClient();
    const db = makeDb(pooledSql);
    const pooledReserveSpy = pooledSql.reserve as ReturnType<typeof vi.fn>;

    const publisher = { publish: vi.fn(), close: vi.fn() };
    const svc = new OutboxDispatcherService(db, publisher, null);
    svc.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));

    expect(pooledReserveSpy).toHaveBeenCalled();
  });
});
