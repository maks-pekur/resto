import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { trace } from '@opentelemetry/api';
import { getCorrelationId } from '@resto/events';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Env } from '../config/env.schema';

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
    // Disable per-route auto-attach. NestJS's route-registration path
    // doesn't reliably trigger the plugin's `onRoute` callback, so we
    // apply the limiter via a single global `preHandler` hook below.
    // `preHandler` runs after route matching so the limiter has the
    // route config it needs; 404 paths are intentionally skipped (their
    // protection is covered by upstream ALB/WAF in prod per ADR-0011).
    global: false,
    timeWindow: '1 minute',
    max: (req: FastifyRequest): number =>
      isInternalRoute(req.url) ? env.RATE_LIMIT_INTERNAL_PER_MIN : env.RATE_LIMIT_PUBLIC_PER_MIN,
    allowList: (req: FastifyRequest): boolean => req.url === '/healthz',
    errorResponseBuilder: (req: FastifyRequest, context: RateLimitContext): unknown => {
      const traceId = trace.getActiveSpan()?.spanContext().traceId;
      const correlationId = getCorrelationId();
      const problem: Record<string, unknown> = {
        type: 'https://resto.app/problems/rate-limit-exceeded',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded, retry in ${Math.ceil(context.ttl / 1000).toString()} seconds`,
        instance: req.url,
      };
      if (correlationId !== undefined) problem.correlationId = correlationId;
      if (traceId !== undefined) problem.traceId = traceId;
      return problem;
    },
  });

  fastify.addHook('preHandler', fastify.rateLimit());

  // @fastify/rate-limit serializes its body as plain JSON; rewrite the
  // content-type so 429s match the rest of the api's RFC 7807 surface.
  fastify.addHook(
    'onSend',
    async (_req: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> => {
      if (reply.statusCode === 429) {
        reply.header('content-type', 'application/problem+json');
      }
      return payload;
    },
  );
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
};
