# Public Menu Caching (HTTP/CDN ETag) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the public menu via HTTP/CDN edge caching keyed on a durable Postgres menu version, split availability (stop-list) into its own near-instant resource, and retire the Redis menu-cache.

**Architecture:** Two public resources — a publish-versioned menu document (`GET /v1/menu`, hard edge cache + ETag) and a small fast availability resource (`GET /v1/menu/availability`, short cache). Versions become durable Postgres values (`menuVersion` per-tenant, `stopVersion` per-brand) bumped atomically inside the publish/stop transactions. Clients fetch both and merge. Redis is removed last, after the edge path is proven.

**Tech Stack:** NestJS + Fastify, Drizzle + Postgres (hand-written migrations + journal), Vitest (unit + Docker e2e via `RESTO_REQUIRE_DOCKER=1`), Vite/React (qr-menu), Next RSC (website), Cloudflare (CDN).

**Source spec:** `docs/superpowers/specs/2026-06-14-public-menu-caching-design.md`.

**Hard project rules (apply to every task):**

- **ZERO code comments.** No doc-blocks, no inline narration, no ticket/AUDIT refs in code. Test intent lives in `describe`/`it` names. If a line seems to need a WHY, leave it out.
- Conventional-commit subject only — single line, no body, no Claude/Co-Authored-By footer.
- TDD: failing test first → run red → minimal impl → run green → commit. Commit per task.
- Pre-commit hook runs prettier/eslint/typecheck. Migrations are hand-written SQL + a `meta/_journal.json` entry (NEVER `db:generate` — snapshots are stale). e2e need Docker.
- Locked decisions: `menuVersion` per-tenant, `stopVersion` per-brand, `s-maxage` 300 (menu) / 5 (availability), no CDN purge in v1, the per-item detail read drops the stop-filter.

---

## Phase roadmap (ship & pause between phases — do NOT auto-advance)

