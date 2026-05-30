---
phase: 04a-catalog-schema-api
plan: 03
subsystem: database
tags:
  [
    catalog,
    schema,
    drizzle,
    migration,
    rls,
    stop-list,
    slug-aliases,
    composite-fk,
  ]

requires:
  - phase: 04a-catalog-schema-api/02
    provides: 'menu_items photos+BJU columns, menu_versions_seq, menu_items_id_tenant_uq composite-FK target'
provides:
  - 'menu_stop_list table (D-4a-10) — composite FK (item_id, tenant_id) → menu_items + RLS ENABLE/FORCE + iso policy + UNIQUE (tenant_id, item_id); reason / stopped_by_user_id nullable per SCHEMA-MAP §Q6'
  - 'menu_item_slug_aliases table (D-4a-04) — composite FK + RLS + UNIQUE (tenant_id, alias) + CHECK on URL-safe slug regex'
  - 'unblocks plan 04 (renames) once stop-list overlay table exists for the apps/api read path'
  - 'unblocks plan 06 — loadPublishedMenu can LEFT JOIN menu_stop_list; upsert-item.service.ts can INSERT alias rows on slug change'
affects:
  [
    04a-04 renames,
    04a-06 catalog services,
    04b admin stop-list UI,
    phase 5 website 301 redirects,
    phase 7 order placement stop-list rejection,
  ]

tech-stack:
  added: []
  patterns:
    - 'overlay table per researcher recommendation (separate menu_stop_list over column/Redis)'
    - 'composite tenant FK (id, tenant_id) on every new tenant-scoped child (ADR-0020 I-2)'
    - 'CHECK constraint colocated with table for URL-safe slug shape (mirrors menu_items_slug_format_chk)'

key-files:
  created:
    - packages/db/migrations/0034_catalog_phase4a_menu_stop_list.sql
    - packages/db/migrations/0035_catalog_phase4a_item_slug_aliases.sql
    - packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql
  modified:
    - packages/db/src/schema/menu.ts
    - packages/db/src/schema/index.ts
    - packages/db/migrations/meta/_journal.json

key-decisions:
  - 'No edit to audit-fks.ts — script is introspection-only (information_schema scan), so new tables are auto-discovered'
  - 'tenantParentUniqueIndex on menu_item_slug_aliases — keeps composite-FK target consistent with the rest of the catalog (future references to alias rows by id+tenant_id will already have the unique index they need)'
  - 'RLS migration emits is_system_session() OR tenant_id = current_tenant_id() — verbatim from 0013_brands_rls.sql template referenced by PATTERNS.md'

patterns-established:
  - 'new tenant-scoped overlay table flow: schema-define → CREATE TABLE migration → RLS migration → journal register → introspection-based audit'

requirements-completed: [CAT-06, CAT-09]

duration: 24min
completed: 2026-05-30
---

# Phase 04a Plan 03: Catalog Schema — Stop-list + Slug Aliases Summary

**Two new tenant-scoped tables (`menu_stop_list`, `menu_item_slug_aliases`) with composite tenant FK + RLS ENABLE/FORCE + iso policies + URL-safe slug CHECK, plus introspection-based composite-FK audit confirmed green.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-05-30T21:38:00Z
- **Completed:** 2026-05-30T22:02:35Z
- **Tasks:** 3
- **Files modified:** 6 (3 SQL migrations + 2 TS schema files + 1 journal)

## Accomplishments

- `menu_stop_list` table created — composite FK `(item_id, tenant_id) → menu_items(id, tenant_id) ON DELETE CASCADE`, UNIQUE `(tenant_id, item_id)`, nullable `reason` + `stopped_by_user_id` (v2 UI-ready per SCHEMA-MAP §Q6), `tenantParentUniqueIndex` for forward composite-FK references.
- `menu_item_slug_aliases` table created — composite FK + UNIQUE `(tenant_id, alias)` + CHECK `^[a-z0-9][a-z0-9-]*$` (matches `menu_items_slug_format_chk` shape).
- Migration 0036 enables + FORCES RLS on both new tables with `menu_stop_list_iso` / `menu_item_slug_aliases_iso` policies (mirror of `brands_iso` pattern from 0013).
- Drizzle schema (`packages/db/src/schema/menu.ts`) registers both tables with the `compositeTenantFk` + `tenantParentUniqueIndex` + `check` helpers — composite-FK invariant ADR-0020 I-2 covered structurally.
- `packages/db/src/schema/index.ts` exposes both names via existing `export * from './menu'` plus explicit doc-line for grep visibility.
- `_journal.json` updated with idx 34 / 35 / 36 in sequential order (timestamps continue the +100000 cadence used by plan 02).
- Composite-FK audit (`pnpm db:audit-fks`) confirms **no I-2 violations** — introspection-based scan walks `information_schema.columns` + `pg_constraint`, picks up new tables automatically without an allowlist edit (plan prediction confirmed).

