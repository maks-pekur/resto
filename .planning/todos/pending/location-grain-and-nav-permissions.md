---
title: Location grain in the URL, permission-filtered navigation, staff location switching
date: 2026-08-23
priority: high
status: pending
---

# Three grains, and what follows from them

Founder's model, arrived at by working through the dashboard, the menu and the staff case. Writing
it down because it settles several questions at once and because my first proposal — location slug
as a blanket first path segment — was **wrong**, and the reason it was wrong is worth keeping.

## The three grains

**Brand grain — no location anywhere.** Locations list, team, roles, tenant settings, domains,
onboarding. These describe the restaurant company, not a point.

**Location grain — a location is required.** Order feed, stop list. Content is meaningless without
knowing which point.

**Mixed — a location is optional.** Dashboard: revenue and order counts must be readable both across
all locations and for one. Menu is the subtle one — the catalogue (items, categories, prices) is
brand-wide, but the stop list and availability are per-location, and per-location price overrides
would move more of it across the line.

**Why the blanket first segment was wrong.** `/{locationSlug}/team` is a lie: the team is
brand-wide. So is `/{locationSlug}/menu/items`. The slug belongs in the path _only where it decides
what is shown_ — otherwise the address claims a scoping that does not exist.

Target shape:

```
pizza.admin.localhost/voskresenka/orders      location grain
pizza.admin.localhost/voskresenka/stop-list   location grain
pizza.admin.localhost/dashboard               mixed — all locations
pizza.admin.localhost/voskresenka/dashboard   mixed — one location
pizza.admin.localhost/team                    brand grain
pizza.admin.localhost/menu/items              brand grain
```

The slug still occupies the first segment, so it must be reserved against every admin root route
segment — fifteen today (`orders`, `menu`, `team`, `roles`, `settings`, `tenant`, `locations`,
`onboarding`, `login`, …) and one more each time a route is added. `ADMIN_ROOT_ROUTE_SEGMENTS` and
its route-derivation spec already exist to keep that list honest. The cost is that a location cannot
be named "Menu" or "Team"; district names — Воскресенка, Podil, High Street — do not collide.

## Blocking bug, introduced 2026-08-23 by the RBAC wiring — FIXED 2026-08-23 (75df3e5f)

`/v1/me` computes permissions from the **tenant-level member role only**, while the request-time
checker now unions that with the role held at the active location. Verified live:

| account              | `/v1/me` reports                 | what a request actually allows |
| -------------------- | -------------------------------- | ------------------------------ |
| `owner@demo.local`   | full catalogue                   | full catalogue                 |
| `manager@demo.local` | `{tenant: read, location: read}` | order feed, detail, catalogue  |

So the server permits what it tells the client is forbidden. Any navigation built on this response
would hide sections that work. **Fix `/v1/me` before filtering anything** — it must use the same
union the checker does, or the two drift again the moment either changes.

Closed by `resolve-effective-permissions.ts`: `/v1/me` and `PermissionsGuard` now call one resolver,
so there is no second definition left to drift.

## Navigation filtering

The sidebar renders all eight items for everyone today; `isOwner` gates only the location switcher.
A cashier sees Payments, Roles, Team and Locations, and gets a refusal on click.

| item            | permission         | who has it from the presets          |
| --------------- | ------------------ | ------------------------------------ |
| Dashboard       | —                  | everyone                             |
| Orders          | `order: read`      | owner, manager, cashier-foh, kitchen |
| Menu, Stop list | `menu: read`       | owner, manager, cashier-foh          |
| Locations       | `location: create` | owner                                |
| Payments        | `billing: read`    | owner                                |
| Team            | `staff: invite`    | owner, manager                       |
| Roles           | `ac: read`         | owner                                |
| Settings        | `settings: update` | owner, manager                       |

**Hiding is convenience, not security.** Every route must still refuse a direct link. A hidden item
with an unguarded route is an illusion.

## Staff location switching

Today: the owner has no server-side pin (their location is the URL param), while a staff member
pins **once** per session and gets `LocationAlreadyPinnedError` on a second attempt — so a manager
covering two points must sign out and back in.

**Decision: allow a staff member to switch between locations they already hold a role at, and log
it.** The re-login requirement protects nothing: permissions are checked per request against
`member_location_scope`, so a session that never moved proves nothing the check does not already
enforce. It costs real usability — two browser tabs, shared credentials, or a session left open on a
shared terminal, all worse than what the pin prevents. Audit needs to know _which location_ an
action happened at, which the order and action rows already record.

The one case the immutable pin genuinely serves is a terminal bolted to one point. That is better
expressed by giving the member a role at one location only, which the model already supports. Keep
the immutable pin in reserve as a future "kiosk mode" if a real customer asks for it.

## Order of work

1. ~~`/v1/me` union — everything else is built on this response.~~ **Done 2026-08-23** (75df3e5f).
2. ~~Navigation filtering plus route-level refusal.~~ **Done** — sidebar filtering 75df3e5f,
   route-level refusal 753fdb01. `lib/auth/permissions.ts` is the single reading of the response;
   `test/route-permission-guards.spec.ts` fails if a new protected route ships without a decision.
3. ~~Location in the path, per the three grains above.~~ **Done 2026-08-26** (558404ed) — see
   `.planning/quick/260826-location-in-the-path/`. Subsumed task 4 of the `260823-loc-slug-address`
   quick plan. Two founder calls landed with it: the catalogue lost its per-location stop toggle
   rather than being given a slug to read it with, and the stop list is one per point with no
   aggregate — the every-location view is the slugless `/dashboard`.
4. Lift the staff re-pin restriction, with a log line. **Next, and the last step.**
