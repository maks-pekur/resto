# Deferred Items — Phase 08.2

## Pre-existing test failure (out of scope for Plan 06)

**File:** `apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts`
**Suite:** `RES-237: ADR-0020 I-1 cross-tenant isolation regression net`
**Test:** `catalog > GET /v1/menu under host A returns A items only, not B items with the same slug`
**Status:** Failing with 404 (expected 200)

**Root cause:** The test calls `GET /v1/menu` with only `x-tenant-slug` (no `x-brand-slug`). Since commit `06e2bb1` enforced `brand_id NOT NULL` on menu items (brand-scoped catalog, Phase 08.2 prerequisite), the public menu endpoint requires a brand context to determine which brand's menu to serve. Without `x-brand-slug`, the middleware resolves no brand and the endpoint returns 404.

**When introduced:** `06e2bb1 feat(catalog): enforce brand ownership on menu writes (brand_id NOT NULL)` — predates Plan 06 work.

**Fix needed:** Update the I1 fixture seed to also configure a `catalog_brand_stop_version` row and pass `x-brand-slug: <brandA.slug>` in the test request, or update the assertion to accept 404 with an appropriate non-brand-guard error code.
