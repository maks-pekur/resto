---
quick_id: 260823-loc-slug-address
slug: location-slug-and-address
completed: 2026-08-26
status: complete
branch: location-slug-and-address
pr: 261
---

# Locations get a slug, real coordinates, and an edit form

Tasks 1–3 of the plan landed on 23 August. Task 4 was overtaken by a founder decision the same
evening and is deferred, not dropped. Two things kept the PR red afterwards; both are closed here.

## What changed

**Schema, domain and API (f3cb7c3d).** `locations.slug` (unique per tenant), `latitude` /
`longitude`, `tenants.timezone`; a `LocationSlug` value type generated from the name with `new` and
`all` reserved; and `PATCH /v1/tenancy/locations/:id`, without which a location could be created and
archived but never corrected.

**Admin (40197857).** `/locations` list with an add button, and one `/locations/$slug` form for both
create and edit, `new` meaning create — the sentinel pattern the role and menu-item routes already
use.

**The URL (1841356e).** `?location=` is no longer written onto pages that do not read it. It still
carries a UUID, not a slug — see below.

**OpenAPI artefact (7d3cd7ea).** The new PATCH endpoint and the slug/coordinate fields were never
regenerated into `docs/api/openapi.yaml`, so CI's drift gate went red the moment the API commit
landed. Regenerated with `api:openapi:emit` + `api-client:gen`; `pnpm openapi:check` is in sync.

**Route-level refusal (753fdb01).** The sidebar started filtering nav items by permission on
23 August, and its own comment claimed "every route still refuses a direct link" — which was not
true. `beforeLoad` checked the session and nothing else, so a hidden section still rendered on a
typed URL and only failed once its requests 403'd.

`lib/auth/permissions.ts` is now the one client-side reading of `/v1/me`.permissions. The sidebar
decides what to offer with `hasPermission`; eleven routes refuse with `requirePermission`, which
throws a `ForbiddenRouteError` the router renders as an explanatory screen instead of a broken page.
The action argument is typed against `PERMISSIONS_STATEMENT`, so `requirePermission('settings',
'read')` does not compile — `settings` only has `update`.

Gates: `/orders` order:read · `/menu` (and its six children, via the layout) menu:read ·
`/locations` and `/locations/$slug` location:create · `/roles`, `/roles/$roleId` ac:read · `/team`
staff:invite · `/settings`, `/tenant/domains`, `/tenant/theme` settings:update · `/tenant/payouts`
billing:read. Dashboard, `/onboarding` and the legacy `/dashboard/$` redirect are ungated by
decision.

## Verification

`admin:typecheck`, `admin:lint`, `admin:test` (123 tests, 20 files) and `pnpm openapi:check` all
green; CI reports `OpenAPI drift check: pass` on the branch.

`test/route-permission-guards.spec.ts` walks the assembled router and fails if any route under the
protected layout has neither a guard nor a guarded ancestor nor a place on the ungated list — proved
by deleting the `/team` guard and watching it turn red before restoring it.

`test/forbidden-route-render.spec.tsx` checks the assumption behind throwing rather than
redirecting: the router must catch the refusal at the refused route and leave every ancestor
mounted. It renders a real route tree through the real guard and asserts the shell survives, the
Forbidden screen appears in the outlet, and the gated component never mounts.

Not smoke-tested in a browser — the dev stack was down and the change is client-side routing covered
by the two specs above. Worth a click through as `manager@demo.local` next time the stack is up.

## A gap in this PR's own verification, closed 2026-08-28

Making `address`, `latitude` and `longitude` required on create broke **eight api e2e suites** — 11
call sites still posted `{ name }` alone. None of it showed up, because `api:e2e` is not in CI and
this task's verification stopped at the static gates plus a browser walk.

Every fixture now sends a real address and coordinates, and all eight suites pass individually:
`location-isolation`, `stop-list-aggregate`, `catalog-reads`, `menu-availability`, `menu-response`,
`catalog-tenant-read-isolation`, `order-routes-authz`, `catalog`.

Two of them fail when run together in one process and pass alone — the known false-failure the
project already documents for `apps/api` vitest. Batch size, not a defect.

## Deferred, with a reason

**Task 4 — `?location=<slug>` — superseded.** The founder's model that evening (see
`.planning/todos/pending/location-grain-and-nav-permissions.md`) moves the location out of the query
string and into the path, but only on the routes where it decides what is shown:
`/voskresenka/orders`, not `/voskresenka/team`. Rewriting the query param to a slug first would be
work thrown away. The param still carries a UUID until that lands.

**Non-owners who may edit a location still cannot reach the form.** The API allows `PATCH` with
`location: update`, but both location routes are gated on `location: create` to match the sidebar,
where Locations is an owner-only item by decision. Aligning the route with the nav is what keeps
"hidden" and "refused" the same set; revisit if a customer needs a manager who edits addresses.

**Hiding is still not security.** These guards are client-side. The API is the authority and refuses
independently — that has not changed and must not be relaxed on the strength of this.
