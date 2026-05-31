# Phase 04a — Deferred Items

Items discovered out-of-scope during plan execution. Tracked here for future
plan attention.

## D-04a-deferred-01: tenancy_erase_tenant references renamed catalog tables

**Discovered during:** Plan 04a-06 execution (db:test failure on `erase-includes-brands.spec.ts` and `tenancy-erase-guard.spec.ts`).

**Issue:** The PL/pgSQL function `tenancy_erase_tenant` created in
`packages/db/migrations/0011_tenancy_erase_function.sql` still references the
old table names `menu_modifiers` and `menu_variants` (and likely
`menu_item_modifiers`). Migrations 0037 and 0038 (plan 04a-04) renamed the
tables but did not update the function body.

**Impact:** Erasure path fails at runtime with `relation "menu_modifiers" does
not exist`. Two integration specs fail on a fresh testcontainer migrate.
Production impact only matters once erasure is invoked against a tenant with
the post-rename schema — no paying tenants exist yet, so the bug is
discoverable but not customer-impacting.

**Why deferred:** Out of scope for plan 04a-06 (catalog services refactor).
The fix is a new migration that drops + recreates `tenancy_erase_tenant` with
the renamed tables in its DELETE list. Touching it from this plan would
expand the surface area beyond the plan's autonomy budget.

**Suggested owner plan:** A small follow-up migration in plan 04a-07 (or its
own micro-plan) that drops + recreates the function with the renamed tables
and adds the new tables (`menu_stop_list`, `menu_item_slug_aliases`) to the
delete list for GDPR completeness.
