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
  the event contracts — this is explicitly plan 10's scope ("plan 10 removes the
  `brandId` field from the `tenancy` and `ordering` event contracts"), so the
  `BrandId` type-not-found error will resolve as a side effect of that plan's work.
  Confirmed via `git merge-base --is-ancestor a44da912 e5e1e3ed` that plan 01's
  removal predates plan 03's landing, so plan 03's SUMMARY claim of a clean
  `packages/events` typecheck was accurate only within its own pre-merge worktree —
  the break surfaced once both plans' commits coexisted on the shared branch.
  `packages/db` itself is unaffected; this is `packages/events`-only breakage.
  Not fixed in plan 04 — outside its `files_modified` list (`packages/db/src/**`
  only) and not caused by plan 04's own changes.
