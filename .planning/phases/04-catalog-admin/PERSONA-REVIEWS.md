---
phase: 04-catalog-admin
reviewed: 2026-05-30
personas:
  [
    persona-cto,
    persona-skeptic,
    persona-product-strategist,
    persona-growth-marketer,
  ]
total_high: 14
total_med: 16
total_low: 9
status: needs_user_decision
unresolved_conflicts: 1
---

# Phase 04: Catalog Admin — Persona Reviews Summary

> Aggregates findings from 4 personas reviewing `04-CONTEXT.md` + `04-DISCUSSION-LOG.md`.
> Full per-persona reports: `PERSONA-CTO.md`, `PERSONA-SKEPTIC.md`, `PERSONA-PRODUCT-STRATEGIST.md`, `PERSONA-GROWTH-MARKETER.md`.

## Unresolved Conflicts (require user decision)

### Conflict 1 — iiko schema redesign in MVP-1: do now vs defer

**Skeptic HIGH-1** says: defer to MVP-3. Cost (irreversible migration + downstream refactor across DTO/repo/services/public DTO/generated API client/integration tests) is real. Benefit (lighter MVP-3 adapter) is speculative and reversible.

**Product Strategist HIGH-frame** says: do it now. Zero production catalog data = cheapest migration window. Redesign for **domain primitives correctness** (the right model now, not the right adapter later). Won't get cheaper if deferred.

**Status:** user already chose "do now" earlier this session. Skeptic's challenge is legitimate but the strategic answer (PS) directly addresses it. **Recommended resolution:** keep schema redesign in Phase 04 (user's call stands), but explicitly accept and mitigate the Skeptic-flagged dependencies (qr-menu mock, generated `api-client` DTO, `tenant-isolation.spec.ts`, ESLint composite-FK audit) — researcher must catalogue these and planner must include their refactor in the plan.

## Strong Convergence (multiple personas agree)

### Add `source` provenance enum to schema redesign now

- **PS HIGH-3** + **GM HIGH-2** both flag this
- Values: `manual / ai_generated / imported_iiko / imported_csv`
- Cost: <1 day during schema redesign
- Prevents: tenant-data migration in MVP-2 (AI onboarding) and MVP-3 (iiko sync), which would each be 4-8 founder-weeks of retrofit
- **Recommendation:** ACCEPT — adds to researcher's mandatory items in `04-SCHEMA-MAP.md`

### D-10 "instant publish + 5s undo" is over-engineered — pick simpler

- **CTO HIGH-1** + **Skeptic HIGH-2** both flag this
- Current `publish-menu.service.ts:13-20` is 7-line version bump; no snapshot table
- `catalog.menu_published.v1` already fires via outbox — undo would require compensating events
- **Two simpler options recommended:**
  - **Delayed-publish (CTO-preferred):** Publish click → 5s in-memory delay → THEN write snapshot + emit outbox event. If user clicks Undo within 5s, nothing was written. Honest with outbox, no compensating events.
  - **Confirm-modal (Skeptic-preferred):** Click Publish → modal "X items will change. Confirm" → on confirm, instant publish. 1/10th the code. User chose AGAINST this initially but didn't see the implementation cost.
- **Recommendation:** revisit D-10 with user — present trade-off concretely

### D-07 single-photo needs schema forward-compat for multi-photo

- **PS HIGH-1** + **GM MED-4** + **Skeptic MED** all flag this
- UI single-photo is fine for MVP-1, BUT schema should be `photos JSONB[]` (or `item_photos` table) not `imageS3Key TEXT`
- Cost: ~1h during schema redesign vs ~2-3 days when v2 multi-photo lands and requires migration of all tenant data
- **Recommendation:** ACCEPT — adds to researcher's mandatory items

### Scope is too big as single phase — split or accept 3-4w solo

- **CTO HIGH-2** + **Skeptic HIGH-4** both flag this
- CTO recommends split: **04a (schema + API + /v1/menu)** then **04b (admin UI)**
- Skeptic says realistic ETA 3-4 weeks for solo founder
- **Recommendation:** acceptable to keep as single phase if user commits to 3-4w; otherwise split. User decision.

### Researcher must produce `04-SCHEMA-MAP.md` BEFORE planner runs

- **CTO HIGH-3** — explicit hard gate before plan-phase
- Already in CONTEXT.md `<schema_redesign_direction>`, but make it a **mandatory deliverable** with explicit acceptance criteria (table format, iiko entity → RestOS entity → proposed change → migration impact)
- **Recommendation:** ACCEPT — codify in plan-phase prompt as researcher acceptance gate

## Additional HIGH findings (single-persona, worth addressing)

### Skeptic HIGH-3 — "dev seed OK to break" hides real dependencies

Specific files to inventory before any schema change lands:

- `apps/qr-menu/` mocks reading `/v1/menu`
- `packages/api-client/` generated DTO (`openapi-typescript`)
- `tenant-isolation.spec.ts` (Phase 01's TEN-08 cross-tenant net)
- ESLint composite-FK audit (some rule that audits FK shape; verify)

**Recommendation:** researcher catalogues, planner includes refactor in plan.

### Product Strategist HIGH-2 — D-08 explicit Save breaks AI-driven onboarding

Auto-save to draft (browser-side, 1-2s debounce) + explicit Publish is the standard B2B-SaaS pattern. Operator's draft is never lost on browser crash, navigate-away, etc. Aligns with MVP-2 AI onboarding (AI generates → operator reviews → publishes).

**Recommendation:** revisit D-08 — flip to auto-save-draft + explicit Publish. The "явный Save" decision was made before considering MVP-2 AI flow.

### Growth Marketer HIGH-1 — activation gap, no live menu visibility in Phase 04

Operator publishes in Phase 04 but can't SEE the result until Phase 05 ships. For B2B SaaS, "aha moment" is "I see my menu on my own URL". Recommend: in-Phase-04 minimal "View live menu" link from admin to existing `apps/qr-menu` SPA (which already reads `/v1/menu`).

**Recommendation:** add as success criterion to Phase 04 — operator can "Preview as customer" via existing qr-menu route.

### Growth Marketer HIGH-3 — distinguish first-publish event

`catalog.menu_first_published.v1` vs `catalog.menu_republished.v1` enables Phase 13/14 activation funnel tracking. Solo founder needs the activation signal to know when first-paying-customer onboarding succeeded.

**Recommendation:** ACCEPT — event contract addition during schema redesign.

### Growth Marketer HIGH-4 — slug Zod hygiene

`item_slug` must be: ASCII kebab-case, auto-transliterated from Cyrillic, validated against URL-friendly regex. Maintain `item_slug_aliases` table so old slug redirects when name changes (SEO + virality).

**Recommendation:** ACCEPT — researcher must include in schema redesign.

## MEDIUM findings (16 total — see per-persona files for full list)

Highlights:

- **CTO MED-1..6:** hierarchical categories impact admin IA (M1), sizes-as-entity ripples to Phase 7 cart/order (M2), stop-list table vs column (M3), outbox/undo interaction ADR (M4), composite-FK + RLS checklist for new entities (M5), publish/audit timing (M6)
- **Skeptic MED:** structured БЖУ is YAGNI without Phase 06 filter validation; manual-only stop-list reset creates "ghost 86" problem (Skeptic recommends a stale-stop-list warning surface at 24h)
- **PS MED:** stop-list >24h soft nudge, БЖУ nullable + estimated flag, sticky-bar auto-expand when N>5
- **GM MED:** `86'd` is North-American jargon — use `Paused` / `Стоп` for badge copy; regen `docs/api/openapi.yaml` as Phase 04 deliverable + CI drift-check; add schema.org/MenuItem mapping; pre-allocate `photos JSONB[]`

## LOW findings (9 total)

Highlights:

- CTO: LocalizedText default-locale convention, sticky-bar positioning, dropzone library, Badge variants for "modified", audit event wiring
- Skeptic: Sonner timing edge case for undo, native HTML5 file input enough, "destructive" badge wrong for 86'd
- GM: Sticky publish bar surfaces live-menu URL + "Copy link"; separate `item_photo_uploaded.v1`; "Recently archived" sub-tab

## Top 3 Plan-phase Intake (consensus)

Ordered by ROI / risk-reduction:

1. **Researcher acceptance gate (`04-SCHEMA-MAP.md` required before planning)** — CTO HIGH-3 + agreed via convergence
2. **Schema redesign decisions to lock during research:**
   - `source` provenance enum (PS+GM convergence)
   - `photos JSONB[]` instead of `imageS3Key TEXT` (PS+GM+Sk convergence)
   - Slug ASCII+Cyrillic transliteration + alias table (GM)
   - First-publish vs republish event distinction (GM)
3. **Two decisions to revisit with user before planning:**
   - **D-08** (auto-save-draft + explicit Publish, PS-recommended)
   - **D-10** (delayed-publish OR confirm-modal, CTO+Skeptic convergence)

## Decisions Held / Confirmed

The personas did NOT flag these as problems — they stand:

- **D-01** sidebar IA (Menu expandable group) — GM LOW-3 confirms label choice
- **D-02** items table view — no challenges
- **D-03** default filter (all except archived) — no challenges
- **D-04** full-page editor — no challenges
- **D-05** MVP-1 single-locale — no challenges (Skeptic LOW notes LocalizedText lock-in cost)
- **D-06** structured БЖУ on 100g — Skeptic mild YAGNI challenge, PS supports for nullable+estimated flag
- **D-11..D-12** stop-list inline + dashboard widget — no major challenges
- **D-13** manual stop-list reset — Skeptic + PS recommend soft nudge at 24h+ (MED, not HIGH)
- Phase 04/05 scope split — no challenges (clean)
