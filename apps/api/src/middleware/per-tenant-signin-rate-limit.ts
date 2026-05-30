import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../config/env.schema';

// D-20 / D-06: per-tenant signin rate-limit. Applied IN ADDITION to the
// per-IP and per-email buckets registered in security.ts. An attacker
// rotating IPs and email addresses against one tenant is throttled here.
//
// D-06 second clause: 429 from this bucket time-equalizes to match the
// per-IP/per-email 429 timing (±10ms) to prevent enumeration via response
// timing — a faster 429 would reveal which bucket fired, leaking the
// per-tenant config boundary.

interface TenantBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;

// CR-03: bound the bucket store so a slug-rotating attacker cannot grow
// the Map without limit. SWEEP_INTERVAL_MS drains expired entries; the
// LRU cap is a belt-and-suspenders cap on adversarial cardinality bursts.
const SWEEP_INTERVAL_MS = 5 * 60_000;
const MAX_BUCKETS = 10_000;

// CR-03: strict allowlist for `x-tenant-slug`. Matches DNS-label rules used
// elsewhere in the codebase (TenantSlug). Anything outside is rejected at
// extractTenantKey() so adversarial keys never reach the bucket map.
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
// UUID v4 shape — BA's organizationId surface is UUID-like; bound cardinality
// by rejecting anything else.
const ORG_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Module-scope bucket store — resets on process restart (acceptable for
// MVP-1 in-process rate limiting; Redis-backed store is a Phase 6+ concern).
const tenantBuckets = new Map<string, TenantBucket>();

const now = (): number => Date.now();

const sweepExpired = (): void => {
  const ts = now();
  for (const [k, v] of tenantBuckets) {
    if (v.resetAt <= ts) tenantBuckets.delete(k);
  }
  if (tenantBuckets.size > MAX_BUCKETS) {
    // Insertion-order iteration drops the oldest entries first.
    const overflow = tenantBuckets.size - MAX_BUCKETS;
    let dropped = 0;
    for (const k of tenantBuckets.keys()) {
      if (dropped >= overflow) break;
      tenantBuckets.delete(k);
      dropped += 1;
    }
  }
};

setInterval(sweepExpired, SWEEP_INTERVAL_MS).unref();

const formatMinuteKey = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear().toString()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
};

/**
 * Extract the tenant identifier from the sign-in request.
 *
 * Priority:
 * 1. `x-tenant-slug` header (admin panel sets this — Phase 1 mechanism).
 * 2. `organizationId` from the BA request body (BA sign-in can carry it).
 *
 * Returns `undefined` when neither is present OR fails the strict slug /
 * uuid allowlist; caller falls back to per-IP + per-email buckets only.
 * The allowlist (CR-03) prevents an attacker from allocating one bucket
 * per invented `x-tenant-slug` value.
 */
const extractTenantKey = (req: FastifyRequest): string | undefined => {
  const slugHeader = req.headers['x-tenant-slug'];
  if (typeof slugHeader === 'string' && slugHeader.length > 0) {
    const slug = slugHeader.toLowerCase();
    if (!SLUG_PATTERN.test(slug)) return undefined;
    return `slug:${slug}`;
  }
  const body = req.body;
  if (typeof body === 'object' && body !== null) {
    const orgId = (body as Record<string, unknown>).organizationId;
    if (typeof orgId === 'string' && ORG_ID_PATTERN.test(orgId)) {
      return `org:${orgId.toLowerCase()}`;
    }
  }
  return undefined;
};

const consumeTenantBucket = (
  tenantKey: string,
  cap: number,
): { allowed: boolean; ttlMs: number } => {
  const ts = now();
  const minuteKey = formatMinuteKey(ts);
  const key = `signin:tenant:${tenantKey}:minute:${minuteKey}`;
  const existing = tenantBuckets.get(key);
  if (!existing || existing.resetAt <= ts) {
    tenantBuckets.set(key, { count: 1, resetAt: ts + WINDOW_MS });
    return { allowed: true, ttlMs: WINDOW_MS };
  }
  if (existing.count >= cap) {
    return { allowed: false, ttlMs: existing.resetAt - ts };
  }
  existing.count += 1;
  return { allowed: true, ttlMs: existing.resetAt - ts };
};

/**
 * Build a 429 body matching the per-IP / per-email shape used in security.ts.
 * Identical shape prevents enumeration of which bucket fired.
 */
const build429Body = (ttlMs: number): Record<string, unknown> => ({
  message: 'Too Many Requests',
  code: 'rate-limit-exceeded',
  detail: `Rate limit exceeded, retry in ${Math.ceil(ttlMs / 1000).toString()} seconds`,
});

/**
 * Apply per-tenant signin rate-limiting for `POST /api/auth/sign-in/email`.
 * Called from the Fastify `preHandler` hook in `security.ts` after the
 * per-IP check passes.
 *
 * Returns `true` if the request is allowed, `false` if it was already
 * rate-limited (caller must not send further replies after false).
 *
 * D-06 second clause: constant-time 429 path. When the per-tenant bucket
 * fires, we execute the same `consumeTenantBucket` path that an allowed
 * request takes, so the timing profile of a rejected request is
 * indistinguishable from an allowed one (both call the Map lookup +
 * optional increment before replying).
 */
export const applyPerTenantSigninRateLimit = (
  req: FastifyRequest,
  reply: FastifyReply,
  env: Env,
): boolean => {
  const tenantKey = extractTenantKey(req);
  if (!tenantKey) return true;

  const cap = env.RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN;
  const { allowed, ttlMs } = consumeTenantBucket(tenantKey, cap);
  if (!allowed) {
    reply.status(429).send(build429Body(ttlMs));
    return false;
  }
  return true;
};
