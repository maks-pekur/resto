---
phase: 03-auth-completion
reviewed: 2026-05-30T00:00:00Z
depth: standard
files_reviewed: 60
files_reviewed_list:
  - apps/admin/app/dashboard/(workspace)/settings/invite-action.ts
  - apps/admin/app/dashboard/(workspace)/settings/invite-form-client.tsx
  - apps/admin/app/dashboard/(workspace)/settings/page.tsx
  - apps/admin/app/dashboard/(workspace)/settings/two-factor-actions.ts
  - apps/admin/app/dashboard/(workspace)/settings/two-factor-enable-client.tsx
  - apps/admin/lib/actions/sign-in-and-bind-org.ts
  - apps/admin/lib/api-server.ts
  - apps/admin/lib/me.ts
  - apps/admin/test/auth-cookies.spec.ts
  - apps/admin/test/two-factor-actions.spec.ts
  - apps/admin/test/two-factor-enable-client.spec.tsx
  - apps/api/eslint.config.mjs
  - apps/api/src/bootstrap/assert-system-roles-present.ts
  - apps/api/src/config/prod-guardrails.ts
  - apps/api/src/contexts/audit/application/record-audit.service.ts
  - apps/api/src/contexts/identity/application/signup.service.ts
  - apps/api/src/contexts/identity/domain/principal.ts
  - apps/api/src/contexts/identity/identity-core.module.ts
  - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts
  - apps/api/src/contexts/identity/infrastructure/email/captured.adapter.ts
  - apps/api/src/contexts/identity/infrastructure/email/email-adapter.factory.ts
  - apps/api/src/contexts/identity/infrastructure/email/mailhog-smtp.adapter.ts
  - apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts
  - apps/api/src/contexts/identity/interfaces/http/error-mapping.ts
  - apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts
  - apps/api/src/contexts/identity/interfaces/http/me.controller.ts
  - apps/api/src/contexts/identity/interfaces/http/signup.controller.ts
  - apps/api/src/infrastructure/background-jobs.module.ts
  - apps/api/src/infrastructure/jobs/invitation-retention-scheduler.service.ts
  - apps/api/src/infrastructure/jobs/verification-retention-scheduler.service.ts
  - apps/api/src/infrastructure/nats.module.ts
  - apps/api/src/main.ts
  - apps/api/src/middleware/per-tenant-signin-rate-limit.ts
  - apps/api/src/shared/security.ts
  - apps/api/test/e2e/gdpr-retention.e2e.spec.ts
  - apps/api/test/e2e/identity-email-verification.e2e.spec.ts
  - apps/api/test/e2e/identity-invitation.e2e.spec.ts
  - apps/api/test/e2e/identity-password-reset.e2e.spec.ts
  - apps/api/test/e2e/identity-role-changed.e2e.spec.ts
  - apps/api/test/e2e/identity-two-factor.e2e.spec.ts
  - apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts
  - apps/api/test/e2e/per-tenant-signin-rate-limit.e2e.spec.ts
  - apps/api/test/e2e/signup-enumeration.e2e.spec.ts
  - apps/api/test/e2e/signup.e2e.spec.ts
  - apps/api/test/unit/identity/build-auth-from-env.spec.ts
  - apps/api/test/unit/identity/captured-email-adapter.spec.ts
  - apps/api/test/unit/identity/email-adapter-factory.spec.ts
  - apps/api/test/unit/identity/email-adapter-gate.spec.ts
  - apps/api/test/unit/identity/identity-boot-integration.spec.ts
  - apps/api/test/unit/identity/mailhog-smtp-adapter.spec.ts
  - apps/api/test/unit/identity/resend-email-adapter.spec.ts
  - apps/api/test/unit/prod-guardrails.spec.ts
  - infra/runbooks/2fa-recovery.md
  - infra/runbooks/spf-dkim-dmarc-checklist.md
  - packages/db/src/withoutTenant.allowlist.ts
  - packages/db/test/unit/withoutTenant-allowlist.spec.ts
  - packages/events/eslint.config.mjs
  - packages/events/src/contracts/identity.ts
  - packages/events/src/index.ts
  - packages/events/src/infrastructure/nats-publisher.ts
  - packages/events/src/infrastructure/nats-subscriber.ts
  - packages/events/src/ports.ts
  - packages/events/test/unit/identity-email-dispatch-failed.spec.ts
  - packages/events/test/unit/nats-publisher-raw.spec.ts
  - packages/events/test/unit/nats-subscriber-dlq.spec.ts
  - scripts/reset-2fa.ts
