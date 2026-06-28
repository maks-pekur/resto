---
phase: quick
plan: 260623-vwy
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/shared/tenant-context.middleware.ts
  - apps/api/test/unit/shared/tenant-context.middleware.spec.ts
  - .planning/phases/07.6-admin-vite-spa/07.6-REVIEW.md
autonomous: true
requirements: [CR-01]

must_haves:
  truths:
    - 'In production, an operator request to /v1/* carrying x-tenant-id: <uuid> binds the tenant context (resolveById consulted, tenantId bound in ALS).'
    - 'In production, x-tenant-slug on a non-internal /v1/* route is still ignored (slug path stays gated; the seed-CLI escape hatch is unchanged).'
    - 'Customer-host resolution still takes precedence over the x-tenant-id header.'
    - 'A dedicated unit test exercises NODE_ENV=production and would fail before this change (e2e runs in NODE_ENV=test and cannot catch this).'
  artifacts:
    - path: 'apps/api/src/shared/tenant-context.middleware.ts'
      provides: 'resolveTenantOnly honors x-tenant-id unconditionally; x-tenant-slug stays gated'
      contains: 'HEADER_TENANT_ID'
    - path: 'apps/api/test/unit/shared/tenant-context.middleware.spec.ts'
      provides: 'Production-mode coverage of the x-tenant-id operator path'
      contains: 'x-tenant-id'
  key_links:
    - from: 'apps/api/src/shared/tenant-context.middleware.ts'
      to: 'TenantResolverService.resolveById'
      via: 'x-tenant-id header (always attempted)'
      pattern: 'resolveById'
    - from: 'AuthGuard'
      to: 'auth.tenant_mismatch cross-check (RES-172)'
      via: 'backstop — already exists, NOT modified'
      pattern: 'tenant_mismatch'
---

<objective>
Fix CR-01 (phase 07.6 code review): the admin SPA sends `x-tenant-id: <activeOrganizationId UUID>` on every `/v1/*` request, but `TenantContextMiddleware.resolveTenantOnly` only reads it when `shouldAcceptTenantSlugHeader()` is true — in production that gate is ONLY `/internal/v1/*` + valid `x-internal-token`. So in prod on a single `admin.resto.app` host the header is ignored, host resolution fails (admin host is not a per-tenant hostname), tenant context is never bound, and every `@RequiresTenantContext()` route returns 403 `auth.tenant_context_missing`. Dev/test pass because the header is already honored there — which is exactly why e2e (NODE_ENV=test) cannot catch this.

Fix: split the two headers. `x-tenant-id` (UUID → `resolveById`) is honored on ALL routes regardless of `NODE_ENV`; `x-tenant-slug` (human slug → `resolveBySlug`) stays behind `shouldAcceptTenantSlugHeader()` (dev/test OR internal-token) as the seed-CLI escape hatch.

Purpose: unblock operator routes in production. This is the last open prod blocker from 07.6-REVIEW.
Output: middleware change, a dedicated production-mode unit test (the key deliverable), and an updated REVIEW Remediation Status entry.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@./apps/CLAUDE.md

@apps/api/src/shared/tenant-context.middleware.ts
@apps/api/test/unit/shared/tenant-context.middleware.spec.ts

<interfaces>
<!-- Extracted from codebase — executor needs no exploration. -->

The fix is fully scoped to `resolveTenantOnly()` in `apps/api/src/shared/tenant-context.middleware.ts`.

Current `resolveTenantOnly` (lines 76-119) reads BOTH `x-tenant-id` and `x-tenant-slug` ONLY inside the `if (this.shouldAcceptTenantSlugHeader(req))` block. The fix moves the `x-tenant-id` lookup OUT of that gate (always attempted) and leaves `x-tenant-slug` INSIDE.

Header constants already declared at top of file:
HEADER_TENANT = 'x-tenant-slug' (gated)
HEADER_TENANT_ID = 'x-tenant-id' (un-gate this one)

