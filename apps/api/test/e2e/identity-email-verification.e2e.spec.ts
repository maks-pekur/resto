import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap } from './helpers/operator-fixture';
import { EMAIL_ADAPTER_PORT } from '../../src/contexts/identity/domain/ports';
import type { CapturedEmailAdapter } from '../../src/contexts/identity/infrastructure/email/captured.adapter';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn(
    '[identity-email-verification.e2e] Docker not available — skipping integration tests.',
  );
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

/**
 * AUTH-06 (Phase 03):
 *   1. A new BA signup triggers `sendVerificationEmail` through the wired
 *      adapter (`emailVerification.sendOnSignUp: true` in auth.config.ts).
 *   2. When `REQUIRE_EMAIL_VERIFICATION=true` is exported in the env,
 *      BA refuses sign-in for unverified credentials with a recognizable
 *      error code — operators with `emailVerified=false` cannot exchange
 *      a password for a session, which gates ALL downstream protected
 *      endpoints (gated via `AuthGuard` once no session exists).
 *
 * Note: REQUIRE_EMAIL_VERIFICATION is already wired into BA's
 * `emailAndPassword.requireEmailVerification` block at
 * `identity-core.module.ts:254` by Plan 02. This spec is the regression
 * gate that proves the wiring is load-bearing.
 */
// The two halves of AUTH-06 need DIFFERENT env, and REQUIRE_EMAIL_VERIFICATION is
// read when the Nest app builds BA — so it cannot be toggled between `it` blocks.
// They therefore get one stack each.
//
// Part 1 runs WITHOUT the gate: with it on, /v1/signup provisions the tenant and
// the user and is then refused its own closing auto-sign-in, so the request 400s.
// Whether that should instead be a 201-without-session is a product question, not
// something this spec should freeze into an assertion.
suite('Identity — sign-up sends a verification email (AUTH-06 part 1)', () => {
  let stack: RealStack;
  let captured: CapturedEmailAdapter;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNUP_PER_MIN = '1000';
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    stack = await startRealStack();
    captured = stack.app.get<CapturedEmailAdapter>(EMAIL_ADAPTER_PORT);
    expect(captured.adapterName).toBe('captured');
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('triggers sendVerification on the sign-up email path', async () => {
    captured.clear();
    const email = `verify-${randomUUID().slice(0, 8)}@example.com`;
    // D-29 closed the public /api/auth/sign-up/email route (403
    // signup.direct_disabled); POST /v1/signup is the sanctioned path and
    // reaches the same auth.api.signUpEmail, so sendOnSignUp still fires.
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: 'correct-horse-battery-staple-12',
        name: 'Verify User',
        country: 'GB',
      },
    });
    // The surface that matters is the verification email landing in the adapter.
    expect(res.statusCode).toBe(201);

    const all = captured.getCaptured();
    const v = all.find((e) => e.kind === 'verification' && 'to' in e && e.to === email);
    expect(v).toBeDefined();
    expect(v && 'url' in v ? v.url : undefined).toBeTruthy();
  }, 60_000);
});

// Part 2 runs WITH the gate on — that is the whole point of it.
suite('Identity — REQUIRE_EMAIL_VERIFICATION gate (AUTH-06 part 2)', () => {
  let stack: RealStack;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNUP_PER_MIN = '1000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    stack = await startRealStack();
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
  });

  it('refuses sign-in for an unverified credential when REQUIRE_EMAIL_VERIFICATION=true', async () => {
    const slug = `verify-block-${randomUUID().slice(0, 8)}`;
    const password = 'correct-horse-battery-staple-block';
    const email = `owner-${slug}@example.com`;

    await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    // runBootstrap drives BA's signUpEmail under the hood — the user is
    // created with emailVerified=false (BA default until verification
    // link click).
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Block Owner' });

    const signIn = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email, password },
    });
    // BA blocks the sign-in with 403 + EMAIL_NOT_VERIFIED (or 401 in
    // older BA versions); the response MUST NOT contain a Set-Cookie
    // session (the gate is load-bearing).
    expect([401, 403]).toContain(signIn.statusCode);
    const setCookie = signIn.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
    expect(cookieStr).not.toContain('better-auth.session_token');
  }, 60_000);
});
