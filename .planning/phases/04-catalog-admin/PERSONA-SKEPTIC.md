# Skeptic Review — Phase 04: Catalog Admin

**Reviewer:** persona-skeptic
**Date:** 2026-05-30
**Posture:** Adversarial. Default assumption: every decision is either over-built or under-built. Find which.

---

## TL;DR

- **The iiko schema redesign is the highest-leverage mistake on the table.** It bets foundational schema work on an integration that is explicitly MVP-3 (Q4 2027+), 18+ months out, that may never happen with this exact entity model, while delaying the Q1 2027 first-paying-customer milestone. Anchor: schema redesign now is irreversible and expensive; alignment later is reversible and cheap.
- **D-10 "instant publish + 5s undo" is gold-plating.** It implies a versioned snapshot store, snapshot-rollback capability, outbox event reversal semantics, and cache-invalidation rollback — for a product with zero paying customers and zero validated "oh-no-I-published-wrong" incidents. A confirm modal solves the same problem in 1/10th the code.
- **The phase is now ~3x its original scope and has zero plan count yet.** Schema redesign (research → SCHEMA-MAP → Drizzle rewrite → migration → service refactor → DTO updates → admin UI) is being absorbed silently into a "10 requirements" phase. Solo founder, no timeline reset.

---

## HIGH severity findings

### HIGH-1 — iiko-alignment in MVP-1 is a forward-bet on an MVP-3 integration that may never happen

**Decision:** Schema redesign (`<schema_redesign_direction>` block in 04-CONTEXT.md, no D-XX assigned)

The CONTEXT.md explicitly says: _"The current schema is a fully-functional, brownfield, RLS-hardened catalog that is already serving `/v1/menu`."_ The redesign trigger is one user sentence: _"in iiko docs they have everything well thought-out... we don't have to do it exactly but borrow what's good."_ That is a vibe, not a forcing function.

Cost of doing it now:

- Rewrite `packages/db/src/schema/menu.ts` (246 lines, six tables with composite-FK invariants per ADR-0020 I-2)
- Migration with destructive intent (the "no paying customers" assumption — see HIGH-3)
- Rewrite `apps/api/src/contexts/catalog/application/dto.ts`, `infrastructure/catalog-drizzle.repository.ts` (342 lines), `domain/published-menu.ts`, all three upsert services, plus the publish/get-published readers
- Re-write the public `/v1/menu` DTO that the existing `apps/qr-menu` already consumes
- New `04-SCHEMA-MAP.md` artifact, research, persona re-review of UI decisions (per the "schema-may-affect-UI" flag)
- Cascading: pre-existing D-01..D-13 might need revision (CONTEXT.md admits this explicitly)

Cost of doing it later (Phase 12+ when MVP-3 iiko adapter is concrete):

- Same migration cost, but with **actual customer data** (more risk)
- BUT: at that point you know _exactly_ which iiko fields you actually use in the adapter. The current redesign is based on reading SDK docs, not running an integration.

**The asymmetry:** MVP-1 alignment is irreversible (schema migration). MVP-3 alignment is reversible (you can iterate the adapter). You are buying insurance against a future cost that may not exist, paying with present time you don't have.

**Counter-argument the user might make:** "Migration is cheaper now because there's no production data." True — but only if you also accept that MVP-3 is far enough out that iiko's nomenclature model might shift (their docs evolve), or that iiko itself might not be the first partnership (per ROADMAP MVP-3: _"iiko adapter as B2B GTM channel"_, conditional on partnership pipeline). You are pricing schema work as a hedge against an outcome that has not been validated.

**Recommendation:** Drop the schema redesign from Phase 04. Keep only the minimum DDL needed for CAT-02 (БЖУ columns) and CAT-07 (stop-list). Defer iiko-alignment until Phase 11 or MVP-3 activation when you have a real integration target. If the user insists, time-box the research to 1 day max and require the planner to surface "Phase 04 estimate doubled to N days" before execution.

---

### HIGH-2 — D-10 "instant publish + 5s undo" is a complexity multiplier for an unvalidated need

**Decision:** D-10

This decision implies backend capability _"revert to previous snapshot within 5s"_. That is:

