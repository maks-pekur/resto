---
quick_id: 260826-location-in-the-path
slug: location-in-the-path
completed: 2026-08-26
status: complete
branch: location-in-the-path
parent_branch: location-slug-and-address
---

# The location moved from the query string into the path

Step 3 of the location-grain todo, and with it task 4 of the `260823-loc-slug-address` plan, which
had been deferred into this rather than done twice.

```
/voskresenka/orders      /voskresenka/stop-list      location grain
/dashboard               /voskresenka/dashboard      mixed
/team  /menu/items  /locations  /roles  /settings    brand grain — no slug, ever
```

`?location=` is gone. So is `all` as a URL word: the slugless `/dashboard` _is_ the every-location
view, so there was nothing left for a sentinel to say.

## What changed

**`/v1/me/locations` carries the slug** (b65409b1). It is the list every operator can read of the
points they may act at, and the slug is now how a point is addressed — a list of locations that
cannot tell you their addresses would have forced a second, wider query on every page.

**Every admin root segment is reserved against location slugs** (48e706ea). `LOCATION_RESERVED_SLUGS`
is no longer two hand-written words; it spreads `ADMIN_ROOT_ROUTE_SEGMENTS`, which the
route-derivation spec already holds honest against the assembled router. A location named "Menu"
would otherwise shadow `/menu/items`. That spec stopped being defence-in-depth and became
load-bearing the moment the slug re-entered the first path segment.

**The route tree** (558404ed). A `/$locationSlug` layout resolves the slug once and hands the
location to its children as route context, so no child loader looks it up again or handles it being
wrong. It is declared last, below every static route. The dashboard got its own address at
`/dashboard`; `/` redirects there; `/orders` and `/menu/stop-list` redirect to the same page under
the operator's default location, because live bookmarks and browser history are the first things a
URL change breaks.

`useEffectiveLocation` no longer redirects anything — the D-12 two-authority rule is unchanged
(owner reads the path, staff read the server pin), but an address that names no location now simply
_is_ the aggregate, and an unreachable one is corrected by the layout before a page renders.

**The catalogue stops knowing about locations** (founder call). `/menu/items` lost its inline
stop/resume switch along with the per-location badges — the toggle is a write against one location,
and a brand-grain page has none. Stopping an item now happens on the stop list, which is where an
operator goes to change it anyway.

**The stop list is one per point** and left the menu subtree; its every-location mode is gone, and
`StopListAggregateTable` with it. `stopListAggregateQuery` keeps its one remaining caller, the
dashboard, where mixed grain is the declared behaviour.

## A bug the tests found before the browser would have

`dashboard-redirect.$` — the legacy `/dashboard/<page>` → `/<page>` route — matched `/dashboard`
itself with an empty splat. So the new `/` → `/dashboard` redirect landed on the legacy route, which
redirected to `/`, which redirected to `/dashboard`: **an infinite loop on the app's landing page.**
It surfaced as a hung test run before it surfaced as a hung browser.

The legacy route is deleted rather than patched: any fix that leaves it matching `/dashboard` leaves
the dashboard unreachable, and the addresses it served come from a scheme phase 10.2 removed two
weeks ago.

## Verification

`admin:typecheck`, `admin:lint`, `admin:test` (117 tests, 19 files), `domain:test` (165),
`api:typecheck` and the identity unit suite (248) all green.

- `test/location-path.spec.ts` — the resolution decisions as pure functions: an unknown slug keeps
  the page and swaps the location, another member's location is indistinguishable from an unknown
  one, no-locations reports itself rather than inventing a redirect target.
- `test/location-route-navigation.spec.ts` — the same decisions driven through the **real assembled
  router**: seven navigations asserting where each address actually lands. This is what caught the
  redirect loop; the pure tests could not have.
- `test/reserved-slugs-route-derivation.spec.ts` — now also asserts every static root segment is in
  `LOCATION_RESERVED_SLUG_SET`, so a new root route that a location could shadow turns it red.

**Not smoke-tested in a browser — Docker was not running.** The navigation test drives the real
route tree, which is most of what a smoke would have checked, but it does not prove the switcher
looks right or that the sidebar highlights the page you are on.

## Left open, deliberately

**Step 4 of the todo — letting a staff member switch between their locations — is untouched.** They
still pin once per session and get `LocationAlreadyPinnedError` on a second attempt. Their URLs
carry the slug like everyone's, resolved from the pin.

**A role without `location: read` cannot use location-grain pages.** `/v1/me/locations` is guarded
on it, and that list is now how anyone learns their own slug. Every preset role has the permission,
so this only bites a hand-made one — but `/v1/me/tenants` is deliberately unguarded for exactly this
reason (a picker cannot ask permission to show you your own options) and this endpoint is arguably
the same case. The hook degrades rather than breaks: a staff member's pin still decides the
location, only the slug is lost.

**The three admin Playwright suites are still brand-era and still not in CI** — a condition that
predates this work by two weeks. Written up in
`.planning/todos/pending/admin-e2e-suites-predate-the-tenant-merge.md`, including the trap that they
can now go green for the wrong reason.
