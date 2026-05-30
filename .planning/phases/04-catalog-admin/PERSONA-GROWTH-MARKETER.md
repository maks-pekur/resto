# Phase 04 — Persona Review: Growth Marketer

**Reviewer:** persona-growth-marketer
**Date:** 2026-05-30
**Lens:** B2B SaaS GTM — activation, virality, partner ecosystem, marketing surface, time-to-aha
**Phase under review:** 04-catalog-admin (CAT-01..CAT-10; D-01..D-13; iiko-aligned schema redesign)

---

## TL;DR (decision-grade)

1. **The biggest growth risk in Phase 04 is the activation gap, not the schema.** D-08 / D-09 / D-10 give the operator a "Publish" button and a sticky bar — but the operator can't _see_ the published result anywhere in MVP-1's runway until Phase 05 ships `apps/website` and Phase 06 polishes `apps/qr-menu`. **The "aha moment" is invisible for ~2 phases of solo-founder velocity.** A minimal "Preview as customer" stop-gap (admin → tenant qr-menu URL with the draft / published snapshot) should ship inside Phase 04, not deferred.
2. **iiko-aligned schema is the right call but needs three small marketing-aware additions to avoid retrofit later:** (a) `source` provenance enum on items (`manual | ai_generated | imported_iiko | imported_csv`) for MVP-2 AI onboarding + MVP-3 iiko sync attribution, (b) ULID/UUID `eventId` on `catalog.menu_published.v1` distinguishing first-publish from subsequent publishes, (c) item `slug` URL-hygiene constraint at the Zod layer (kebab-case, ASCII-safe, no Cyrillic transliteration ambiguity). All three are <1 day each if done with the schema redesign; all three are weeks of migration pain later.
3. **D-09's `86'd` status badge label is restaurant-jargon and will confuse first-time small-cafe operators** (the very segment RestOS is positioned for). Use `paused` or `out of stock` on the badge; keep `86'd` as internal API value if needed. Same applies to `Today's 86` widget name (D-12).

---

## Findings (severity-ranked)

### HIGH-1 — Activation gap: operator publishes in Phase 04 but can't see the published menu anywhere

**Decision touched:** D-10 (instant publish + 5s undo), Phase 04 scope boundary (Phase 04 = schema + API + admin; Phase 05 = web render; Phase 06 = qr-menu render).

**Problem.** In B2B SaaS the "aha moment" is the operator showing the result to someone else. For RestOS, that's **"I see my restaurant's published menu on a URL I can paste into a WhatsApp/Telegram to my partner."** Phase 04 ends with a green `published` badge in the admin table and a toast — but no live URL the operator can open. Phase 05 (`apps/website` render) and Phase 06 (`apps/qr-menu` polish) are 2–4 weeks of solo-founder time away from Phase 04 close (per ROADMAP execution order).

For a founder demo-ing to a pilot restaurant, "your menu is published — trust me, it'll render in a few weeks" is a flat conversation. For a pilot user clicking around at 11pm trying to evaluate the product, it's a churn-out moment.

**Impact.**

- Operator activation funnel stalls between "data entered" and "value perceived"
- No share-able artifact = no organic virality (no operator screenshots a `published` badge to a colleague; they screenshot a rendered menu)
- Pilot demos in the 90-day window before Phase 05 finishes have nothing to show

**Recommendation.**
Add to Phase 04 scope: **a minimal "View live menu" link** in the admin sticky publish bar that opens the _existing_ `apps/qr-menu` Vite SPA at its current state (the slug-resolved URL `<slug>.menu.<host>` already exists per `code_context` — `apps/qr-menu` consumes `/v1/menu`). Even if Phase 06 polishes qr-menu later, the unstyled-but-functional read of the _new_ schema is enough for the operator to see their data render. Cost: ~half a day to wire the link + a smoke test the `/v1/menu` response with new BJU/allergen fields doesn't 500 the existing qr-menu reader.

**Alternative if qr-menu can't render the new schema yet:** ship a `/dashboard/menu/preview` route in admin that renders a JSON-ish read-only mock of the published snapshot — uglier but proves to operator "yes, this is the data customers will see." Strictly worse than option 1 but still better than zero feedback loop.

**Competitive context.** Yandex.Eda's restaurant operator panel surfaces "Превью карточки" (card preview) the moment you save an item. Delivery Club's R-Keeper integration shows operators what guests will see. RestOS at MVP-1 cannot ask operators to imagine the output.

---

### HIGH-2 — Add `source` provenance enum on items NOW, not after MVP-2 retrofit

**Decision touched:** schema redesign direction (`<schema_redesign_direction>`), D-06 (BJU structured), D-07 (single photo).

**Problem.** Three downstream features all need to know "where did this item come from":

- **MVP-2 AI onboarding constructor** (ROADMAP MVP-2 Phase D) — OCR/LLM-generated items need to be flagged for operator review before public exposure (`source: ai_generated` → soft-gate publish until reviewed)
- **MVP-3 iiko adapter** — items synced from iiko POS should NOT be edited freely in admin (the source of truth is iiko); operator UI should show "synced from iiko, last sync 14:32" badge (`source: imported_iiko`)
- **Phase 13 Analytics + Phase 14 Marketing automation** — funnel analytics like "% of tenants whose first published menu was AI-generated vs manual" is a direct GTM KPI for the AI-driven pivot positioning (2026-05-27)

Retrofitting `source` to ~10 tables 6 months from now means a backfill migration plus a re-publish cascade across all paying tenants. Adding `source enum NOT NULL DEFAULT 'manual'` in the Phase 04 redesign migration is essentially free.

**Recommendation.**
Add to `04-SCHEMA-MAP.md` and the proposed Drizzle schema:

```
items.source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai_generated', 'imported_iiko', 'imported_csv'))
```

Same column on `categories` and `modifier_groups`. Surface it as a small "Imported" / "AI-generated" badge in the items table (D-02) so the operator immediately understands provenance. No UI work needed in Phase 04 beyond the badge — the value of the column is downstream.

**Severity rationale: HIGH** because this directly underwrites the MVP-2 (AI) and MVP-3 (iiko) value propositions captured in the project pivot. Skipping it costs founder-weeks later.

---

### HIGH-3 — `published` event granularity: distinguish first-publish from subsequent publishes

**Decision touched:** D-10 (instant publish), CAT-06, `code_context.Integration Points` (`catalog.menu_published.v1`).

**Problem.** "First published menu" is _the_ activation event for B2B SaaS restaurant onboarding — it's the milestone ONB-03 measures ("time-to-published-menu ≤ 1 hour"). Every subsequent publish is operational, not activation. If the outbox emits a single `catalog.menu_published.v1` envelope shape, the Phase 13 analytics dashboard and the (future) Phase 14 marketing-automation engine can't tell them apart without a hack like "ORDER BY occurred_at ASC LIMIT 1 per tenant".

That hack is wrong because:

- It re-runs on every aggregation query
- It breaks when a tenant un-publishes then re-publishes (do we count that as first?)
- It can't drive a _real-time_ activation hook (e.g., trigger a congrats email at first publish, an upsell sequence at 10th publish)

**Recommendation.**
Either:

1. **Emit two contract versions on first publish** — `catalog.menu_first_published.v1` (one-shot, idempotent — only emitted when `tenant.first_published_at IS NULL`) AND `catalog.menu_published.v1`. The first contract is the activation hook; the second is the operational event. `tenant.first_published_at` becomes a denormalized cache for funnel queries.
2. **OR** add a `publishSequence: number` field on `catalog.menu_published.v1` payload (1 = first, 2 = second, …) — simpler schema but harder for downstream consumers to filter naturally.

I recommend option 1 — separate event contracts are how Stripe, Linear, and Notion all model "first X" events, and downstream consumers (marketing automation, analytics) can subscribe to just the one they need.

**Same pattern applies to:**

- `catalog.item_created.v1` vs `catalog.first_item_created.v1` (first item is meaningful for onboarding analytics)
- `catalog.category_created.v1` vs `catalog.first_category_created.v1`
- `catalog.photo_uploaded.v1` vs `catalog.first_photo_uploaded.v1`

These first-event contracts are basically free at Phase 04 (it's the same outbox row + a tenant-level boolean cache). Skipping them means Phase 13's "where do operators drop off in setup" funnel chart is a multi-week SQL pretzel.

**Severity rationale: HIGH** because activation funnel definition is the entire Phase 13/14 substrate.

---

### HIGH-4 — Item slug URL hygiene must be enforced in Zod, not just "trust the operator"

**Decision touched:** schema redesign (slug already exists in current schema per `apps/api/src/contexts/catalog/.../dto.ts`), Phase 05 web rendering, future viral share-links.

**Problem.** Phase 05 will expose menu items as URLs (most likely `<slug>.resto.app/menu/[category-slug]/[item-slug]` or similar). Once a menu item URL gets shared (operator → WhatsApp → friend; or restaurant-shares-on-Instagram), changing the slug breaks the link. Worse: if slugs allow Cyrillic, the URL becomes `restaurant.resto.app/menu/закуски/салат-цезарь` — which:

- WhatsApp / Telegram preview will render percent-encoded (`%D1%84%D0%B8%D0%BB%D0%B5...`) — looks like spam
- Yandex.Eda crawlers don't follow encoded URLs well
- Google's search snippet shows the encoded form, killing CTR
- Won't survive copy-paste through Microsoft Office (ASCII stripping)

iiko stores names in Cyrillic; we have no control over how operators type. If we let `slug` derive from item name without ASCII normalization, every Russian-speaking tenant ships unshareable URLs.

**Recommendation.**
Apply at the Zod layer in `packages/domain/src/Slug` (already exists per `code_context`):

- Enforce regex: `/^[a-z0-9]+(-[a-z0-9]+)*$/` (kebab-case ASCII)
- Add **server-side auto-suggest** in the admin item editor: when operator types "Салат Цезарь", suggest `salat-tsezar` (transliteration via a small lib like `cyrillic-to-translit-js`). Operator can override but defaults to a clean slug.
- Schema-level uniqueness already correct: per-tenant composite (`tenant_id`, `slug`) — confirmed in `infrastructure/catalog-drizzle.repository.ts:240`.

Also add: **immutable slug history** — when an operator changes a slug after publish, the OLD slug should keep resolving (301-redirect-style) for at least 90 days, so existing shared links don't break. This is a `item_slug_aliases` table (cheap), retroactively impossible if not done now (we don't keep old slugs anywhere).

**Severity rationale: HIGH** because broken/ugly URLs are a hidden churn lever and a virality blocker — operators won't share what looks broken.

---

### MED-1 — `86'd` is restaurant-industry jargon; small-cafe operators will Google "what does 86 mean"