findings:
  critical: 4
  warning: 11
  info: 6
  total: 21
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-30T00:00:00Z
**Depth:** standard
**Files Reviewed:** 60
**Status:** issues_found

## Summary

Phase 3 ("auth-completion") delivers a substantial body of security-critical
work: Better Auth wiring, three email-adapter variants, 2FA TOTP flows,
GDPR retention sweeps, per-tenant rate limit, NATS DLQ branch, an identity
role-change audit hook, and admin server actions. The boot-time guard
stack (RLS / system roles / prod-guardrails / email-adapter wiring) is
genuinely defense-in-depth and the test coverage for the new surfaces is
broad.

However, four issues rise to **BLOCKER** severity:

1. **2FA reset script audits without verifying the actor identity** —
   `RESET_ACTOR_EMAIL` is reused verbatim as the audit subject; no
   challenge, no allowlist, no signature. A workstation env var is the
   sole evidence in the forensic record.
2. **`SignUpService` falls back to a non-deterministic `email-taken` heuristic
   on string match** — any future change to BA's error message instantly
   either re-opens enumeration (returns the wrong error) or breaks signup.
3. **Per-tenant rate-limit bucket keys leak indefinitely** — the
   module-scoped `Map<string, TenantBucket>` is never cleaned; a
   slug-rotating attacker fills heap with one entry per minute per slug
   variation across the process lifetime.
4. **Admin `apiFetch` invokes `redirect()` on 401 even on writes** — server
   actions that race a session expiry throw `NEXT_REDIRECT` from inside
   `forwardSetCookie` paths, dropping the partially-applied Set-Cookie
   side effects and leaving the user in an indeterminate auth state.

The remainder are real-but-bounded quality and robustness issues:
loose typing on BA shapes, a self-defeating slug suffix counter, a noisy
non-issue in mailHog secrets, and several test files muting console.error
or wallpapering over async rejection.

## Critical Issues

### CR-01: `scripts/reset-2fa.ts` trusts an unauthenticated env var as the audit actor

**File:** `scripts/reset-2fa.ts:111-130`
**Issue:** The audit row that proves an out-of-band-verified human pressed
the button is constructed as:

```ts
const actorEmail = process.env['RESET_ACTOR_EMAIL'] ?? 'founder';
// ...
actorSubject: `founder:manual:${actorEmail}`,
```

There is no allowlist of legitimate operator emails, no signature, no
cross-check against a session, no MFA step. Anyone with shell access can
set `RESET_ACTOR_EMAIL=alice@victim.com` and the audit log will say Alice
performed the reset. The runbook (`infra/runbooks/2fa-recovery.md`) tells
the operator the audit row is forensic ("do not delete it") but the value
is attacker-controlled.

Compounding this: a) `'founder'` is a fallback so accidentally omitting
the var still produces a row claiming the founder did it; b) the script
also accepts the `DATABASE_URL` env var with no role check — running it
under a high-privilege admin DSN is fine but never validated, so the
ESLint `no-restricted-syntax` rule that bans `set_config` is bypassed by
sheer convention; c) the audit row's `tenantId` is `null`, which is
consistent with `tenants` schema but means the row is invisible to a
tenant-scoped audit reader. Combined, the runbook's forensic property is
not load-bearing.

**Fix:** Treat the audit actor as a load-bearing field — require a
signed-in admin's session, OR a short-lived one-time token written by a
second human, OR at minimum validate `RESET_ACTOR_EMAIL` against
`@resto.app` plus the `founder` allowlist. Drop the `'founder'` default
entirely (require explicit value), and write `actorKind: 'admin'` with
the user's BA `user.id` instead of an opaque email string:

```ts
const actorEmail = process.env['RESET_ACTOR_EMAIL'];
if (!actorEmail || !/^[a-z0-9._%+-]+@resto\.app$/i.test(actorEmail)) {
  process.stderr.write(
    'RESET_ACTOR_EMAIL=<your-resto.app email> is required (matches the verified-team allowlist).\n',
  );
  process.exit(1);
}
// Look up the BA user, fail if not found.
const actor = await db.select({ id: schema.user.id }).from(schema.user)
  .where(eq(schema.user.email, actorEmail)).limit(1);
if (actor.length === 0) {
  process.stderr.write(`Actor ${actorEmail} not a BA user; refusing.\n`);
  process.exit(1);
}
// ... actorSubject: actor[0].id, actorKind: 'admin', payload: { ..., actorEmail }
```

### CR-02: `SignUpService` derives `SignupEmailAlreadyExistsError` from a regex match against BA's error message

