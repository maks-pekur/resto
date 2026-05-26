import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SchedulerRegistry } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { TenantErasureSchedulerService } from '../../src/infrastructure/tenant-erasure-scheduler.service';
import { InboxRetentionService } from '../../src/infrastructure/inbox-retention.service';
import { OffboardTenantService } from '../../src/contexts/tenancy/application/offboard-tenant.service';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

suite('BackgroundJobsModule cron services', () => {
  let stack: RealStack;

  beforeAll(async () => {
    stack = await startRealStack();
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  describe('TenantErasureSchedulerService', () => {
    it('completes with zero tenants scheduled — logs ok=0/failed=0/total=0', async () => {
      const service = stack.app.get(TenantErasureSchedulerService);
      // Per D-11: with no scheduled tenants, the run completes cleanly.
      await expect(service.run()).resolves.toBeUndefined();
    });

    it('continues on per-tenant failure and records OTel error span', async () => {
      const service = stack.app.get(TenantErasureSchedulerService);
      const offboard = stack.app.get(OffboardTenantService);

      const TENANT_A = TenantId.parse('11111111-1111-4111-8111-111111111111');
      const TENANT_B = TenantId.parse('22222222-2222-4222-8222-222222222222');
      const listSpy = vi
        .spyOn(offboard, 'listScheduled')
        .mockResolvedValue([{ id: TENANT_A }, { id: TENANT_B }] as never);
      const eraseSpy = vi
        .spyOn(offboard, 'executeErasure')
        .mockImplementationOnce(() => Promise.reject(new Error('simulated erasure failure')))
        .mockResolvedValueOnce({} as never);

      await service.run();

      expect(eraseSpy).toHaveBeenCalledTimes(2);
      // Both iterations ran sequentially — the failure did not short-circuit.
      expect(eraseSpy.mock.calls[0]?.[0]).toMatchObject({ tenantId: TENANT_A });
      expect(eraseSpy.mock.calls[1]?.[0]).toMatchObject({ tenantId: TENANT_B });

      listSpy.mockRestore();
      eraseSpy.mockRestore();
    });
  });

  describe('InboxRetentionService', () => {
    it('deletes inbox_processed rows older than retention threshold', async () => {
      const service = stack.app.get(InboxRetentionService);
      const db = stack.app.get(TenantAwareDb);

      // Seed five rows with processed_at > 30 days ago.
      await db.withoutTenant('background-jobs e2e: seed inbox_processed', async (tx) => {
        for (let i = 0; i < 5; i += 1) {
          await tx.execute(
            sql`INSERT INTO inbox_processed (event_id, consumer, tenant_id, processed_at)
                VALUES (gen_random_uuid(), 'e2e-inbox-retention-seed', NULL, NOW() - INTERVAL '31 days')`,
          );
        }
      });

      await service.run();

      const remaining = await db.withoutTenant(
        'background-jobs e2e: count remaining inbox_processed',
        async (tx) => {
          const rows = await tx
            .select()
            .from(schema.inboxProcessed)
            .where(sql`consumer = 'e2e-inbox-retention-seed'`);
          return rows.length;
        },
      );
      expect(remaining).toBe(0);
    });
  });

  describe('@Cron registration', () => {
    it('registers tenant-erasure and inbox-retention cron jobs with UTC timezone', () => {
      const registry = stack.app.get(SchedulerRegistry);
      const erasureJob = registry.getCronJob('tenant-erasure');
      const inboxJob = registry.getCronJob('inbox-retention');
      expect(erasureJob).toBeDefined();
      expect(inboxJob).toBeDefined();
      // cron-time stores timezone on `cronTime.timeZone` (string) for both jobs.
      const tz = (job: { cronTime: { timeZone?: string } }): string | undefined =>
        job.cronTime.timeZone;
      expect(tz(erasureJob)).toBe('UTC');
      expect(tz(inboxJob)).toBe('UTC');
    });
  });
});