**Decision touched:** D-09 (status badges: `draft / modified / published / 86'd / archived`), D-12 (`Today's 86` widget).

**Problem.** RestOS targets restaurants from "neighborhood cafe" upward. The "86" stop-list term is North-American restaurant slang for an out-of-stock item — universally known to experienced restaurateurs, but **alien to first-time entrepreneurs who just opened a kebab shop**. That demographic is a sizable share of the RestOS GTM funnel (the AI-driven pivot is explicitly aimed at lowering the operational bar). Telling a first-time operator "use the 86'd badge to mark your stop-list" induces a Google lookup and a "what kind of weird product is this" moment.

**Recommendation.**
**UI copy split (operator-facing vs internal API):**

- Badge label: `Paused` or `Out of stock` (translated to RU as `Стоп` per Russian restaurant convention)
- Widget title: `Out of stock today` (RU: `Стоп-лист на сегодня`)
- Internal API constants, event subject, audit log: keep `86'd` if engineering prefers — no operator sees them

`Стоп` / `Стоп-лист` is the actual Russian restaurant term and matches iiko terminology directly. The English "86" is the jargon that breaks here.

**Severity rationale: MED** because it's pure copy and won't block a beta, but for an onboarding funnel where 5 seconds of confusion = drop-off, it's the cheapest single growth fix in Phase 04.