**File:** `apps/api/src/contexts/identity/application/signup.service.ts:152-167`
**Issue:**

```ts
if (err instanceof BetterAuthBootstrapFailureError) {
  const message = err.message;
  if (/email/i.test(message) && /already/i.test(message)) {
    throw new SignupEmailAlreadyExistsError(input.email);
  }
  const stage: 'signUpEmail' | 'addMember' = message.includes('addMember')
    ? 'addMember'
    : 'signUpEmail';
  throw new SignupBetterAuthFailureError(stage, err);
}
```

The D-06 enumeration-safety guarantee (`executeOrTimeEqualize` swallows
`SignupEmailAlreadyExistsError` to make the email-taken branch
indistinguishable) relies on this string-match catching every "email
already exists" path. BA's error messages are not API contract — when BA
1.5/1.6 renames `"User already exists with this email"` to e.g.
`"E_EMAIL_TAKEN"` or `"duplicate identity"`, this regex silently misses,
the controller falls through to `SignupBetterAuthFailureError`, the
error-mapper returns a distinct 400 with `code: 'signup.signup_failed'`,
and the enumeration parity is gone — the slow email-taken branch becomes
a 400 while the new-email branch returns 201.

Additionally the same regex stage classifier (`message.includes('addMember')`)
is fragile in the same way; a BA version that prefixes the message with
`"[organization]"` breaks the classification but at least the user-visible
response is still 400.

**Fix:** Switch on BA's documented error `code` (BetterAuthError has
typed `code` and `cause`), or detect duplication via the explicit
`userExistsByEmail` recheck inside the catch block. Pin the BA version
in `package.json` (`~1.4.22` not `^`) until a contract-level adapter
exists.

```ts
} catch (err) {
  if (err instanceof OwnerAlreadyExistsError) {
    throw new SignupEmailAlreadyExistsError(input.email);
  }
  // Re-probe BA's user store rather than string-matching the message.
  if (err instanceof BetterAuthBootstrapFailureError) {
    if (await this.userExistsByEmail(input.email)) {
      throw new SignupEmailAlreadyExistsError(input.email);
    }
    const stage = /addMember/i.test(err.message) ? 'addMember' : 'signUpEmail';
    throw new SignupBetterAuthFailureError(stage, err);
  }
  throw err;
}
```

### CR-03: Per-tenant rate-limit bucket store has unbounded growth

**File:** `apps/api/src/middleware/per-tenant-signin-rate-limit.ts:22, 57-74`
**Issue:** The module-scoped Map stores bucket entries keyed by
`signin:tenant:{tenantKey}:minute:{minuteKey}`. The key changes every
minute (UTC), so entries from prior minutes are orphaned and never
removed. There is no sweeper, no `setInterval` cleanup, and no LRU bound.

```ts
const tenantBuckets = new Map<string, TenantBucket>();
// ...
tenantBuckets.set(key, { count: 1, resetAt: ts + WINDOW_MS });
```

Failure modes:
1. **Slow heap leak:** at a sustained 1 unique `x-tenant-slug` value per
   second, the Map grows by 60 entries per minute and is never pruned —
   a long-running pod accumulates ~31M entries per year per unique slug.
2. **DoS amplification:** an attacker rotating `x-tenant-slug` values
   (the header is user-supplied, not validated against existing tenants
   at this layer) can deliberately allocate one entry per minute per
   slug they invent. Cost: one HTTP request. Memory: ~150 bytes per
   entry (key + bucket object).
3. **Same shape applies to `identityBuckets` in `apps/api/src/shared/security.ts:60`**
   — the per-email bucket key includes `email.toLowerCase()` with no
   bound on email cardinality, and the key never expires.

The companion test `per-tenant-signin-rate-limit.e2e.spec.ts` runs in a
single process and a single suite — the leak is structurally invisible
to it.

**Fix:** Either (a) gate the bucket creation on a tenant-exists lookup
(an order of magnitude harder to attack), or (b) periodically sweep
expired entries:

```ts
const CLEANUP_INTERVAL_MS = 5 * 60_000; // every 5 minutes
const MAX_ENTRIES = 100_000; // belt + suspenders LRU cap
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tenantBuckets) {
    if (v.resetAt <= now) tenantBuckets.delete(k);
  }
  // Optional: if still over MAX_ENTRIES, drop oldest by resetAt.
}, CLEANUP_INTERVAL_MS).unref();
```

Apply the equivalent fix to `identityBuckets` in `security.ts`. Also
consider validating the `x-tenant-slug` header at the rate-limit layer
(reject if `slug` doesn't match `/^[a-z0-9-]+$/` to bound key cardinality
trivially).

