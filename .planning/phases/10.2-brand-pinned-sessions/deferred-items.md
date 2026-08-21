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

## From plan 10

- **`apps/api/src/contexts/identity/domain/ports.ts` — `SendGuestNotificationInput.brandTheme`
  / `.brandName` / `GuestBrandTheme`** still carry `brand` vocabulary. Mechanically checked
  (`grep -l "identity/domain/ports.ts" .planning/phases/10.2-brand-pinned-sessions/*-PLAN.md`
  → zero results) — unowned by any plan in this phase. Plan 10's Task 3 rewrote
  `send-guest-notification.service.ts` to source the guest email's sender identity, theme
  and locale from the merged `tenants` row (via `notification-order-drizzle.repository.ts`'s
  new join) instead of `BrandQueriesService`, but the payload it hands to
  `EmailAdapterPort.sendGuestNotification` still uses the port's existing field names
  (`brandTheme`, `brandName`) because that port — and its downstream renderer,
  `apps/api/src/contexts/notifications/infrastructure/guest-email-templates.ts` (also
  unowned, `grep -l` confirms) — live in `identity/domain/`, owned by plan 08, running
  concurrently in a sibling worktree. Renaming them here would edit a file outside this
  plan's `files_modified` and outside its bounded context, risking exactly the kind of
  cross-plan collision the phase's parallel-execution rules forbid. Not fixed — the DATA
  is correctly tenant-scoped (T-10.2-10-05 mitigated); only the wire field NAME still says
  `brand`. `rg -in "brand" apps/api/src/contexts/notifications/` therefore does not return
  zero matches, contrary to plan 10's own literal Task 3 acceptance criterion — see
  `10.2-10-SUMMARY.md` for the full trace. Whichever plan eventually touches
  `identity/domain/ports.ts` for D-40/D-41 (plan 21's mechanical sweep is the most likely
  owner) should rename `brandTheme`/`brandName`/`GuestBrandTheme` to their tenant-named
  equivalents and update `guest-email-templates.ts` + its spec + this plan's two files
  (`send-guest-notification.service.ts`, `.spec.ts`) in the same commit.

## From plan 07

- **Deleting `apps/api/src/contexts/tenancy/application/brand-queries.service.ts`
  (Task 1, D-40) breaks three files outside `contexts/tenancy/` that still import
  `BrandQueriesService`:**
  - `apps/api/src/contexts/identity/infrastructure/brand-provisioning.adapter.ts` —
    `owner: plan 08` (`grep -l` confirms `10.2-08-PLAN.md` lists this file). Plan 08's
    own Task 1 already deletes this adapter and its port outright (`ports/
brand-provisioning.port.ts`, `infrastructure/brand-provisioning.adapter.ts`), so
    the new `TS2307: Cannot find module '.../brand-queries.service'` is moot — the
    importing file is gone the moment plan 08 lands.
  - `apps/api/src/contexts/notifications/application/send-guest-notification.service.ts`
    (+ its spec) — `owner: plan 10` (`grep -l` confirms `10.2-10-PLAN.md`). Plan 10's
    own action text already rewrites this file to source sender identity/locale from
    the tenant instead of the brand, so it was going to drop the `BrandQueriesService`
    import regardless.
    Not fixed here — both consumers are outside `files_modified` for this plan and
    already owned by concurrent plans that independently remove the dependency. Verified
    before deleting: neither consumer imports anything from `brand-queries.service.ts`
    that would give it a _new_, different failure mode (both already failed to typecheck
    before this plan touched anything, for unrelated pre-existing reasons — missing
    `BrandId`/`BrandSlug` exports, a missing `provision-brand.service.ts`). Baseline
    captured via `npx tsc -p apps/api/tsconfig.json --noEmit` before the Task 1 edit;
    the only new lines it added were the four `TS2307`s on the `brand-queries.service`
    import path itself.

