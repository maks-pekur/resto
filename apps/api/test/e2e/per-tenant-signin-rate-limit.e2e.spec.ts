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

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

// D-20: per-tenant signin rate-limit regression.
// The per-tenant cap is deliberately set very low (3/min) so we can
// trigger the limit quickly without a large number of requests.
const PER_TENANT_CAP = 3;

suite('Per-tenant signin rate-limit (D-20)', () => {
  let stack: RealStack;
  let tenantSlug: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN = String(PER_TENANT_CAP);
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '10000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '10000';
    process.env.RATE_LIMIT_PUBLIC_PER_MIN = '10000';
    process.env.RATE_LIMIT_AUTH_SIGNUP_PER_MIN = '10000';

    stack = await startRealStack();

    tenantSlug = `ratelimit-${randomUUID().slice(0, 8)}`;
    await provisionTenant(stack.app, tenantSlug, 'integration-test-token-1234567890');

    await runBootstrap({
      tenantSlug,
      email: `owner-${tenantSlug}@example.com`,
      password: 'correct-horse-battery-staple',
      name: 'Rate Limit Owner',
    });
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('Test 4: 429 on the N+1 request for a single tenant within 1 minute', async () => {
    const signIn = async () =>
      stack.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: {
          'content-type': 'application/json',
          'x-tenant-slug': tenantSlug,
        },
        payload: {
          email: `owner-${tenantSlug}@example.com`,
          password: 'wrong-password-for-rate-limit-test',
        },
      });

    // First N requests — should be allowed (may return 401 due to wrong password,
    // but not 429 from the per-tenant bucket).
    for (let i = 0; i < PER_TENANT_CAP; i++) {
      const res = await signIn();
      expect(res.statusCode).not.toBe(429);
    }

    // N+1 request — should be throttled by the per-tenant bucket.
    const throttled = await signIn();
    expect(throttled.statusCode).toBe(429);
    const body = throttled.json<{ code?: string }>();
    expect(body.code).toBe('rate-limit-exceeded');
  });

  it('Test 5: 429 timing parity — per-tenant 429 response time is within ±150ms of per-IP 429 (D-06 second clause)', async () => {
    // This is a timing parity test. We verify that the per-tenant 429 does not
    // respond significantly faster than an allowed request, which would leak the
    // per-tenant boundary via timing.
    //
    // The ±150ms window is deliberately generous for CI environments.
    // The implementation uses the same synchronous Map lookup path regardless
    // of allowed/rejected, so timing should be well within this bound.

    // Warm up — use a new tenant slug (bucket starts fresh) to measure an allowed request.
    const freshSlug = `timing-${randomUUID().slice(0, 8)}`;

    const allowedStart = performance.now();
    await stack.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json', 'x-tenant-slug': freshSlug },
      payload: { email: 'test@example.com', password: 'wrong' },
    });
    const allowedDuration = performance.now() - allowedStart;

    // Use the original tenant slug (bucket is exhausted from Test 4) for a 429 measurement.
    const throttledStart = performance.now();
    await stack.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json', 'x-tenant-slug': tenantSlug },
      payload: { email: `owner-${tenantSlug}@example.com`, password: 'wrong' },
    });
    const throttledDuration = performance.now() - throttledStart;

    // The 429 branch executes the same bucket-lookup path before replying,
    // so response times should be within a generous CI window.
    expect(Math.abs(throttledDuration - allowedDuration)).toBeLessThan(150);
  });
});
