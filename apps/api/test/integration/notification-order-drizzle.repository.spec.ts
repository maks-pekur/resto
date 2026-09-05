import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from '../e2e/helpers/with-db-stack';
import { NotificationOrderDrizzleRepository } from '../../src/contexts/notifications/infrastructure/notification-order-drizzle.repository';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[notification-order-drizzle.repository] Docker not available — skipping.');
}

suite(
  'NotificationOrderDrizzleRepository (07.5-13: tenantSlug + primaryCustomDomain projection)',
  () => {
    let stack: DbStack;
    let repo: NotificationOrderDrizzleRepository;

    const tenantWithCustomDomainId = randomUUID();
    const tenantWithoutCustomDomainId = randomUUID();
    const locationId = randomUUID();
    const otherLocationId = randomUUID();
    const orderWithCustomDomainId = randomUUID();
    const orderWithoutCustomDomainId = randomUUID();

    beforeAll(async () => {
      stack = await startDbStack();
      repo = new NotificationOrderDrizzleRepository(stack.db);

      await stack.db.withoutTenant('seed notification-order fixtures', async (tx) => {
        await tx.insert(schema.tenants).values([
          {
            id: tenantWithCustomDomainId,
            slug: `notif-custom-${tenantWithCustomDomainId.slice(0, 8)}`,
            displayName: 'Custom Domain Tenant',
            locale: 'en',
            country: 'GB',
            defaultCurrency: 'EUR',
          },
          {
            id: tenantWithoutCustomDomainId,
            slug: `notif-apex-${tenantWithoutCustomDomainId.slice(0, 8)}`,
            displayName: 'Apex Only Tenant',
            locale: 'en',
            country: 'GB',
            defaultCurrency: 'EUR',
          },
        ]);
        await tx.insert(schema.locations).values([
          { id: locationId, tenantId: tenantWithCustomDomainId, name: 'Main', slug: 'main' },
          {
            id: otherLocationId,
            tenantId: tenantWithoutCustomDomainId,
            name: 'Main',
            slug: 'main',
          },
        ]);
        await tx.insert(schema.tenantDomains).values([
          {
            tenantId: tenantWithCustomDomainId,
            domain: 'order.custom-domain-fixture.example',
            kind: 'custom',
            isPrimary: true,
            verifiedAt: new Date(),
          },
          {
            tenantId: tenantWithoutCustomDomainId,
            domain: `notif-apex-${tenantWithoutCustomDomainId.slice(0, 8)}.resto.app`,
            kind: 'subdomain',
            isPrimary: true,
          },
        ]);
        await tx.insert(schema.orders).values([
          {
            id: orderWithCustomDomainId,
            tenantId: tenantWithCustomDomainId,
            locationId,
            idempotencyKey: orderWithCustomDomainId,
            orderNumber: 'N-1',
            status: 'placed',
            orderType: 'dine_in',
            customerEmail: 'guest-1@example.com',
            subtotal: '10.00',
            total: '10.00',
            currency: 'EUR',
            shortNumber: 1,
          },
          {
            id: orderWithoutCustomDomainId,
            tenantId: tenantWithoutCustomDomainId,
            locationId: otherLocationId,
            idempotencyKey: orderWithoutCustomDomainId,
            orderNumber: 'N-2',
            status: 'placed',
            orderType: 'dine_in',
            customerEmail: 'guest-2@example.com',
            subtotal: '10.00',
            total: '10.00',
            currency: 'EUR',
            shortNumber: 2,
          },
        ]);
      });
    }, 180_000);

    afterAll(async () => {
      if (stack) await stopDbStack(stack);
    });

    it('carries the tenant slug and the primary verified custom domain when one exists', async () => {
      const row = await repo.findOrder(
        TenantId.parse(tenantWithCustomDomainId),
        orderWithCustomDomainId,
      );

      expect(row?.tenantSlug).toBe(`notif-custom-${tenantWithCustomDomainId.slice(0, 8)}`);
      expect(row?.primaryCustomDomain).toBe('order.custom-domain-fixture.example');
    });

    it('carries a null primaryCustomDomain when the tenant only has a subdomain row', async () => {
      const row = await repo.findOrder(
        TenantId.parse(tenantWithoutCustomDomainId),
        orderWithoutCustomDomainId,
      );

      expect(row?.tenantSlug).toBe(`notif-apex-${tenantWithoutCustomDomainId.slice(0, 8)}`);
      expect(row?.primaryCustomDomain).toBeNull();
    });
  },
);