1. **Postgres versions** — durable `menuVersion` (per-tenant) + `stopVersion` (per-brand); Postgres-backed `MenuVersionPort` + a `StopVersionPort`; atomic bump inside publish/stop txns. Redis still caches the menu doc — behavior unchanged, versions now durable. **Detailed below.**
2. **Availability endpoint (additive)** — new `GET /v1/menu/availability` returning `{ stoppedItemIds }` with `ETag: "<stopVersion>"` + `Cache-Control: public, s-maxage=5` + `If-None-Match`/304. `/v1/menu` is NOT touched (keeps `isStopListed`) so qr-menu does not regress. **Regrouped 2026-06-14:** the `isStopListed` removal + menu-doc ETag/caching were moved OUT of this phase into Phase 3 — they are a breaking contract change that must ship atomically with the client switch (otherwise qr-menu shows stopped items as orderable between phases, and a stop would stale an ETag-cached menu doc without bumping `menuVersion`).
3. **Contract break + caching + clients (atomic)** — remove `isStopListed` from `GET /v1/menu`; per-item detail drops the stop-filter; add `ETag: "<menuVersion>"` + `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` + `If-None-Match`/304 to `/v1/menu`; AND switch qr-menu (Vite) + website (Next) to fetch both resources, merge client-side (grey-out/hide stopped), send `If-None-Match`, refresh availability on focus + ~20s — all in one phase so there is no regression window.
4. **CDN** — Cloudflare in front of qr-menu/API; verify edge HIT/MISS + 304 revalidation in staging (ops/config, minimal code).
5. **Redis removal** — delete `redis-catalog-cache.adapter.ts`, the `menu_versions_seq` fallback, and its `WITHOUT_TENANT_ALLOWLIST` entry (the AUDIT #16 enforcement test flags the stale entry).

Each subsequent phase gets its own bite-sized plan (re-run writing-plans) when started, because its exact code depends on the prior phase's committed shapes.

---

## Phase 1 — Postgres versions

**Outcome:** `menuVersion` and `stopVersion` live in Postgres, are bumped atomically with the publish/stop writes, and are read by the existing menu read path. No HTTP/contract change yet; Redis still caches the menu document. Verifiable: durable monotonic versions survive a Redis-less boot; publish/stop bump the right version in the same transaction as the data.

### File Structure (Phase 1)

- Create `packages/db/migrations/0048_catalog_menu_versions.sql` — `catalog_menu_version` (per-tenant `menu_version`) + `catalog_brand_stop_version` (per-brand `stop_version`) tables, seeded for existing rows.
- Create `packages/db/migrations/meta/_journal.json` entry idx 48.
- Modify `packages/db/src/schema/menu.ts` — add `catalogMenuVersion` + `catalogBrandStopVersion` table defs (composite tenant FK on the brand-scoped one per ADR-0020 I-2).
- Modify `apps/api/src/contexts/catalog/domain/ports.ts` — add `StopVersionPort` (`STOP_VERSION_PORT` + interface); keep `MenuVersionPort` shape.
- Create `apps/api/src/contexts/catalog/infrastructure/postgres-menu-version.adapter.ts` — Postgres `MenuVersionPort` (`current`/`bump`) + `StopVersionPort` (`currentStop`/`bumpStop`).
- Modify `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` — `finalizeMenuPublish` bumps `menu_version` in-tx and returns it; stop/unstop repo methods bump `stop_version` in-tx.
- Modify `apps/api/src/contexts/catalog/application/publish-menu.service.ts` + `stop-list.service.ts` — read versions via the ports; the bump moves into the repo tx (application layer keeps no `tx.*`).
- Modify `apps/api/src/contexts/catalog/catalog.module.ts` — bind `MENU_VERSION_PORT` + `STOP_VERSION_PORT` to the Postgres adapter; the Redis adapter keeps only `CATALOG_CACHE_PORT`.
- Test: `packages/db/test/integration/catalog-menu-versions.spec.ts` (migration + durable bump), `apps/api/test/integration/postgres-menu-version.adapter.spec.ts`, and extend the publish/stop e2e.

### Task 1.1: Migration + schema for the two version tables

**Files:**

- Create: `packages/db/migrations/0048_catalog_menu_versions.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Modify: `packages/db/src/schema/menu.ts`
- Test: `packages/db/test/integration/catalog-menu-versions.spec.ts`

- [ ] **Step 1: Write the migration SQL.** `catalog_menu_version (tenant_id uuid PK REFERENCES tenants(id), menu_version bigint NOT NULL DEFAULT 1)`; `catalog_brand_stop_version (brand_id uuid, tenant_id uuid, stop_version bigint NOT NULL DEFAULT 1, PRIMARY KEY (brand_id, tenant_id), FOREIGN KEY (brand_id, tenant_id) REFERENCES brands(id, tenant_id) ON DELETE CASCADE, FOREIGN KEY (tenant_id) REFERENCES tenants(id))`. Enable + FORCE RLS on both (predicate `is_system_session() OR tenant_id = current_tenant_id()`), mirroring an existing tenant-scoped table's policy block. Seed: `INSERT INTO catalog_menu_version (tenant_id) SELECT id FROM tenants ON CONFLICT DO NOTHING;` and the per-brand equivalent from `brands`.
- [ ] **Step 2: Add the journal entry** idx 48, tag `0048_catalog_menu_versions`, `when` strictly greater than 0047's.
- [ ] **Step 3: Add the Drizzle table defs** in `menu.ts` (`catalogMenuVersion`, `catalogBrandStopVersion`) using `tenantIdColumn()` + `compositeTenantFk` for the brand table, matching the existing menu-table conventions.
- [ ] **Step 4: Write the integration test** in `catalog-menu-versions.spec.ts` (real testcontainer): after migrations, both tables exist; a seeded tenant/brand has version `1`; a manual `UPDATE ... SET menu_version = menu_version + 1 RETURNING menu_version` yields `2`; RLS blocks a cross-tenant read of `catalog_brand_stop_version` (mirror `tenant-isolation.spec.ts` assertions).
- [ ] **Step 5: Run** `RESTO_REQUIRE_DOCKER=1 pnpm --filter @resto/db exec vitest run test/integration/catalog-menu-versions.spec.ts` → PASS; `pnpm exec nx run-many -t typecheck lint -p db` → PASS.
- [ ] **Step 6: Commit** `feat(db): add catalog menu_version + brand stop_version tables`.

### Task 1.2: `StopVersionPort` + Postgres version adapter

**Files:**

- Modify: `apps/api/src/contexts/catalog/domain/ports.ts`
- Create: `apps/api/src/contexts/catalog/infrastructure/postgres-menu-version.adapter.ts`
- Test: `apps/api/test/integration/postgres-menu-version.adapter.spec.ts`

- [ ] **Step 1: Add the port.** In `ports.ts`: `export interface StopVersionPort { currentStop(brandId: string): Promise<number>; bumpStop(tx: RestoTx, brandId: string, tenantId: string): Promise<number>; }` and `export const STOP_VERSION_PORT = Symbol('STOP_VERSION_PORT');`. Extend `MenuVersionPort` with an in-tx bump: keep `current(tenantId)`, change/augment to `bump(tx: RestoTx, tenantId: TenantId): Promise<number>` (the bump now runs inside the publish tx). Read `current` stays tx-less (its own scoped read).
- [ ] **Step 2: Write the adapter test** (real DB): `current`/`currentStop` return the seeded `1`; `bump`/`bumpStop` inside a `withTenant` tx increment and return the new value; two sequential bumps yield `2` then `3`; `currentStop` is per-brand (bumping brand A does not change brand B).
- [ ] **Step 3: Run red** → FAIL (adapter not implemented).
- [ ] **Step 4: Implement** `PostgresMenuVersionAdapter implements MenuVersionPort, StopVersionPort`. `current`: `db.withTenant` select `menu_version` for the tenant (default 1 if absent). `bump(tx, tenantId)`: `UPDATE catalog_menu_version SET menu_version = menu_version + 1 WHERE tenant_id = ? RETURNING menu_version`, upsert-on-missing. `currentStop(brandId)`: scoped select. `bumpStop(tx, brandId, tenantId)`: `UPDATE catalog_brand_stop_version SET stop_version = stop_version + 1 WHERE brand_id = ? AND tenant_id = ? RETURNING stop_version`, upsert-on-missing. Use `ScopedTx`/`tx` per the no-raw-SQL-outside-db rule (the version tables are tenant-scoped, so `ScopedTx` applies).
- [ ] **Step 5: Run green** + `nx run-many -t typecheck lint -p api db`.
- [ ] **Step 6: Commit** `feat(catalog): postgres-backed menu + stop version adapter`.

### Task 1.3: Bump versions atomically in publish / stop transactions

**Files:**

- Modify: `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` (`finalizeMenuPublish`, `addToStopList`/`removeFromStopList`)
- Modify: `apps/api/src/contexts/catalog/application/publish-menu.service.ts`, `stop-list.service.ts`
- Modify: `apps/api/src/contexts/catalog/catalog.module.ts`
- Test: extend `apps/api/test/e2e/catalog.e2e.spec.ts` (or the publish/stop e2e)

- [ ] **Step 1: Write the e2e assertions** (red): after `POST /v1/catalog/publish`, the tenant's `catalog_menu_version` incremented by exactly 1; after `POST /v1/catalog/stop-list` for brand A, brand A's `stop_version` incremented by 1 and brand B's unchanged; the publish did NOT change any `stop_version`, and the stop did NOT change `menu_version`.
- [ ] **Step 2: Move the bump into the tx.** In `finalizeMenuPublish(tx, ...)`: call `menuVersion.bump(tx, tenantId)` (inject the port) and return the new version; remove the pre-tx `versions.bump` from `doPublish` (read-back the returned version instead). In `addToStopList`/`removeFromStopList`: call `stopVersion.bumpStop(tx, brandId, tenantId)` inside the existing `withTenant` block. Application services no longer call `bump` directly (keeps `tx.*` out of the app layer).
- [ ] **Step 3: Rebind the module.** `catalog.module.ts`: `{ provide: MENU_VERSION_PORT, useClass: PostgresMenuVersionAdapter }`, `{ provide: STOP_VERSION_PORT, useClass: PostgresMenuVersionAdapter }` (same instance via a shared provider or `useExisting`). The Redis adapter keeps `{ provide: CATALOG_CACHE_PORT, useClass: RedisCatalogCacheAdapter }` only — remove its `MENU_VERSION_PORT` binding.
- [ ] **Step 3b:** the Redis adapter still exposes `current/bump` (unused now) — leave the class intact (it is deleted in Phase 5); just stop binding it to `MENU_VERSION_PORT`.
- [ ] **Step 4: Run green** — the new e2e + the full catalog e2e suite (`catalog.e2e`, `catalog-reads`, `catalog-brand-isolation`, `menu-brand-response`) stay green; the menu read still works (it reads `current` from Postgres now).
- [ ] **Step 5:** `nx run-many -t typecheck lint -p api`, `pnpm openapi:check` (no contract change expected in Phase 1).
- [ ] **Step 6: Commit** `feat(catalog): bump menu/stop versions in publish/stop transactions`.

### Task 1.4: Redis-less boot proves durable versions

**Files:**

- Test: `apps/api/test/e2e/menu-version-durability.e2e.spec.ts` (new)

- [ ] **Step 1: Write the test** (red→green is structural): boot the real stack with `NATS`/Redis irrelevant — set no `REDIS_URL` (or a disabled cache), publish twice, assert `menu_version` went 1→2→3 in Postgres and the menu read returns successfully (no dependence on Redis for the version). This pins the foundational invariant the whole feature rests on.
- [ ] **Step 2: Run** `RESTO_REQUIRE_DOCKER=1 ... vitest run test/e2e/menu-version-durability.e2e.spec.ts` → PASS.
- [ ] **Step 3: Commit** `test(catalog): menu version is durable without redis`.

### Phase 1 acceptance

- Both version tables exist with RLS; seeded to 1 for existing tenants/brands.
- `menuVersion` bumps once per publish, `stopVersion` once per stop/unstop, each inside the data transaction; publish never touches stop_version and vice-versa.
- The menu read path reads `current` from Postgres; behavior is unchanged with or without Redis.
- All existing catalog e2e green; typecheck/lint/openapi green.

---

## Phase 2 — Endpoints + contract (plan when Phase 1 ships)

**Goal:** `GET /v1/menu` emits `ETag: "<menuVersion>"` + `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` and returns 304 on matching `If-None-Match`; new `GET /v1/menu/availability` returns `{ stoppedItemIds }` with `ETag: "<stopVersion>"` + `Cache-Control: public, s-maxage=5`; the menu document drops `isStopListed`; the per-item detail read drops the stop-filter (returns the document, no 404 on stopped).

**Key tasks (expand to bite-sized at start):** add a Fastify `setHeader`/`ETag` + conditional-304 path in `public-menu.controller.ts` reading the version port; remove the stop overlay from `loadPublishedMenu`/`findPublishedItem` and the `PublishedMenu`/DTO types; add `GetMenuAvailabilityService` + repo `listStoppedItemIds(brandId)` + the new controller route + DTO; OpenAPI regen + `openapi:check`; e2e proving ETag-changes-on-publish, 304-on-match, **menu ETag unchanged across a stop** (the key property), per-brand availability isolation, and the absence of `isStopListed`.

**Acceptance:** headers correct on both routes; 304 works; stop changes availability but not the menu ETag; contract change reflected in OpenAPI + clients still parse (Phase 3 updates them).

## Phase 3 — Clients (plan when Phase 2 ships)

**Goal:** qr-menu (`apps/qr-menu`) and website (`apps/website`) fetch `/v1/menu` + `/v1/menu/availability`, merge (grey-out/hide stopped by id), send `If-None-Match`, refresh availability on window focus + ~20s while visible; website aligns Next `revalidate` to 300/5.

**Key tasks:** split the api-client fetchers (`fetchMenu` + new `fetchAvailability`); a small merge util (stopped-set → item flag); qr-menu render greys/hides stopped; website RSC fetches both with `next: { revalidate }`; tests for the merge util + a qr-menu smoke that a stopped id renders sold-out without re-fetching the menu doc. Honor the apps/ network rules (AbortSignal timeout, one-retry-on-idempotent-GET-5xx, Try-again affordance).

**Acceptance:** stopped item shows sold-out after an availability refresh without re-fetching the menu document; both clients send conditional requests.

## Phase 4 — CDN (plan when Phase 3 ships)

**Goal:** Cloudflare in front of qr-menu/API edge-caches `/v1/menu` (and `/availability`) honoring our headers; verify HIT/MISS + 304 revalidation in staging.

**Key tasks (mostly ops/config, minimal code):** ensure the API does not set `Set-Cookie` / `Vary` that defeats caching on these public GETs; confirm host-based cache keying (per brand subdomain); a staging runbook asserting `cf-cache-status: HIT` after warm-up and a 304 on revalidation; document the cache headers in `apps/CLAUDE.md` (not code comments).

**Acceptance:** edge HIT on repeat reads; publish reflected within `s-maxage`; stop within ~5s.

## Phase 5 — Redis removal (plan when Phase 4 ships)

**Goal:** delete the Redis menu-cache now that the edge is the cache and the version is Postgres.

**Key tasks:** remove `redis-catalog-cache.adapter.ts`, its `CATALOG_CACHE_PORT` binding, the `CatalogCachePort` reads from the menu service (the Postgres read becomes the origin), the `menu_versions_seq` fallback, the `ioredis` dependency if unused elsewhere, and the `redis-catalog-cache.adapter.ts` entry from `WITHOUT_TENANT_ALLOWLIST` + its ESLint override (the AUDIT #16 enforcement test will fail until the stale entry is dropped). Keep `REDIS_URL` env optional-removal as a separate call.

**Acceptance:** app boots + serves menu with no Redis; AUDIT #16 allowlist test green; no `ioredis`/Redis references remain in the catalog read path.

---

## Self-review notes

- Spec coverage: every spec section maps to a phase (two resources → P2/P3; Postgres version → P1; header contract → P2; invalidation → P1 bump + P2 ETag; client merge → P3; Redis removal order → P1/P5; testing → per-phase acceptance).
- Phase 1 is fully bite-sized and independently shippable (durable versions, no contract change). Phases 2–5 are roadmapped because their exact code depends on Phase 1's committed shapes — each is expanded via writing-plans when started, preserving the "pause between phases" rule.
