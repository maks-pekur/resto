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

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[identity-two-factor.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

/**
 * AUTH-07 — 2FA TOTP enable + verify + recovery codes + partial-activation
 * rejection (Pitfall 7 closed).
 *
 * Contract assumptions (verified at types.d.mts):
 *  - POST /api/auth/two-factor/enable      body { password } → { totpURI, backupCodes: string[10] }
 *  - POST /api/auth/two-factor/verify-totp body { code }     → 200 + flips user.twoFactorEnabled
 *  - POST /api/auth/two-factor/disable     body { password } → { status: true }
 *  - POST /api/auth/two-factor/totp/generate body { secret } → { code } (test-only helper to
 *    derive the current TOTP code from the secret without an external authenticator dep)
 *
 * D-23 / D-22 — what is NOT covered here (explicitly out of scope for Phase 03):
 *  - admin-reset-for-subordinates (Phase 17 / TEAM-04)
 *  - recovery-code regeneration UI (Phase 17 / TEAM-05)
 *  - email-recovery loop (collapses 2FA to email — never shipping)
 */

interface EnableResponse {
  readonly totpURI?: unknown;
  readonly backupCodes?: unknown;
}
interface MeBody {
  readonly kind?: unknown;
  readonly twoFactorEnabled?: unknown;
}
interface GenerateResponse {
  readonly code?: unknown;
}

// Lightweight typed-narrow wrappers. fastify-light's `inject().json()` returns
// `any`; routing through a parameterized factory keeps the call sites typed
// without spreading inline asserts that the linter flags as either unsafe
// (no-unsafe-argument) or unnecessary (no-unnecessary-type-assertion).
const asEnable = (raw: unknown): EnableResponse => raw as EnableResponse;
const asMe = (raw: unknown): MeBody => raw as MeBody;
const asGenerate = (raw: unknown): GenerateResponse => raw as GenerateResponse;

const extractSecret = (totpURI: string): string => {
  const url = new URL(totpURI);
  const secret = url.searchParams.get('secret');
  if (!secret) throw new Error(`extractSecret: no secret in ${totpURI}`);
  return secret;
};

const readTotpURI = (raw: unknown): string => {
  const body = asEnable(raw);
  return typeof body.totpURI === 'string' ? body.totpURI : '';
};

const readBackupCodes = (raw: unknown): readonly string[] => {
  const body = asEnable(raw);
  if (!Array.isArray(body.backupCodes)) return [];
  return body.backupCodes.filter((c): c is string => typeof c === 'string');
};

const readGenerateCode = (raw: unknown): string => {
  const body = asGenerate(raw);
  return typeof body.code === 'string' ? body.code : '';
};

const readTwoFactorEnabled = (raw: unknown): boolean => {
  const body = asMe(raw);
  return body.twoFactorEnabled === true;
};

const readMeKind = (raw: unknown): string => {
  const body = asMe(raw);
  return typeof body.kind === 'string' ? body.kind : '';
};

suite('Identity — 2FA TOTP enable + verify + Pitfall 7 closure (AUTH-07)', () => {
  let stack: RealStack;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_PUBLIC_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('enable returns { totpURI, backupCodes[10] } and does NOT yet flip twoFactorEnabled', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner' });
    const cookie = await signInAsOperator(stack.app, email, password, tenant.id);

    const res = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie },
      payload: { password },
    });
    expect(res.statusCode).toBe(200);
    const totpURI = readTotpURI(res.json());
    expect(totpURI.startsWith('otpauth://totp/')).toBe(true);
    const codes = readBackupCodes(res.json());
    expect(codes.length).toBe(10);
    for (const code of codes) {
      expect(code.length).toBeGreaterThan(0);
    }

    // Pitfall 7 — twoFactorEnabled MUST still be false after enable (only verify flips it).
    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(readMeKind(me.json())).toBe('operator');
    expect(readTwoFactorEnabled(me.json())).toBe(false);
  }, 60_000);

  it('verify-totp with the current code flips twoFactorEnabled=true on /v1/me', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa-2';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner 2' });
    const cookie = await signInAsOperator(stack.app, email, password, tenant.id);

    const enable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie },
      payload: { password },
    });
    expect(enable.statusCode).toBe(200);
    const secret = extractSecret(readTotpURI(enable.json()));

    const gen = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/totp/generate',
      headers: { 'content-type': 'application/json', cookie },
      payload: { secret },
    });
    expect(gen.statusCode).toBe(200);
    const code = readGenerateCode(gen.json());
    expect(code).toMatch(/^\d{6}$/u);

    const verify = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: { 'content-type': 'application/json', cookie },
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);

    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(readTwoFactorEnabled(me.json())).toBe(true);
  }, 60_000);

  it('verify-totp with a wrong code does NOT flip twoFactorEnabled', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa-3';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner 3' });
    const cookie = await signInAsOperator(stack.app, email, password, tenant.id);

    const enable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie },
      payload: { password },
    });
    expect(enable.statusCode).toBe(200);

    const verify = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: { 'content-type': 'application/json', cookie },
      payload: { code: '000000' },
    });
    expect(verify.statusCode).not.toBe(200);

    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(readTwoFactorEnabled(me.json())).toBe(false);
  }, 60_000);

  it('Pitfall 7: closing the tab between enable and verify leaves twoFactorEnabled=false', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa-4';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner 4' });
    const firstCookie = await signInAsOperator(stack.app, email, password, tenant.id);

    // Step 1: enable, capture the backup codes that were generated.
    const enable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie: firstCookie },
      payload: { password },
    });
    expect(enable.statusCode).toBe(200);
    const generatedCodes = readBackupCodes(enable.json());
    expect(generatedCodes.length).toBe(10);

    // Step 2: do NOT call verify. Simulate "close the tab" by signing out and
    // signing back in (fresh session).
    await stack.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { 'content-type': 'application/json', cookie: firstCookie },
      payload: {},
    });
    const secondCookie = await signInAsOperator(stack.app, email, password, tenant.id);

    // Step 3: /v1/me MUST still report twoFactorEnabled=false (no half-state).
    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: secondCookie },
    });
    expect(me.statusCode).toBe(200);
    expect(readTwoFactorEnabled(me.json())).toBe(false);

    // Step 4: the codes BA generated during the never-verified enable() are
    // NOT authoritative for any sign-in path. BA's verify-backup-code requires
    // twoFactorEnabled=true; the call MUST be rejected.
    const firstCode = generatedCodes[0] ?? '';
    expect(firstCode.length).toBeGreaterThan(0);
    const useBackup = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-backup-code',
      headers: { 'content-type': 'application/json', cookie: secondCookie },
      payload: { code: firstCode },
    });
    expect(useBackup.statusCode).not.toBe(200);
  }, 60_000);

  it('disable: after activation, password-confirmed disable flips twoFactorEnabled back to false', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa-5';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner 5' });
    const cookie = await signInAsOperator(stack.app, email, password, tenant.id);

    const enable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie },
      payload: { password },
    });
    expect(enable.statusCode).toBe(200);
    const secret = extractSecret(readTotpURI(enable.json()));

    const gen = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/totp/generate',
      headers: { 'content-type': 'application/json', cookie },
      payload: { secret },
    });
    const code = readGenerateCode(gen.json());

    const verify = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: { 'content-type': 'application/json', cookie },
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);

    const disable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/disable',
      headers: { 'content-type': 'application/json', cookie },
      payload: { password },
    });
    expect(disable.statusCode).toBe(200);

    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie },
    });
    expect(readTwoFactorEnabled(me.json())).toBe(false);
  }, 60_000);
});
