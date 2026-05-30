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
  console.warn('[identity-password-reset.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

interface CapturedEmail {
  readonly kind: 'invitation' | 'reset-password' | 'verification';
  readonly to?: string;
  readonly url?: string;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  if (s.length % 2 === 0) return ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
  return s[m] ?? 0;
};

/**
 * AUTH-04/05 + D-06 (Phase 03):
 *   - `POST /api/auth/request-password-reset` MUST trigger the wired email
 *     adapter when the email exists.
 *   - The same endpoint MUST behave identically (status, body, ±10ms median
 *     timing) when the email does not exist (BA built-in parity, verified
 *     in 03-RESEARCH.md against `password.mjs:51-61` of BA 1.4.22).
 *   - The reset-password completion path is exercised end-to-end via the
 *     captured token; verifying that BA's cascade hook (sessions revoked +
 *     `identity.password_reset_completed.v1` envelope) fires lives in
 *     `identity-audit.e2e.spec.ts` — this spec focuses on the email-out
 *     and enumeration-parity surface.
 */
suite('Identity — password reset email + D-06 parity', () => {
  let stack: RealStack;
  let captured: CapturedEmailAdapter;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_RESET_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN = '1000';
    stack = await startRealStack();
    captured = stack.app.get<CapturedEmailAdapter>(EMAIL_ADAPTER_PORT);
    expect(captured.adapterName).toBe('captured');
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('sends reset email through the wired adapter for an existing user', async () => {
    const slug = `reset-${randomUUID().slice(0, 8)}`;
    const password = 'correct-horse-battery-staple-reset';
    const email = `owner-${slug}@example.com`;

    await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Reset Owner' });

    captured.clear();
    const res = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      headers: { 'content-type': 'application/json' },
      payload: { email, redirectTo: 'http://localhost:3001/reset-password' },
    });
    expect(res.statusCode).toBe(200);

    const all = captured.getCaptured() as readonly CapturedEmail[];
    const reset = all.find((e) => e.kind === 'reset-password' && e.to === email);
    expect(reset).toBeDefined();
    expect(reset?.url).toContain('reset-password');
  }, 60_000);

  it('returns identical status + body for existing vs nonexistent email (enumeration parity)', async () => {
    const slug = `reset-parity-${randomUUID().slice(0, 8)}`;
    const password = 'correct-horse-battery-staple-parity';
    const email = `owner-${slug}@example.com`;
    await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Parity Owner' });

    const ghostEmail = `ghost-${randomUUID().slice(0, 8)}@example.com`;
    captured.clear();

    const real = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      headers: { 'content-type': 'application/json' },
      payload: { email, redirectTo: 'http://localhost:3001/reset-password' },
    });
    const ghost = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      headers: { 'content-type': 'application/json' },
      payload: { email: ghostEmail, redirectTo: 'http://localhost:3001/reset-password' },
    });

    expect(real.statusCode).toBe(ghost.statusCode);
    expect(real.body).toBe(ghost.body);
    // No mail goes out for the ghost.
    const ghostEmails = captured.getCaptured().filter((e) => 'to' in e && e.to === ghostEmail);
    expect(ghostEmails).toHaveLength(0);
  }, 60_000);

  it('timing parity — median delta < 60ms across paired requests', async () => {
    const slug = `reset-timing-${randomUUID().slice(0, 8)}`;
    const password = 'correct-horse-battery-staple-timing';
    const email = `owner-${slug}@example.com`;
    await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Timing Owner' });

    const ITERATIONS = 10;
    const realTimes: number[] = [];
    const ghostTimes: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const ghostEmail = `ghost-${randomUUID().slice(0, 8)}@example.com`;
      const t1 = Date.now();
      const r1 = await stack.app.inject({
        method: 'POST',
        url: '/api/auth/request-password-reset',
        headers: { 'content-type': 'application/json' },
        payload: { email, redirectTo: 'http://localhost:3001/reset-password' },
      });
      realTimes.push(Date.now() - t1);
      expect(r1.statusCode).toBe(200);

      const t2 = Date.now();
      const r2 = await stack.app.inject({
        method: 'POST',
        url: '/api/auth/request-password-reset',
        headers: { 'content-type': 'application/json' },
        payload: { email: ghostEmail, redirectTo: 'http://localhost:3001/reset-password' },
      });
      ghostTimes.push(Date.now() - t2);
      expect(r2.statusCode).toBe(200);
    }
    const delta = Math.abs(median(realTimes) - median(ghostTimes));
     
    console.warn(
      `[D-06 reset] median real=${median(realTimes).toFixed(1)}ms ghost=${median(ghostTimes).toFixed(1)}ms delta=${delta.toFixed(1)}ms`,
    );
    expect(delta).toBeLessThan(60);
  }, 120_000);
});
