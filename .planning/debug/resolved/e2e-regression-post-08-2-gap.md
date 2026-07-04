---
status: resolved
trigger: 'Two e2e regressions after phase-08.2 gap-closure round'
created: 2026-07-03T16:34:00Z
updated: 2026-07-03T16:50:00Z
---

## Current Focus

hypothesis: Both failures are test-side issues caused by the gap round changing security semantics that the tests were not updated to reflect.
test: apply targeted test fixes, verify 10/10 + 13/13 green
expecting: both test suites pass without weakening any isolation

reasoning_checkpoint:
hypothesis: "brand-isolation.e2e setPin(unscopedAdmin) gets 403 because CR-02 now enforces null-scope = deny in set-active-brand.service; the test bypassed the scope check relying on the old permissive behavior. cross-tenant catalog test gets 404 because requireBrandOr404() was added in 5a8d4fb but the test (written before that commit) never added x-brand-slug."
confirming_evidence: - "Failure 1: test fails at line 150 (unscopedAdminCookiePinnedA = setPin(unscopedBase, brandAId)) — unscopedAdmin has no member_brand_scope rows, CR-02 change !scope?.includes() → 403" - "Failure 2: catalog test headers only have x-tenant-slug, no x-brand-slug; requireBrandOr404() returns undefined → NotFoundException(404)" - "git show 787495f confirms CR-02 changed null scope behavior from permissive to deny" - "git show 5a8d4fb confirms requireBrandOr404() added in that commit, before cross-tenant test"
falsification_test: "if isolation is broken, cross-brand RLS matrix tests (12 tests in cross-tenant) would fail, but they pass — confirming isolation is intact"
fix_rationale: "Fix 1: replace setPin API call for unscopedAdmin with direct authDb session update (forceSetActiveBrand), which correctly simulates the 'pin set but scope later revoked' scenario. Fix 2: add x-brand-slug header to the catalog test request."
blind_spots: "is_system_session() function referenced in 0058 policies — was it dropped or changed in the gap round? (checked: not changed, gap round only touched app_bind_brand signature)"

next_action: implement both test fixes

## Symptoms

expected:

- brand-isolation.e2e.spec.ts: 10/10 green
- cross-tenant-isolation.e2e.spec.ts: 13/13 green

actual:

- brand-isolation.e2e.spec.ts: 0/10 (10 skipped, beforeAll fails with 403 on setPin)
- cross-tenant-isolation.e2e.spec.ts: ~12/13 (catalog test gets 404 instead of 200)

errors:

- "AssertionError: expected 403 to be 200 — setPin test/e2e/brand-isolation.e2e.spec.ts:96"
- "GET /v1/menu returns 404 (requireBrandOr404 triggered)"

reproduction:

- cd apps/api && pnpm vitest run test/e2e/brand-isolation.e2e.spec.ts
- cd apps/api && pnpm vitest run test/e2e/cross-tenant-isolation.e2e.spec.ts

started: after phase-08.2 gap-closure round commits (787495f CR-02, 5daf493)

## Eliminated

- hypothesis: "Failure 2 caused by ::text cast in client.ts breaking current_brand_id() comparison"
  evidence: "cross-BRAND RLS matrix (12 tests) all pass — those tests call app_bind_brand explicitly and work fine. The issue is upstream of RLS: the brand is never bound because requireBrandOr404() fires before withTenant."
  timestamp: 2026-07-03T16:45:00Z

- hypothesis: "Failure 1 caused by member_brand_scope RLS blocking the scope reader"
  evidence: "member_brand_scope has only tenant-level RLS (0017). The failure is in service logic, not RLS: CR-02 change made null scope = 403."
  timestamp: 2026-07-03T16:45:00Z

- hypothesis: "Failure 2 is a real production bug where public menu returns 404"  
  evidence: "requireBrandOr404() is intentional — public menu requires brand context. The test predates this requirement and simply needs x-brand-slug added. Production path resolves brand from subdomain host; test uses x-tenant-slug override without brand."
  timestamp: 2026-07-03T16:45:00Z

## Evidence

- timestamp: 2026-07-03T16:35:00Z
  checked: "brand-isolation.e2e.spec.ts line 150 + setPin helper"
  found: "failure is at unscopedAdminCookiePinnedA = setPin(unscopedBase, brandAId) — not scopedAdminCookiePinnedA"
  implication: "scopedAdmin (has member_brand_scope rows via seedMemberScoped) pins fine; unscopedAdmin (no scope rows) cannot pin after CR-02"

- timestamp: 2026-07-03T16:38:00Z
  checked: "git show 787495f — CR-02 diff"
  found: "changed 'if (scope !== null && !scope.includes(...))' to 'if (!scope?.includes(...))' — null scope now throws"
  implication: "Users with no member_brand_scope rows can no longer call set-active-brand — correct D-08 behavior, breaks old test assumption"

- timestamp: 2026-07-03T16:40:00Z
  checked: "cross-tenant-isolation.e2e.spec.ts catalog test headers"
  found: "only x-tenant-slug: fixture.tenantA.slug sent, no x-brand-slug"
  implication: "TenantContextMiddleware sets tenantId but no brandId → getBrandId() = undefined → requireBrandOr404() throws 404"

- timestamp: 2026-07-03T16:42:00Z
  checked: "public-menu.controller.ts requireBrandOr404() + git log 5a8d4fb"
  found: "requireBrandOr404() added in 5a8d4fb 'feat(catalog): brand-scope public menu reads; brandless read 404s' — BEFORE cross-tenant test was written"
  implication: "Cross-tenant test was written AFTER requireBrandOr404 existed but the author didn't add x-brand-slug — test was never actually green for the catalog scenario (or was green in a DB state where brand was resolved differently)"

## Resolution

root_cause:
failure_1: "CR-02 (787495f) correctly enforces D-08 default-deny for null-scope users in set-active-brand.service. The brand-isolation.e2e test creates unscopedAdmin via addMemberWithRole (no member_brand_scope rows) and expects setPin to succeed — assumption from old permissive behavior."
failure_2: "requireBrandOr404() in public-menu.controller.ts (added 5a8d4fb) requires brand context for GET /v1/menu. The cross-tenant catalog test sends only x-tenant-slug (resolves tenant, not brand) so getBrandId() returns undefined → 404. Test was not updated when brand requirement was added."

fix:
failure_1: "In brand-isolation.e2e.spec.ts: replace setPin(unscopedBase, brandAId) with forceSetActiveBrand() helper that directly updates the session's activeBrandId in authDb. This correctly simulates 'pin set then scope revoked' scenario. No service change."
failure_2: "In cross-tenant-isolation.e2e.spec.ts: add x-brand-slug: 'flagship-i1a' to the catalog GET /v1/menu request headers. The fixture seeds brandA with slug 'flagship-i1a' for tenantA."

verification: "All 4 suites green: brand-isolation 10/10, cross-tenant 13/13, catalog-brand-isolation 6/6, brand-payout-isolation 10/10. 39/39 total. Commit 7d66d66."
files_changed:

- apps/api/test/e2e/brand-isolation.e2e.spec.ts
- apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts
