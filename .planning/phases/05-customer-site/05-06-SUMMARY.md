# Plan 05-06 — Summary

**Plan:** 05-06 — Seeded content pages
**Status:** Complete
**Wave:** 4
**Requirements:** SITE-10

## What was built

- `lib/content.ts` — `ContentPageKey` union + `getSeededContent(key, restaurantName)` returning `{heading, body}` for about/delivery/contact/faq from seeded per-tenant copy interpolating the brand name; structured so Phase 15 can swap the default for a real API-backed content field without changing call sites (D-08).
- `components/content-page.tsx` — RSC renderer (props `{heading, body}`): centered max-width 720, heading + body split on `\n` into `<p>` text children (blank lines dropped). NO markdown, NO `dangerouslySetInnerHTML` (XSS mitigation T-05-06-X).
- `components/content-route.tsx` — shared server helper: `ContentRouteServer({pageKey})` (tenant gating reused from the menu page: `notFound()` / suspended-state / re-throw) + `contentMetadata(label)` (per-page title `{label} — {brandName}`, `index,follow`).
- `app/{about,delivery,contact,faq}/page.tsx` — four thin RSC routes delegating to the shared helper, each with its own SEO title.
- `test/content-page.spec.tsx` — paragraph-split + heading + seeded-content tests.

## Verification

- `nx typecheck website` — pass
- `nx lint website` — pass
- `nx test website` — 41/41 pass (5 files)
- `nx build website` — pass (4 content routes render server-side on demand)

## Deviations / notes

- **Extra file beyond plan's `files_modified`:** added `components/content-route.tsx` to DRY the tenant-gating + suspended-state + metadata across the four routes (each route would otherwise duplicate ~45 lines). The four route files are now thin (delegate to the helper). Functionally identical to the plan; cleaner.
- Content is generic seeded copy (no per-tenant DB field yet — that field + operator WYSIWYG editor is Phase 15/MVP-2). Pages are `index,follow` (SEO surface per D-03).

## Key files

- apps/website/lib/content.ts
- apps/website/components/{content-page,content-route}.tsx
- apps/website/app/{about,delivery,contact,faq}/page.tsx
