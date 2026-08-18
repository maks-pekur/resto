import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import {
  addMemberWithRole,
  provisionTenant,
  runBootstrap,
  signInAsOperator,
} from './helpers/operator-fixture';
import { EMAIL_ADAPTER_PORT } from '../../src/contexts/identity/domain/ports';
import type { CapturedEmailAdapter } from '../../src/contexts/identity/infrastructure/email/captured.adapter';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[identity-invitation.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

interface CapturedEmail {
  readonly kind: 'invitation' | 'reset-password' | 'verification';
  readonly to?: string;
  readonly url?: string;
  readonly tenantSlug?: string;
}

/**
 * AUTH-02 + AUTH-03 (Phase 03): invitation send + accept regressions.
 *
 * The Skeptic LOW-12 mandated regression is Test "owner-only-grants-owner" —
 * an admin-tier operator attempting to invite a new owner-tier member MUST
 * receive a 403 from BA's `crud-invites.mjs:112` `creatorRole` enforcement.
 *
 * Pitfall 8 is asserted indirectly: the test fixture creates a verified
 * owner; the regression test stays scoped to the owner-vs-admin matrix
 * because the verified-vs-unverified gate is exercised by the dedicated
 * `identity-email-verification.e2e.spec.ts` spec.
 */
suite('Identity — invitation send + owner-only-grants-owner regression (AUTH-02/03)', () => {
  let stack: RealStack;
  let captured: CapturedEmailAdapter;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_PUBLIC_PER_MIN = '10000';
    // Verification is OFF in this spec — `runBootstrap` produces
    // unverified rows otherwise, and BA blocks sign-in. The companion
    // spec `identity-email-verification.e2e.spec.ts` covers the gated path.
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();
    captured = stack.app.get<CapturedEmailAdapter>(EMAIL_ADAPTER_PORT);
    expect(captured.adapterName).toBe('captured');
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('owner can send an invitation → email lands in the captured adapter', async () => {
    const slug = `inv-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${slug}@example.com`;
    const ownerPwd = 'correct-horse-battery-staple-inv';
    const inviteeEmail = `invitee-${randomUUID().slice(0, 8)}@example.com`;

    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({
      tenantSlug: slug,
      email: ownerEmail,
      password: ownerPwd,
      name: 'Invitation Owner',
    });
    const ownerCookie = await signInAsOperator(stack.app, ownerEmail, ownerPwd, tenant.id);

    captured.clear();
    const res = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/organization/invite-member',
      headers: { 'content-type': 'application/json', cookie: ownerCookie },
      payload: { email: inviteeEmail, role: 'admin' },
    });
    expect([200, 201]).toContain(res.statusCode);

    const all = captured.getCaptured() as readonly CapturedEmail[];
    const invitation = all.find((e) => e.kind === 'invitation' && e.to === inviteeEmail);
    expect(invitation).toBeDefined();
    expect(invitation?.url).toContain('accept-invitation');
    expect(invitation?.tenantSlug).toBe(slug);
  }, 60_000);

  it('Skeptic LOW-12: an admin-tier member cannot invite anyone as owner', async () => {
    const slug = `inv-admin-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${slug}@example.com`;
    const adminEmail = `admin-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-low12';

    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({
      tenantSlug: slug,
      email: ownerEmail,
      password,
      name: 'LOW-12 Owner',
    });
    const ownerCookie = await signInAsOperator(stack.app, ownerEmail, password, tenant.id);

    const adminCookie = await addMemberWithRole(stack.app, {
      tenantId: tenant.id,
      internalToken: INTERNAL_TOKEN,
      email: adminEmail,
      password,
      name: 'LOW-12 Admin',
      role: 'admin',
    });

    const adminInvitesAdmin = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/organization/invite-member',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { email: `peer-${randomUUID().slice(0, 8)}@example.com`, role: 'admin' },
    });
    expect([200, 201]).toContain(adminInvitesAdmin.statusCode);

    const escalate = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/organization/invite-member',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { email: `escalation-${randomUUID().slice(0, 8)}@example.com`, role: 'owner' },
    });
    expect(escalate.statusCode).toBe(403);

    const ownerGrantsOwner = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/organization/invite-member',
      headers: { 'content-type': 'application/json', cookie: ownerCookie },
      payload: { email: `co-owner-${randomUUID().slice(0, 8)}@example.com`, role: 'owner' },
    });
    expect([200, 201]).toContain(ownerGrantsOwner.statusCode);
  }, 90_000);
});