- **`apps/api/src/contexts/tenancy/tenancy.module.ts`'s full brand-vocabulary cleanup
  (nominally Task 3's) landed inside Task 2's commit instead, forced by the
  `lint-staged` eslint gate — not by choice.** Task 2's own acceptance criteria
  require `tenancy.module.ts` to already reference `StartTenantOnboardingService` and
  have zero `StartStripeOnboardingService`/`stripe-onboarding` matches at Task 2's
  commit, so a partial edit to this Task-3-owned file was unavoidable (same situation
  as Task 1's `location.aggregate.ts` unblock in plan 06). The first, minimal attempt —
  swapping only the four Stripe-onboarding-specific import/provider/controller lines —
  could not be _committed_: `@typescript-eslint/no-unsafe-assignment` flagged the whole
  `providers`/`exports` array literals as `any[]` because `BrandDrizzleRepository`
  (imported from a file plan 06 already deleted) resolves to `any`, and ESLint's
  contextual-typing check poisons the entire array literal, not just the one bad
  element — confirmed empirically: removing only the `BRAND_REPOSITORY`/
  `BrandDrizzleRepository` pair left the array-level `any[]` errors still firing from
  the three OTHER already-unresolvable imports (`ProvisionBrandService`,
  `BrandQueriesService`, `TenantAndBrandResolverService`, dead since plan 06 / this
  plan's own Task 1), so all three had to go too before `npx eslint
apps/api/src/contexts/tenancy/tenancy.module.ts --max-warnings=0` passed.
  **Consequence for Task 3**: `tenancy.module.ts` is now fully clean of brand
  vocabulary — Task 3 will find nothing left to do to this specific file (its other
  files — `tenants.controller.ts`, `internal-tenants.controller.ts`,
  `locations.controller.ts`, `tenant-response.ts`, `error-mapping.ts` — are unaffected
  and still Task 3's to do). **Verified safe** (no new breakage in a previously-working
  file): the only consumers of the three removed providers outside this file were
  already broken before this edit — `notifications/application/
send-guest-notification.service.ts` (+spec, plan 10, mid-rewrite),
  `identity/infrastructure/brand-provisioning.adapter.ts` (+port, +spec, plan 08,
  being deleted outright), and the unowned `test/unit/tenancy/
provision-brand.service.spec.ts` (already flagged above). `grep -l` confirms none of
  the three removed classes appear in any _other_ plan's `files_modified` for
  `tenancy.module.ts` itself.

- **`apps/api/src/contexts/tenancy/application/start-tenant-onboarding.service.ts:72`
  passes `brandId: snapshot.id` into `PaymentProviderPort.ensureOnboardingAccount`.**
  `owner: plan 10` (`grep -l "payments/domain/ports.ts"` → `10.2-10-PLAN.md` only).
  `CreateOnboardingAccountInput.brandId` is a field name on a port this plan does not
  own; renaming it is out of scope (concurrent worktree, verification-lesson #5). This
  is the one remaining `brand` string match inside `contexts/tenancy/application/`
  (`rg -in "brand"` — down from 6 before the `oauth-state.ts` `OAuthStatePayload`
  field rename below). Not a shim — the call site correctly supplies the tenant's own
  id into an inherited field name; only the field's NAME is stale. Whichever plan
  renames `CreateOnboardingAccountInput.brandId` (plan 10 itself, or the D-41 code-half
  sweep in plan 21) will get a one-line compile error here pointing straight at this
  call site.

- **`apps/api/src/contexts/tenancy/domain/oauth-state.ts` — `OAuthStatePayload.brandId`
  renamed to `tenantId`.** Not owned by any plan (`grep -l "domain/oauth-state.ts"` →
  only this plan's own `10.2-07-PLAN.md`, as a `read_first` citation, never as a file
  another plan claims). Renamed here rather than left stale because Task 2 already
  rewrites every call site (`start-tenant-onboarding.service.ts`) and the two Task 2
  spec files, and doing so closes 5 of the 6 pre-rename `brand` matches inside
  `contexts/tenancy/application/`. Pure Zod-schema field rename, zero behavior change,
  verified by both onboarding spec files still passing (13/13).

- **`test/unit/tenancy/brand-aggregate.spec.ts` and
  `test/unit/tenancy/provision-brand.service.spec.ts` do not compile** — both import
  `brand.aggregate.ts`/`provision-brand.service.ts`, deleted outright by plan 06. `grep
-l` for both spec paths across every `*-PLAN.md` returns zero — unowned by any plan,
  unlike `test/e2e/brand-slug-lookup.e2e.spec.ts` and
  `test/e2e/payment-lifecycle.e2e.spec.ts` (same root cause, but both owned by plan
  19). Pre-existing since plan 06 landed; not caused by this plan and outside Task 2's
  `files_modified`. Flagging for plan 19's green-gate sweep alongside the two owned
  e2e specs.

## From plan 11 (Task 0b)

- **`apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts` still
  carries 5 `activeBrandId`/`brandId` matches** — the `session.additionalFields.activeBrandId`
  declaration (line 364) and the org-switch `databaseHooks.session.update.after` brand-pin
  sub-block (lines 381-424, plus the `brandId: pinnedBrandId` logger field at line 441).
  This is the one remaining file with matches under `apps/api/src/contexts/identity` — Task
  0b's own `<files>` list is `auth.guard.ts` / `set-active-location.controller.ts` /
  `me.controller.ts`, and this file is not in it. Confirmed dead at runtime:
  `onInitialBrandPin` is never wired in `identity-core.module.ts`'s `buildAuth({...})` call
  (`grep -n "onInitialBrandPin" identity-core.module.ts` returns nothing), so
  `opts.onInitialBrandPin` is always `undefined` and the whole brand/location auto-pin branch
  inside the hook never executes — leaving it in place changes nothing observable. Not
  removed here because doing so means rewriting a Better-Auth session hook (schema
  `additionalFields` + `databaseHooks` write logic) in a security-sensitive auth-plugin
  file, and `10.2-08-SUMMARY.md`'s "Next Phase Readiness" note already assigns
  "reviving/rewriting this hook" to **plan 12** — Rule 4 (architectural change to auth
  wiring) applies rather than a mechanical identifier rename. `identity-core.module.ts`'s
  own `brandId` param (renamed to `tenantId` at the `onInitialLocationPin` call site) and
  `auth.config.ts`'s matching type declaration were renamed as pure, zero-risk parameter
  renames since `resolveForUserInBrand`'s second parameter is already `tenantId` (Task 0a
  precedent) — those two are NOT part of this deferred item, only the 5 matches listed above
  remain.

- **`apps/admin/src/lib/queries/locations.ts`'s `PinnableLocation.brandId: string`** is now
  stale — `GET /v1/me/locations`'s response no longer carries `brandId` after this task
  (the field was dropped from the port/reader/controller Zod schema; the pick-location list
  is now tenant-scoped, not brand-scoped — see 10.2-11-SUMMARY.md). `grep -l
"apps/admin/src/lib/queries/locations.ts" .planning/phases/10.2-brand-pinned-sessions/*-PLAN.md`
  → owned by **plan 14**, not this plan. Confirmed zero admin consumers actually read
  `.brandId` off a `PinnableLocation` (`grep -n "brandId" app-sidebar.tsx
use-effective-location.ts pick-location.tsx` — no matches), so the stale field is inert,
  not a live bug; left for plan 14 to drop alongside its own work on this file.

## From plan 12

- **`apps/api/test/e2e/helpers/operator-fixture.ts`'s `addMemberWithRole` still inserts
  `schema.member` rows with `organizationId: input.tenantId`.** `member`'s Drizzle property is
  `tenantId` (D-41, `packages/db/src/schema/auth.ts:91`) — `organizationId` does not exist on
  the insert type, so this line is one of the pre-existing `apps/api/test/` compile errors
  (`operator-fixture.ts(182,41): error TS2769`, confirmed via `tsc` before this plan touched
  anything) and, worse, would throw a NOT NULL violation on `tenant_id` at runtime if ever
  called — `member.tenantId` would be `undefined`, not merely mistyped.

  `grep -l "operator-fixture" .planning/phases/10.2-brand-pinned-sessions/*-PLAN.md` → zero
  results, unowned by any plan. This plan's own Task 3 needed the file's `provisionTenant`
  helper (which had an **adjacent but distinct** bug — sent `defaultCurrency` to an endpoint
  that now requires `country`, D-34/D-35 — fixed here, see 10.2-12-SUMMARY.md) and fixed only
  that one, mechanical, single-line rename, verified by the resulting e2e spec running green.
  `addMemberWithRole` was NOT touched: Task 3's own tests never call it (case 1–4 all seed
  memberships via a local `addMembership` helper written directly in the new spec, using the
  correct `tenantId` field), so fixing it was not required to complete this plan's own task,
  and touching a second, unrelated bug in an unowned file stretches past "the minimal fix this
  task needs." 4 of the 38 e2e specs that import `operator-fixture` call `addMemberWithRole`
  (`grep -l "addMemberWithRole" apps/api/test/e2e/*.spec.ts`: `brand-isolation`,
  `catalog-rbac`, `identity-invitation`, `tenants-controller`) and will hit this at runtime the
  first time any of them actually execute against a live/testcontainer database. Whichever plan
  next runs these specs for real (plan 19's green-gate sweep is the most likely owner) should
  rename `organizationId` → `tenantId` on that one `.values({...})` call.