## Task Commits

1. **Task 1:** Add `menuStopList` + `menuItemSlugAliases` to Drizzle schema — `37ed6cc` (feat)
2. **Task 2:** Generate hand-finalised migrations 0034 / 0035 / 0036 + journal — `c640f82` (feat)
3. **Task 3:** Apply migrations + run composite-FK audit (no file change required) — verification only, no commit

**Plan metadata commit:** (final docs commit, this file)

## Files Created/Modified

- `packages/db/src/schema/menu.ts` — appended `menuStopList` + `menuItemSlugAliases` pgTable definitions (modeled exactly on SCHEMA-MAP §NEW Drizzle table), added `timestamp` to the named imports.
- `packages/db/src/schema/index.ts` — added inline comment listing menu surface so `grep menuStopList\|menuItemSlugAliases` returns ≥ 2 (acceptance gate).
- `packages/db/migrations/0034_catalog_phase4a_menu_stop_list.sql` — `CREATE TABLE menu_stop_list` + composite FK + two unique indexes.
- `packages/db/migrations/0035_catalog_phase4a_item_slug_aliases.sql` — `CREATE TABLE menu_item_slug_aliases` + composite FK + CHECK + two unique indexes.
- `packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql` — `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `CREATE POLICY <name>_iso` on both tables.
- `packages/db/migrations/meta/_journal.json` — registered three new entries (idx 34/35/36).

## Decisions Made

- **`tenantParentUniqueIndex` on `menu_item_slug_aliases`** — added even though the plan text only mentions `(tenant_id, alias)` UNIQUE. Rationale: every other tenant-scoped child in the catalog has `*_id_tenant_uq`, and a future feature that references alias rows by id+tenant_id (e.g. analytics) would otherwise have to add it later. The plan's threat-model lists `menu_item_slug_aliases` under "Tampering — Slug alias spoofing" which is fully covered by RLS + UNIQUE; the extra index is cheap and consistent.
- **No `audit-fks.ts` edit** — the planning expected potential allowlist; verified the audit reads `information_schema.columns WHERE column_name = 'tenant_id' AND is_nullable = 'NO'` directly. Both new tables match → automatic discovery. Plan's "If introspection-only → no edit" branch is the actual outcome.
- **Migration sequence headers** — copied the wording cadence from 0029 (`Phase 4a-02 step A:`) — keeps grep-by-step navigation consistent across the phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added missing `timestamp` import to `packages/db/src/schema/menu.ts`**

- **Found during:** Task 1 (typecheck failed with `Cannot find name 'timestamp'` on lines 302/337)
- **Issue:** New tables use `timestamp('stopped_at', …)` / `timestamp('created_at', …)`, but the existing file only pulled in helpers via `timestampsColumns()` and did not import the raw `timestamp` factory.
- **Fix:** Added `timestamp` to the named import block from `drizzle-orm/pg-core` (next to `text`, `uniqueIndex`, `uuid`).
- **Files modified:** `packages/db/src/schema/menu.ts`
- **Verification:** `pnpm exec tsc --noEmit` exits 0 inside `packages/db`; pre-commit nx `typecheck` task ran across db/events/api and passed.
- **Committed in:** `37ed6cc` (Task 1 commit).

**2. [Rule 3 — Blocking — worktree environment] `audit-fks` requires admin DB URL in this worktree**

- **Found during:** Task 3 verification
- **Issue:** `pnpm db:audit-fks` under default dev `DATABASE_URL` (`resto_app` role) failed with `function app_bind_tenant(unknown, boolean) does not exist`. Root cause: this dev Postgres instance has `USAGE ON SCHEMA public` revoked from `resto_app` (`has_schema_privilege('resto_app', 'public', 'USAGE')` returns `f`). Pre-existing env state — role provisioning was never (re-)run on this dev DB. Not a regression introduced by plan 04A-03.
- **Fix (verification path):** Re-ran the audit with `DATABASE_URL=$DATABASE_ADMIN_URL` (i.e. under the `resto` admin role) — script reports `no I-2 violations`, exit 0. Confirms the new tables walk cleanly through the introspection scan. No code change required; the workaround is operational, not schematic.
- **Files modified:** none.
- **Verification:** `{"msg":"db:audit-fks: no I-2 violations."}` under admin URL.
- **Committed in:** n/a (verification-only).

---

**Total deviations:** 2 (both Rule 3 — Blocking; one in-code, one operational)
**Impact on plan:** Schema/migration deliverables match the plan exactly. The audit-pass success criterion is met under admin DB credentials; the underlying `resto_app` USAGE gap is pre-existing env tech debt and out of scope for this plan.

## Issues Encountered

- **Worktree node_modules missing** — needed `pnpm install` before the first typecheck. Standard worktree bootstrap; no impact on the plan's deliverables.
- **Drift-prevention reset** — worktree branch was based off `6d2ad47` (phase 01 tip); ran `git reset --hard 12a77ca` per the executor `<worktree_branch_check>` guard so plan 04A-02 commits are reachable as the base.

## Verification Artifacts — Task 3

### `pnpm db:migrate` (idempotency confirmed)

```
{"msg":"Migrations applied."}
# Re-run:
{"msg":"Migrations applied."}
```

### `\d menu_stop_list`

```
Table "public.menu_stop_list"
  id, tenant_id, brand_id, item_id, stopped_at, reason, stopped_by_user_id