### CR-04: Admin `apiFetch` calls `redirect('/login?expired=1')` on every non-session-lookup 401, including writes — drops in-flight Set-Cookie

**File:** `apps/admin/lib/api-server.ts:217-222`
**Issue:**

```ts
if (res.status === 401 && path !== '/api/auth/get-session') {
  redirect('/login?expired=1');
}
if (options.forwardSetCookie === true) {
  const incoming = collectSetCookies(res);
  // ... cookieStore.set(...)
}
```

`redirect()` from `next/navigation` throws `NEXT_REDIRECT`, which bypasses
the rest of the function — including the `forwardSetCookie` block below.
This is the intended behaviour for a stale read (`/v1/me`), but the same
helper is invoked from server actions that mutate state and carry Set-Cookie
upstream (`signInAndBindOrg`, `enableTwoFactorAction`, `verifyTwoFactorAction`,
`disableTwoFactorAction`). Real failure mode:

1. User's session expires mid-2FA-verify.
2. They click "Confirm"; the action calls
   `verifyTwoFactorAction('123456')` → `apiFetch('/api/auth/two-factor/verify-totp', { forwardSetCookie: true })`.
3. BA returns 401 with a Set-Cookie that clears the session token.
4. `apiFetch` throws `NEXT_REDIRECT('/login?expired=1')` **before** it
   forwards the cleared-cookie Set-Cookie.
5. The user lands on `/login?expired=1` but their browser still has a
   stale session cookie that points at a non-existent BA session, so the
   next page load reads a stale `/api/auth/get-session` 401, redirects
   to `/login?expired=1` again. Loop on every navigation until the cookie
   times out client-side.

There's also a layering smell: a fetch helper should not own a navigation
side effect. The redirect breaks the "single try/catch boundary" claim in
`sign-in-and-bind-org.ts` (the catch never sees 401 because the helper
swallowed it).

**Fix:** Forward Set-Cookie BEFORE evaluating the redirect:

```ts
if (options.forwardSetCookie === true) {
  const incoming = collectSetCookies(res);
  for (const sc of incoming) {
    const parsed = parseSetCookie(sc);
    setForwardedCookie(cookieStore, parsed);
  }
}
if (res.status === 401 && path !== '/api/auth/get-session') {
  redirect('/login?expired=1');
}
```

Better: move the redirect out of `apiFetch` entirely. Return
`{ status: 401, ok: false, ... }` like every other status; let RSC code
paths decide to call `redirect()` after they inspect the response. The
sign-in-and-bind helper already does explicit branching — `verifyTwoFactorAction`
should do the same and surface `'session_expired'` to the client, which
already has a code path for it.

## Warnings

### WR-01: `AuthGuard` accepts `req.headers` from Fastify but `auth.api.getSession` ignores `cookie` when the upstream caller forged a header

**File:** `apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts:71-74, 157-169`
**Issue:** `toWebHeaders` copies every Fastify header into a `Headers`
object including `x-tenant-slug` and `x-tenant-id` that the admin app
sets. BA reads only the cookie header for its session lookup, so this is
not directly exploitable. But the same `toWebHeaders` helper merges
multi-value headers via `headers.append(k, v)` — for `cookie`, that
creates two entries which BA reads only the first of (or concatenates
depending on undici version). In production behind a Cloudflare layer
that joins cookies with `, ` separators, this could mis-parse. Verify
the production behaviour or normalize to a single comma-joined cookie
header.

**Fix:** Add an explicit `cookie` consolidation in `toWebHeaders`:

```ts
const toWebHeaders = (raw: FastifyRequest['headers']): Headers => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (k.toLowerCase() === 'cookie') {
      const joined = Array.isArray(v) ? v.join('; ') : (v ?? '');
      if (joined) headers.set('cookie', joined);
      continue;
    }
    // ... existing append/set logic
  }
  return headers;
};
```

### WR-02: `RecordAuditService.fromEnvelope` runs ALL projections inside `withoutTenant` even for tenant-bound events

**File:** `apps/api/src/contexts/audit/application/record-audit.service.ts:37-41`
**Issue:**

```ts
async fromEnvelope(envelope: EventEnvelope): Promise<void> {
  await this.db.withoutTenant(`audit consumer: ${envelope.type}`, (tx) =>
    this.fromEnvelopeWithTx(envelope, tx),
  );
}
```

