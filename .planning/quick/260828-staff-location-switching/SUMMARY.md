---
quick_id: 260828-staff-location-switching
slug: staff-location-switching
completed: 2026-08-28
status: complete
branch: staff-location-switching
parent_branch: location-in-the-path
source: .planning/todos/pending/location-grain-and-nav-permissions.md (step 4, last)
---

# A staff member may move between the locations they hold

The last of the four steps in the location-grain todo. A manager covering two points had to sign
out and back in to change which one they were looking at: the session pin was written once and a
second attempt threw `LocationAlreadyPinnedError`.

## Why the restriction went

It protected nothing. Every request is authorised against `member_location_scope` regardless of
where the session started, so a pin that never moved proved nothing the check does not already
enforce — and the same scope check still refuses a location the member does not hold, which the e2e
now asserts alongside the switch itself.

What it cost was real: two browser tabs, shared credentials, or a session left open on a shared
terminal — every one of them worse than what the immutable pin prevented.

The one case it genuinely served is a terminal bolted to one point. That is expressed by giving the
member a role at one location, which the model already supports and the scope check already
enforces. `LocationAlreadyPinnedError` and its `location.already_pinned` code are deleted rather than
left dormant; a "kiosk mode" that ever needs them can be built from the same scope data.

## What changed

**`SetActiveLocationService`** no longer reads the pin to reject; it reads it to log. A move between
two locations emits one structured line with `fromLocationId` / `toLocationId`, because the audit
trail should show that a session changed point, and the order and action rows only record where an
action landed.

**The sidebar switcher now renders for staff** who hold more than one location — not for one, since
there is nothing to switch to — and never offers "All locations": a pin is always exactly one point,
and the every-location view belongs to the owner, whose location lives in the URL.

**A staff switch moves the pin before it navigates.** `/v1/me` resolves a staff member's permissions
against the active location, so navigating first would render a page the server has not agreed to
yet, with a sidebar built from the old point's permissions. On refusal it does not navigate at all.

## Verification

`admin:test` 122, api unit 540, `location-isolation.e2e` 12/12 against a real stack, plus typecheck
and lint on both projects.

Two claims are held by tests that were proved to fail without the code:

- `location-switcher.spec.tsx` — inverting the two lines so navigation happens first turns two of
  its five tests red.
- `location-isolation.e2e` — a staff member scoped to A and B moves A → B → A across three calls,
  while one scoped to A alone is still refused B with `location.out_of_scope`.

The e2e needed a second staff fixture holding two locations; the helper that seeds scope now takes a
list. That also moved `scopedMemberCount` on the archive test from 1 to 2 — both seeded members hold
location A, and archiving reports everyone it cuts off.

## Found on the way: this stack broke eight e2e suites

Making `address`, `latitude` and `longitude` required on location create (PR #261, 2026-08-23) broke
**11 call sites across eight api e2e suites** that still posted `{ name }` alone. Every one of them
failed at `beforeAll`, so entire suites were skipped rather than reported.

Fixed on `location-slug-and-address`, where the change that caused it lives, and merged forward
through both descendant branches. All eight pass individually:
`location-isolation`, `stop-list-aggregate`, `catalog-reads`, `menu-availability`, `menu-response`,
`catalog-tenant-read-isolation`, `order-routes-authz`, `catalog`.

Nothing caught it because **`api:e2e` is not in CI** — the same gap that hid the unassignable `admin`
role for seven weeks and three dead admin Playwright suites for two. That is now three separate
findings from one missing job.

## Not done

Not smoke-tested in a browser. The switch is covered by a component test that pins the ordering and
an e2e that pins the server contract, but nobody has watched a real manager move between two points
and seen the sidebar redraw with the new location's permissions.
