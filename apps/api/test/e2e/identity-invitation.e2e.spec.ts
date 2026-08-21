import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { schema } from '@resto/db';
import { AppModule } from '../../src/app.module';
import {
  addMemberWithRole,
  extractCookies,
  provisionTenant,
  runBootstrap,
  signInAsOperator,
} from './helpers/operator-fixture';
import { EMAIL_ADAPTER_PORT } from '../../src/contexts/identity/domain/ports';
import type { CapturedEmailAdapter } from '../../src/contexts/identity/infrastructure/email/captured.adapter';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

interface CapturedEmail {
  readonly kind: 'invitation' | 'reset-password' | 'verification';
  readonly to?: string;
  readonly url?: string;
  readonly tenantSlug?: string;
}

/**
 * No testcontainer here (10.2 plan 13, Task 3) — a fresh-container migration
 * replay of the full chain fails on the pre-existing 0079 idempotency bug
 * (`ALTER POLICY organization_role_resto_auth_full` — logged in
 * deferred-items.md under plan 06, owned by plans 05/19, unrelated to this
 * plan's files). The live dev Postgres is already migrated with roles
 * granted; this spec inserts its own uniquely-slugged rows into it rather
 * than rebuilding the database, matching plan 12's `organization-switch.
 * e2e.spec.ts` precedent for the same blocker (also applied to
 * `signup-enumeration.e2e.spec.ts` / `signup.e2e.spec.ts` /
 * `identity-bootstrap.e2e.spec.ts` earlier in this same plan).
 *
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
describe('Identity — invitation send + owner-only-grants-owner regression (AUTH-02/03)', () => {
  let app: NestFastifyApplication;
  let captured: CapturedEmailAdapter;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgres://resto_app:resto_app_dev_password@localhost:5433/resto';
    process.env.BETTER_AUTH_DATABASE_URL =
      'postgres://resto_auth:auth_password_dev@localhost:5433/resto';
    process.env.NATS_URL = 'nats://localhost:4222';
    process.env.NODE_ENV = 'test';
    process.env.OTEL_DISABLED = 'true';
    process.env.NATS_DISABLED = 'true';
    process.env.BETTER_AUTH_SECRET = 'invitation-e2e-secret-padding-padding-padding-padding';
    process.env.BETTER_AUTH_BASE_URL = 'http://localhost:4000';
    process.env.ADMIN_WEB_URL = 'http://localhost:3000';
    process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'x';
    process.env.S3_SECRET_KEY = 'x';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNUP_PER_MIN = '1000';
    process.env.RATE_LIMIT_PUBLIC_PER_MIN = '10000';
    // Verification is OFF for SIGN-IN in this spec — `runBootstrap` produces
    // unverified rows otherwise, and BA blocks sign-in. The companion spec
    // `identity-email-verification.e2e.spec.ts` covers the gated sign-in
    // path. This does NOT affect `requireEmailVerificationOnInvitation`
    // (hardcoded true in auth.config.ts, Pitfall 8) — the carve-out tests
    // below still verify the invitee's email before accepting.
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    captured = app.get<CapturedEmailAdapter>(EMAIL_ADAPTER_PORT);
    expect(captured.adapterName).toBe('captured');
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('owner can send an invitation → email lands in the captured adapter', async () => {
    const slug = `inv-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${slug}@example.com`;
    const ownerPwd = 'correct-horse-battery-staple-inv';
    const inviteeEmail = `invitee-${randomUUID().slice(0, 8)}@example.com`;

    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({
      tenantSlug: slug,
      email: ownerEmail,
      password: ownerPwd,
      name: 'Invitation Owner',
    });
    const ownerCookie = await signInAsOperator(app, ownerEmail, ownerPwd, tenant.id);

    captured.clear();
    const res = await app.inject({
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

    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({
      tenantSlug: slug,
      email: ownerEmail,
      password,
      name: 'LOW-12 Owner',
    });
    const ownerCookie = await signInAsOperator(app, ownerEmail, password, tenant.id);

    const adminCookie = await addMemberWithRole(app, {
      tenantId: tenant.id,
      internalToken: INTERNAL_TOKEN,
      email: adminEmail,
      password,
      name: 'LOW-12 Admin',
      role: 'admin',
    });

    const adminInvitesAdmin = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/invite-member',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { email: `peer-${randomUUID().slice(0, 8)}@example.com`, role: 'admin' },
    });
    expect([200, 201]).toContain(adminInvitesAdmin.statusCode);

    const escalate = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/invite-member',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { email: `escalation-${randomUUID().slice(0, 8)}@example.com`, role: 'owner' },
    });
    expect(escalate.statusCode).toBe(403);

    const ownerGrantsOwner = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/invite-member',
      headers: { 'content-type': 'application/json', cookie: ownerCookie },
      payload: { email: `co-owner-${randomUUID().slice(0, 8)}@example.com`, role: 'owner' },
    });
    expect([200, 201]).toContain(ownerGrantsOwner.statusCode);
  }, 90_000);

  /**
   * D-29 (10.2 plan 13, Task 3): `POST /api/auth/sign-up/email` is closed to
   * the public internet except for an email carrying a valid, pending,
   * non-expired invitation. Case 1 (reject) and case 2 (admit) exercise the
   * SAME endpoint and code path with different DB state — this is the F-32
   * discipline (10.2-FINDINGS.md): a suite where every case passes cannot
   * distinguish "the control rejected the spoof" from "the control never
   * ran". If the `hooks.before` gate were absent or a no-op, case 1 would
   * also return 200, not 403 — so case 1's rejection is itself the proof
   * the gate is live, and case 2's admission proves it is not a blanket
   * deny either.
   */
  describe('POST /api/auth/sign-up/email — invitation carve-out (D-29)', () => {
    it('rejects a direct signup for an email with no pending invitation', async () => {
      const email = `no-invite-${randomUUID().slice(0, 8)}@example.com`;
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { 'content-type': 'application/json' },
        payload: { email, password: 'correct-horse-battery-staple-noinv', name: 'No Invite' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<{ code: string }>().code).toBe('signup.direct_disabled');
    });

    it('admits a direct signup submitted in a different case than the invitation, through to membership', async () => {
      const slug = `inv-carve-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `owner-${slug}@example.com`;
      const ownerPwd = 'correct-horse-battery-staple-carve';
      // Mixed case on the SIGNUP side only — BA itself lowercases (never
      // trims) the email it writes into `invitation.email` on invite
      // (crud-invites.mjs:76, `ctx.body.email.toLowerCase()`), so the
      // carve-out's own lookup lowercases the submitted signup email before
      // comparing. This proves that normalisation, not just an exact-string
      // match. (Whitespace is exercised separately below — BA's own
      // `z.email()` body schema rejects a whitespace-padded address outright
      // before an account could ever be created from it, so a whitespace
      // variant cannot reach this "admitted, all the way to membership"
      // path in practice.)
      const inviteeEmailCanonical = `invitee-${randomUUID().slice(0, 8)}@example.com`;
      const inviteeEmailAsSubmitted = inviteeEmailCanonical.toUpperCase();

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({
        tenantSlug: slug,
        email: ownerEmail,
        password: ownerPwd,
        name: 'Carveout Owner',
      });
      const ownerCookie = await signInAsOperator(app, ownerEmail, ownerPwd, tenant.id);

      const inviteRes = await app.inject({
        method: 'POST',
        url: '/api/auth/organization/invite-member',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        payload: { email: inviteeEmailCanonical, role: 'staff' },
      });
      expect([200, 201]).toContain(inviteRes.statusCode);
      const invitationId = inviteRes.json<{ id: string }>().id;

      captured.clear();
      const signUpRes = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: inviteeEmailAsSubmitted,
          password: 'correct-horse-battery-staple-invitee',
          name: 'Invitee Carveout',
        },
      });
      expect(signUpRes.statusCode).toBe(200);

      const verificationEmail = (captured.getCaptured() as readonly CapturedEmail[]).find(
        (e) => e.kind === 'verification',
      );
      if (!verificationEmail?.url) {
        expect.fail('verification email was not captured');
      }
      const verifyUrl = new URL(verificationEmail.url);

      const verifyRes = await app.inject({
        method: 'GET',
        url: `${verifyUrl.pathname}${verifyUrl.search}`,
      });
      expect(verifyRes.statusCode).toBe(302);
      const inviteeCookie = extractCookies(verifyRes.headers['set-cookie']);
      expect(inviteeCookie).toContain('better-auth.session_token');

      const acceptRes = await app.inject({
        method: 'POST',
        url: '/api/auth/organization/accept-invitation',
        headers: { 'content-type': 'application/json', cookie: inviteeCookie },
        payload: { invitationId },
      });
      expect(acceptRes.statusCode).toBe(200);
      const accepted = acceptRes.json<{ member: { role: string; userId: string } }>();
      expect(accepted.member.role).toBe('staff');

      const authDb = app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
      const memberRows = await authDb.db
        .select()
        .from(schema.member)
        .where(eq(schema.member.userId, accepted.member.userId));
      expect(memberRows).toHaveLength(1);
      expect(memberRows[0]?.tenantId).toBe(tenant.id);
      expect(memberRows[0]?.role).toBe('staff');
    }, 60_000);

    it('rejects a direct signup when the only invitation for that email has expired', async () => {
      const slug = `inv-expired-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `owner-${slug}@example.com`;
      const ownerPwd = 'correct-horse-battery-staple-expired';
      const inviteeEmail = `expired-invitee-${randomUUID().slice(0, 8)}@example.com`;

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({
        tenantSlug: slug,
        email: ownerEmail,
        password: ownerPwd,
        name: 'Expired Owner',
      });
      const ownerCookie = await signInAsOperator(app, ownerEmail, ownerPwd, tenant.id);

      const inviteRes = await app.inject({
        method: 'POST',
        url: '/api/auth/organization/invite-member',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        payload: { email: inviteeEmail, role: 'staff' },
      });
      expect([200, 201]).toContain(inviteRes.statusCode);
      const invitationId = inviteRes.json<{ id: string }>().id;

      const authDb = app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
      await authDb.db
        .update(schema.invitation)
        .set({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where(eq(schema.invitation.id, invitationId));

      const signUpRes = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: inviteeEmail,
          password: 'correct-horse-battery-staple-expiredinv',
          name: 'Expired Invitee',
        },
      });
      expect(signUpRes.statusCode).toBe(403);
      expect(signUpRes.json<{ code: string }>().code).toBe('signup.direct_disabled');
    }, 60_000);

    it('a whitespace-padded invitee email is not blocked as "disabled" by the closure gate', async () => {
      const slug = `inv-ws-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `owner-${slug}@example.com`;
      const ownerPwd = 'correct-horse-battery-staple-ws';
      const inviteeEmailCanonical = `ws-invitee-${randomUUID().slice(0, 8)}@example.com`;

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({
        tenantSlug: slug,
        email: ownerEmail,
        password: ownerPwd,
        name: 'Whitespace Owner',
      });
      const ownerCookie = await signInAsOperator(app, ownerEmail, ownerPwd, tenant.id);

      const inviteRes = await app.inject({
        method: 'POST',
        url: '/api/auth/organization/invite-member',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        payload: { email: inviteeEmailCanonical, role: 'staff' },
      });
      expect([200, 201]).toContain(inviteRes.statusCode);

      const signUpRes = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: `  ${inviteeEmailCanonical}  `,
          password: 'correct-horse-battery-staple-wsinvitee',
          name: 'Whitespace Invitee',
        },
      });
      // The gate's own `.trim().toLowerCase()` lookup finds the invitation,
      // so the closure itself admits the request (never returns 403
      // `signup.direct_disabled`). BA's OWN `z.email()` body schema then
      // rejects the untrimmed address at 400 (`VALIDATION_ERROR`) — a
      // separate, later layer. Asserting 400-not-403 proves whitespace
      // cannot be used to either dodge or trigger the closure gate itself.
      expect(signUpRes.statusCode).toBe(400);
    }, 60_000);
  });
});