---

### MED-2 — `/v1/menu` partner-discoverability: ship OpenAPI for the new schema as a Phase 04 deliverable

**Decision touched:** schema redesign, `code_context` (`@nestjs/swagger` 8.1.0 already in deps), MVP-3 iiko adapter prep.

**Problem.** The user's stated goal for the iiko-aligned schema is "MVP-3 iiko-integration adapter будет тонким маппингом, не reshape'ом." But for that to be true, the schema needs to be _discoverable_ by a future integration partner (or an MVP-3 future-self) without reading the codebase. The repo already has `@nestjs/swagger` + a committed `docs/api/openapi.yaml` artifact (per `CLAUDE.md` Technology Stack). Phase 04 changes the catalog DTOs in non-trivial ways.

**Risk.** If Phase 04 closes without regenerating `docs/api/openapi.yaml` and asserting the regeneration in CI, the openapi artifact drifts and future partners (and the MVP-3 adapter author — same founder, 8 months later) lose the canonical contract.

**Recommendation.**

- Phase 04 deliverable: bump `docs/api/openapi.yaml` with the new catalog DTOs (categories, items with BJU/allergens/ingredients, modifier groups, sizes, stop-list, publish)
- Add a CI check: `pnpm openapi:emit && git diff --exit-code docs/api/openapi.yaml` fails if generation drifts from commit
- Schema descriptions on Zod fields propagate to OpenAPI — invest 1 hour in writing `.describe('Calories per 100g')`-style annotations on every new field; pays back at MVP-3 partner read

