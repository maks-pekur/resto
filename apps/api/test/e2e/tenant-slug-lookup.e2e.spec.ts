import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema, TenantAwareDb } from '@resto/db';
import {
  CheckTenantSlugAvailabilityService,
  SLUG_LOOKUP_LIMIT,
} from '../../src/contexts/identity/application/check-tenant-slug-availability.service';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[tenant-slug-lookup.e2e] Docker not available — skipping.');
}

// Replaces brand-slug-lookup.e2e.spec.ts (10.2 plan 19). The rate-limited
// slug check survives renamed (D-40), but the row-cap logic it tested
// moved from a public BrandDrizzleRepository method to a PRIVATE method on
// CheckTenantSlugAvailabilityService querying `tenants` directly — there
// is no longer a repository method to probe in isolation. Exercised here
// through the service's own public `execute`, resolved from the real DI
// container (the service depends on the `resto_auth`-scoped AuthDrizzle,
// which only `with-real-stack.setup.ts` provisions): seeding well past
// SLUG_LOOKUP_LIMIT colliding tenant slugs must not make the lookup error
// or hang.
suite('CheckTenantSlugAvailabilityService — row cap under heavy collision', () => {
  let stack: RealStack;

  beforeAll(async () => {
    stack = await startRealStack({ natsEnabledInApp: false });

    const db = stack.app.get(TenantAwareDb);
    await db.withoutTenant('seed tenant slug-cap fixture', async (tx) => {
      const rows = [
        { id: randomUUID(), slug: 'capx', displayName: 'capx', country: 'GB' as const },
        ...Array.from({ length: 150 }, (_, i) => ({
          id: randomUUID(),
          slug: `capx-${(i + 2).toString()}`,
          displayName: `capx-${(i + 2).toString()}`,
          country: 'GB' as const,
        })),
      ];
      await tx.insert(schema.tenants).values(rows);
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('completes without error when far more than SLUG_LOOKUP_LIMIT rows collide on the prefix', async () => {
    const service = stack.app.get(CheckTenantSlugAvailabilityService);
    const result = await service.execute('capx');
    expect(SLUG_LOOKUP_LIMIT).toBe(100);
    expect(result.available).toBe(false);
    if (result.suggestion !== null) {
      expect(result.suggestion).toMatch(/^capx-\d+$/);
    }
  });
});