Resolver signature (read-only, do not change) — apps/api/src/contexts/tenancy/application/tenant-resolver.service.ts:
resolveById(rawId: string): Promise<TenantSnapshot | null> // UUID lookup, safeParse(TenantId) internally
resolveBySlug(slug: string): Promise<TenantSnapshot | null>
resolveByHost(host: string | undefined): Promise<TenantSnapshot | null>
TenantSnapshot has a `.id` field (the bound tenantId string). `resolveById` already returns null on a non-UUID input, so attempting it on every route is cheap and safe.

Security backstop (read-only, DO NOT modify) — auth.guard.ts:108-119 (RES-172):
when principal.tenantId (BA active org) && alsTenantId (the header) are both set and differ → throws 403 `auth.tenant_mismatch`.
Plus PermissionsGuard evaluates @Permissions against the BA session's active org. A forged x-tenant-id therefore opens no escalation path. Host-based customer resolution (`resolveByCustomerHost`) runs FIRST in `resolveContext`, so a customer host cannot be overridden by the header.

Test harness already present in apps/api/test/unit/shared/tenant-context.middleware.spec.ts:

- `baseEnv(overrides)` defaults to NODE_ENV='production' — pass overrides for dev/test cases.
- `setup(env, repoOverride?)` → { middleware, resolver, resolveBySlug (spy), resolveByHost (spy) }.
- `buildRepo()` → TenantRepository with all methods stubbed (findById/findBySlug/findByDomainHost as vi.fn).
- `tenantFor(slug)` → a provisioned Tenant aggregate; pass it through `.toSnapshot()` is unnecessary — the middleware calls `resolveById` which itself returns a snapshot, so stub the REPO's `findById` to return the aggregate (the resolver calls `repo.findById(parsed.data)` then `.toSnapshot()`).
- `reqWith(headers)` builds a fake request — NOTE it does NOT set `req.url`. The production x-tenant-id path does not depend on `url`, but the x-tenant-slug gate inspects `req.url` (defaults to '' → not '/internal/v1/'), which is what you want for the "slug ignored in prod" assertion. For an explicit operator route, add `url: '/v1/catalog/items'` to the headers-arg object passed to reqWith (the cast tolerates extra keys) OR extend reqWith to accept a url.
  </interfaces>
  </context>

<tasks>

<task type="auto">
  <name>Task 1: Un-gate the x-tenant-id header in resolveTenantOnly</name>
  <files>apps/api/src/shared/tenant-context.middleware.ts</files>
  <action>
In `resolveTenantOnly` (currently lines 76-119), move the `x-tenant-id` (HEADER_TENANT_ID) lookup OUT of the `if (this.shouldAcceptTenantSlugHeader(req))` block so it runs on every route regardless of NODE_ENV: read `req.headers[HEADER_TENANT_ID]`, and when it is a non-empty string call `this.tenants.resolveById(idHeader)`; if it resolves, `return fromId.id` immediately. Keep the `x-tenant-slug` (HEADER_TENANT) → `this.tenants.resolveBySlug(...)` lookup INSIDE the `shouldAcceptTenantSlugHeader` gate (the seed-CLI escape hatch — must stay restricted in prod). Order: attempt `x-tenant-id` first, then the gated `x-tenant-slug`, then `resolveByHost`, then the dev-fallback (unchanged). Do NOT touch `resolveContext` (customer-host precedence already correct), `shouldAcceptTenantSlugHeader`, or `timingSafeEqualString` (WR-04 is a separate finding — leave it).

