import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from '../e2e/helpers/with-db-stack';
import { RecordAuditService } from '../../src/contexts/audit/application/record-audit.service';
import type { EventEnvelope } from '@resto/events';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn(
    '[ordering-audit-projection] Docker not available — skipping. RESTO_REQUIRE_DOCKER fail-closed.',
  );
}

const buildOrderCreatedEnvelope = (orderId: string, tenantId: string): EventEnvelope => ({
  id: randomUUID(),
  type: 'ordering.order_created.v1',
  version: 1,
  tenantId: TenantId.parse(tenantId),
  correlationId: randomUUID(),
  causationId: null,
  occurredAt: new Date(),
  payload: {
    orderId,
    tenantId,
    orderNumber: '20260614-TEST1',
    orderType: 'pickup',
    total: 1200,
    currency: 'USD',
    itemCount: 1,
  },
});

suite(
  'ORD-09: RecordAuditService — ordering.order_created.v1 projection (NATS-independent)',
  () => {
    let stack: DbStack;
    let service: RecordAuditService;

    beforeAll(async () => {
      stack = await startDbStack();
      service = new RecordAuditService();
    }, 180_000);

    afterAll(async () => {
      if (stack) await stopDbStack(stack);
    });

    it('writes exactly one audit_log row with target_id === orderId and targetType === order', async () => {
      const tenantId = randomUUID();
      const orderId = randomUUID();
      const envelope = buildOrderCreatedEnvelope(orderId, tenantId);

      await stack.db.withoutTenant('ord-09 projection: seed tenant', async (tx) => {
        await tx.insert(schema.tenants).values({
          id: tenantId,
          slug: `ord09-${tenantId.slice(0, 8)}`,
          displayName: 'ORD-09 Tenant',
          locale: 'en',
          country: 'GB',
          defaultCurrency: 'USD',
        });
      });

      await stack.db.withoutTenant('ord-09 projection: write audit row', async (tx) => {
        await service.fromEnvelopeWithTx(envelope, tx);
      });

      const rows = await stack.db.withoutTenant('ord-09 projection: read audit_log', async (tx) =>
        tx
          .select({
            action: schema.auditLog.action,
            targetType: schema.auditLog.targetType,
            targetId: schema.auditLog.targetId,
            tenantId: schema.auditLog.tenantId,
          })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.targetId, orderId)),
      );

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      expect(row?.targetId).toBe(orderId);
      expect(row?.targetType).toBe('order');
      expect(row?.action).toBe('ordering.order_created.v1');
      expect(row?.tenantId).toBe(tenantId);
    });

    it('resolves targetId from orderId for all 5 ordering event types', async () => {
      const tenantId = randomUUID();
      const orderId = randomUUID();

      await stack.db.withoutTenant('ord-09 5-events: seed tenant', async (tx) => {
        await tx.insert(schema.tenants).values({
          id: tenantId,
          slug: `ord09b-${tenantId.slice(0, 8)}`,
          displayName: 'ORD-09b Tenant',
          locale: 'en',
          country: 'GB',
          defaultCurrency: 'USD',
        });
      });

      const eventTypes = [
        'ordering.order_created.v1',
        'ordering.order_paid.v1',
        'ordering.order_canceled.v1',
        'ordering.order_refunded.v1',
        'ordering.order_status_changed.v1',
      ] as const;

      for (const [i, type] of eventTypes.entries()) {
        const envelope: EventEnvelope = {
          id: randomUUID(),
          type,
          version: 1,
          tenantId: TenantId.parse(tenantId),
          correlationId: randomUUID(),
          causationId: null,
          occurredAt: new Date(),
          payload: { orderId, tenantId, total: 0, currency: 'USD', itemCount: 1 },
        };

        await stack.db.withoutTenant(`ord-09 5-events[${i.toString()}]: write`, async (tx) => {
          await service.fromEnvelopeWithTx(envelope, tx);
        });
      }

      const rows = await stack.db.withoutTenant('ord-09 5-events: read audit_log', async (tx) =>
        tx
          .select({ action: schema.auditLog.action, targetId: schema.auditLog.targetId })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.tenantId, tenantId)),
      );

      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(row.targetId).toBe(orderId);
      }
    });
  },
);