`identity.role_changed.v1`, `identity.signed_in.v1`,
`tenancy.tenant_provisioned.v1` all carry a non-null tenantId. The
`audit_log` table is platform-wide (no `tenant_id` RLS constraint per the
CLAUDE.md note), so functionally this works — but the WARN log line that
`withoutTenant` emits ("audit consumer: identity.role_changed.v1") will
fire for every audited event in production. The reason string is also
identical across events of the same type, which collapses the audit
trail at the bypass-log level — operators looking at "why did we bypass
RLS" cannot tell `tenant: A` from `tenant: B`.

The same applies to `record-audit` being in `WITHOUT_TENANT_ALLOWLIST`:
it's there because the **DLQ path** writes platform-level alerts, but
the bulk of writes have a known tenantId.

**Fix:** Branch on `envelope.tenantId`:

```ts
async fromEnvelope(envelope: EventEnvelope): Promise<void> {
  if (envelope.tenantId !== null) {
    await this.db.withTenantId(envelope.tenantId as TenantId, (tx) =>
      this.fromEnvelopeWithTx(envelope, tx),
    );
    return;
  }
  await this.db.withoutTenant(
    `audit platform event: ${envelope.type}`,
    (tx) => this.fromEnvelopeWithTx(envelope, tx),
  );
}
```

### WR-03: `RecordAuditService.project` treats `payload.userId` as `targetId` before checking `payload.tenantId`, masking the tenant in role-change audits

**File:** `apps/api/src/contexts/audit/application/record-audit.service.ts:65-69`
**Issue:**

```ts
const targetId =
  (typeof payload.userId === 'string' && payload.userId) ||
  (typeof payload.tenantId === 'string' && payload.tenantId) ||
  null;
```

This is `||`-on-truthiness, so any non-empty `userId` wins. For
`identity.role_changed.v1` this is correct (target IS the user) — but
the `ACTION_TARGET_KIND` map maps it to `'user'` while the e2e spec
(`identity-role-changed.e2e.spec.ts:179-180`) expects exactly that. Good.
However, for hypothetical future audit events that carry both `userId`
(the operator who did it) and `tenantId` (the tenant being mutated), the
**operator** lands in `target_id` rather than the **tenant** — flipping
the semantics. This is an event-author footgun, not a current bug.

Also: the field documentation in `IdentityRoleChangedV1Payload.actorUserId`
says BA "does not always surface the calling user" — but the projection
unconditionally uses `payload.userId` (the **subject** of the role change,
not the actor) as `actorSubject`. The e2e accepts this (line 184) but it
means the audit log reports the user-whose-role-changed as the actor of
their own role change, which is wrong-coloured semantically.

**Fix:** Make the target resolution explicit per event type, and require
new contracts to declare both `actorUserId` and a `targetId` field. As
an interim, log a WARN when `actorUserId` is absent:

```ts
actorSubject: typeof payload.actorUserId === 'string'
  ? payload.actorUserId
  : typeof payload.userId === 'string' && payload.userId.length > 0
    ? payload.userId   // fallback; log a warn so the gap is visible
    : 'system',
```

### WR-04: `parseSetCookie` in `apps/admin/lib/api-server.ts` does not handle quoted cookie values or RFC 6265 edge cases

**File:** `apps/admin/lib/api-server.ts:88-110`
**Issue:** The parser splits on `;`, takes the first segment, splits on
`=`, and assumes the remainder is the raw value. RFC 6265 allows
quoted-string values (DQUOTE 5C-escaped) and base64 cookie values which
can themselves contain `=` (no quoting required); the current code
correctly handles the latter via `slice(eq + 1)`, but the trailing-segment
parser splits each attribute on `=` (`const [k, v] = seg.split('=')`)
without limiting to 2 splits. An `expires=Wed, 09 Jun 2027 10:18:14 GMT`
attribute serializes with no embedded `=`, so it's fine. But
`expires=...=padding` would mis-parse the date — unlikely from BA but
fragile.

More worrying: `secure` is parsed as `key === 'secure'` only when the
segment is `Secure` with no `=`; the current logic correctly handles this
via `if (key === 'secure') options.secure = true;` but the regex sweep
in `auth-cookies.spec.ts` cannot statically verify that an upstream
cookie's `Secure;` flag is preserved. The forwarded cookie always sets
`secure: NODE_ENV === 'production'` regardless of what BA said. In
practice this is the safer default, but it could clobber an upstream
explicit `Secure` in a dev environment where the admin proxies to a
test BA over HTTPS.

**Fix:** Replace with the established `set-cookie-parser` npm package
(zero-dep, RFC-correct), or at minimum cap `seg.split('=', 2)`:

