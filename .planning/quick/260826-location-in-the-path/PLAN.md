---
slug: location-in-the-path
created: 2026-08-26
type: quick
branch: location-in-the-path
parent_branch: location-slug-and-address
source: .planning/todos/pending/location-grain-and-nav-permissions.md (step 3)
---

# The location moves from the query string into the path

Step 3 of the location-grain todo. The slug goes in the first path segment, but **only on the pages
where it decides what is shown** — `/voskresenka/orders`, never `/voskresenka/team`. This also
subsumes task 4 of the `260823-loc-slug-address` plan (`?location=<slug>`), which was deferred into
this rather than done twice.

## Where the location lives today

`?location=` on the protected layout's `validateSearch`, carrying a **UUID** (or the literal `all`).
Two authorities, never mixed (D-12): the owner's is the URL, a staff member's is the server session
pin. Six consumers:

| consumer                | uses it for                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| `orders.tsx`            | the feed itself — `loaderDeps` + render                               |
| `menu/stop-list.tsx`    | single-location list vs the `all` aggregate (two different endpoints) |
| `menu/items.tsx`        | per-location stopped state on item rows                               |
| `index.tsx` (dashboard) | single vs aggregate widgets                                           |
| `app-sidebar.tsx`       | the unaccepted-orders badge                                           |
| `location-switcher.tsx` | writes the value                                                      |

`isLocationScopedPath` is the list of pages allowed to carry it, added on 23 August so the switcher
stopped stamping the param onto `/team` and `/locations`.

## Target

```
/voskresenka/orders        location grain — required
/voskresenka/stop-list     location grain — required
/dashboard                 mixed — every location
/voskresenka/dashboard     mixed — one location
/team  /roles  /settings   brand grain — no slug, ever
/menu/items  /locations    brand grain — no slug, ever
```

Two shapes disappear: `?location=` entirely, and `/menu/stop-list` (the stop list leaves the menu
subtree, because its grain is the location and the menu's is the brand).

## Decisions already settled

**The dashboard moves to `/dashboard`.** It is `/` today. The todo writes `/dashboard` and
`/voskresenka/dashboard`, so `/` becomes a redirect to `/dashboard` and stays the landing address.
The existing `/dashboard/$` legacy redirect is repointed rather than deleted.

**Staff get the same URL shape as the owner.** A staff member's pin resolves to a slug and they are
redirected to `/{their-slug}/orders`. Two URL schemes for one screen is the thing that makes
"where am I" unanswerable, and the pin still decides — they simply cannot switch until step 4.

**The aggregate is the slugless address, and `all` leaves the URL entirely.** `/dashboard` _is_
"every location"; `/{slug}/dashboard` is one. Nothing needs an `all` segment, so nothing gets one.
(`all` stays a reserved location slug — it is still the `apiFetch({ locationId })` sentinel
internally, and `new` needs the same list anyway.)

**Reserving the new root segments.** `dashboard` and `stop-list` join `ADMIN_ROOT_ROUTE_SEGMENTS`.
The slug now sits in the first segment again, so `reserved-slugs-route-derivation.spec.ts` stops
being defence-in-depth and becomes load-bearing: a new root route that is not reserved is a route a
location can shadow.

## Answered by the founder, 2026-08-26

**The catalogue stops knowing about locations.** `/menu/items` loses its per-location stopped
badges rather than being given a slug to read them with. "What is off right now" belongs to the stop
list, which is where an operator goes to change it.

**The stop list is per-location, full stop — one tab per point, no aggregate.** This is what the
todo's own grain table already said (`location grain — required`); the `?location=all` mode on that
page was the leftover. `stopListAggregateQuery` keeps its one remaining caller, the dashboard, where
"mixed" is the declared grain.

## Work

1. `packages/domain` — reserve the new root segments.
2. Route tree — a `$locationSlug` layout owning `orders`, `stop-list` and `dashboard`; brand-grain
   routes stay flat. Slug → id resolution from the locations list the shell already loads.
3. `useEffectiveLocation` — reads the path param instead of the search param; the two-authority rule
   (D-12) is unchanged, only the owner's carrier moves.
4. `LocationSwitcher` — rewrites the first segment instead of the search param.
5. Delete `?location=`, `locationSearchSchema` and `isLocationScopedPath`; the route tree now
   encodes what that list described.
6. Redirects for the old addresses so live bookmarks survive.
7. Tests: path resolution, the unknown/foreign/archived-slug fallback, the reserved-segment spec,
   and the e2e specs that still drive `?location=all`.

## Risk

`adm-01-all-mode-smoke` and `adm-02-orders-workflow-smoke` navigate by `?location=` **and** by a
`/${brandSlug}` path prefix that no longer exists in the router. They are already suspect; this
change forces the issue.
