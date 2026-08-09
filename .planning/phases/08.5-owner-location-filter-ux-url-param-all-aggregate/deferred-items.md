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