1. Snapshot version tracking (already exists — `publish-menu.service.ts`)
2. **Reversible** snapshot pointer (set `published_version_id = previous_version_id`) — does NOT exist
3. Outbox event already emitted (`catalog.menu_published.v1`) — what do you do? Emit a compensating `catalog.menu_unpublished.v1` event? Now `audit` and any future subscribers must handle revert semantics.
4. Redis cache already invalidated and possibly re-warmed with new snapshot — must invalidate again
5. The qr-menu and (future) website may have already served the new menu to a customer who placed an order against it — order item snapshots are now from a "rolled-back" published version. Audit implications.

Option 1 in the discussion log (confirm modal with change list) does the same job with: a modal + a list-of-changed-items query. That's 1 controller endpoint + 1 React component. No reversal semantics, no compensating events, no cache dance.

**What real-world operator scenario justifies this?** None has been stated. The user's mental model is "правка цены → save → publish" (quick edit). For that workflow, a 1-click confirm modal ("Publish 3 changes?") is _not_ friction — it's a safety check. The 5s undo is the worst kind of safety net: it gives the illusion of safety, but if the operator walks away to handle a phone call after publishing wrong data, the undo window expires silently.

**Recommendation:** Replace D-10 with the confirm-modal option (Q3 option 1). Document the 5s-undo idea in `<deferred>` only if a real incident proves the confirm modal too heavy.

---

### HIGH-3 — "Dev seed data acceptable to break" assumes too much; integration tests + qr-menu mock data may silently regress

**Decision:** Schema redesign migration risk (CONTEXT.md says "OK потому что catalog данных в проде ноль")

"No paying customers" ≠ "nothing depends on current catalog schema". Current dependencies that I can confirm exist:

- `apps/api/src/contexts/catalog/application/get-published-menu.service.ts` — public `/v1/menu` reader
- `apps/qr-menu` — Vite SPA that calls `/v1/menu`. May have e2e tests, may have mock data, may have type imports from the openapi-typescript-generated client
- `packages/api-client/src/generated/api.ts` — OpenAPI codegen artifact. Schema changes invalidate the generated DTO. Anything consuming the typed client must be re-checked.
- `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts` — cache shape encodes the published-menu DTO. Cache invalidation strategy on schema change?
- `packages/db/test/integration/tenant-isolation.spec.ts` — per CLAUDE.md _"every new tenant-scoped table needs an entry here"_. Schema redesign means every catalog table re-enrolls.
- Phase 1 cross-tenant isolation test net (TEN-08) — comprehensive coverage was built. A schema swap requires re-running all of it.
- ESLint composite-FK audit rule (`pnpm db:audit-fks` planned). Each new tenant-scoped child needs the composite FK pattern from `_columns.ts`.

**The "dev seed acceptable to break" framing hides operational debt.** A migration that breaks dev seeds breaks every developer's local DB on `git pull`. For a solo founder, that's tolerable. But if the migration also breaks generated API client types, every downstream caller (including `apps/admin` Phase 02 brand UI) silently typechecks against the wrong shape.

**Recommendation:** Force the planner to produce a "breaking change impact inventory" before any schema migration is approved. Listed minimum: openapi.yaml diff, generated DTO diff, tests that import from `@resto/db` schema, qr-menu type imports, integration test fixtures.

---

### HIGH-4 — Phase 04 has zero plan count after major scope expansion

**Decision:** Implicit. ROADMAP.md still says "Plans: TBD" for Phase 04.

Phase 03 (Auth Completion) had 5 plans across 4 waves, took ~1 day per plan in execution, and that was _not_ foundational schema work. Phase 04 now contains:

1. iiko research + SCHEMA-MAP doc
2. Drizzle schema redesign + migration (with composite-FK invariants, RLS policies, tests)
3. Catalog application services refactor (3 upsert services + publish + 2 readers)
4. DTO + OpenAPI + generated client diff
5. New endpoints: modifier groups (separate from modifiers per iiko split), sizes (separate entity?), stop-list, draft/published diff
6. БЖУ columns + structured validation
7. Admin UI: 4 list pages, 4 editor pages, sidebar restructure, sticky publish bar, undo toast, stop-list widget on dashboard
8. Publish snapshot rollback capability (per D-10)