**Marketing-side benefit.** Once `docs/api/openapi.yaml` is current, a partner-readiness landing page can render it via Redoc or Stoplight without any extra build step. Cheap differentiation vs iiko's own gated docs.

**Severity rationale: MED** because it's not a Phase 04 blocker for MVP-1 ship, but it's a 1-day investment that makes MVP-3 + partner conversations dramatically smoother.

---

### MED-3 — BJU + allergens + ingredients are good. Add `schema.org/MenuItem` JSON-LD generation in Phase 04's DTO design

**Decision touched:** D-06 (4 BJU fields), schema redesign (allergens, ingredients).

**Problem.** Phase 05 will render the public menu site. If the published-menu DTO from Phase 04 already includes everything needed for `schema.org/MenuItem` and `schema.org/NutritionInformation` structured data (calories, proteinContent, fatContent, carbohydrateContent, suitableForDiet, ingredients, image, offers.price, offers.priceCurrency), then Phase 05's SEO surface is "render a `<script type="application/ld+json">` tag" — one afternoon of work. If Phase 04 ships an incomplete DTO, Phase 05 needs to circle back to Phase 04 to add fields.

**Recommendation.**
Researcher: when writing `04-SCHEMA-MAP.md`, add a third comparison column → `schema.org/MenuItem` field. The current iiko-only mapping is partial; the schema.org mapping forces honesty about what's missing for SEO. Specific fields likely needed beyond D-06:

- `servingSize` (e.g., "100g" — already implicit per "per 100g" copy but not a field)
- `suitableForDiet` array (`vegetarian`, `vegan`, `glutenFree`, `kosher`, `halal`) — can be inferred from allergens but better as a separate `dietary_tags TEXT[]` field
- `cuisine` at category or item level — already useful for SEO, "Italian pizza" etc.
- `prepTime` / `cookTime` — defer to v2, irrelevant for menu SEO

These are 3 extra fields max; designing for them in Phase 04 makes Phase 05 cheap.

**Competitive context.** Yandex.Eda restaurant pages rank well on long-tail "халяль шаурма [district]" because they ship rich snippets. iiko's storefront product (iiko.frontpad) doesn't ship JSON-LD by default. This is genuine differentiation if shipped early.

**Severity rationale: MED** because Phase 05 can technically patch in fields later, but every Phase-04→Phase-05 round-trip is solo-founder time.

