# Phase 04 Catalog Admin — Product Strategist Review

**Reviewer:** Head of Product / Product Strategist persona
**Date:** 2026-05-30
**Phase:** 04-catalog-admin (Goal + 5 success criteria per ROADMAP.md; CAT-01..CAT-10 per REQUIREMENTS.md)
**Decisions reviewed:** D-01..D-13 in `04-CONTEXT.md` + schema redesign direction (iiko alignment) + Phase 04/05 scope split

---

## TL;DR

- **Strategically sound on the big bets, but mis-prioritised at the seams.** Schema redesign now (iiko alignment) is the right strategic call — the cost of retrofitting Группа/Размер/ModifierGroup boundaries in 6 months after first paying customer is materially worse than re-cutting the flat schema today, before any catalog row exists in prod. Phase 04/05 scope split is also clean. But three decisions inside the phase need adjustment before plan-phase.
- **First-paying-customer at risk in two specific places.** (1) D-07 single-photo for items is a competitive weakness vs iiko-built menus that operators already see in market — restaurants will photograph their food on a Friday and want gallery output by Monday. (2) D-08 explicit Save draft + lose-on-navigate-away is the modal failure pattern of legacy POS (R-Keeper era) and is misaligned with the AI-driven positioning RestOS is selling — auto-save is a 1-day implementation difference but a generational UX difference. Both push perceived product polish below iiko/Quick Resto floor.
- **The single biggest MVP-2 retrofit risk in this phase is an unflagged item lifecycle.** D-09 status taxonomy is `draft | modified | published | 86'd | archived` — but MVP-2 AI onboarding constructor will emit items in an "AI-suggested, awaiting operator review" state that is neither draft (operator created) nor published. Adding `source: 'manual' | 'ai_generated' | 'iiko_imported'` and `needs_review: boolean` to the items schema NOW costs <0.5d in Phase 04; retrofitting it after MVP-2 ships costs a migration on live tenant data. This is the cheapest cross-milestone insurance available in the entire phase.

---

## Finding 1 — [HIGH] D-07 Single-photo per item undersells the product in the demo

**Framework:** Vertical completeness / competitive floor.

**Evidence:** D-07 defers multi-photo gallery to v2 with reasoning "after first paying customers feedback." But the founder has 10 years of restaurant-industry experience and already knows the answer: restaurant operators select a SaaS by **what their menu looks like compared to the platform they're leaving**. iiko, Poster, Quick Resto, and R-Keeper all support multiple photos per item (hero + detail shots). When a prospect lands on a RestOS-built QR-menu and sees one photo per item while the iiko-built menu next door has hero + ingredient close-up + plated shot, the product reads as "lighter / unfinished."

The cost is not architectural — `imageS3Key` becoming `imagesS3Keys: string[]` (or a sibling `item_photos` table) is a one-day schema move WHEN there is zero production data. Doing it in v2 means a migration across paying tenants' catalogs plus refit of the upload UX. Phase 04 is the ONLY cheap window.

**Restaurant-vertical specifics:**
- Food photography is the single highest-impact conversion lever for menu items on a customer-facing surface (this is well-documented in QSR + delivery-app A/B testing — Toast/DoorDash blog content confirms 30%+ uplifts from hero photo presence).
- Restaurants pay food photographers up-front during onboarding; the typical asset delivery is 3–5 photos per dish, not 1. The operator has the photos; the platform's job is to accept them.
- The "main photo" pattern works for delivery aggregators (Glovo, Wolt) because their grid card surface only renders one photo. But on RestOS's QR-menu item detail and Site item detail, there is real estate for a gallery.

**Severity rationale:** HIGH because (a) it impacts first-paying-customer perceived polish vs incumbents the prospect is comparing against, and (b) the in-phase cost is fractional while the retrofit cost compounds with every paying tenant.

