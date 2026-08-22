import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) console.warn('[catalog-guard-safety.e2e] Docker not available — skipping.');

// Replaces the deleted per-restaurant-label isolation net from before the
// tenant/organization merge (10.2 plan 19, Plan 08.2-06's SC-4 suite).
// Disposition, decided per-case, not as a block:
//
// - The pin-reconciliation, default-deny, in-scope-positive-control, and
//   owner-bypass cases all tested the deleted per-label scope guard on
//   `POST /v1/catalog/categories`. That route is `@LocationNeutral()`
//   today (catalog structure is tenant-wide, not per-location) — there is
//   no scope guard left on it to test. The identical SHAPE of assertion
//   (non-owner scope mismatch -> 404, zero-scope -> 403 default-deny,
//   in-scope -> 200, owner bypass) survives intact on the route that IS
//   still scope-guarded, `/v1/catalog/stop-list` — already covered by
//   location-isolation.e2e.spec.ts's Task 1 describe blocks. Not
//   duplicated here.
// - The pin-un-forgeable case (a raw `/api/auth/update-session` write
//   attempting to move the deleted per-label session pin) has a direct
//   successor in organization-switch.e2e.spec.ts's ported tamper case,
//   proving `activeOrganizationId`/`activeTenantId` cannot be forged the
//   same way.
// - The GUC-binding proof asserted a SECURITY DEFINER function set a GUC
//   that RLS read. The function and its GUC are dropped outright (D-09);
//   the negative-existence assertion lives in
//   packages/db/test/integration/tenant-isolation.spec.ts.
//
// What survives here: public/guest routes must never be gated by an
// operator-scope guard. This property has no per-label OR per-location
// dimension — it is about guard placement, not about what the guard
// checks — so it is kept as its own file rather than folded into a
// scope-specific spec.
suite('Public routes are never gated by an operator-scope guard', () => {
  let stack: RealStack;
  let tenantId: string;
  let tenantSlug: string;
  let tenantHost: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack({ natsEnabledInApp: false });

    tenantSlug = `guardsafe-${randomUUID().slice(0, 8)}`;
    tenantHost = `${tenantSlug}.menu.resto.app`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
    await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('anonymous GET /v1/menu is never rejected by an operator-scope guard code', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost },
    });

    const SCOPE_GUARD_CODES = [
      'location.operator_required',
      'location.context_required',
      'location.access_denied',
    ];
    if (res.statusCode >= 400) {
      const body = res.json<{ code?: string }>();
      expect(SCOPE_GUARD_CODES).not.toContain(body.code);
    } else {
      expect(res.statusCode).toBe(200);
    }
  });

  it('guest POST /v1/orders is never rejected by an operator-scope guard code', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      payload: {
        items: [],
        customerName: 'Guest',
        customerPhone: '+1234567890',
        deliveryType: 'pickup',
      },
    });

    const SCOPE_GUARD_CODES = [
      'location.operator_required',
      'location.context_required',
      'location.access_denied',
    ];
    if (res.statusCode >= 400) {
      const body = res.json<{ code?: string }>();
      expect(SCOPE_GUARD_CODES).not.toContain(body.code);
    } else {
      expect([200, 201]).toContain(res.statusCode);
    }
  });
});
