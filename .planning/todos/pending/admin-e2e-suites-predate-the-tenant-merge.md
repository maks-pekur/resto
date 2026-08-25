---
title: The three admin Playwright suites still drive the brand-era URLs, and nothing runs them
date: 2026-08-26
priority: medium
status: pending
---

# adm-01, adm-02 and adm-03 have been dead since phase 10.2

They navigate to `/{brandSlug}/orders`, sign in expecting to land on `/{brandSlug}`, and seed their
fixtures with `POST` + an `x-brand-slug` header. Phase 10.2 (completed 2026-08-22) deleted the brand
entirely — one restaurant is one tenant is one Better Auth organization — and plan 15 removed the
`/$brandSlug` path segment along with it. The suites have not been touched since 2026-08-10.

Nothing caught it because **`admin:e2e` is not in `.github/workflows/ci.yml`**. It is a target you
have to remember to run, and it has not been run since the merge.

adm-01 is the most misleading of the three: its whole subject is `?location=all`, a mode that no
longer exists anywhere. The location moved into the path on 2026-08-26 and the every-location view
is now the slugless `/dashboard`; the order feed has had no aggregate at all since 2026-08-18.

## What to decide

**Whether these suites earn their keep.** Three brand-era Playwright suites, each with its own
bespoke fixture seeding through raw HTTP, is a lot of surface to carry for something no gate runs.
The honest options are to port them to the post-10.2 model _and_ put `admin:e2e` in CI, or to delete
them and say plainly that the browser path is covered by hand.

Carrying them un-ported and un-run is the one option that costs something and buys nothing: they
read as coverage in the repo and are not.

## If they are ported

- `/{brandSlug}/orders` → `/{locationSlug}/orders`
- `/{brandSlug}` → `/dashboard`
- `?location=all` on the dashboard → `/dashboard`; on the stop list it has no successor at all
- `/{brandSlug}/menu/stop-list` → `/{locationSlug}/stop-list`
- fixture seeding drops `x-brand-slug` and the brand `POST`

Note that after the path change these old URLs no longer 404 — `/{brandSlug}/orders` now matches the
`/$locationSlug` layout, fails to resolve the slug and redirects to the default location. So a
ported-badly suite can go green for the wrong reason. Assert the final URL, not just that the page
loaded.
