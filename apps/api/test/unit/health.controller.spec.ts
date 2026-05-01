import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantAwareDb } from '@resto/db';
import type { EventPublisher } from '@resto/events';
import { HealthController } from '../../src/health/health.controller';

const dbWithExecute = (executeImpl: () => Promise<unknown>): TenantAwareDb =>
  ({
    connection: { db: { execute: executeImpl } },
  }) as unknown as TenantAwareDb;

const okPublisher = (): EventPublisher => ({
  publish: (): Promise<void> => Promise.resolve(),
  close: (): Promise<void> => Promise.resolve(),
});

describe('HealthController.liveness', () => {
  it('returns ok unconditionally', () => {
    const ctrl = new HealthController(
      dbWithExecute(() => Promise.resolve([])),
      okPublisher(),
    );
    expect(ctrl.liveness()).toEqual({ status: 'ok' });
  });
});

describe('HealthController.readiness', () => {
  it('returns ok when DB and broker are healthy', async () => {
    const ctrl = new HealthController(
      dbWithExecute(() => Promise.resolve([])),
      okPublisher(),
    );
    const result = await ctrl.readiness();
    expect(result.status).toBe('ok');
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it('throws ServiceUnavailableException when the DB check fails', async () => {
    const ctrl = new HealthController(
      dbWithExecute(() => Promise.reject(new Error('connection lost'))),
      okPublisher(),
    );
    await expect(ctrl.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when the broker is not connected', async () => {
    const ctrl = new HealthController(
      dbWithExecute(() => Promise.resolve([])),
      null,
    );
    await expect(ctrl.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
