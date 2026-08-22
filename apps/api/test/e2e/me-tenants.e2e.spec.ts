import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signIn } from './helpers/operator-fixture';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) console.warn('[me-tenants.e2e] Docker not available — skipping.');

// Replaces the deleted pre-merge per-restaurant-label listing spec (10.2
// plan 19). The old endpoint listed sub-labels WITHIN one tenant, scoped
// by a per-member scope table, with a POST half for creating additional
// labels. Neither survives as a like-for-like rename: a tenant can no
// longer hold multiple of those labels (D-03), and creating a second
// tenant for an existing owner is a deliberately deferred entry
// point (CONTEXT.md GAP, D-39) with no
// backend route to test. `GET /v1/me/tenants` is a genuinely different
// endpoint that happens to occupy the same naming slot: it lists the
// TENANTS the signed-in user is a MEMBER of, backing the sign-in
// picker (D-17). This file tests that endpoint on its own terms, per the
// plan's own instruction.
suite('GET /v1/me/tenants', () => {
  let stack: RealStack;

  beforeAll(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    stack = await startRealStack({ natsEnabledInApp: false });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('a user who belongs to exactly one tenant sees exactly one', async () => {
    const slug = `mt-one-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password: PASSWORD, name: 'Solo Owner' });
    const cookie = await signIn(stack.app, email, PASSWORD);

    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/me/tenants',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ tenants: { id: string; slug: string }[] }>();
    expect(body.tenants).toHaveLength(1);
    expect(body.tenants[0]?.id).toBe(tenant.id);
  }, 60_000);

  it('a user who belongs to two tenants sees exactly two — the picker depends on this', async () => {
    const slugA = `mt-two-a-${randomUUID().slice(0, 8)}`;
    const slugB = `mt-two-b-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slugA}@example.com`;
    const tenantA = await provisionTenant(stack.app, slugA, INTERNAL_TOKEN);
    const tenantB = await provisionTenant(stack.app, slugB, INTERNAL_TOKEN);
    const { userId } = await runBootstrap({
      tenantSlug: slugA,
      email,
      password: PASSWORD,
      name: 'Multi Owner',
    });

    const db = stack.app.get(TenantAwareDb);
    await db.withoutTenant('seed second membership for me-tenants e2e', (tx) =>
      tx.insert(schema.member).values({
        id: randomUUID(),
        tenantId: tenantB.id,
        userId,
        role: 'staff',
        createdAt: new Date(),
      }),
    );

    const cookie = await signIn(stack.app, email, PASSWORD);
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/me/tenants',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ tenants: { id: string }[] }>();
    expect(body.tenants).toHaveLength(2);
    const ids = body.tenants.map((t) => t.id).sort();
    expect(ids).toEqual([tenantA.id, tenantB.id].sort());
  }, 60_000);

  it('never lists a tenant the user is not a member of — the leak boundary', async () => {
    const slugA = `mt-leak-a-${randomUUID().slice(0, 8)}`;
    const slugB = `mt-leak-b-${randomUUID().slice(0, 8)}`;
    const emailA = `owner-${slugA}@example.com`;
    const tenantA = await provisionTenant(stack.app, slugA, INTERNAL_TOKEN);
    const tenantB = await provisionTenant(stack.app, slugB, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slugA, email: emailA, password: PASSWORD, name: 'Owner A' });
    // Owner A has no membership in tenant B whatsoever.

    const cookie = await signIn(stack.app, emailA, PASSWORD);
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/me/tenants',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ tenants: { id: string }[] }>();
    const ids = body.tenants.map((t) => t.id);
    expect(ids).toContain(tenantA.id);
    expect(ids).not.toContain(tenantB.id);
  }, 60_000);

  it('works pre-bind: a fresh sign-in with no active tenant can still call it (D-17)', async () => {
    const slug = `mt-prebind-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password: PASSWORD, name: 'Fresh Owner' });

    // signIn only — no set-active/switch-organization call, matching a
    // genuinely fresh session with no activeOrganizationId bound yet.
    const cookie = await signIn(stack.app, email, PASSWORD);
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/me/tenants',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
  }, 60_000);
});