That is realistically a 3–4 week phase for a solo founder, not a typical 1-week phase. The CONTEXT.md notes "schema-may-affect-UI" but does not budget for the re-review loop that implies.

**Recommendation:** Force the planner to produce a draft plan count + per-plan size estimate _before_ the user confirms scope. If the count exceeds 6 plans or estimated duration exceeds the previous phase's actuals by >50%, trigger a scope-cut conversation.

---

## MEDIUM severity findings

### MED-1 — БЖУ as 4 structured numeric fields is gold-plating for MVP-1

**Decision:** D-06

CAT-02 says: _"name, description, price, allergens, BJU, ingredients, photo"_. It says "BJU" — not "structured БЖУ filter for QR-menu". The structured choice is justified by _"enables QR-menu filters in Phase 06"_ (06-DISCUSSION-LOG) and _"future integration with iiko ТТК"_. Neither is in MVP-1.

What does the typical first paying customer actually need? They need to **display** nutritional info (regulatory + customer trust). Display works fine with a single free-text field. A structured BJU schema adds:

- 4 columns to migrate
- 4 form fields to validate (with "per 100g" copy and number-input UX)
- Zod schema work for Bju value-object
- Adds _zero_ customer-facing value in MVP-1

Counter-argument: "but Phase 06 filters need it". Phase 06 is QR-Menu Customer. Filtering menu items by BJU is exotic — name a real customer scenario. Allergens are a much more meaningful filter (and are already an array). Filter-by-protein is a hypothetical.

**Recommendation:** Keep the 4 structured fields if and only if there is a documented Phase 06 success criterion that mentions BJU filters. Otherwise demote to a single optional `nutrition_text` field and add structured fields when (if) a customer requests filtering.

---

### MED-2 — Manual-only stop-list reset (D-13) bites in real-world ops

**Decision:** D-13

CONTEXT.md justification: _"оператор предпочитает явный контроль (особенно когда дефицит ингредиента длится >1 дня)"_. That is one half of the failure mode. The other half: **operator forgets to reset**. Restaurant ops people are not always on the device; shift changes drop context.

Real scenario: chef adds 6 items to stop-list at 7pm Friday because they ran out. Saturday morning the stock truck arrives, chef restocks, but never opens admin. The 6 items remain "86'd" on the customer site/QR-menu for the entire Saturday service. Lost revenue, lost customer trust ("they always show items as out of stock, why bother").

The "Today's 86" dashboard widget (D-12) is described as a count + list with "Reset all" button. That helps **if the operator opens the dashboard daily**. There is no guarantee.

The cheapest mitigation is not a cron-based auto-reset (which the user correctly identified as tz-complexity). It is **a sticky warning at the top of admin** when stop-list contains items older than 24h. Or: an email digest "your stop-list has 6 items older than 24h" to the owner role.

**Recommendation:** Accept D-13 as written, but require Phase 04 to ship at least one "stale stop-list" warning surface (sticky banner OR daily digest). Document the failure mode in `<deferred>` so it does not get lost.

---

### MED-3 — Single photo per item is a real product gap, not a deferral

**Decision:** D-07

Restaurants compete on food photography. Look at any actual restaurant in your target market on Glovo/Bolt/Wolt — they have 3–5 photos per item (hero + close-up + ingredient shots + lifestyle). One photo is _aggregator quality from 2018_, not what a 2027 customer expects from a "turnkey digital presence" SaaS.

The CONTEXT.md justification is _"after first paying customers feedback"_ — but no operator is going to articulate this as "I need a multi-photo gallery feature". They will just photograph their menu once, see the result is uninspiring, and either (a) not bother taking more photos because the system can't show them or (b) churn to a platform that supports galleries.

Counter-argument: "MVP-1 ships, customer asks for galleries, we add it in v2". Fair. But the _schema_ should pre-prepare. Q4 option 3 in the discussion log explicitly offers this: _"1 photo + v2 slot ready in schema"_. That was rejected without a recorded rationale. Adding a `menu_item_photos` table now (or a JSONB array on items) is a 30-minute schema change and removes a future migration.

**Recommendation:** Add the multi-photo table schema in Phase 04 as a forward-compatibility hook. UI in Phase 04 still ships single-photo only. v2 just plugs the gallery UI on top. This is the rare case where forward-compatibility schema work _is_ worth doing — because it removes a future migration of a customer-data-heavy table.