---

### MED-4 — Photo strategy (D-07 single photo) is the right MVP call, but pre-allocate a `photos` JSONB column shape now

**Decision touched:** D-07 (single main photo, multi-photo deferred to v2).

**Problem.** Single photo per item is competitively weak vs Yandex.Eda / Delivery Club listings — but D-07's call is right for MVP-1 velocity. The risk is the schema choice: if Phase 04 keeps the current `imageS3Key TEXT` column and v2 has to migrate to a `photos JSONB[]` array, every published-menu snapshot in production needs re-shaping, every consumer (qr-menu, website) needs reader updates, and the cache versioning must coordinate.

**Recommendation.**
Define the column as `photos JSONB NOT NULL DEFAULT '[]'::jsonb` from the start, with shape:

```json
[
  {
    "s3Key": "...",
    "alt": "...",
    "width": 1200,
    "height": 800,
    "isPrimary": true
  }
]
```

In MVP-1 the array always has exactly one entry. UI in Phase 04 still shows one upload slot. Public DTO can expose `primaryPhoto` as a convenience for qr-menu/website consumers. v2 just relaxes the UI cardinality — zero migration. Same cost in Phase 04, vastly cheaper v2.

**Width/height fields** are critical for OG card / Twitter Card meta tags (Phase 05 will need them; `og:image:width` / `og:image:height` prevent layout shift). The S3 presign step can resolve these via `sharp` (already a common dep or trivially added) at upload time.

**Severity rationale: MED** because it's a small schema-shape decision now vs a multi-table cache-bumping migration later.

---

### MED-5 — Stop-list events: emit per-item, per-toggle, with actor + duration estimate

**Decision touched:** D-11 (stop-list as separate concept), D-12 (inline toggle + dashboard widget), D-13 (manual reset).

**Problem.** Stop-list toggles are a _gold-mine_ of operational data for Phase 14 marketing automation and product insight:

- "Tenant X always 86's `Cesar Salad` on Mondays" → inventory-tracking add-on upsell signal
- "Tenant Y has 12 items 86'd >7 days" → "low menu freshness" health-score input
- "Bestseller `Margherita` 86'd at 7pm on Friday" → "we noticed your top item went out of stock during peak — would $X/mo inventory tracking have prevented this?" automated email

If the Phase 04 event payload for stop-list events is just `{ tenantId, itemId, stopped: true/false }`, downstream automation has to do graph queries to extract these signals. If the payload includes context, downstream is dumb-pipe.

**Recommendation.**
For `catalog.item_stopped.v1` and `catalog.item_unstopped.v1` (or whatever the final contract names are), payload should include:

- `tenantId`, `brandId`, `itemId`, `itemSlug`
- `actorUserId` (who toggled — operator identity for activation analytics)
- `stoppedAt` timestamp
- `itemRevenueRankLast30d` (optional precomputed rank — "is this a bestseller?")
- `previouslyStoppedAt` (if this item has been stopped before, when was the last time)

The last two enable rich automation without requiring downstream services to do their own joins. They're cheap to compute at stop-time (a single SQL query each).

**Severity rationale: MED** because the events fire either way; the question is just what payload shape unlocks Phase 14 work cheaply.

---

### LOW-1 — Sticky publish bar copy: surface the customer-share URL right there

**Decision touched:** D-09 (sticky publish bar), `<specifics>` (`"**N unpublished changes** • [View list ▾] [Publish ↑]"`).

**Recommendation.**
After successful publish, the toast (D-10) or the now-cleared sticky bar should expose: **"Published. View live menu: `https://your-restaurant.menu.resto.app` [Copy link]"**. One click → URL in clipboard → operator pastes to a chat group → free virality. Costs ~30 minutes; converts a moment of completion into a moment of share.

**Severity rationale: LOW** because it's pure UI polish, but it's the highest-leverage UI polish in the whole phase.

---

### LOW-2 — Photo upload analytics: emit `photo_uploaded` event separately from `item_updated`

