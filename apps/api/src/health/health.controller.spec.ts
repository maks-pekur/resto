import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenantAwareDb } from '@resto/db';
import type { EventPublisher } from '@resto/events';
import { describe, expect, it } from 'vitest';
import { EVENT_PUBLISHER } from '../infrastructure/nats.module';
import { OutboxDispatcherService } from '../infrastructure/outbox-dispatcher.service';
import { HealthController } from './health.controller';

const makeDb = (pingOk: boolean) =>
  ({
    ping: pingOk ? () => Promise.resolve() : () => Promise.reject(new Error('db down')),
  }) as unknown as TenantAwareDb;

const makePublisher = (connected: boolean): EventPublisher | null =>
  connected ? { publish: () => Promise.resolve(), close: () => Promise.resolve() } : null;

const makeOutboxSvc = (
  isLeader: boolean,
  lastDispatchAt: Date | null,
  oldestUndeliveredAgeMs: number | null = null,
) =>
  ({
    isLeader: () => isLeader,
    getOutboxLeaderHealth: () => ({
      isLeader,
      lastDispatchAt,
      staleMs: lastDispatchAt ? Date.now() - lastDispatchAt.getTime() : null,
    }),
    getOldestUndeliveredOutboxAgeMs: () => Promise.resolve(oldestUndeliveredAgeMs),
  }) as unknown as OutboxDispatcherService;

async function buildController(
  dbOk: boolean,
  publisherConnected: boolean,
  outboxSvc: OutboxDispatcherService,
  stallThresholdMs = 60_000,
): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: TenantAwareDb, useValue: makeDb(dbOk) },
      { provide: EVENT_PUBLISHER, useValue: makePublisher(publisherConnected) },
      { provide: OutboxDispatcherService, useValue: outboxSvc },
      {
        provide: 'OUTBOX_STALL_THRESHOLD_MS',
        useValue: stallThresholdMs,
      },
    ],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  describe('GET /healthz', () => {
    it('returns {status: ok}', async () => {
      const ctrl = await buildController(true, true, makeOutboxSvc(false, null));
      expect(ctrl.liveness()).toEqual({ status: 'ok' });
    });
  });

  describe('GET /readyz — DB and broker', () => {
    it('returns 200 when DB and broker are healthy and instance is not the leader', async () => {
      const ctrl = await buildController(true, true, makeOutboxSvc(false, null));
      const result = await ctrl.readiness();
      expect(result.status).toBe('ok');
    });

    it('returns 503 when DB is down', async () => {
      const ctrl = await buildController(false, true, makeOutboxSvc(false, null));
      await expect(ctrl.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('returns 503 when broker is not connected', async () => {
      const ctrl = await buildController(true, false, makeOutboxSvc(false, null));
      await expect(ctrl.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('GET /readyz — outbox leader liveness (G-03)', () => {
    it('returns 200 when instance is leader and dispatch is recent', async () => {
      const fresh = new Date(Date.now() - 5_000);
      const ctrl = await buildController(true, true, makeOutboxSvc(true, fresh), 60_000);
      const result = await ctrl.readiness();
      expect(result.status).toBe('ok');
      const leaderCheck = result.checks.find((c) => c.name === 'outbox_leader');
      expect(leaderCheck?.ok).toBe(true);
    });

    it('returns 503 when instance is leader, dispatch is stale, and backlog has undelivered rows', async () => {
      const stale = new Date(Date.now() - 120_000);
      const ctrl = await buildController(true, true, makeOutboxSvc(true, stale, 90_000), 60_000);
      await expect(ctrl.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('returns 200 when instance is not the leader (non-leader is correctly idle)', async () => {
      const ctrl = await buildController(true, true, makeOutboxSvc(false, null), 60_000);
      const result = await ctrl.readiness();
      expect(result.status).toBe('ok');
      const leaderCheck = result.checks.find((c) => c.name === 'outbox_leader');
      expect(leaderCheck?.ok).toBe(true);
    });

    it('returns 200 when leader and lastDispatchAt is null (queue empty — polled recently)', async () => {
      // null lastDispatchAt with isLeader=true means leader just started up; treat as ok
      const ctrl = await buildController(true, true, makeOutboxSvc(true, null), 60_000);
      const result = await ctrl.readiness();
      expect(result.status).toBe('ok');
    });

    it('returns 503 when leader is stale and outbox backlog exists (wedged-at-startup false-negative fixed)', async () => {
      // Leader acquired lock but staleMs > threshold AND backlog has old undelivered rows
      const stale = new Date(Date.now() - 120_000);
      const ctrl = await buildController(true, true, makeOutboxSvc(true, stale, 90_000), 60_000);
      await expect(ctrl.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('returns 200 when leader is stale but outbox backlog is empty (idle queue is healthy)', async () => {
      // Leader staleMs > threshold but no undelivered rows — queue is genuinely empty
      const stale = new Date(Date.now() - 120_000);
      const ctrl = await buildController(true, true, makeOutboxSvc(true, stale, null), 60_000);
      const result = await ctrl.readiness();
      expect(result.status).toBe('ok');
      const leaderCheck = result.checks.find((c) => c.name === 'outbox_leader');
      expect(leaderCheck?.ok).toBe(true);
    });
  });
});