---

### MED-4 — Sticky publish bar (D-09) is UI premature optimization

**Decision:** D-09

The sticky bar exists to surface "N unpublished changes → Publish" at all times. But:

- Operators making edits know they have unpublished changes (they just made them)
- The status badges on items already encode draft-vs-modified-vs-published per row
- The publish action is rare (typically end of edit session)

A "Save & Publish" combined button on the editor page, plus a dashboard widget "You have N unpublished changes" once outside the editor, covers the same need. The sticky bar adds:

- z-index management
- viewport vs content-area positioning (admitted as Claude's discretion)
- mobile responsiveness (admin probably not used on mobile — confirm)
- conflict with other sticky elements (toaster, side sheet, etc.)

**Recommendation:** Drop D-09's sticky bar. Replace with: (1) status badges per row (keep), (2) a "Publish menu" CTA in the page header of `/dashboard/menu/items`, (3) a top-of-page alert when N>0 unpublished changes exist. Simpler, deep-linkable, no z-index roulette.

---

### MED-5 — `apps/website` consumption deferred to Phase 05 may break the schema-validation feedback loop

**Decision:** Scope split Phase 04 vs Phase 05 (discussion log final section)

The user agreed to ship API + admin in Phase 04, then render in Phase 05. That sounds clean. The risk: Phase 04 schema decisions get validated against admin UX (operator-facing) but NOT against customer-facing render (qr-menu / website). What if the new `Размер` entity feels right in admin but renders awkwardly on the public menu?

Existing `apps/qr-menu` already renders `/v1/menu` — Phase 04 inherently changes that DTO. If qr-menu silently breaks (or even just looks weird) and Phase 05 doesn't open for 2 weeks, the validation gap is real.

**Recommendation:** Require Phase 04 plan to include "smoke-render the new `/v1/menu` DTO in `apps/qr-menu` against fixture data" as success criterion. If qr-menu can't render the new shape without modification, Phase 04 is not done — and the scope-split is a lie.

---

### MED-6 — "Researcher may recommend hierarchical categories" reopens 4 of 13 decisions silently

**Decision:** `<schema_redesign_direction>` Point 3, "Open questions to surface in RESEARCH.md"

If hierarchical categories are recommended, the CONTEXT.md admits _"это потребует пересмотра D-01 (sidebar) и D-02 (Items table)"_. The user has already made those decisions. The plan-phase reviewer will need to re-discuss them. That is fine in principle but creates a re-decision loop that erodes the value of the discuss phase.

Hidden assumption: the researcher's recommendation will be tractable. If the researcher returns "you need hierarchical categories AND separate Size entity AND modifier-group/modifier split AND ТТК recipe layer", you have a 6-week phase that the user did not sign up for.

**Recommendation:** Before researcher starts, the planner should write a _constraint document_: "Researcher's recommendation may add at most N entities and may not require revising D-01..D-13." If the recommendation exceeds the constraint, the planner kicks back to discuss-phase rather than silently expanding scope.

---

## LOW severity findings

### LOW-1 — Multilingual editor deferral is fine, but `LocalizedText` schema lock-in is not zero-cost

**Decision:** D-05

The schema keeps `jsonb('name').$type<LocalizedText>()`. UI writes default locale only. That is the right call for MVP-1. But:

- Every Zod schema validation must accept `{ ru: ..., en: ... }` shape even when only one key is populated
- Every DTO returns `LocalizedText` to the client, forcing the qr-menu / website to negotiate locale even when only one is present

Cost is low (already paid). Note for awareness: when (if) you remove `LocalizedText` to simplify, it will be a wide refactor. Don't add new LocalizedText fields lightly.

---

### LOW-2 — Toast library = Sonner is already locked

**Decision:** "Claude's discretion" section

Sonner is fine. No challenge. Note: Sonner toasts auto-dismiss. The 5s undo window (D-10) depends on the toast staying visible until clicked or 5s elapses. Confirm Sonner's timing is configurable and the dismissal-mid-undo case is handled. If user moves mouse to dismiss the toast at 2s, undo is lost — is that the intended UX?

---

### LOW-3 — Drag-drop photo upload library choice deferred

**Decision:** "Claude's discretion"

react-dropzone is overkill for single-photo upload. Native HTML5 `<input type="file" accept="image/*">` is one line. Recommend explicit guidance: native HTML5 unless multi-file is added (which won't happen in MVP-1 per D-07).

---

### LOW-4 — Status badge color choice (orange destructive for 86'd) is a minor pet peeve

**Decision:** `<specifics>` block

"`destructive` for 86'd" is semantically misleading. Destructive = "this action will destroy something" in shadcn's intent (delete buttons, etc.). 86'd is _temporary unavailable_ — that maps to `warning` or `secondary`, not destructive. Use the shadcn `Badge` variant `secondary` with an orange dot, or a custom `unavailable` variant.

---

## Pattern Adoption Honesty Check

Phase 04 hasn't shipped code yet, so this is forward-looking on the decisions:

| Claimed pattern                                      | Score | Notes                                                                       |
| ---------------------------------------------------- | ----- | --------------------------------------------------------------------------- |
| DDD bounded contexts (catalog only — no new context) | 8     | Existing catalog is well-bounded; redesign should not introduce splits      |
| Hexagonal / ports-adapters                           | 9     | Pattern exists; CAT redesign should preserve port shapes                    |
| Outbox + ScopedTx for catalog events                 | 7     | D-10 "undo publish" risks an event-emission rollback hack                   |
| Zod DTO source of truth                              | 9     | БЖУ value-object discipline is good                                         |
| OpenAPI-first contract                               | 5     | Schema redesign forces full regen of `@resto/api-client`; cost not budgeted |
| Test pyramid                                         | 5     | Integration test re-enrollment for new schema is not in success criteria    |

**Pattern integrity: 43 / 60**

---

## Top 3 Things I Would Cut or Defer

1. **iiko schema redesign in Phase 04.** Defer to MVP-3 Phase B when iiko adapter has a concrete target. Keep Phase 04 to admin CRUD on existing schema + minimal column additions for БЖУ. Saves 1–2 weeks, removes irreversibility risk.
2. **D-10 5s undo.** Replace with confirm modal. Saves snapshot-rollback capability + compensating-event work + cache-invalidation rollback. Net loss of UX: one extra click on publish. Net gain: a feature that actually works under operator's real attention budget.
3. **D-09 sticky publish bar.** Replace with page-header CTA + top-of-page alert. Saves z-index roulette + mobile testing + viewport-positioning bikeshedding.

## Top 3 Things That Should NOT Be Deferred

1. **Multi-photo schema (table or JSONB array), even if UI ships single-photo.** Photography is a competitive moat for restaurants. Adding a `menu_item_photos` table now is 30 min; migrating it once it has customer data is an order of magnitude more. This is the rare YAGNI exception — schema forward-compatibility, not feature.
2. **Stale stop-list warning surface.** D-13 manual-reset is fine, but without a "your stop-list has items older than 24h" surface (banner or daily digest), real-world ops will silently rot customer trust. Cheap to add now (1 query + 1 banner), expensive to retrofit after first incident.
3. **Phase 04 success criterion: "qr-menu renders the new `/v1/menu` DTO without modification."** The scope split (Phase 04 = schema/API/admin, Phase 05 = web render) creates a validation gap. Force the smoke render now.

---

## What I Did NOT Review

- Actual iiko documentation contents (canonical URL behind SPA; relied on CONTEXT.md's characterization)
- Whether `apps/qr-menu` has e2e tests or fixture data that depend on current catalog DTO shape (would need a deeper grep)
- Whether `packages/api-client` generated DTO is consumed by other Phase 02/03 code paths (could find collisions)
- The full audit-event surface for catalog (assumed `catalog.menu_published.v1`, `catalog.item_stopped.v1` patterns based on existing context tradition; not verified)
- The publish-snapshot store shape and whether D-10 rollback is actually feasible without DB migration
- Performance characteristics of the new schema (no measurements done; only structural review)
- Migration reversibility — researcher's mandate covers it but I did not audit specifics

---

_Submitted by: persona-skeptic_
_Phase: 04-catalog-admin_
_Source review: 04-CONTEXT.md, 04-DISCUSSION-LOG.md, ROADMAP.md, REQUIREMENTS.md, current catalog schema/code_
