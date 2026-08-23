# Deferred Items — Phase 08.5

## Plan 08.5-02 (D-13/D-14/D-15/LOW-11)

### Pre-existing `member_brand_scope` test debt — confirmed unaffected by D-14

D-14 (non-owner `set-active-brand` now returns 403 unconditionally, before any
scope check) surfaced as new failures in 5 e2e files when the full suite was
run during this plan's verification:

- `apps/api/test/e2e/set-active-brand.e2e.spec.ts`
- `apps/api/test/e2e/brand-isolation.e2e.spec.ts`
- `apps/api/test/e2e/roles-brand-scope-orthogonality.e2e.spec.ts`
- `apps/api/test/e2e/catalog-brand-scope.e2e.spec.ts`
- `apps/api/test/e2e/brand-payout-isolation.e2e.spec.ts`

Root-cause analysis (code-path read, not assumption): all 5 seed the legacy
`member_brand_scope` table for their non-owner fixtures, not
`member_location_scope`. `SetActiveBrandService`'s (pre-08.5) non-owner branch
and `InitialBrandDrizzleRepository.resolveForUserInTenant` both read
exclusively from `member_location_scope` (08.4 D-04) — so these fixtures
already produced `reachableBrands === null` and already threw
`BrandOutOfScopeError` (403) **before** this plan's changes. This matches the
already-tracked STATE.md test debt: "set-active-brand.e2e (2) + related
brand-scope e2e assert the pre-08.4 member_brand_scope model."

**What this plan fixed (in scope, D-14 directly caused it):** 2 assertions in
`set-active-brand.e2e.spec.ts` that checked the specific error `code` on an
already-403 response (`brand.out_of_scope` → `identity.non_owner_brand_switch_forbidden`,
since D-14 fires before any scope check). Both now pass.

**What remains untouched (pre-existing, out of scope for 08.5-02):**

- `set-active-brand.e2e.spec.ts` — 2 tests still red for the pre-existing
  `member_brand_scope`/`member_location_scope` mismatch:
  - `non-owner in-scope: can re-pin to a scoped brand (200)`
  - `D-13: non-owner scoped to 2 brands gets deterministic initial pin...`
- `brand-isolation.e2e.spec.ts`, `roles-brand-scope-orthogonality.e2e.spec.ts`,
  `catalog-brand-scope.e2e.spec.ts`, `brand-payout-isolation.e2e.spec.ts` —
  all use `set-active-brand` purely as non-owner fixture setup seeded via
  `member_brand_scope`; already 403'd pre-08.5 for the same reason (statusCode
  assertion fails identically before and after D-14 — verified, not assumed).

### Unrelated pre-existing flake noticed while running `test/unit/identity/`

`identity-boot-integration.spec.ts` — "Plan 03-02 D-14: boot-time email-adapter
misconfiguration regression > happy path: staging with real key +
adapterName=resend → assertProdGuardrails passes" fails in isolation
(`ProdGuardrailsError: ... STRIPE_CONNECT_RETURN_URL is unset ...`), on a
clean checkout, unrelated to any file this plan touches (Stripe Connect env
guardrails, not identity/location/brand). Confirmed via `git diff HEAD~4 HEAD`
— zero changes to this spec file or `src/config/` from this plan's commits.
Not fixed here — out of scope (Scope Boundary rule).

**New wrinkle for whoever picks up the existing test debt:** once
`member_brand_scope` fixtures are reseeded via `member_location_scope`, the
`non-owner in-scope: can re-pin to a scoped brand (200)` test in
`set-active-brand.e2e.spec.ts` cannot simply be "fixed" — D-14 makes 200
permanently impossible for any non-owner regardless of scope. That test case
must be deleted or repurposed to assert
403 `identity.non_owner_brand_switch_forbidden` instead, not reseeded to pass.

## Plan 08.5-03 (aggregate endpoint) — pre-existing owner-fixture regression, confirmed unrelated

While verifying this plan's D-10 change to `get-stop-list.service.ts`, ran
`catalog-reads.e2e.spec.ts` + `catalog-brand-read-isolation.e2e.spec.ts` as an
extra regression check (not in this plan's file-list). 3 tests fail:

- `catalog-reads.e2e.spec.ts` > `GET /stop-list surfaces stoppedAt per item, sorted DESC`
- `catalog-reads.e2e.spec.ts` > `GET /draft-diff returns unpublishedCount and capped items (tenant-only, no brand required)`
- `catalog-brand-read-isolation.e2e.spec.ts` > `stopping a brand-A item does not affect brand B's menu (#9)`

All three fail with `403 location.context_required` (from `LocationScopeGuard`,
`location-scope.guard.ts:39-45`, unchanged by this plan). Root cause: these
files' `setupAuthedTenant` fixture never creates a location or sends an
`x-location-id` header for the owner — before Phase 08.5, this apparently
relied on an ambient location context that no longer resolves (candidate:
08.5-02's owner-pin retirement, `de911ef`, or a `TenantContextMiddleware`
behavior change; not investigated further — out of scope for this plan).

**Confirmed NOT caused by this plan's changes**: isolated the 3 files this
plan touched (`get-stop-list.service.ts`, `catalog.module.ts`,
`catalog.controller.ts`) back to their pre-Task-2 state (commit `400f14d`,
before the D-10 validation and the aggregate endpoint existed) and reran
`catalog-reads.e2e.spec.ts` — identical 2 failures, identical 403
`location.context_required`, before any Task 2/3 code existed. The guard file
that actually throws is untouched by any 08.5-03 commit. Changes were then
restored to their Task-2/3 state (`git checkout 802815d -- ...` + reapplied
the Task 3 controller diff) and reverified green
(`stop-list-aggregate.e2e.spec.ts` 6/6, `location-isolation.e2e.spec.ts` 12/12).

Not fixed here — pre-existing, out of scope (Scope Boundary rule). Flagging
for whoever next touches `catalog-reads.e2e.spec.ts` /
`catalog-brand-read-isolation.e2e.spec.ts`: their owner fixtures need an
explicit location (create one + send `x-location-id`, mirroring
`catalog.e2e.spec.ts`'s `setupAuthedTenant`) now that owners no longer get an
ambient location context.
