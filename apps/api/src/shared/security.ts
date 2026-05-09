import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Env } from '../config/env.schema';
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

interface RateLimitContext {
  readonly after: string;
  readonly max: number;
  readonly ttl: number;
}

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
    // Single per-IP store across all routes — same IP hitting different
    // route groups shares the counter. Per-endpoint max overrides at
    // request time but the counter is shared. Acceptable for MVP-1; a
    // future ticket can per-bucket via `keyGenerator` if cross-traffic
    // pollution becomes visible.
    max: (req: FastifyRequest): number => {
      if (isInternalRoute(req.url)) return env.RATE_LIMIT_INTERNAL_PER_MIN;
      if (req.url.startsWith('/api/auth/sign-up')) return env.RATE_LIMIT_AUTH_SIGNUP_PER_MIN;
      if (req.url.startsWith('/api/auth/request-password-reset'))
        return env.RATE_LIMIT_AUTH_RESET_PER_MIN;
      if (req.url.startsWith('/api/auth/sign-in/email')) return env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN;
      return env.RATE_LIMIT_PUBLIC_PER_MIN;
    },
    allowList: (req: FastifyRequest): boolean => req.url === '/healthz',
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
    if (req.url.startsWith('/api/auth/')) {
      try {
        await rateLimitHandler(req, reply);
      } catch (err) {
        const body = err as { statusCode?: number };
        reply.status(body.statusCode ?? 429).send(err);
      }
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
