# Deferred Items — Phase 10.2

Out-of-scope discoveries found during plan execution. Not fixed by the discovering
plan per the executor's scope-boundary rule; listed here for whichever later plan
owns the file.

## From plan 04

- **`packages/events/src/contracts/tenancy.ts:2`** — `import { ..., BrandId } from
'@resto/domain'` fails to compile: `BrandId` was removed from
  `packages/domain/src/ids.ts` by plan 01's commit `a44da912` ("fold BrandSlug and
  BrandTheme into tenant-named equivalents"), which landed before plan 03 ran.
  `packages/events/src/contracts/tenancy.ts:96,109` and
  `packages/events/src/contracts/ordering.ts:8` still declare `brandId` fields on
  the event contracts.

  **Ownership corrected by the orchestrator (2026-08-20):** plan 04 attributed this to
  plan 10. `packages/events/src/contracts/tenancy.ts` is in **plan 06**'s
  `files_modified` (wave 4) and is not in plan 10's; only
  `packages/events/src/contracts/ordering.ts` is shared between 06 and 10. So the
  `BrandId` type-not-found error is plan 06's to close, and plan 06 runs six waves
  earlier than the plan named here. Left unfixed by design either way — the wrong
  owner would have delayed the fix, not lost it, but a later plan reading this file
  would have skipped a break it owns.
  Confirmed via `git merge-base --is-ancestor a44da912 e5e1e3ed` that plan 01's
  removal predates plan 03's landing, so plan 03's SUMMARY claim of a clean
  `packages/events` typecheck was accurate only within its own pre-merge worktree —
  the break surfaced once both plans' commits coexisted on the shared branch.
  `packages/db` itself is unaffected; this is `packages/events`-only breakage.
  Not fixed in plan 04 — outside its `files_modified` list (`packages/db/src/**`
  only) and not caused by plan 04's own changes.

## From plan 09

- **`apps/api/src/contexts/tenancy/domain/ports.ts` — `LocationRepository.listForBrand`**
  still takes `(brandId: BrandId, tenantId: TenantId)`. `owner: plan 06` (`grep -l
"tenancy/domain/ports.ts" .planning/phases/10.2-brand-pinned-sessions/*-PLAN.md` →
  only `10.2-06-PLAN.md`), which was running concurrently in a separate worktree and
  is explicitly tasked (D-40) with deleting `BrandRepository`/`BrandId` vocabulary
  from this exact file — but its own `<action>` text never mentions
  `LocationRepository`. Two catalog call sites (`get-stop-list.service.ts`,
  `get-stop-list-aggregate.service.ts`) needed a tenant-scoped equivalent, so they now
  call `this.locations.listForTenant(tenantId)` — a name chosen to mirror the
  already-established `BrandRepository.listForTenant(tenantId, ids?)` convention in
  the same file, not confirmed against plan 06's actual landed diff. Each call site
  carries a local `TenantScopedLocationRepository` interface augmentation (documented
  inline) so catalog's own `tsc`/`eslint` pass cleanly without touching
  `tenancy/domain/ports.ts`. **Reconcile at merge**: if plan 06 lands with a
  differently-named or -shaped method, update the two call sites and delete the local
  augmentations; if it lands with `listForTenant(tenantId)`, the augmentations become
  redundant (safe to delete, structurally identical) but are not a compile error
  either way.

- **`apps/api/test/e2e/menu-brand-response.e2e.spec.ts`** does not compile
  (`schema.brands`/`schema.brandDomains` were deleted by plan 03) — pre-existing,
  outside `files_modified`, and explicitly plan 19's to rewrite per this plan's own
  `<action>` text. Not executed live; static `tsc` check confirms the failure is a
  compile error on tables that no longer exist, not a runtime assertion this plan's
  catalog changes could pass or fail.
- **`apps/api/test/e2e/catalog-brand-isolation.e2e.spec.ts`** compiles cleanly but its
  entire test body (`beforeAll` calls `POST /v1/me/brands`, every `it()` asserts
  brand-A-vs-brand-B isolation via `x-brand-slug`) tests a concept D-07/D-40 deleted
  outright; it contains no cross-tenant assertion to separately verify. Not executed
  live — booting the real NestJS stack against the shared dev Postgres while plan 06
  ran concurrently in a sibling worktree risked mutating state the other agent
  depended on, for a test whose premise is already obsolete. `owner: plan 19`
  (explicitly named in this plan's `<verification>` section).
