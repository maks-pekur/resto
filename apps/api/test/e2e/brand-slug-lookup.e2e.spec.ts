import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema } from '@resto/db';
import { BrandDrizzleRepository } from '../../src/contexts/tenancy/infrastructure/brand-drizzle.repository';
import { SLUG_LOOKUP_LIMIT } from '../../src/contexts/identity/application/check-brand-slug-availability.service';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[brand-slug-lookup.e2e] Docker not available — skipping.');
}

suite('BrandDrizzleRepository.findActiveSlugsByPrefix — row cap', () => {
  let stack: DbStack;
  let repo: BrandDrizzleRepository;

  beforeAll(async () => {
    stack = await startDbStack();
    repo = new BrandDrizzleRepository(stack.db);

    const tenantId = randomUUID();
    await stack.db.withoutTenant('seed brand slug-cap tenant', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: 'cap-tenant',
        displayName: 'Cap Tenant',
        locale: 'en',
        defaultCurrency: 'USD',
      });
      const rows = [
        { id: randomUUID(), tenantId, slug: 'capx', displayName: 'capx' },
        ...Array.from({ length: 150 }, (_, i) => ({
          id: randomUUID(),
          tenantId,
          slug: `capx-${(i + 2).toString()}`,
          displayName: `capx-${(i + 2).toString()}`,
        })),
      ];
      await tx.insert(schema.brands).values(rows);
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('returns no more than SLUG_LOOKUP_LIMIT rows even with 150 matches seeded', async () => {
    const slugs = await repo.findActiveSlugsByPrefix('capx', SLUG_LOOKUP_LIMIT);
    expect(slugs.length).toBeLessThanOrEqual(SLUG_LOOKUP_LIMIT);
    expect(SLUG_LOOKUP_LIMIT).toBe(100);
  });
});