**Recommendation:**
- **Minimum:** Reserve the schema slot now. Add `item_photos` table OR `imageS3Keys: string[]` column in Phase 04 even if the admin UI only writes/reads the first slot. Cost: ~0.5d schema + DTO. UI stays MVP-1.
- **Preferred:** Ship gallery upload in Phase 04 (drag-drop area accepting multiple files, first photo = hero, reorder via drag). Add 1–2 days to phase plan. shadcn primitives are already present; react-dropzone supports multi-file out of the box.
- **D-07 alternative captured in the decision log already** (one photo + v2 slot in schema) — that option should be promoted from rejected to selected.

---

## Finding 2 — [HIGH] D-08 Save-draft + lose-on-navigate is the wrong mental model for an AI-driven platform

**Framework:** Time-to-value + brand positioning.

**Evidence:** D-08 chose "explicit Save draft button, edits lost on navigate-away without save" with the rationale "auto-save risk of accidental edits > convenience." This rationale is a holdover from desktop POS UX (R-Keeper, iiko Office) where edits are infrequent, intentional, and slow. It is wrong for three RestOS-specific reasons:

1. **The phase is gated on a workflow where operators edit dozens of items in a row during onboarding.** Onboarding TTL target is ≤1h (ONB-03). An operator entering 80 items has 80 explicit save points and 80 chances to navigate away on a mistyped URL or accidental tab close. Single lost-edit incident in the first 90 minutes = churn.
2. **MVP-2 AI onboarding constructor will generate drafts and operator will be reviewing/correcting them.** "Review and accept the AI's draft" is fundamentally an auto-save flow — the operator's edits ARE the corrections, and they expect persistence. Phase 04's explicit save model will need replumbing in MVP-2.
3. **The marketing positioning is "AI-driven SaaS for restaurants" (per 2026-05-27 pivot).** AI-positioned products carry an implicit UX promise of "modern, forgiving, fluid" (think Notion, Linear, Figma — all auto-save). Shipping explicit-save in 2026/2027 reads as legacy.

The cited risk ("accidental edits") is real but solvable: every modern auto-save product (Notion, Google Docs, Linear) uses a `draft` state separate from `published` PLUS an explicit "Publish" gesture. Auto-save writes to draft; publish is the explicit commit. That is exactly the model D-09/D-10 already designed for **menu publish** — extending the same draft-vs-published mental model to **field-level edits** is internally consistent.

**Severity rationale:** HIGH because the workflow it most affects is the onboarding TTL (first-paying-customer gate), and because the decision is locked-in by Phase 04 schema only weakly (auto-save vs explicit-save is a UI decision, not a schema decision — so reversing it post-Phase-04 is cheap, but reversing the user's mental model on a UX they've already used is not).

**Recommendation:**
- **Auto-save to draft on field blur or 800ms debounce.** Status indicator "Saved" / "Saving..." in the form header. No Save button.
- **Keep the explicit "Publish" gesture in the sticky bar (D-09/D-10) unchanged** — that's the commit operation.
- **Add an Undo affordance per edit:** `Cmd+Z` and a 5s toast on field change ("Reverted price from 800 → 850. Undo"). Matches D-10 publish-undo mental model.
- **If founder wants to keep explicit save as a deliberate choice:** at minimum, drop "lose on navigate-away." Auto-persist the dirty form state in `localStorage` or a server-side draft record so navigating away is recoverable. The current decision leaks operator work into the void on tab-close, which is indefensible UX in 2026.

---

## Finding 3 — [HIGH] No `source` / `needs_review` flag on items is a MVP-2 retrofit landmine

**Framework:** Integration-as-moat + cross-milestone forward compatibility.

**Evidence:** D-09 defines item status taxonomy as `draft | modified | published | 86'd | archived`. This taxonomy assumes a single content origin: the operator typed it in. But the explicit project positioning includes two NEAR-FUTURE additional content origins:

1. **MVP-2 AI onboarding constructor** (`.planning/seeds/mvp2-ai-platform.md`): "OCR/LLM menu extraction from photos/PDF" → AI generates items that the operator reviews and confirms.
2. **MVP-3 iiko adapter**: "catalog sync (iiko → RestOS)" → items pulled from iiko-side ТТК need to be marked as "synced from iiko" so RestOS-side edits know not to round-trip back.

If Phase 04 ships without an item `source` column AND `needs_review` flag, then:
- MVP-2 has to migrate every tenant's items table to add the column, and AI-generated items will have no flag distinguishing them from operator-typed items, so the AI dashboard's "items needing review" widget has nothing to query.
- MVP-3 has to either re-migrate or hack `source` into a metadata JSONB, leading to inconsistent query patterns.

**Cost of adding now:** ~0.25d. Two columns: `source: 'manual' | 'ai_generated' | 'iiko_imported' | 'csv_import'` (enum, default `manual`) and `needs_review: boolean` (default `false`). Admin UI in Phase 04 ignores both; just ensures Default values are correct. Filter dropdown in items table gets a `Source` filter as a no-op in Phase 04, real options surface in MVP-2/3.

**Recommendation:**
- Add `source` enum and `needs_review` boolean to the new `menu_items` schema in Phase 04.
- Optionally: add `source_external_id` (string, nullable) for the future iiko ID — matches the architectural pattern of `tenant_domains.external_id` and avoids a second migration in MVP-3.
- This is the single highest-leverage, lowest-cost cross-milestone insurance in the phase.

---

## Finding 4 — [MED] Schema redesign is the right call but reframe the iiko-alignment rationale internally

**Framework:** Integration-as-moat (do not overweight) + vertical completeness (do overweight).

**Evidence:** The schema redesign direction in `04-CONTEXT.md` justifies the iiko alignment primarily as "MVP-3 iiko-integration adapter будет тонким маппингом, не reshape'ом." This framing is partially right but understates the real strategic value AND oversells the integration story.