```ts
const [k, ...rest] = seg.split('=');
const v = rest.join('=');
```

### WR-05: `signInAndBindOrg` silently returns `{ ok: true }` when `orgList` is empty or non-array

**File:** `apps/admin/lib/actions/sign-in-and-bind-org.ts:44-50`
**Issue:**

```ts
if (!orgList.ok || orgList.data === null) return { ok: true };
if (orgList.data.length !== 1) return { ok: true };
const orgId = orgList.data[0]?.id;
if (!orgId) return { ok: true };
```

The function reports success to the caller for **four distinct failure
modes**: (a) org-list endpoint failed with non-401, (b) user has zero
orgs, (c) user has multiple orgs, (d) the first row has no `.id`. Cases
(b) and (c) might be legitimate, but conflating (a) with success means a
flaky org-list endpoint silently lands the user on a half-bound session.
The downstream dashboard will then 401 on the first tenant-scoped read
because BA's session has no `activeOrganizationId`.

Equally, the comment says "Returns a result object instead of throwing"
but does NOT distinguish "auto-activate skipped (multi-org)" from
"auto-activate failed". The caller has no way to render a multi-org
picker because the result is indistinguishable from happy path.

**Fix:** Extend the result discriminant:

```ts
export interface SignInAndBindOrgResult {
  readonly ok: boolean;
  readonly error?: 'invalid_credentials' | 'org_activation_failed' | 'org_list_failed';
  readonly orgCount?: number;
}
// In step 2:
if (!orgList.ok) return { ok: false, error: 'org_list_failed' };
const orgs = orgList.data ?? [];
if (orgs.length !== 1) return { ok: true, orgCount: orgs.length };
```

### WR-06: `signup.service.ts` `findFreeSlug` skips suffix `-1` (cosmetic) and uses 100 sequential DB lookups

**File:** `apps/api/src/contexts/identity/application/signup.service.ts:182-189`
**Issue:**

```ts
for (let suffix = 0; suffix <= MAX_SLUG_SUFFIX; suffix++) {
  const candidate = suffix === 0 ? base : `${base}-${(suffix + 1).toString()}`;
  const existing = await this.tenantLookup.findBySlug(candidate);
  if (!existing) return candidate;
}
```

Two issues. (1) Suffix labelling — when `base` exists, the next candidate
is `base-2`, then `base-3`, …, `base-100`. There is no `base-1`. This is
deliberate ("base IS the first"), but `MAX_SLUG_SUFFIX = 99` then yields
only 100 distinct candidates, not the 100 unique-suffix-name suggested
by the constant name.

(2) Sequential async lookups — on a popular display-name collision (e.g.
"Cafe", "Pizza"), each new signup walks 1..N rows in serial. At N=50, that
is ~50 DB roundtrips before the user sees their 201. Combined with
`PARITY_FLOOR_MS = 350` floor, signups for popular names slow further.

**Fix:** Either batch the lookup (one `IN (...)` query for all 100
candidates and pick the first absent), or query the slug pattern with
`LIKE 'base%'` ordered, then compute the next free suffix in memory.
Trivial perf change with clearer naming:

```ts
const used = await this.tenantLookup.findSlugsByPrefix(base, 100);
// computes set + finds gap
```

### WR-07: `auth.config.ts` `databaseHooks.session.update.after` reconstructs URL with a hard-coded base host

**File:** `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:280`
**Issue:**

```ts
const path = rawRequest?.url ? new URL(rawRequest.url, 'http://x').pathname : '';
if (!path.endsWith('/api/auth/organization/set-active')) return;
```

The string `'http://x'` is a placeholder so a relative URL parses. This
works, but is fragile: a future BA upgrade that ships `ctx.path` (similar
to the `hooks.before/after` middleware that uses `ctx.path` directly)
makes this dead code. The path check `endsWith('/api/auth/organization/set-active')`
also accepts e.g. `/proxy/foo/api/auth/organization/set-active` — defense
in depth, but pure-`endsWith` on path could match an unrelated nested
route in future.

**Fix:** Use BA's own `ctx.path` if available on the session-update
context (mirrors the pattern elsewhere in this file), or pin the check
to an exact equality with a known base path:

```ts
const path = rawRequest?.url ? new URL(rawRequest.url, 'http://x').pathname : '';
if (path !== '/api/auth/organization/set-active') return;
```

### WR-08: `enableTwoFactorAction` rejects malformed BA response as `'unknown'` but DOES return `{ ok: false }` and never re-attempts

