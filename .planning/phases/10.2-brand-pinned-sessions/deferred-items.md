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

## From plan 06

- **`packages/events` Docker/testcontainer integration suite fails migration
  setup, not event-contract related.** `cd packages/events && npx vitest run`
  — 4 of 9 test files fail
  (`test/integration/{dispatcher-stop-idempotent,outbox-claim-ownership,
outbox-roundtrip,run-deduped}.spec.ts`), all with the same root cause:
  `ALTER POLICY organization_role_resto_auth_full ON tenant_role RENAME TO
tenant_role_resto_auth_full;` fails against the fresh testcontainer Postgres
  that these tests spin up and migrate from scratch. Verified this is
  unrelated to plan 06's own change (`rg -n "BrandPayment|TenantPayment"` on
  all four failing spec files and `test/setup.ts` returns zero matches — none
  of them reference the tenancy event contracts this plan renamed). The 5
  unit-test files in the same package (`envelope`, `build-envelope`,
  `identity-email-dispatch-failed`, `nats-subscriber-dlq`,
  `nats-publisher-raw`) all pass; `tsc -p packages/events/tsconfig.json
--noEmit` exits 0. Root cause looks like a migration-0079 ordering/
  idempotency issue (renaming `organization_role_resto_auth_full` a second
  time, or the policy not existing under that name when this migration runs
  against a from-scratch testcontainer database) — plan 05's territory
  (`packages/db/migrations/0079_organization_merge.sql`), already merged.
  Owning plan derived mechanically: `grep -l "packages/db/migrations/0079"
.planning/phases/10.2-brand-pinned-sessions/*-PLAN.md` → plans 05 (done) and
  19 (the phase's green-gate plan). Flagging for plan 19's full-suite
  verification pass since plan 05 has already landed. Not fixed here — no
  file in this plan's `files_modified` touches `packages/db/migrations/` or
  `packages/db/sql/`.

- **The `Location` cluster has no owning plan.** Mechanically checked with
  `grep -l "<path>" .planning/phases/10.2-brand-pinned-sessions/*-PLAN.md` for
  each: `apps/api/src/contexts/tenancy/application/list-locations.service.ts`,
  `apps/api/src/contexts/tenancy/application/provision-location.service.ts`,
  and `apps/api/src/contexts/tenancy/infrastructure/location-drizzle.repository.ts`
  all return **zero matches** — no plan in this phase lists them in
  `files_modified`. All three (plus their spec files
  `test/unit/tenancy/archive-location.service.spec.ts` and
  `test/unit/tenancy/provision-location.service.spec.ts`) were already broken
  before this plan ran — they reference `BrandId` (removed by plan 01) and
  `requireBrandContext`/`withBrand` (removed by plan 04) — pre-existing
  breakage, not caused by this plan.

  This plan's Task 1 touched `apps/api/src/contexts/tenancy/domain/location.aggregate.ts`
  only as a Rule-3 minimal unblock: removed the one `BrandId`-typed field
  (`LocationSnapshot.brandId` / `LocationArchivedEvent.brandId`) that was
  the sole reason `contexts/tenancy/domain/` — this plan's own directory-wide
  typecheck gate — didn't compile. `ports.ts`'s `LocationRepository.listForBrand`
  was renamed to `listForTenant(tenantId)` to match (the `brandId` parameter
  had no meaning left to carry). This is a genuine, if small, interface change
  that ripples into the three unowned files above, which were already broken
  on `BrandId`/`requireBrandContext` before this plan touched anything — the
  rename does not newly break a working file, but it does mean the eventual
  fix must additionally drop the `brandId` parameter, not just repoint
  `BrandId`/`requireBrandContext` imports.

  `apps/api/src/contexts/tenancy/interfaces/http/locations.controller.ts` IS
  owned by plan 07 (`grep -l` confirms it in `10.2-07-PLAN.md`'s
  `files_modified`) — plan 07 will hit this exact gap the moment it tries to
  make that controller compile, since the controller depends on all three
  unowned files. Flagging explicitly so plan 07 (or a plan inserted ahead of
  it) absorbs `list-locations.service.ts`, `provision-location.service.ts`,
  and `location-drizzle.repository.ts` rather than being surprised by them.
