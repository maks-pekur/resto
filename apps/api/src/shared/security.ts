import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Env } from '../config/env.schema';
import { applyPerTenantSigninRateLimit } from '../middleware/per-tenant-signin-rate-limit';
import { RateLimitGuard, type RateLimitHandler } from './rate-limit.guard';

const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Compile a CORS allowlist into a matcher. Each pattern is either an
 * exact origin (`https://admin.resto.app`) or contains `*` as a single
 * subdomain segment (`https://*.menu.resto.app`). The wildcard never
 * spans dots, so `https://*.example.com` does not match
 * `https://a.b.example.com` — that's intentional, prevents a sloppy
 * pattern from opening up a parent domain.
 */
export const buildOriginMatcher = (patterns: readonly string[]): ((origin: string) => boolean) => {
  if (patterns.length === 0) return () => false;
  const compiled = patterns.map((pattern) => {
    if (!pattern.includes('*')) return { kind: 'literal', value: pattern } as const;
    const re = new RegExp(`^${pattern.split('*').map(escapeRegex).join('[^./:]+')}$`);
    return { kind: 'regex', value: re } as const;
  });
  return (origin) =>
    compiled.some((entry) =>
      entry.kind === 'literal' ? entry.value === origin : entry.value.test(origin),
    );
};

const isInternalRoute = (url: string): boolean => url.startsWith('/internal/v1/');

const STRIPE_WEBHOOK_PATH = '/webhook/stripe';

const rateLimitKeyGenerator = (req: FastifyRequest): string =>
  req.principal && 'userId' in req.principal ? req.principal.userId : `ip:${req.ip}`;

/**
 * Best-effort email extraction from a parsed BA request body. BA's
 * sign-in/reset endpoints accept JSON or `application/x-www-form-urlencoded`;
 * Fastify pre-parses both into `req.body`. Returns `undefined` if the
 * email is missing or non-string — the caller falls back to the per-IP
 * bucket only.
 */
const readEmailFromBody = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>).email;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

interface RateLimitContext {
  readonly after: string;
  readonly max: number;
  readonly ttl: number;
}

interface IdentityBucket {
  count: number;
  resetAt: number;
}

const identityBuckets = new Map<string, IdentityBucket>();
const IDENTITY_BUCKET_WINDOW_MS = 60_000;

// CR-03: identityBuckets keyed by per-email lowercased value has unbounded
// cardinality (attacker can rotate email-shaped strings). Periodic sweep
// drops expired entries; the LRU cap is a belt-and-suspenders bound on
// adversarial bursts.
const IDENTITY_SWEEP_INTERVAL_MS = 5 * 60_000;
const IDENTITY_MAX_BUCKETS = 50_000;

const sweepExpiredIdentity = (): void => {
  const now = Date.now();
  for (const [k, v] of identityBuckets) {
    if (v.resetAt <= now) identityBuckets.delete(k);
  }
  if (identityBuckets.size > IDENTITY_MAX_BUCKETS) {
    const overflow = identityBuckets.size - IDENTITY_MAX_BUCKETS;
    let dropped = 0;
    for (const k of identityBuckets.keys()) {
      if (dropped >= overflow) break;
      identityBuckets.delete(k);
      dropped += 1;
    }
  }
};

setInterval(sweepExpiredIdentity, IDENTITY_SWEEP_INTERVAL_MS).unref();