**File:** `apps/admin/app/dashboard/(workspace)/settings/two-factor-actions.ts:86-88`
**Issue:**

```ts
if (!isValidEnableResponse(res.data)) {
  return { ok: false, error: 'unknown' };
}
```

The validator requires `backupCodes.length >= 10`. BA's default is
exactly 10 — but a future config change could shrink this to 8 in which
case the admin UI silently rejects every successful enable. The user
sees "Something went wrong" while BA logs success and may have already
persisted partial 2FA state. Also, `'unknown'` is the generic bucket;
the user has no way to distinguish "transient" from "schema drift".

**Fix:** Loosen the lower bound to a minimum-viable value (e.g. `>= 6`),
and log structured info when the response shape mismatches:

```ts
if (body.backupCodes.length < 6) return false;
// And in the controller path:
if (!isValidEnableResponse(res.data)) {
  console.warn('two-factor/enable response shape unexpected:', res.data);
  return { ok: false, error: 'unknown' };
}
```

### WR-09: `verifyTwoFactorAction` maps every 4xx to `invalid_code` — loses `session_expired` resolution

**File:** `apps/admin/app/dashboard/(workspace)/settings/two-factor-actions.ts:122-124`
**Issue:**

```ts
if (!res.ok) {
  if (res.status >= 400 && res.status < 500) return { ok: false, error: 'invalid_code' };
  return { ok: false, error: 'unknown' };
}
```

`enableTwoFactorAction` and `disableTwoFactorAction` carefully distinguish
401 (`invalid_password`) from 403 (`session_expired`) — but `verifyTwoFactorAction`
collapses every 4xx into `'invalid_code'`. If BA returns 403 for an
expired-session-during-verify case, the user sees "Invalid code. Open
your authenticator and try the current code." with no path forward — they
re-type, BA 403s again, loop forever. The `EnableTwoFactorError` union
explicitly includes `'session_expired'`; consistency would be cheap.

**Fix:**

```ts
if (!res.ok) {
  if (res.status === 403) return { ok: false, error: 'session_expired' };
  if (res.status >= 400 && res.status < 500) return { ok: false, error: 'invalid_code' };
  return { ok: false, error: 'unknown' };
}
```

(The corresponding type union and friendly-message map need updating.)

### WR-10: `two-factor-enable-client.spec.tsx` monkey-patches `console.error` globally and never restores it

**File:** `apps/admin/test/two-factor-enable-client.spec.tsx:29-41`
**Issue:**

```ts
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]): void => {
  if (/* jsdom navigation noise */) return;
  originalConsoleError(...args);
};
```

This runs at module-evaluation top level — it persists across test files
in the same vitest worker. Any subsequent test in the same worker that
asserts `console.error` was called (e.g. testing logger output) will see
filtered output. The comment acknowledges this is to silence the jsdom
"Not implemented: navigation" warning, but the actual fix is to stub
`window.location.reload` (jsdom supports `delete window.location;
window.location = { ... }` since v16). The current approach is the
loudest-possible monkey-patch.

**Fix:** Replace `window.location.reload` for the duration of the test
suite via `beforeAll`/`afterAll`:

```ts
let origReload: () => void;
beforeAll(() => {
  origReload = window.location.reload;
  Object.defineProperty(window.location, 'reload', {
    configurable: true,
    value: vi.fn(),
  });
});
afterAll(() => {
  Object.defineProperty(window.location, 'reload', {
    configurable: true,
    value: origReload,
  });
});
```

### WR-11: `resend.adapter.ts` `#abortAfter` and `Promise.race` leak a timer per attempt

**File:** `apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts:258-270, 353-356`
**Issue:**

```ts
result = await Promise.race([
  this.#client.emails.send(...),
  this.#abortAfter(SEND_TIMEOUT_MS),
]);
// ...
async #abortAfter(ms: number): Promise<never> {
  await sleep(ms);
  throw new Error(`Resend send timed out after ${String(ms)}ms`);
}
```

When the send finishes first, the `sleep(5500)` timer is still ticking —
node keeps it scheduled until it fires, then throws inside an unhandled
context. Over 4 attempts in the retry loop, 4 timers may stack; on
process shutdown they keep the event loop alive past app shutdown
hooks. Also, the `throw` inside the timer-resolved promise becomes an
unhandled rejection if nothing is awaiting that promise anymore — node
22+ with `--unhandled-rejections=strict` exits the process.

**Fix:** Use an `AbortController` + `setTimeout` pair, cancel on success:

```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
try {
  result = await this.#client.emails.send(payload, {
    idempotencyKey: cmd.idempotencyKey,
    signal: controller.signal,  // requires SDK support; else use Promise.race
  });
} finally {
  clearTimeout(timeoutId);
}
```

If Resend SDK doesn't accept `signal`, at minimum wrap the racer in a
finally that clears the timer.

## Info

### IN-01: `auth.config.ts` `organization()` plugin cast to `BetterAuthPlugin` via double-cast

**File:** `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:254`
**Issue:** `organization({...}) as unknown as BetterAuthPlugin` is the
universal escape hatch and the comment documents that the BA team has a
known type gap. This is OK as a tactical wart but should be tracked
against a BA upgrade ticket. The ESLint override block already disables
the `no-unsafe-*` family for this single file, which is fine. Suggest
adding a `RES-<ticket>` reference next to the cast so future readers can
prune it when BA fixes upstream.

### IN-02: `assert-system-roles-present.ts` `SystemRoleDriftError.actual` is a snapshot, never logged

**File:** `apps/api/src/bootstrap/assert-system-roles-present.ts:35-48, 130`
**Issue:** The error constructor receives `actual` (a snapshot of every
registered role's statements) and stores it on `this.actual` — but
nothing reads it. The boot path logs `err.message` (which only contains
`diff`), and the orchestrator's failed-boot stack ignores the field. If
this drift fires in prod, the operator sees the diff line but not the
full registered statement map. Useful as a postmortem field; add it to
the message:

```ts
super(
  `system-roles-drift: ... ${diff.join('; ')}.\n` +
  `actual=${JSON.stringify(actual, null, 2)}\n` +
  `expected=${JSON.stringify(expected, null, 2)}`,
);
```

### IN-03: `record-audit.service.ts` line 7 `ACTION_TARGET_KIND` map carries a TODO that says "move ... once the map crosses 8 entries"

**File:** `apps/api/src/contexts/audit/application/record-audit.service.ts:7`
**Issue:** Map currently has 10 entries (counted: 7 tenancy + 3 identity
+ 1 platform = 11). The TODO threshold has been crossed; either move the
mapping into `defineEventContract` (the documented endpoint) or delete
the TODO. Leaving a stale TODO erodes signal in `git grep TODO`.

### IN-04: `nats-subscriber.ts` defaults `DEFAULT_MAX_IN_FLIGHT = 10` but the per-tenant rate-limit suite intentionally bumps caps to 1000s — assert-stack drift

**File:** `packages/events/src/infrastructure/nats-subscriber.ts:30`
**Issue:** The default `max_ack_pending: 10` matches the
`packages/events/CLAUDE.md` rule ("MUST be raised above 1"). However,
the role-change e2e spec relies on a single message landing in audit_log
within 20s, and concurrent suites that publish many messages on
`identity.>` queue behind this cap. Not a bug — but if a future Phase
adds bulk identity events (e.g. invitation expirations en masse), this
floor becomes a stall point. Worth documenting per-consumer at the
caller sites instead of the global default.

### IN-05: `signup.service.ts` `redactEmail` produces ambiguous output for short locals

**File:** `apps/api/src/contexts/identity/application/signup.service.ts:120-125`
**Issue:** For email `ab@x.com`, the condition `at <= 1` returns `'***'`
because `'ab@x.com'.indexOf('@') === 2` — actually wait, that's `at=2`,
so it takes the `else` branch and returns `'a***@x.com'`. For `a@x.com`
(local length 1), `at === 1`, returns `'***'`. For an empty local (which
shouldn't happen because Zod validates email shape, but defensive), it
returns `'***'`. Looks correct on closer reading; no bug. Suggest
inlining the comment to make the boundary obvious so a future tweak
doesn't break it.

### IN-06: `scripts/reset-2fa.ts` `targetUser[0]` is non-null asserted via narrowing but not exhaustively checked

**File:** `scripts/reset-2fa.ts:69`
**Issue:**

```ts
const target = targetUser[0];
const sessionRows = await db
  .select(...)
  .where(eq(schema.session.userId, userId));

process.stdout.write(`User ID:       ${target.id}\n`);
```

Type narrowing relies on the `targetUser.length === 0` early-return at
line 63. ESLint's `noUncheckedIndexedAccess` is enabled in
`tsconfig.base.json`, so `target` should be `{ id, email, twoFactorEnabled }
| undefined`. The fact that it compiles means either the array length
narrowing is sound (it is, post-TS 4.8) or the script's tsconfig opts
out. Worth confirming the script runs under the same strict config as
the api.

---

_Reviewed: 2026-05-30T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