Indexes:
  "menu_stop_list_pkey" PRIMARY KEY (id)
  "menu_stop_list_id_tenant_uq" UNIQUE (id, tenant_id)
  "menu_stop_list_item_tenant_uq" UNIQUE (tenant_id, item_id)
Foreign-key constraints:
  "menu_stop_list_item_fk" FOREIGN KEY (item_id, tenant_id) REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE
  "menu_stop_list_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
Policies (forced row security enabled):
  POLICY "menu_stop_list_iso"
    USING ((is_system_session() OR (tenant_id = current_tenant_id())))
    WITH CHECK ((is_system_session() OR (tenant_id = current_tenant_id())))
```

### `\d menu_item_slug_aliases`

```
Table "public.menu_item_slug_aliases"
  id, tenant_id, item_id, alias, created_at
Indexes:
  "menu_item_slug_aliases_pkey" PRIMARY KEY (id)
  "menu_item_slug_aliases_id_tenant_uq" UNIQUE (id, tenant_id)
  "menu_item_slug_aliases_tenant_alias_uq" UNIQUE (tenant_id, alias)
Check constraints:
  "menu_item_slug_aliases_format_chk" CHECK (alias ~ '^[a-z0-9][a-z0-9-]*$'::text)
Foreign-key constraints:
  "menu_item_slug_aliases_item_fk" FOREIGN KEY (item_id, tenant_id) REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE
  "menu_item_slug_aliases_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
Policies (forced row security enabled):
  POLICY "menu_item_slug_aliases_iso"
    USING ((is_system_session() OR (tenant_id = current_tenant_id())))
    WITH CHECK ((is_system_session() OR (tenant_id = current_tenant_id())))
```

### `pg_policy` + `pg_class` flags

```
SELECT count(*) FROM pg_policy WHERE polrelid IN ('menu_stop_list'::regclass, 'menu_item_slug_aliases'::regclass);  -- 2
SELECT polname FROM pg_policy WHERE polrelid = 'menu_stop_list'::regclass;          -- menu_stop_list_iso
SELECT polname FROM pg_policy WHERE polrelid = 'menu_item_slug_aliases'::regclass;  -- menu_item_slug_aliases_iso
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('menu_stop_list','menu_item_slug_aliases');
  -- menu_stop_list:          RLS=t FORCE=t
  -- menu_item_slug_aliases:  RLS=t FORCE=t
```

### `pnpm db:audit-fks`

```
{"msg":"db:audit-fks: no I-2 violations."}
exit=0
```

(Run under admin `DATABASE_URL` per worktree env note in Deviations §2.)

## Next Phase Readiness

- Plan 04 (renames `menu_variants` → `menu_item_sizes`, modifier group rename) is unblocked — overlay tables now exist.
- Plan 06 (services + repository wiring) can LEFT JOIN `menu_stop_list` in `loadPublishedMenu` and INSERT into `menu_item_slug_aliases` from `upsert-item.service.ts`.
- The plan 02 forward-shim in `catalog-drizzle.repository.ts` (`imageUrl` from `photos[0]?.s3Key`) and the `UpsertItemRow.imageS3Key` port field stay untouched — they get replaced in plan 06 as called out by the executor-context note.

## Self-Check: PASSED

- `packages/db/migrations/0034_catalog_phase4a_menu_stop_list.sql`: FOUND
- `packages/db/migrations/0035_catalog_phase4a_item_slug_aliases.sql`: FOUND
- `packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql`: FOUND
- Commit `37ed6cc` (Task 1): FOUND
- Commit `c640f82` (Task 2): FOUND
- Schema export `menuStopList`: FOUND in `packages/db/src/schema/menu.ts`
- Schema export `menuItemSlugAliases`: FOUND in `packages/db/src/schema/menu.ts`
- Journal entries idx 34/35/36: FOUND in `packages/db/migrations/meta/_journal.json`
- RLS on both tables (`relrowsecurity AND relforcerowsecurity = t`): VERIFIED via `pg_class`
- Audit-FKs exit 0 under admin role: VERIFIED

---

_Phase: 04a-catalog-schema-api_
_Plan: 03_
_Completed: 2026-05-30_