const consumeIdentityBucket = (key: string, cap: number): { allowed: boolean; ttlMs: number } => {
  const now = Date.now();
  const existing = identityBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    identityBuckets.set(key, { count: 1, resetAt: now + IDENTITY_BUCKET_WINDOW_MS });
    return { allowed: true, ttlMs: IDENTITY_BUCKET_WINDOW_MS };
  }
  if (existing.count >= cap) {
    return { allowed: false, ttlMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { allowed: true, ttlMs: existing.resetAt - now };
};

/**
 * Register network-layer security plugins on the underlying Fastify
 * instance. Called from main.ts before `app.listen` and from the e2e
 * test harness before the app is `ready`. Order matters: helmet first
 * (response headers on every reply), then CORS (preflight short-circuit),
 * then rate limit (last gate before the route).
 */
export const registerSecurity = async (app: NestFastifyApplication, env: Env): Promise<void> => {
  // platform-fastify parameterises `FastifyInstance` with a generic
  // `FastifyTypeProvider`, while @fastify/* plugins are typed against
  // `FastifyTypeProviderDefault` and add module-augmentation properties
  // (e.g. `rateLimit`). Untyping at the seam is the conventional
  // NestJS+Fastify-plugin interop fix — runtime is fine, only the type
  // alignment needs help. Inline callbacks below carry their own types.
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  const fastify: any = app.getHttpAdapter().getInstance();

  await fastify.register(helmet, {
    // Disable CSP — the api is not an HTML origin and Swagger UI under
    // /docs needs a permissive policy that's not worth maintaining
    // until we deploy a public docs surface. HSTS, X-CTO, X-Frame-Options
    // and friends remain enabled.
    contentSecurityPolicy: false,
  });

  const matchOrigin = buildOriginMatcher(env.CORS_ALLOWED_ORIGINS);
  await fastify.register(cors, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void): void => {
      // Same-origin and non-browser callers (no Origin header) pass
      // through; browsers enforce the rest via the preflight result.
      if (origin === undefined || origin === '' || matchOrigin(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(rateLimit, {
    // Disable per-route auto-attach. NestJS's `FastifyAdapter`
    // route-registration path bypasses the plugin's `onRoute` callback
    // and the equivalent global `preHandler` hook surfaces the limit
    // exception outside Nest's exception pipeline (RES-120). The
    // `RateLimitGuard` below invokes the limiter from inside the Nest
    // pipeline so the standard `ProblemDetailsFilter` formats the 429.
    global: false,
    timeWindow: '1 minute',
    keyGenerator: rateLimitKeyGenerator,
    max: (req: FastifyRequest): number => {
      if (isInternalRoute(req.url)) return env.RATE_LIMIT_INTERNAL_PER_MIN;
      if (req.url.startsWith('/api/auth/sign-up') || req.url.startsWith('/v1/signup'))
        return env.RATE_LIMIT_AUTH_SIGNUP_PER_MIN;
      if (req.url.startsWith('/api/auth/request-password-reset'))
        return env.RATE_LIMIT_AUTH_RESET_PER_MIN;
      if (req.url.startsWith('/api/auth/sign-in/email')) return env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN;
      return env.RATE_LIMIT_PUBLIC_PER_MIN;
    },
    // Stripe webhook is rate-limit-exempt: a 429 makes Stripe retry
    // indefinitely (self-DoS).
    allowList: (req: FastifyRequest): boolean =>
      req.url === '/healthz' || req.url === STRIPE_WEBHOOK_PATH,
    errorResponseBuilder: (_req: FastifyRequest, context: RateLimitContext): unknown => ({
      // Shape matches NestJS HttpException response convention
      // (`message`, `code`) so `ProblemDetailsFilter` derives title/type
      // automatically. The limiter throws this object as the error
      // body; the guard catches and rewraps as a Nest 429.
      message: 'Too Many Requests',
      code: 'rate-limit-exceeded',
      detail: `Rate limit exceeded, retry in ${Math.ceil(context.ttl / 1000).toString()} seconds`,
    }),
  });

  const rateLimitHandler = fastify.rateLimit() as RateLimitHandler;

  // BA's `/api/auth/*` endpoints are mounted directly on Fastify (see
  // identity-http.module → better-auth.handler) so the NestJS Guard does
  // not see them. The preHandler hook intercepts every BA request before
  // routing so the same per-endpoint `max` logic (sign-up, reset,
  // sign-in/email) applies without any module-scope coupling.
  // The limiter throws a Fastify HTTP error when the limit is exceeded;
  // we catch it here and call reply.send() so Fastify's onSend chain still
  // fires (including the content-type rewrite below). Rethrowing would
  // bypass onSend and land in NestJS's global exception filter → 500.
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.url.startsWith('/api/auth/')) return;
    try {
      await rateLimitHandler(req, reply);
    } catch (err) {
      const body = err as { statusCode?: number };
      reply.status(body.statusCode ?? 429).send(err);
      return;
    }

    const isSignin = req.url.startsWith('/api/auth/sign-in/email');
    const isReset = req.url.startsWith('/api/auth/request-password-reset');
    if (!isSignin && !isReset) return;

    // D-20: per-tenant signin rate-limit applied before per-email so that
    // tenant-scoped burst is caught first (the higher default cap of 60/min
    // makes it the outer fence; per-email at 10/min is the inner fence).
    if (isSignin && !applyPerTenantSigninRateLimit(req, reply, env)) return;

    const email = readEmailFromBody(req.body);
    if (!email) return;
    const cap = isSignin
      ? env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN
      : env.RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN;
    const key = `${isSignin ? 'signin' : 'reset'}:${email.toLowerCase()}`;
    const { allowed, ttlMs } = consumeIdentityBucket(key, cap);
    if (!allowed) {
      reply.status(429).send({
        message: 'Too Many Requests',
        code: 'rate-limit-exceeded',
        detail: `Rate limit exceeded, retry in ${Math.ceil(ttlMs / 1000).toString()} seconds`,
      });
    }
  });

  // The limiter throws a Fastify HTTP error whose body is the
  // problem-shaped object built above; Fastify serialises it as plain
  // JSON. Rewrite the content-type for 429s so /api/auth/* matches the
  // rest of the api's RFC 7807 surface (NestJS-routed 429s already get
  // problem+json from `ProblemDetailsFilter`).
  fastify.addHook(
    'onSend',
    async (_req: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> => {
      if (reply.statusCode === 429) {
        reply.header('content-type', 'application/problem+json');
      }
      return payload;
    },
  );

  app.useGlobalGuards(new RateLimitGuard(rateLimitHandler));
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
};