**Decision touched:** D-07, CAT-03.

**Recommendation.**
Don't fold photo uploads into a generic `catalog.item_updated.v1`. Emit `catalog.item_photo_uploaded.v1` with payload `{ tenantId, itemId, s3Key, fileSizeBytes, contentType }`. Why:

- Phase 13 analytics: "% of items with photos" is a menu-quality KPI for tenant health-score
- Phase 14 marketing: "Your menu is missing photos on 12 items — guests are 3× more likely to order items with photos" automated nudge
- Future: image-quality audit (LLM-driven, MVP-2) needs to subscribe to photo uploads

**Severity rationale: LOW** — small future affordance, near-zero cost in Phase 04.

---

### LOW-3 — `Archived` items: keep audit trail for "menu evolution" insight + restore UX

**Decision touched:** D-11 (archive = final removal, requires publish), `<deferred>` (no bulk archive in MVP-1).

**Recommendation.**
When operator archives an item, keep all its data (no hard delete — already a project invariant per CLAUDE.md). Surface a "Recently archived (last 30 days)" sub-tab in items list so operators can un-archive without recreating from scratch. Cheap UX win.

Also: emit `catalog.item_archived.v1` event (separate from generic update). Reason: "tenant archived 5 items in the last 24h" is a tenant-health signal — high churn of menu items often correlates with operational struggle, and is a customer-success outreach trigger in Phase 14.

**Severity rationale: LOW** — operator-quality improvement, cheap to ship.

---

## What I'm NOT flagging (deliberate non-issues)

- **D-05 deferring multilang to v2** — correct. First paying customer is likely Russian-speaking; investing in multilang UI for hypothetical EN/EU customer is premature.
- **D-08 explicit `Save draft` vs autosave** — correct. Catalog edits with autosave create accidental-publish anxiety, which is a worse UX than a Save button.
- **D-02 table over grid** — correct. The grid-view bias is QR-menu rendering, not admin editing.
- **D-10 instant publish + 5s undo** — correct for MVP-1; if pilots complain, the v2 "confirm modal toggle" deferred idea covers it.
- **Bulk operations deferred** — correct. Solo-cafe operators don't need them; chain operators are not the MVP-1 target.

---

## Cross-references

- ROADMAP Phase 04 entry (line 154–168) — success criteria don't currently mandate a customer-preview URL or activation-event granularity; recommend adding HIGH-1 + HIGH-3 outputs there before plan-phase
- ROADMAP Phase 16 — ONB-03 targets "time-to-published-menu ≤ 1 hour"; that KPI is unmeasurable without HIGH-3's first-publish event distinction
- ROADMAP MVP-2 Phase D (AI onboarding constructor) — depends on HIGH-2 `source` provenance to safe-gate AI-generated content
- ROADMAP MVP-3 Phase B (iiko adapter) — depends on HIGH-2 `source: imported_iiko` and MED-2 OpenAPI artifact freshness
- `.planning/REQUIREMENTS.md` — CAT-08 ("diff between draft and published") is satisfied per D-09; CAT-07 (stop-list) gains analytical depth per MED-5; no new CAT-\* requirements needed if these are baked into the existing requirements' implementation

---

## Recommended changes to Phase 04 plan-phase input (top 3 by ROI)

1. **HIGH-1 — Add "View live menu" link in admin** (~half day): unblocks the activation moment in MVP-1 well before Phase 05/06 polish. Single highest-ROI fix.
2. **HIGH-2 + HIGH-3 — Schema `source` enum + first-event contracts** (~1 day combined, must land in the same migration as iiko-aligned schema redesign): prevents 4–8 founder-weeks of retrofit cost across MVP-2 + MVP-3 + Phase 13/14.
3. **HIGH-4 — Slug Zod constraint + auto-transliterate + immutable slug history** (~half day): protects future virality and SEO surface before any URLs ship publicly. Cheapest after-the-fact this becomes truly painful.

If only one is done: pick HIGH-1. The activation gap is the only one that bites in the next 30 days of pilot conversations.