Rewrite the WHY-comments so they stay accurate per apps/CLAUDE.md (WHY-only, <=2 lines each): one short comment on the `x-tenant-id` lookup stating it is honored on operator routes in prod and is safe because AuthGuard's `auth.tenant_mismatch` cross-check (RES-172) rejects a forged value (RES-181 — the admin sends BA `activeOrganizationId`); keep/trim the existing comment on the `x-tenant-slug` block stating it stays gated as the seed-CLI escape hatch (RES-176). Remove any now-stale wording claiming `x-tenant-id` is honored "under the same gate".
</action>
<verify>
<automated>cd apps/api && npx tsc -p tsconfig.json --noEmit && npx eslint src/shared/tenant-context.middleware.ts</automated>
</verify>
<done>`x-tenant-id` is read and resolved via `resolveById` outside the `shouldAcceptTenantSlugHeader` gate; `x-tenant-slug`/`resolveBySlug` remains inside the gate; `shouldAcceptTenantSlugHeader` and `timingSafeEqualString` unchanged; comments are accurate and WHY-only; typecheck + lint of the file pass.</done>
</task>

<task type="auto">
  <name>Task 2: Add production-mode unit coverage for the x-tenant-id operator path</name>
  <files>apps/api/test/unit/shared/tenant-context.middleware.spec.ts</files>
  <action>
Extend the existing spec (do NOT create a new file) with a new `describe('TenantContextMiddleware — x-tenant-id header (operator routes)')` block. Reuse `baseEnv` (defaults to NODE_ENV='production'), `setup`, `buildRepo`, `tenantFor`, and `reqWith`. To assert the bound context, read it INSIDE the `next` callback: the middleware wraps `next()` in `runInTenantContext`, so `getTenantContext()?.tenantId` is only populated during `next`. Import `getTenantContext` from `@resto/db` (alongside the existing imports). Capture the bound id with a closure variable set inside a `next = vi.fn(() => { boundTenantId = getTenantContext()?.tenantId; })` style stub (await the `middleware.use(...)` call before asserting).

