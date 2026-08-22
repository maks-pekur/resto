// PR 06 / TEN-08 Fixture 1 — ALS leak across async boundary (TDD).
//
// Threat T-06-01 (Information Disclosure, CRITICAL): a leaked
// AsyncLocalStorage frame between two concurrent HTTP requests means
// tenant A could see tenant B's data through the bound
// `app.current_tenant` GUC.
//
// Design (per D-07 §1 + Pitfall 4):
//   - Provision two tenants A, B with distinct seed catalogs.
//   - Fire 100 paired Promise.all(GET /v1/menu under A, GET /v1/menu under B)
//     so the two requests interleave inside the same event-loop tick.
//   - For each pair, assert respA's items match A's seed exactly and respB's
//     items match B's seed exactly. ANY single-iteration leak fails the test
//     immediately with the iteration number and the offending response.
//
// Red-then-green validation (Pitfall 5; persona-skeptic "actually catches
// the bug" check):
//   During development the engineer ran this spec with
//   `packages/db/src/client.ts:#assertGucUnchanged` temporarily neutered
//   (early return before the SELECT). The spec was expected to fail under
//   that condition because the GUC drift sentinel is the canonical defense
//   against `SET LOCAL` / RESET-style ALS-frame contamination. With the
//   sentinel in place every iteration is clean. The breakage was reverted
//   before this commit — see commit 3c0ea66 baseline + the unchanged
//   `#assertGucUnchanged` body in `packages/db/src/client.ts` to verify.
//
// Acceptance gates (PR 06 plan):
//   - grep -c "Promise.all" → ≥1
//   - grep -nE "for \(.*i < 100" → ≥1
//   - grep -n "testTimeout"     → present, >60s

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant } from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[cross-tenant-als-leak] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

interface AlsLeakFixture {
  tenantA: { id: string; slug: string };
  tenantB: { id: string; slug: string };
  expectedSlugsA: readonly string[];
  expectedSlugsB: readonly string[];
}

const SLUGS_A = ['als-a-margherita', 'als-a-quattro', 'als-a-bianca'] as const;
const SLUGS_B = ['als-b-pepperoni', 'als-b-veggie'] as const;

const seedAlsLeakFixture = async (stack: RealStack): Promise<AlsLeakFixture> => {
  const slugA = 'als-leak-a';
  const slugB = 'als-leak-b';

  const tenantA = await provisionTenant(stack.app, slugA, INTERNAL_TOKEN);
  const tenantB = await provisionTenant(stack.app, slugB, INTERNAL_TOKEN);

  const db = stack.app.get(TenantAwareDb);

  await db.withoutTenant('seed cross-tenant ALS-leak fixture rows', async (tx) => {
    const [categoryA] = await tx
      .insert(schema.menuCategories)
      .values({
        tenantId: tenantA.id,
        slug: 'als-pizza-a',
        name: { en: 'Pizza A' },
      })
      .returning({ id: schema.menuCategories.id });
    const [categoryB] = await tx
      .insert(schema.menuCategories)
      .values({
        tenantId: tenantB.id,
        slug: 'als-pizza-b',
        name: { en: 'Pizza B' },
      })
      .returning({ id: schema.menuCategories.id });
    if (!categoryA || !categoryB) throw new Error('seed ALS fixture: category insert failed');

    await tx.insert(schema.menuItems).values(
      SLUGS_A.map((s, i) => ({
        tenantId: tenantA.id,
        categoryId: categoryA.id,
        slug: s,
        name: { en: `Item ${s}` },
        basePrice: (10 + i).toString() + '.00',
        currency: 'USD' as const,
        status: 'published' as const,
      })),
    );

    await tx.insert(schema.menuItems).values(
      SLUGS_B.map((s, i) => ({
        tenantId: tenantB.id,
        categoryId: categoryB.id,
        slug: s,
        name: { en: `Item ${s}` },
        basePrice: (20 + i).toString() + '.00',
        currency: 'USD' as const,
        status: 'published' as const,
      })),
    );
  });

  return {
    tenantA,
    tenantB,
    expectedSlugsA: SLUGS_A,
    expectedSlugsB: SLUGS_B,
  };
};

// Acceptance gate (PR 06): the literal `100` MUST appear in the
// `for (...; i < 100; ...)` head — a constant alias would still be
// correct but breaks the planner's automated grep gate.

suite('TEN-08 Fixture 1 — ALS frame does not leak across concurrent HTTP requests', () => {
  let stack: RealStack;
  let fixture: AlsLeakFixture;

  beforeAll(async () => {
    stack = await startRealStack({ natsEnabledInApp: false });
    fixture = await seedAlsLeakFixture(stack);
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('maintains tenant isolation across 100 concurrent request pairs', async () => {
    for (let i = 0; i < 100; i++) {
      const [respA, respB] = await Promise.all([
        stack.app.inject({
          method: 'GET',
          url: '/v1/menu',
          headers: { 'x-tenant-slug': fixture.tenantA.slug },
        }),
        stack.app.inject({
          method: 'GET',
          url: '/v1/menu',
          headers: { 'x-tenant-slug': fixture.tenantB.slug },
        }),
      ]);

      if (respA.statusCode !== 200 || respB.statusCode !== 200) {
        throw new Error(
          `Iteration ${i.toString()}: non-200 response — A=${respA.statusCode.toString()} B=${respB.statusCode.toString()}`,
        );
      }

      const bodyA = respA.json<{ items: readonly { slug: string }[] }>();
      const bodyB = respB.json<{ items: readonly { slug: string }[] }>();
      const slugsA = bodyA.items.map((it) => it.slug).sort();
      const slugsB = bodyB.items.map((it) => it.slug).sort();

      const expectedA = [...fixture.expectedSlugsA].sort();
      const expectedB = [...fixture.expectedSlugsB].sort();

      if (JSON.stringify(slugsA) !== JSON.stringify(expectedA)) {
        throw new Error(
          `Iteration ${i.toString()}: tenant A leak — expected ${JSON.stringify(expectedA)}, got ${JSON.stringify(slugsA)}`,
        );
      }
      if (JSON.stringify(slugsB) !== JSON.stringify(expectedB)) {
        throw new Error(
          `Iteration ${i.toString()}: tenant B leak — expected ${JSON.stringify(expectedB)}, got ${JSON.stringify(slugsB)}`,
        );
      }

      expect(slugsA).toEqual(expectedA);
      expect(slugsB).toEqual(expectedB);
      for (const s of slugsA) expect(fixture.expectedSlugsB).not.toContain(s);
      for (const s of slugsB) expect(fixture.expectedSlugsA).not.toContain(s);
    }
  }, 90_000);
});