**What the iiko alignment actually buys (and what it doesn't):**

| Benefit | Real or assumed? | Notes |
|---|---|---|
| Lighter MVP-3 iiko adapter | Real but small | The adapter cost is bounded regardless of schema (iiko's API is what it is). Saving 5 days in MVP-3 is real but not phase-defining. |
| "Easy import from iiko" as onboarding lever | Assumed and probably overweighted | "Already on iiko? Import in 10 min" is a STRATEGIC GTM pitch (MVP-3 partnership motion), not an MVP-1 onboarding lever. MVP-1 customers self-build menu in the AI constructor (MVP-2) or by hand (MVP-1 fallback). iiko import lands in MVP-3. |
| Better menu primitives for ALL operators | Real and underweighted | Hierarchical categories (Группа is a tree), `Размер` as first-class entity, separate `ModifierGroup` vs `Modifier` — these are LITERALLY the data shapes restaurateurs already think in because they're domain conventions, not iiko-specific. The schema is closer to how restaurant menus exist on paper. |
| Talent / hiring signal | Real | When the founder hires a second engineer, "our schema mirrors iiko nomenclature" is a much easier 5-minute onboarding than "ours is custom flat." |

**Severity rationale:** MED because the decision (do the redesign) is correct, but the internal narrative should be corrected so the planner doesn't over-optimize for iiko-mapping-fidelity at the cost of UX simplicity. The redesign is justified primarily by "menu primitives that match restaurateur mental model," NOT by "MVP-3 adapter is 3 days vs 8 days."

**Recommendation:**
- Reframe in the planner's research mandate: "Use iiko nomenclature as a reference for restaurant-domain entity boundaries; deviate where the iiko model carries operational complexity RestOS doesn't need (e.g., iiko ТТК ingredient lists tie to cost-of-goods workflows that are out of scope until MVP-3+)."
- Specifically: **do not** copy iiko field-by-field. Copy entity-by-entity (Группа, Блюдо, Размер, Модификатор, Группа Модификаторов, Стоп-лист). Skip iiko-specific fields like `nomenclatureGroupId` parent reference traversal patterns that won't help RestOS UX.
- The schema redesign is correct as a strategic bet; the rationale framing needs adjustment.

---

## Finding 5 — [MED] D-12 Stop-list inline toggle is competitive with iiko, but D-13 manual reset has churn risk

**Framework:** Time-to-value + competitive floor.

**Evidence:** Restaurants live and die on stop-list responsiveness — when an ingredient runs out at 19:32 on Friday, the operator needs to 86 the dish in 2 seconds. Both iiko (Office app + iiko Front terminal) and Quick Resto have an inline-toggle UX that's a 1-click action. D-12 (inline switch in Items table + Dashboard widget with `Reset all`) matches this competitive floor — **this is correct and well-judged.**

**However, D-13 (no auto-reset, manual toggle off) carries real operational risk that the discussion log dismisses too quickly.**

The stated rationale ("operator predпочитает manual control, особенно когда дефицит ингредиента длится >1 дня") describes the *good* case. The bad case:

- Friday night, sous-chef 86s 12 items as the kitchen runs out of components. Monday morning, the operator (a different person) opens the QR-menu and sees 12 items still 86'd from Friday because nobody remembered to reset. Customers see a half-empty menu, scan-to-bounce rate spikes.
- Quick Resto and Poster default to auto-reset at end of business day (configurable). iiko offers BOTH (manual + auto-reset at start-of-day). RestOS shipping only manual is a competitive regression vs the segment standard.

**Severity rationale:** MED because the fix is well-scoped (toggle in tenant settings) and can ship in MVP-1 or v2 without architectural debt; the harm window is bounded (operators learn to reset manually within a week of paid use); but each unreset stop-list item on a Monday morning is a real conversion-impacting customer experience.

**Recommendation:**
- **MVP-1 (Phase 04 scope):** Ship D-13 manual reset as-is + add a Dashboard widget prompt: "12 items have been 86'd for >24h. Reset?" as a soft nudge. Cost: trivial (it's a query against `stopped_at`).
- **v2:** Add a tenant-setting "Auto-reset stop-list at HH:MM tenant-local time" (default off). When pilot operators ask for it (they will), enable cleanly.
- Do NOT ship auto-reset cron in Phase 04 — D-13's deferral is correct for in-phase scope. But ship the soft nudge.

---

## Finding 6 — [MED] D-09/D-10 Instant publish + 5s undo is the right model BUT diff-via-badges only is borderline thin for CAT-08

**Framework:** Operator trust / release management.

**Evidence:** D-09 satisfies CAT-08 ("operator sees a diff between draft and published before publishing") via "status badges per item + sticky publish bar showing N unpublished changes." D-10 ships instant-publish + 5s undo toast.

**What's right:**
- Instant + undo matches modern SaaS norms (Linear, Notion). Confirm modals are friction.
- Per-item status badges are good ambient information.
- The 5s undo is genuine safety net.

**What's borderline:**
- "View list" expansion of the sticky bar (per `<specifics>` section: "N unpublished changes • [View list ▾]") is the **only** place where the operator sees what they're about to publish. If the operator publishes 25 unpublished changes accidentally and within 5s the kitchen has already received 3 orders against the wrong price — the 5s undo can't actually undo orders.
- Larger restaurants (the small-chain segment) do think in release-management terms. "I want to publish only the lunch-menu changes, not the dinner-menu changes I made last night that aren't ready" is a real workflow.

**Severity rationale:** MED because for solo-operator independent restaurants (the MVP-1 segment), this is fine. For small-chain segment (which RestOS markets to per PROJECT.md "1–10 locations"), it's thin. But solving it fully = scope creep into v2.

**Recommendation:**
- **Keep D-09/D-10 as designed for Phase 04** — instant publish + undo + badge + sticky bar.
- **Add ONE thing to the sticky bar:** when N > 5 unpublished changes, expand by default and require operator to click "Publish" (don't auto-collapse). Soft friction proportional to change-count without a confirm modal.
- **Defer to v2:** selective publish ("publish only these 3 items"). Mention in deferred ideas section.
- **Make sure backend `revert to previous snapshot` capability genuinely works** for the 5s window — D-10 mentions it implies this. The planner should add an explicit test case for "publish, immediately undo within 5s, verify previous version is restored, verify in-flight customer reads either old OR new but never inconsistent state."

---

## Finding 7 — [MED] БЖУ (D-06) earns its keep, but precision is a UX trap

**Framework:** Vertical completeness + AI-readiness.

**Evidence:** D-06 chose "4 numeric fields per 100g (proteins / fats / carbs / kcal)" with rationale that it (a) enables QR-menu filters in Phase 06, (b) supports nutrition labels on Site (Phase 05), (c) aligns with iiko ТТК structure, (d) hints at fiscal/sanitary compliance signals. **This is the right call.** But there's a 1-paragraph UX trap to surface now before the planner builds it:

**The trap:** Restaurants will not actually have precise БЖУ values for most house-made items. They'll have them for industrial supply (packaged drinks, branded ice cream) but for "Caesar salad" the operator will guess. iiko ТТК solves this with cost-of-goods workflow (ingredients × per-100g values aggregated), but that requires the full recipe entity which is **deferred to v2** (correctly per "Recipe / ТТК (v2)" in deferred list).

If the БЖУ fields are presented as required-feeling and unforgiving, operators will either:
1. Skip them (defeating the purpose), or
2. Fabricate values (worse — false claims on a customer-facing surface, with EU consumer-protection exposure).

**Severity rationale:** MED. The schema decision is right. The UX presentation is what needs care.

**Recommendation:**
- БЖУ fields default to `null`, not 0. Schema column nullable.
- UI presents them as optional with helper text "Leave blank if not measured. Required for nutrition filters on QR-menu."
- AI assistant in MVP-2 will be a natural source of estimated values — flag the field as `nutrition_estimated: boolean` (similar to `needs_review` in Finding 3, can be same generic field).
- Phase 06 QR-menu nutrition filter only shows items with non-null values — natural opt-in mechanism.

---

## Finding 8 — [LOW] Sidebar IA "Menu" label is correct for the segment

**Framework:** Plain-language UX.

**Evidence:** D-01 chose "Menu" as the top-level sidebar group label (over alternatives: Catalog, Products, Nomenclature). Restaurant industry mental model for the segment is "menu" in both EN and RU markets. iiko uses "Номенклатура" (Nomenclature) which is a back-office accounting term — fine for chain operations staff but feels stuffy/enterprise to independent operators. Poster uses "Меню". Quick Resto uses "Меню". Toast uses "Menu Builder." RestOS using "Menu" matches both the segment vernacular and the customer surface naming (the QR-menu is called "menu" everywhere).

**Severity rationale:** LOW because the decision is correct; flagging only for completeness.

**Recommendation:** No change. Keep "Menu." If the founder wants a translation pass for RU operators in admin UI, use "Меню" in Russian locale, not "Номенклатура."

---

## Finding 9 — [LOW] D-02 / D-03 default filters are operator-friendly; minor refinement

**Framework:** Time-to-value.

**Evidence:** D-02 (compact table with 48px thumb) and D-03 (default show all except archived) are well-judged for the 200+ items operator. One small refinement worth noting:

- First-time operator empty state: no items exist. The table view defaults to showing "Create your first item" CTA + import-CSV affordance (deferred to v2 but worth a stubbed link). This connects to ONB-03 "≤1h time-to-publish."
- Default sort by `sortOrder` then by category is correct for steady-state. For first-load post-onboarding (when sortOrder isn't yet meaningful), default to sort by created-at desc so the most recent additions float to top — operator sees their work.

**Severity rationale:** LOW because the core decisions are right; only a UI polish note for the planner.

**Recommendation:**
- Empty-state copy: "Create your first menu item to start building your menu."
- Stub a disabled "Import from CSV" link with tooltip "Coming soon" — sets expectation that bulk import lands in v2.
- Sort default = `sortOrder ASC NULLS LAST, createdAt DESC` so unsorted items still surface meaningfully.

---

## Finding 10 — [LOW] No data-loss test for the publish-undo path

**Framework:** Operator trust.

**Evidence:** D-10 implies "backend capability `revert to previous snapshot` within 5s." This is a CORRECT capability but warrants explicit test coverage in the plan:
- Concurrent reads during the 5s window: customer reading menu at second 3 of a 5s undo window — does the customer see version N or N-1? Stale-read inconsistency on a customer-paid order is a real harm.
- Undo after partial NATS event propagation: publish emits `catalog.menu_published.v1` → audit subscribers tick → undo retracts the snapshot but audit row stays. Eventual consistency footprint needs auditing.

**Severity rationale:** LOW because it's a correctness concern more than a product concern, and the planner will (presumably) surface this. Flagging because CTO persona may miss it as a "product trust" implication.

**Recommendation:** The planner should add test cases for the 5s undo window covering (a) concurrent customer read during undo, (b) audit row consistency, (c) Redis cache version handling under undo.

---

## Decision-by-Decision Verdict Matrix

| Decision | Verdict | Action Required |
|---|---|---|
| D-01 Sidebar Menu group | Keep | None |
| D-02 Compact table | Keep | Empty-state copy + sort default refinement (LOW) |
| D-03 Default filter (all except archived) | Keep | None |
| D-04 Full-page editor | Keep | None |
| D-05 Single-locale editor | Keep | None |
| D-06 БЖУ structured | Keep | UX: nullable + estimated flag (MED) |
| D-07 Single photo | **Revise** | Reserve schema slot minimum; ship gallery preferred (HIGH) |
| D-08 Explicit Save draft + lose-on-navigate | **Revise** | Auto-save to draft; keep explicit Publish (HIGH) |
| D-09 Status badges + sticky bar (diff via UI) | Keep | Soft friction when N>5 unpublished (MED) |
| D-10 Instant publish + 5s undo | Keep | Add explicit concurrency tests for undo window (LOW) |
| D-11 Stop-list ≠ Archive | Keep | None |
| D-12 Inline stop-list toggle + dashboard widget | Keep | None |
| D-13 Manual stop-list reset (no auto-cron) | Keep | Add "items 86'd >24h" soft nudge widget (MED) |
| Schema redesign (iiko alignment) | Keep | Reframe rationale; add `source`/`needs_review` columns (HIGH cross-milestone insurance) |
| Phase 04/05 scope split | Keep | None |

---

## Cross-Milestone Forward-Compatibility Checklist (MVP-2 / MVP-3 readiness)

Phase 04 schema MUST set up these slots to avoid migration debt:

- [ ] **`item.source` enum** (`manual` | `ai_generated` | `iiko_imported` | `csv_import`) — MVP-2 + MVP-3 readiness — **HIGH**
- [ ] **`item.needs_review` boolean** — MVP-2 AI-generated content review workflow — **HIGH**
- [ ] **`item.source_external_id` string nullable** — MVP-3 iiko ID for round-trip sync — **MED**
- [ ] **`item.nutrition_estimated` boolean** (or fold into needs_review) — MVP-2 AI БЖУ estimation provenance — **LOW**
- [ ] **`item_photos` table OR `imageS3Keys: string[]`** — MVP-1 competitive floor + v2 gallery — **HIGH**
- [ ] **Hierarchical category support** in schema even if MVP-1 UI is flat — researcher's open question; if iiko-mapping research confirms tree is the operator's mental model, ship hierarchical NOW; UI can be flat in MVP-1 — **MED, gated on research outcome**

The `source` + `needs_review` + `source_external_id` trio is the single highest-leverage forward-compat investment in this phase. Total cost: <1 day. Total saved migration risk across MVP-2 and MVP-3: 3–5 days plus customer-data-touching migration risk.

---

## Strategic Frame Summary

**Vertical completeness for first-paying-customer:** Phase 04 as designed gets RestOS to "operator can build a working menu" — yes. The gaps that erode the "felt completeness" vs incumbents:
1. Single photo (D-07) — competitive regression
2. Explicit save (D-08) — modern UX regression
3. No auto-reset stop-list nudge (D-13) — operational regression

None of these are MVP-1 blockers individually. Together they degrade the demo vs an iiko-built or Quick-Resto-built menu in a side-by-side. For a solo-founder operator hitting their first 5 prospects, that side-by-side WILL happen.

**Integration-as-moat (iiko alignment):** Correctly weighted as MVP-3 setup. The redesign is justified by the better domain primitives more than by adapter slimming. Plan accordingly — do not let the iiko entity model dictate UX decisions that hurt independent restaurants who never plan to use iiko.

**Time-to-value:** Phase 04's biggest TTV lever is auto-save + import-CSV stub. Auto-save alone could halve onboarding friction. CSV import stub manages expectations for v2.

**MVP-2 readiness:** The `source` / `needs_review` flag pattern is the cheapest cross-milestone insurance available. Skip it, and MVP-2 ships with a tenant-data migration. Add it now, and MVP-2 AI onboarding constructor lands cleanly.

---

## Recommended Adjustments Before Plan-Phase

**Must-fix (HIGH severity, before planner produces PLAN.md):**

1. **D-07 → revise to "1 photo in UI, schema supports array"** (or ship gallery if scope allows). Updates `imageS3Key` to `imageS3Keys: string[]` in DTO + schema. Phase 04 UI uses index 0.
2. **D-08 → revise to "auto-save to draft on blur/800ms debounce, explicit Publish unchanged."** Drop lose-on-navigate-away language.
3. **Add `source` + `needs_review` + `source_external_id` to items schema in Phase 04.** Default values. Admin UI ignores in MVP-1.

**Should-fix (MED severity, during planning):**

4. Reframe iiko-alignment rationale toward "restaurant domain primitives" — keeps planner focused on UX over adapter optimization.
5. Add "items 86'd >24h" soft-nudge widget on Dashboard (alongside D-12 Today's 86 widget).
6. БЖУ fields: nullable in schema, optional in UI, "estimated" provenance flag.
7. Sticky bar auto-expands when N>5 unpublished changes.

**Awareness (LOW severity, for planner / executor):**

8. Empty-state copy + CSV-import stub + sort default refinement.
9. Explicit concurrency tests for the 5s undo window.

---

## What I Did NOT Review

- Concrete shadcn component variants (Claude's discretion per CONTEXT.md).
- Specific Drizzle migration SQL — that's planner + researcher scope.
- Audit envelope shapes for new catalog events — CTO/skeptic scope.
- Multi-language strategy beyond D-05 (current decision is correct).
- Performance / Redis cache invalidation strategy under heavy publish load.
- RBAC permissions (`staff:menu:write` / `staff:menu:publish`) verification — assumed correct from Phase 03.

---

*Reviewer's net assessment:* Phase 04 is **80% well-judged with two high-severity UX regressions and one cheap cross-milestone insurance to add.** Schema redesign is the right strategic bet for the timing. The discussion log shows good rigor on stop-list-vs-archive and publish-flow design. The two HIGH-severity findings (D-07 single-photo, D-08 explicit-save) are both "small in-phase fix, large delayed-cost if unfixed" — exactly the kind of pre-plan-phase catch a product strategist persona is here to surface. Fix those plus the schema flags trio and Phase 04 is plan-phase ready.