Add these tests (all with NODE_ENV='production'):
(a) Request to `/v1/catalog/items` carrying `x-tenant-id: <uuid>` binds the tenant context. Build a `tenantFor('cafe-a')` aggregate, capture its `.toSnapshot().id` (call it `tid`), stub `repo.findById` to resolve that aggregate for `tid`, send `x-tenant-id: tid` plus `url: '/v1/catalog/items'`. Assert `repo.findById` (or spy on `resolver.resolveById`) was called with the parsed id AND the captured `boundTenantId === tid` AND `next` called once. (resolveById internally `safeParse`s a UUID — use a real `randomUUID()` from 'node:crypto' as the tenant id so parsing succeeds; ensure the aggregate's id matches what you send by stubbing `repo.findById` to return that aggregate regardless of input, or construct so ids line up.)
(b) Request to a non-internal `/v1/*` route (`url: '/v1/catalog/items'`) carrying ONLY `x-tenant-slug: cafe-a` (no x-tenant-id, host that does not resolve) does NOT resolve a tenant in production: assert `resolveBySlug` was NOT called and `getTenantContext()` is undefined inside next (context unbound → middleware calls bare `next()`).
(c) Customer-host precedence: stub the brand repo so `resolveByCustomerHost` matches the host, send both a matching customer host AND an `x-tenant-id` for a DIFFERENT tenant, assert the bound `tenantId`/`brandId` are the customer-host ones (header did NOT override). If wiring the brand-repo customer-host stub is awkward via the existing `buildBrandRepo`, fall back to spying on `brandResolver.resolveByCustomerHost` to return a fixed `{ tenantId, brandId }` and assert `resolveById` was NOT reached.

Keep test bodies comment-free (describe/it names document intent, per apps/CLAUDE.md). Match existing style: single quotes, `vi.fn()`, no globals (import `describe/it/expect/vi/beforeEach` from 'vitest').
</action>
<verify>
<automated>cd apps/api && npx vitest run test/unit/shared/tenant-context.middleware.spec.ts && npx tsc -p tsconfig.json --noEmit && npx eslint test/unit/shared/tenant-context.middleware.spec.ts</automated>
</verify>
<done>New describe block added to the existing spec; tests (a)/(b)/(c) all run under NODE_ENV='production' and pass; test (a) demonstrably exercises the previously-broken path (would fail against the pre-Task-1 middleware); typecheck + lint of the spec pass; no comments in test bodies.</done>
</task>

<task type="auto">
  <name>Task 3: Mark CR-01 closed in the 07.6 review remediation log</name>
  <files>.planning/phases/07.6-admin-vite-spa/07.6-REVIEW.md</files>
  <action>
In the `## Remediation Status (2026-06-22, branch admin-vite-spa)` section, update the `CR-01 (prod blocker)` bullet (around line 67) to record it as fixed: note that `resolveTenantOnly` now honors `x-tenant-id` on all routes (slug stays gated), the AuthGuard `auth.tenant_mismatch` backstop (RES-172) is unchanged, and a dedicated production-mode unit test was added at `apps/api/test/unit/shared/tenant-context.middleware.spec.ts` (e2e cannot catch this since it runs in NODE_ENV=test). Keep it terse — one short status line appended/prefixed (e.g. `RESOLVED 2026-06-23:`). Do NOT alter the CR-03a, CR-04, or WR-04 bullets, and do NOT edit the detailed finding section lower in the file unless a one-line "see Remediation Status" pointer is warranted.
  </action>
  <verify>
    <automated>grep -n "RESOLVED" .planning/phases/07.6-admin-vite-spa/07.6-REVIEW.md | grep -i "CR-01\|x-tenant-id" || grep -niE "CR-01.*(resolved|fixed)" .planning/phases/07.6-admin-vite-spa/07.6-REVIEW.md</automated>
  </verify>
  <done>CR-01 bullet in Remediation Status reflects the fix + the new unit test; CR-03a/CR-04/WR-04 untouched.</done>
</task>

</tasks>

<verification>
From repo root, the executor must run and report:
- `pnpm --filter @resto/api exec vitest run test/unit/shared/tenant-context.middleware.spec.ts` — new + existing middleware tests pass (this is the nx-equivalent; the nx `test` target runs `vitest run test/unit` from `apps/api`, so the targeted invocation must use the `test/unit/shared/...` path, NOT `src/shared/...`).
- `pnpm --filter @resto/api typecheck` (alias for `tsc -p tsconfig.json --noEmit` in `apps/api`) — clean.
- Lint the two changed code files: `pnpm --filter @resto/api exec eslint src/shared/tenant-context.middleware.ts test/unit/shared/tenant-context.middleware.spec.ts` — clean.

Sanity grep (proves the split landed): in `tenant-context.middleware.ts`, the `HEADER_TENANT_ID` / `resolveById` lookup must sit OUTSIDE the `shouldAcceptTenantSlugHeader` block, and `HEADER_TENANT` / `resolveBySlug` must remain INSIDE it.
</verification>

<success_criteria>

- `resolveTenantOnly` honors `x-tenant-id` (UUID → `resolveById`) on operator `/v1/*` routes in production; `x-tenant-slug` (slug → `resolveBySlug`) stays gated behind `shouldAcceptTenantSlugHeader`.
- New production-mode unit tests prove (a) the operator path binds tenant context, (b) the slug path stays ignored in prod, (c) customer-host precedence is preserved.
- `auth.guard.ts`, `permissions.guard.ts`, controllers, and `timingSafeEqualString` (WR-04) are untouched.
- WHY-comments in the middleware are accurate and <=2 lines each (apps/CLAUDE.md HARD rule).
- vitest + typecheck + lint all pass.
- CR-01 marked resolved in `07.6-REVIEW.md` Remediation Status.
- Commit (only if the user asks): conventional single-line subject, no body, no Claude attribution — e.g. `fix(api): honor x-tenant-id on operator routes in prod`.
  </success_criteria>

<output>
Create `.planning/quick/260623-vwy-cr-01-honor-x-tenant-id-on-operator-rout/260623-vwy-SUMMARY.md` when done.
</output>
