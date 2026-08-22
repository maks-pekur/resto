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

  **RESOLVED (10.2 plan 14, Task 2, 2026-08-21):** `PinnableLocation.brandId` dropped from
  `apps/admin/src/lib/queries/locations.ts` alongside the rest of the brand-dimension sweep.

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

  **RESOLVED (10.2 plan 13, Task 3, 2026-08-21):** `identity-invitation.e2e.spec.ts`'s own
  carve-out cases call `addMemberWithRole` indirectly via the shared fixture module load, and
  the plan's own `<verify>` step runs this exact spec — so the bug now blocks Task 3 directly,
  not just a hypothetical future run. Fixed with the one-line rename this note already
  prescribed (`organizationId` → `tenantId`). `brand-isolation`, `catalog-rbac` and
  `tenants-controller` still have their own, unrelated pre-existing breakage (see their own
  entries elsewhere in this file / plan 19's territory) and were not run or touched here.

## From plan 14

- **`apps/admin/src/lib/i18n/messages/{en,ru,es}.json` still carry `brand`-flavored keys**
  (`brand`, `addBrand`, `noBrands`, `noBrandsDescription`, `brandDomainsTitle`,
  `brandDomainsDescription`, `brandPayoutsTitle`, `brandPayoutsDescription`, `brandThemeTitle` —
  all around line 499-517 in each file). `grep -l "lib/i18n/messages"
.planning/phases/10.2-brand-pinned-sessions/*-PLAN.md` → zero results, and this plan's own
  `files_modified` does not list these three files — unowned. Not renamed here: an i18n key
  rename is only safe done atomically with every `t('...')` call site that reads it, and every
  current reader lives under `apps/admin/src/routes/(protected)/$brandSlug/` and
  `apps/admin/src/components/` — explicitly plan 15/16/17's territory this plan was told not to
  touch. Renaming the JSON keys alone would silently break every existing call site's lookup
  (empty-string render, not a compile error, since i18next keys are untyped strings) without
  fixing anything. Whichever plan rewrites the settings/payouts/domains screens (UI-SPEC S4/S5
  territory — plans 15-17) should rename these keys alongside their own call-site rewrite.

  **RESOLVED (10.2 plan 21, 2026-08-22):** plans 15-17 landed the settings/payouts/domains
  screens (`tenant.domains.tsx`, `tenant.theme.tsx`, `tenant.payouts.tsx`) without ever wiring
  these keys — confirmed via `grep -rn "addBrand\|noBrandsDescription\|noBrands\b\|brandDomainsTitle\|
brandDomainsDescription\|brandPayoutsTitle\|brandPayoutsDescription\|brandThemeTitle"
  apps/admin/src` returning zero call sites outside the message files themselves. All nine keys
  were dead, not stale — deleted outright (D-39) from all three catalogues rather than renamed.
  `i18n.spec.ts` (key-set parity across ru/en/es) still passes 8/8.

- **`apps/admin/src/lib/hooks/use-effective-location.ts` retains one structural `brand` match**
  it cannot clear: `import { Route as brandSlugLayoutRoute } from
'@/routes/(protected)/$brandSlug/_layout'` plus the local alias's two use sites and two prose
  comments. This plan's own Task 2 action text says "touch ONLY the brand dimension" and the
  hook's actual query calls (`meLocationsQuery()`, `activeLocationIdQuery()`) already take zero
  brand-flavored arguments — there was no query-key brand dimension to remove. The remaining
  match is a hard dependency on the route file's own path (`$brandSlug/_layout.tsx`), which this
  plan's own instructions name as explicitly plan 15's to delete/restructure, not this plan's.
  `rg -in "brand" apps/admin/src/lib/` therefore does not return zero, contrary to the plan's own
  literal `<verification>` text — the residual is entirely this one file, entirely this one
  unavoidable cross-plan dependency. Whichever plan rewrites `$brandSlug/_layout.tsx` (plan 15)
  should update this hook's import path and local alias in the same commit.

- **Worklist for plans 15/16 — every remaining `brand`-flavored query key literal found outside
  `apps/admin/src/lib/`** (components/routes still invalidate or key queries by the pre-sweep
  brand-shaped key; the query functions themselves no longer accept a `brandSlug` argument after
  this plan's Task 2, so every one of these call sites is now also a compile error, not just a
  stale-cache risk):
  `apps/admin/src/components/menu/category-form.tsx`,
  `apps/admin/src/components/menu/categories-table.tsx`,
  `apps/admin/src/components/menu/todays-86-reset-button.tsx`,
  `apps/admin/src/components/menu/modifier-options-list.tsx`,
  `apps/admin/src/components/menu/item-sizes-card.tsx`,
  `apps/admin/src/components/menu/sticky-publish-bar.tsx`,
  `apps/admin/src/components/menu/stop-list-table.tsx`,
  `apps/admin/src/components/menu/item-modifier-groups-card.tsx`,
  `apps/admin/src/components/menu/item-detail-form.tsx`,
  `apps/admin/src/components/menu/modifier-group-form.tsx`,
  `apps/admin/src/components/menu/items-table.tsx`,
  `apps/admin/src/components/orders/orders-empty-state.tsx` (`'brand-payment-status'` key, also
  imports the now-deleted `getBrandPaymentStatus` from `brand-payments-api.ts`),
  `apps/admin/src/routes/index.tsx`,
  `apps/admin/src/routes/(protected)/$brandSlug/brands.$slug.payouts.tsx` (same
  `'brand-payment-status'` key, plus `getBrandPaymentStatus`/`startBrandEmbeddedSession`/
  `startBrandHostedLink`/`startBrandOAuth`, all deleted by this plan's Task 3 —
  the merged replacements are `getTenantPaymentStatus`/`startTenantEmbeddedSession`/
  `startTenantHostedLink`/`startTenantOAuth` in `tenant-payments-api.ts`, taking zero
  slug/id argument since the route is tenant-scoped via session, not a path param),
  `apps/admin/src/routes/(protected)/$brandSlug/locations.tsx`.

## From plan 18

- **`tools/scripts/seed/commands/sync-preset-roles.ts` still queries `organization_role` /
  `organization_id` — both renamed by migration 0079 (`tenant_role` / `tenant_id`, D-41).**
  `grep -l "tools/scripts/seed/commands/sync-preset-roles\.ts" .planning/phases/10.2-brand-pinned-sessions/*-PLAN.md`
  returns zero — unowned by any plan in this phase (a _different_ file,
  `apps/api/src/contexts/identity/application/sync-preset-roles.service.ts`, was fixed by plan
  22 — homonym, not this CLI script). Every query in this file (`syncOrganization`'s
  `SELECT`/`UPDATE`/`INSERT ... FROM/INTO organization_role WHERE organization_id = ...`) will
  fail with "relation/column does not exist" the moment it runs against the live schema. Not
  fixed here — outside this plan's `files_modified`, not exercised by Task 1's or Task 2's
  `<verify>` commands (neither calls `sync-preset-roles`). This is the "log a seventh" file the
  plan's verification lessons anticipated.

  **RESOLVED (10.2 plan 21, 2026-08-22):** `organization_role`→`tenant_role`,
  `organization_id`→`tenant_id` in all four raw SQL statements (`SELECT`/`UPDATE`/`INSERT`), plus
  `syncOrganization`→`syncTenant`, `organizationIds`→`tenantIds`, `OrgRow`→`TenantRow` for
  consistency. Live-verified against the real dev database (not just typecheck): `pnpm resto:seed
sync-preset-roles --all` ran clean against all 304 live tenants, zero errors — confirms the
  previous "relation does not exist" failure is gone.

- **`packages/db/test/integration/erase-includes-brands.spec.ts` does not exist — plan 03
  deleted it outright (`git show e5e1e3ed --stat`, 105 deletions / 0 additions), not merely
  left it stale.** Plan 19's own Task 2 read*first and action text ("rewrite, do not delete")
  assume this file is still present to rewrite. It is gone. Plan 19 will need to \_create*
  `packages/db/test/integration/erase-tenant.spec.ts` (or similar) from scratch rather than
  edit an existing file — flagging so that executor isn't surprised mid-task. The erasure
  mechanism this new spec needs to assert against is documented in this plan's own
  `10.2-18-SUMMARY.md` and `packages/db/migrations/0080_tenancy_erase_tenant_pii.sql`.

- **`pnpm resto:erase-tenant --help` (this plan's own Task 2 `<verify>` command) throws before
  reaching any of this plan's code**, unrelated to PII-column coverage: `TypeError: Cannot read
properties of null (reading 'getInstance')` at
  `apps/api/src/contexts/identity/identity-http.module.ts:107`. `IdentityHttpModule.onModuleInit`
  unconditionally calls `this.httpHost.httpAdapter.getInstance()` to register Better Auth's
  Fastify handler; `tools/scripts/erase-tenant/cli.ts` boots the app via
  `NestFactory.createApplicationContext(AppModule)` (no HTTP adapter, by design — it's a
  one-shot script, not a server), so `httpHost.httpAdapter` is `null`. Traced via `git log
--oneline -- apps/api/src/contexts/identity/identity-http.module.ts`: this `onModuleInit`
  pattern dates to `b5636acd` (`RES-106`, pre-dates phase 10.2 entirely) — a long-standing,
  unrelated bootstrap-context bug, not something the brand→tenant merge introduced or something
  Task 2's PII-column fix could plausibly cause. `grep -l "identity-http.module.ts"
.planning/phases/10.2-brand-pinned-sessions/*-PLAN.md` → plans 08 and 13 (both merged,
  neither touched `onModuleInit`). Not fixed here — out of this plan's scope per the
  scope-boundary rule (pre-existing, unrelated to erasure/PII work, and risky to patch casually
  in a Better-Auth-wiring file without dedicated review). Verified the actual PII-column fix
  directly against the SQL function instead (`10.2-18-SUMMARY.md` has the live probe) since the
  literal CLI smoke-test cannot run until this separate bug is fixed.

## From plan 16

- **`apps/admin/src/components/roles/permission-catalog.tsx` and `preset-picker.tsx` still carry
  a stale `brand` permission resource.** Task 2's own action text instructs: "these render the
  permission matrix from `PERMISSIONS_STATEMENT`... If the matrix is generated from the statement
  rather than hardcoded, confirm that by reading and record it in the SUMMARY — then the only work
  is removing a stale label." Confirmed: `PermissionCatalog` (`permission-catalog.tsx`) is fully
  dynamic — it iterates `Object.entries(PERMISSIONS_STATEMENT)` and looks up a display label via
  `RESOURCE_LABELS[resource] ?? resource`. `packages/domain/src/rbac/permissions.ts` no longer
  defines a `brand` resource key (confirmed via `rg -in "brand"` on that file — zero matches), so
  `RESOURCE_LABELS.brand = 'Brand'` (line 15) is dead: it is never looked up because `brand` never
  appears in `PERMISSIONS_STATEMENT`'s own keys. This is genuinely the "stale label" the plan's
  text anticipated — but it lives in `permission-catalog.tsx`, not in `role-form.tsx` /
  `role-list.tsx` (the only two files this task's `<files>` list names).

  A second, more serious instance: `preset-picker.tsx`'s three hardcoded `PRESETS` entries
  (`manager`, `cashier-foh`, `kitchen`) each include a `brand: ['read'(, 'update')]` key in their
  `permission` object (lines 22, 33, 42). Selecting any of these presets in `RoleForm`
  (`onSelect={({ permission: presetPermission }) => setPermission(presetPermission)}`) seeds the
  role's permission state with a resource key the server no longer recognizes — whether this is
  silently dropped or rejected at `createRole`/`updateRole` time depends on server-side validation
  this plan did not trace, but at minimum it means a "Manager" preset built from `PRESETS` no
  longer grants a permission an operator would reasonably expect (whatever `brand:['read','update']`
  used to gate) and could carry a validation-layer risk instead.

  `grep -l "permission-catalog.tsx"` and `grep -l "preset-picker.tsx"` across every
  `*-PLAN.md` in this phase both return zero — unowned by any plan. Not fixed here: outside this
  task's `<files>` list (`role-form.tsx`, `role-list.tsx` only) and outside the scope-boundary rule
  ("Only auto-fix issues DIRECTLY caused by the current task's changes") — this staleness predates
  plan 16 and was not introduced by the brandSlug-prop sweep. Flagging as the "log a seventh file"
  case the phase's verification lessons anticipated (in this instance, two files). Whichever plan
  next touches the roles UI should: (1) delete the `brand: 'Brand'` row from
  `RESOURCE_LABELS` in `permission-catalog.tsx`, and (2) delete the `brand: [...]` key from all
  three `PRESETS` entries in `preset-picker.tsx`, verifying against the live
  `PERMISSIONS_STATEMENT` shape first.

  **RESOLVED (10.2 plan 21, 2026-08-22):** both fixed exactly as prescribed — the `brand: 'Brand'`
  row deleted from `RESOURCE_LABELS`, and the `brand: [...]` key deleted from all three `PRESETS`
  entries (`manager`, `cashier-foh`, `kitchen`). `rg -n "brand" packages/domain/src/rbac/permissions.ts`
  confirmed zero matches before editing, matching plan 16's own confirmation that `brand` is dropped,
  not renamed, from `PERMISSIONS_STATEMENT`.

## From plan 15

- **`apps/admin/test/catalog-spa.spec.tsx` does not compile** — a pre-`--skip-nx-cache` stale
  suite (its own `describe` titles cite "Plan 07.6-05 Task 4") asserting the PRE-plan-14 3-argument
  `categoriesQuery(slug)`/`itemsQuery(slug, filters)`/`stopListQuery(slug, locationId)` shape and
  passing a `brandSlug` prop into `ItemsTable`/`StickyPublishBar`, both removed by plan 14 (query
  signatures) and plan 16 (component props) respectively. `grep -l "catalog-spa.spec"
.planning/phases/10.2-brand-pinned-sessions/*-PLAN.md` → zero results across every plan including
  this one — unowned. Confirmed pre-existing: `apps/admin/tsconfig.json`'s `include` is
  `src/**/*` only (`test/` is excluded), so this file is outside both this plan's own `<verify>`
  gate (`tsc -p tsconfig.json`) and `pnpm --filter admin build` (Vite only bundles from
  `main.tsx`'s import graph) — neither ran or could have caught it. Not fixed here: none of this
  plan's own tasks touch `queries/catalog.ts`, `items-table.tsx`, or `sticky-publish-bar.tsx` (all
  already brand-free before this plan started), so the breakage is not caused by this plan's
  changes — it predates plan 14/16, unlike `location-search-schema.spec.ts` and
  `index-redirect.spec.ts` (both fixed/deleted in this plan because THIS plan's own route move
  directly broke their import paths). Whichever plan next touches `apps/admin/src/components/menu/`
  or does the phase's final green-gate sweep (plan 19 pattern) should rewrite this spec's query-key
  assertions to the brand-free shape or delete it if superseded by the specs plan 16 already
  strengthened (`accept-popover.spec.tsx` et al. cover the same components' rendered behavior).

- **`apps/admin/src/routes/(protected)/_layout.tsx`'s onboarding redirect targets
  `/onboarding/brand`, not `/onboarding`.** D-31/this plan's own action text describe the target as
  `/onboarding` (a bare index route), matching UI-SPEC S4's "recommend `index.tsx`" naming. That
  route does not exist in this worktree — `onboarding/index.tsx` is explicitly plan 17's file
  (`grep -l "onboarding/index.tsx" .planning/phases/10.2-brand-pinned-sessions/*-PLAN.md` →
  `10.2-17-PLAN.md` only), and plan 17 has not landed. Targeting the nonexistent `/onboarding`
  path would itself be a `TS2322` typed-router error — exactly the class of error this plan closes
  everywhere else. Redirects to the one onboarding path that is actually registered today,
  `/onboarding/brand` (a `const ONBOARDING_ROUTE` in `_layout.tsx`, one edit site). When plan 17
  lands `onboarding/index.tsx` and folds `onboarding/brand.tsx`'s one-field form into it (per
  UI-SPEC S4), it should update this one constant to `/onboarding`.

- **`apps/admin/src/routes/(protected)/onboarding/brand.tsx` rewritten beyond a mechanical
  repoint, to close the `apps/admin` zero-error bar.** This file is explicitly plan 17's
  (`10.2-17-PLAN.md` lists it), but it was already failing to compile before this plan touched
  anything — `meBrandsQuery` (deleted by plan 14), `@/lib/slugify-brand` (deleted by plan 14) — and
  this plan's own route deletion added one more break (`navigate({ to: '/$brandSlug', params: {
brandSlug: brand.slug } })`, the exact route this plan removes). Per the phase's explicit
  "apps/admin at zero typecheck errors, not just routes" bar, left broken this file alone would
  have failed the whole-package gate. Fixed with the MINIMUM contract-correct change, not a UI-SPEC
  S4 pass: dropped the slug input and its live-availability check entirely (`GET
/v1/me/brands/slug-availability` no longer exists; D-30 says the slug is server-derived, not
  asked), posted `{ displayName }` only to the real, live `POST /v1/me/tenants/onboarding`
  (`me-tenants.controller.ts`), and navigated to `/` (not `/$brandSlug`) on success. No host-preview
  string, no i18n keys, no copy polish beyond the one-field form working — plan 17's own UI-SPEC S4
  read_first should treat this as a working skeleton, not the finished screen.

## From plan 17

- **`apps/admin/src/routes/(auth)/login.tsx`'s `expired` search param crashes the route on a fresh
  navigation to `/login?expired=1`** — the exact URL `apiFetch`'s own 401 handler navigates to
  (`window.location.href = '/login?expired=1'`) and the exact URL a stale second tab is supposed to
  land on (UI-SPEC S3, this plan's own success criterion). TanStack Router's default `parseSearch`
  coerces a numeric-looking query value (`expired=1`) to the JS number `1` before `validateSearch`
  runs; `SearchSchema`'s `expired: z.string().optional()` then rejects it (`SearchParamError:
expected string, received number`), which TanStack Router's `CatchBoundaryImpl` catches and
  renders as the generic `RouteError` fallback ("Something went wrong. Please try again.") instead
  of the login card with the `tAuth('sessionExpired')` banner. Confirmed live (Playwright,
  `page.goto('http://admin.localhost:4000/login?expired=1')` — a full navigation, identical in kind
  to what `window.location.href` produces): the login page never renders; only the error fallback
  does. `git log -p -- apps/admin/src/routes/'(auth)'/login.tsx` shows `SearchSchema` unchanged by
  this plan (`expired: z.string().optional()` predates plan 17's own edits) — pre-existing, not
  caused by this plan's rewrite of the file's post-sign-in branching. `grep -l "login.tsx"
.planning/phases/10.2-brand-pinned-sessions/*-PLAN.md` → plans 02 (done, added the banner/i18n
  key this bug now prevents from rendering) and this plan only — no later plan in this phase's
  numbering currently owns `login.tsx`. Not fixed here: outside the scope-boundary rule (pre-existing,
  not introduced by this plan's own changes) and the fix touches TanStack Router's search-param
  parsing contract (either a custom `parseSearch`/`stringifySearch` pair on the router, or loosening
  `SearchSchema` to accept `z.union([z.string(), z.number()]).transform(String)`), which is a
  judgment call about the router-wide search-parsing convention, not a one-line fix scoped to this
  file alone. Whichever plan next touches `apps/admin/src/main.tsx`'s router construction or does
  the phase's final green-gate sweep should decide the router-wide fix and confirm this exact URL
  renders the banner, not the error fallback.

  **RESOLVED (10.2 plan 19, 2026-08-22):** fixed with the scoped schema loosening this entry itself
  named as an option — `expired: z.union([z.string(), z.number()]).transform((v) => String(v)).optional()`
  — rather than a router-wide `parseSearch`/`stringifySearch` change, since this is the only search
  param in the app that collides with TanStack Router's default numeric coercion. Verified live
  (Playwright, `page.goto('http://admin.localhost:4000/login?expired=1')`): status 200, the
  `session-expired-notice` banner renders, no `RouteError` fallback text present.

## From plan 19 (2026-08-22)

- **`apps/admin/e2e/adm-01-all-mode-smoke.spec.ts` and `adm-02-orders-workflow-smoke.spec.ts` (and
  likely `adm-03-guest-status-loop.spec.ts`) are stale in the same way `adm-00-smoke-walk.spec.ts`
  was before this plan** — `rg -in "brand"` on `adm-01`/`adm-02` returns dozens of matches: both seed
  via `POST /v1/me/brands` (deleted endpoint), send `x-brand-slug` headers, and navigate to
  `/${brandSlug}/...` paths (routes deleted by plan 15). Out of scope for this plan: the orchestrator's
  own objective named only the five parked `adm-00` scenarios, and rewriting three more full spec files
  plus their shared `seed-orders.ts` fixture is a materially larger, unbounded task — not a mechanical
  sweep. `pnpm --filter admin e2e` (the whole directory) will still fail on `adm-01`/`adm-02` even
  though `adm-00-smoke-walk.spec.ts` now passes standalone (verified:
  `npx playwright test e2e/adm-00-smoke-walk.spec.ts` → 5/5 green). Whichever plan next touches the
  admin e2e suite should rewrite `adm-01`/`adm-02`/`adm-03` onto the flat routes + `GET /v1/me/tenants`
  model, following the same pattern `adm-00`'s `fixtures/seed-tenants.ts` now uses (provision via
  `/internal/v1/tenants` + `/internal/v1/tenants/:id/owner`, no brand creation call).

## From plan 21

- **Two pre-existing `apps/api/test/e2e` failures found during this plan's live verification,
  confirmed NOT caused by the vocabulary sweep.** Both were discovered running specs individually
  against the real dev stack (Docker Postgres on :5433) while verifying the identity port-boundary
  refactor and the `organizationId`→`tenantId` DTO rename.
  - `identity-role-changed.e2e.spec.ts` — "records identity.role_changed.v1 in audit_log when an
    owner promotes a staff member to admin" gets a 403/500 instead of 200/201. Root cause traced live:
    `auth.config.ts`'s `beforeUpdateMemberRole` hook resolves `SYSTEM_ROLES.admin` as the target
    permission set and rejects it via `containsNonDelegatable(targetPermission)` — meaning promoting
    staff to the built-in `admin` role is currently rejected as "non-delegatable," which looks like a
    genuine authorization bug unrelated to any rename (`SYSTEM_ROLES` lives in `packages/domain`,
    untouched by this plan; `beforeUpdateMemberRole`'s logic, also untouched — verified via
    `git diff 551ad8c...HEAD -- apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts`,
    the only change in that file is the unrelated `onActiveOrganizationSet`→`onActiveTenantSet` rename).
  - `tenants-controller.e2e.spec.ts` — "returns 200 and clears offboardingScheduledAt for owner"
    (`DELETE /v1/tenants/me/offboard`) gets 403 immediately after the identical owner's `POST
/v1/tenants/me/offboard` succeeds with 202 in the same test, using the identical
    `@Permissions({ tenant: ['delete'] })` decorator on both routes. Confirmed not caused by this
    plan: the only two files this plan touched that are anywhere near this path are
    `location-scope.guard.ts` (one error-message string, verified via diff against the base commit)
    and `provision-tenant.service.ts` (the `seedPresets.execute({organizationId→tenantId})` call,
    verified working live via `signup.e2e.spec.ts` and `tenant-onboarding.e2e.spec.ts` both passing
    6/6 and 8/8 with the renamed field) — neither is on the offboard permission-check path.
  - Both are individually reproducible (not cross-test pollution — re-run each file alone, same
    result). Not fixed here: outside this plan's scope-boundary rule (pre-existing, unrelated to
    `organization`/`brand` vocabulary). `packages/domain/src/rbac/permissions.ts` (the likely home of
    the `admin` non-delegatable-permission question) was read but not modified by this plan. Flagging
    for whichever plan next touches `beforeUpdateMemberRole` or the tenant-offboard permission path.

- **`apps/admin/e2e/fixtures/seed-orders.ts:225`'s raw SQL still inserts into `member`'s
  `organization_id` column** — renamed to `tenant_id` by migration 0079 (D-41). This raw INSERT would
  throw "column organization_id does not exist" the moment it runs. Not fixed here: this fixture is
  used only by `adm-02-orders-workflow-smoke.spec.ts` and `adm-03-guest-status-loop.spec.ts`, both
  already flagged stale and out of scope by plan 19's own deferred-items.md entry ("From plan 19") —
  fixing this one column name would not make either spec runnable, since both also call the deleted
  `POST /v1/me/brands` endpoint and reference brand-slug routes. Whichever plan rewrites `adm-01`/
  `adm-02`/`adm-03` onto the merged tenant model (per plan 19's entry above) should fix this
  alongside that larger rewrite.
