# PERSONA-CTO — Phase 04: Catalog Admin

**Reviewer:** CTO (15+ years B2B SaaS, multi-tenant systems at 10k+ tenants)
**Date:** 2026-05-30
**Phase:** 04-catalog-admin
**Inputs reviewed:**
- `.planning/phases/04-catalog-admin/04-CONTEXT.md`
- `.planning/phases/04-catalog-admin/04-DISCUSSION-LOG.md`
- `.planning/ROADMAP.md` (Phase 4 + Phase 5 sections)
- `.planning/REQUIREMENTS.md` CAT-01..CAT-10
- `.planning/PROJECT.md` (Tech Stack, Constraints, Conventions)
- Current catalog code: `apps/api/src/contexts/catalog/` (services, ports, repo, controllers)
- Current schema: `packages/db/src/schema/menu.ts`
- Multi-tenancy/outbox invariants (CLAUDE.md packages, db, apps)

---

## TL;DR

- **Scope nearly doubled** when the user added "rebuild schema under iiko nomenclature" on top of an already-ten-requirement CRUD phase. As designed, Phase 04 is now a foundational data-model phase plus a full admin surface — too big to run as one indivisible unit for a solo founder. Recommend splitting into **04a (schema + API + public DTO) → 04b (admin UI)** with a hard checkpoint between them.
- **D-10 (instant publish + 5s undo) is materially under-specified at the backend layer.** Current `publish-menu.service.ts` is a version bump — there is no snapshot table, no "previous version" pointer, and `catalog.menu_published.v1` is already emitted via outbox. Calling that capability "undo in 5s" hides a real architectural decision: do we add a snapshot store now, or downgrade undo to "client-side mute the toast and avoid bumping until 5s pass"? Plan must pick one explicitly.
- **Researcher-gates approach is correct and should be enforced.** `04-SCHEMA-MAP.md` + an explicit migration plan must land in RESEARCH.md before `/gsd:plan-phase` runs. Without that gate, planner builds tasks on top of a schema that hasn't been validated against iiko entity shapes — and the schema reshape will leak into every task estimate.

---

## Architecture Assessment

The existing catalog context (`apps/api/src/contexts/catalog/`) is already well-layered: domain/application/infrastructure/interfaces split, ports bound by `Symbol`, ScopedTx + RLS, Redis cache, S3 presign adapter, NATS outbox event (`catalog.menu_published.v1`). Phase 04 is not building from zero; it is reshaping a working bounded context. That is the correct seam to make changes through — no new context, no new module wiring.

The schema as it exists today (`packages/db/src/schema/menu.ts`) is flat-categories + items + variants + modifiers + modifier-options + item-modifier junction. Composite-tenant FKs are already in place on all child tables (`menu_items_category_fk`, `menu_variants_item_fk`, etc.) and `tenantParentUniqueIndex` is declared so future composite FKs from yet-unborn tables can attach correctly. The redesign therefore inherits a correct tenancy substrate — the work is reshaping entities, not re-doing isolation. That's a strong starting position.

The biggest architectural delta the iiko alignment introduces is the **modifier-group / modifier split** and **sizes as a first-class entity**. The current schema treats `menu_modifiers` as already being the group (it has `min_selectable`/`max_selectable`) and `menu_modifier_options` as the choices. iiko's model is the same shape under different names — that mapping is mostly nominal, not a reshape. Sizes-as-entity vs variants-embedded is a real reshape: today `menu_variants` carries `priceDelta`; iiko's `Размер` is a reusable size across many items. If the researcher recommends iiko's reusable-size model, every downstream cart line, order line, and POS adapter has to carry `(itemId, sizeId)` instead of `(itemId, variantId)` — that's a Phase 7 (Ordering) impact, not just Phase 04.

The publish flow is the most fragile architectural piece in the current code. `publish-menu.service.ts:13-20` is a 7-line version bump; the actual "snapshot" today is just "items where status = 'published' AT READ TIME". There is no immutable snapshot table. The `catalog.menu_published.v1` event is emitted (per `packages/events/README.md:38`) but carries the version number, not a content reference. This works for forward publish; it does **not** support D-10's "revert to previous snapshot in 5s" claim. Either the snapshot model has to change (real immutable snapshot rows) or the undo has to be a no-op-before-bump (delay the version bump by 5s).

The qr-menu / website / qr-menu split with `/v1/menu` as the contract boundary is clean and survives the schema redesign — provided the public DTO is the only consumer-facing surface and customer surfaces never touch `menu_items` directly. That contract is currently held by `get-published-menu.service.ts` in catalog; Phase 04 must update the public DTO once, and Phases 05/06 inherit changes by reading the typed `@resto/api-client` types. Cleanly enforced.

---

## Findings (severity-classified)

### HIGH — must address before `/gsd:plan-phase` runs

#### H1. D-10 "5s undo" backend capability is asserted, not designed

**Evidence:**
- `apps/api/src/contexts/catalog/application/publish-menu.service.ts:13-20` — entire publish service is `versions.bump(tenantId)`. No snapshot stored. No previous-version pointer.
- `apps/api/src/contexts/catalog/domain/ports.ts:28-31` — `MenuVersionPort` exposes only `current()` / `bump()`. No `revertTo(version)`.
- `packages/events/README.md:38` — `catalog.menu_published.v1` already documented as an emitted event.

**Why HIGH:** Three concrete problems the planner needs a decision on before writing tasks:
1. **No snapshot to revert to.** "Published menu" is the live state of `menu_items.status = 'published'`; rolling back requires either (a) introducing an immutable `menu_snapshots` table (Drizzle migration, new repo methods, snapshot-on-publish path, snapshot-on-read switch), or (b) holding the publish in a 5s "pending" window before the version bump (simpler — but then the toast is fake; nothing was published yet).
2. **The outbox event already fired.** If we picked option (a), the `catalog.menu_published.v1` envelope has already been written to outbox by the time the user clicks Undo. Walking back an outbox event that may already have been dispatched to NATS subscribers (audit, cache invalidators, future POS push) is a distributed-systems landmine. Compensating events (`catalog.menu_publish_reverted.v1`) are the only clean answer and have to be designed now.
3. **Redis cache version key.** Bumping version invalidates cache; reverting means either bumping again (so cache cold-starts twice for one user action) or restoring the pre-bump key (impossible after evict).

**Required of plan:** Pick option (a) snapshot-table or option (b) delayed-publish. If (b), strongly recommended — far less complexity, no outbox-rollback problem. Document the choice in PLAN.md with explicit cache + outbox sequence diagram.

#### H2. Scope of Phase 04 is now ~2× original, with no split point

**Evidence:**
- `.planning/REQUIREMENTS.md:77-86` — CAT-01..CAT-10 (10 reqs, originally scoped as "CRUD UX over existing schema")
- `04-CONTEXT.md:11-17` — phase now also owns schema redesign + DTO + public surface
- `PROJECT.md` Constraints: "Solo founder on the 12-month roadmap horizon. Phase sizing accommodates solo throughput"

**Why HIGH:** A schema reshape touching `menu_items`, `menu_variants`, `menu_modifiers` (rename to `modifier_groups`?), `menu_modifier_options`, plus new tables (sizes, stop_list, нutrition) is itself a multi-day data-model phase. Layering 10 CRUD requirements + admin UI + publish flow + undo on top means one of two outcomes: (i) phase slips by 50-100%, eroding the Q1 2027 paying-customer milestone, or (ii) the admin UI is rushed against a not-quite-stable schema, requiring rework in Phase 05/06.

**Recommendation:** Split into:
- **Phase 04a** — Schema redesign + API DTO updates + `/v1/menu` shape update + migration. Output: stable schema + green types in `@resto/api-client` + integration tests proving Public read path works. Single PR, single user verification.
- **Phase 04b** — Admin UI CRUD + publish flow + stop-list + undo. Output: operator can manage menu end-to-end.

The user has zero paying customers — breaking 04a/04b boundary explicit is cheap NOW. After the first paying tenant lands, this split is mandatory because schema migrations get a 30-min downtime window instead of `db:reset`.

#### H3. Researcher gates must produce `04-SCHEMA-MAP.md` and a migration script sketch BEFORE planner runs

**Evidence:**
- `04-CONTEXT.md:26-49` — researcher's mandate exists in CONTEXT but is "guidance," not a gate.
- Existing schema already has composite FKs and `tenant_id` discipline (`packages/db/src/schema/menu.ts:81-103`) — losing that during reshape is a regression vector.

**Why HIGH:** Without a concrete `04-SCHEMA-MAP.md` (iiko entity → RestOS entity → field-by-field delta) and a sketch of the migration SQL **before** planner produces tasks, the planner will estimate tasks against an undefined target. The planner cannot estimate "add сategory hierarchy support" without knowing whether researcher recommends adjacency-list (`parent_id`), nested-set, materialized-path, or `ltree`. Each has different query patterns, RLS implications, and admin-UI consequences.

**Required of plan:** Add an explicit `04-SCHEMA-MAP.md` deliverable to RESEARCH.md output. Planner refuses to advance without it. Schema-map must include: (a) iiko entity → RestOS proposed entity table, (b) field-level diff (added/removed/renamed columns), (c) composite-FK declaration for every new child table, (d) RLS enable+force on every new tenant-scoped table, (e) a one-page migration plan with rollback strategy (data preservation acceptable to lose since no paying tenants).

---

### MED — should address during planning

#### M1. Hierarchical categories decision changes the admin IA, not just the schema

**Evidence:** `04-CONTEXT.md:36, 47` — researcher may recommend hierarchical Группы; if so D-01 (sidebar) + D-02 (Items table) need revision.

**Why MED:** This is correctly flagged in CONTEXT but the planner needs an explicit pre-decision branch: "IF researcher recommends hierarchical → emit a /gsd:discuss-phase delta on D-01/D-02 BEFORE finalising plan." Without that branch, the planner may freeze the UX before the data model is final.

**Recommendation:** Add to plan-phase prompt: "After RESEARCH.md is approved, if SCHEMA-MAP introduces hierarchical categories, return to discussion phase for D-01/D-02/CAT-08 reconciliation."

#### M2. Sizes-as-entity vs variants-embedded has downstream Phase 7 cost

**Evidence:** `04-CONTEXT.md:38` — open question.

**Why MED:** If researcher recommends iiko's reusable-size model (`Размер` as a top-level entity referenced by many items), cart lines (Phase 7) and order lines must carry `(itemId, sizeId)` not `(itemId, variantId)`. POS adapter (Phase MVP-3) will be simpler. The decision must be made now because order_lines schema lands in Phase 7 and changing it later means a second migration.

**Recommendation:** Researcher explicitly takes a position with rationale. If reusable-sizes wins, the migration includes the join table now (even if Phase 04 admin UI ships with "one-size-per-item" assumption — the schema seam is the load-bearing part).

#### M3. Stop-list as runtime state must NOT bump the menu version

**Evidence:** `04-CONTEXT.md:75-79` (D-11) — "Stop-list (86'd) — published мгновенно (не требует publish-flow)".

**Why MED:** If the implementation toggles `menu_items.status = '86'` (one of the badges in `<specifics>`) and writes through `ScopedTx`, that's a status mutation on the canonical row — but the publish version isn't bumped, so Redis cache returns stale data showing the item as available. Either: (a) `stop_list` is a separate table queried in the read path overlay (correct — keeps published menu immutable conceptually), or (b) toggling stop bumps the version (correct but expensive — every stop = every customer cold-cache hit).

**Recommendation:** Researcher specifies stop-list as a separate table OR a nullable `stopped_at` column on `menu_items` AND the cache key is `(tenantId, version, stopListHash)` OR the cache has a per-tenant short TTL (e.g., 30s) for stop-list responsiveness. Plan PUBLISH path and STOP-LIST path differently. Composite FK on stop_list (or `stopped_at` index) still applies.

#### M4. Outbox + undo interaction needs an explicit ADR-style decision

**Evidence:** `04-CONTEXT.md:147` — "Publish flow … existing publish-menu.service.ts ВЕРСИОНИРУЕТ snapshot. Undo (5s window) требует 'set published_version_id = previous'". This phrasing implies snapshot exists; it does not.

**Why MED:** Even if we go with "delayed publish" (option (b) from H1), the audit context (and any future subscriber) needs to know whether `catalog.menu_published.v1` fires at button-click or at end-of-5s-window. If at end-of-window, the user's perception is "published instantly" but the audit log timestamp lags 5s. If at click, the event needs a compensating event for undo.

**Recommendation:** Plan explicitly states: "publish event fires at end-of-undo-window; UI optimistically shows 'published' for 5s with toast." This keeps the outbox model simple, no compensating event needed. Document this in the plan as the load-bearing assumption.

#### M5. Composite-FK rule applies to every new entity — call it out as a planner checklist item

**Evidence:** ADR-0020 I-2 invariant; `packages/db/CLAUDE.md` Schema Rules.

**Why MED:** New entities the researcher will propose (`sizes`, `stop_list`, `modifier_groups` renamed, `recipe_ingredients` if ТТК lands) all require `(parent_id, tenant_id) REFERENCES parent(id, tenant_id)` composite FKs. The current schema (`menu.ts:86-90, 132-136, 197-201, 233-242`) is rigorous; planner must propagate this discipline. A checklist item in PLAN.md ensures it's not skipped under deadline pressure.

**Recommendation:** Plan acceptance criteria for every new table include: (1) RLS enabled + forced, (2) composite FK to parent + tenant, (3) `tenantParentUniqueIndex` declared, (4) `tenant-isolation.spec.ts` entry added.

#### M6. The "instant publish + undo" UX is at odds with audit / business-event timing

**Evidence:** D-10 promises "правка цены → save → publish" as the typical flow.

**Why MED:** Restaurant pricing changes have downstream consequences (Stripe quotes, POS sync, analytics). If a single click + 5s window mutates the published menu and emits `catalog.menu_published.v1`, an operator who fat-fingers a price will see customer orders at the wrong price for ~5s after undo + republish if the customer surfaces don't roll back atomically. Phase 04 is the only chance to plant the right semantics: undo must complete BEFORE any external system reacts.

**Recommendation:** Reinforce option (b) — publish event fires only after 5s. UI shows local "published" state during the window. This matches the operator's mental model AND keeps the outbox correct.

---

### LOW — note for execution

#### L1. Multi-language deferred but `LocalizedText` writes default-locale only

**Evidence:** D-05; current schema `menu.ts:38` stores `name jsonb LocalizedText`.

**Why LOW:** Just a code convention: the admin form writes `{ ru: input.name }` (or whichever default), not `input.name`. Easy to miss; one place in `EditItemFormClient` to enforce. Add to plan as a code-review checklist item.

#### L2. Publish bar positioning — sticky bottom of content vs viewport-fixed

**Evidence:** CONTEXT discretion list; D-09.

**Why LOW:** Next.js 16 app router + Tailwind 4 handles both with `sticky bottom-0` or `fixed bottom-0`. No technical conflict with shadcn or RSC; this is purely UX. Discretion stays with execution agent.

#### L3. `react-dropzone` vs native HTML5 for photo upload

**Evidence:** CONTEXT discretion list.

**Why LOW:** Native HTML5 drag-drop in 2026 is well-supported; `react-dropzone` adds 6KB. For 1 photo per item with no batch behaviour, native is fine. Save the dependency.

#### L4. Status badge variant choices conflict slightly with shadcn defaults

**Evidence:** `04-CONTEXT.md:164` — "modified = warning-yellow outline" is not a stock shadcn Badge variant.

**Why LOW:** `Badge` in shadcn (new-york / neutral) has `default`, `secondary`, `destructive`, `outline`. "Modified yellow" needs a one-line custom variant via `class-variance-authority` in `components/ui/badge.tsx` — easy, but not zero work. Add to execution checklist.

#### L5. Audit-context dependency for new events

**Evidence:** `04-CONTEXT.md:152` — "audit context subscribes; catalog.item_stopped.v1, catalog.item_unstopped.v1".

**Why LOW:** Audit context already subscribes to all NATS subjects (per project ARCHITECTURE.md). Adding new event subjects means: (a) define contract in `packages/events/src/contracts/catalog.ts` (or whichever file holds catalog contracts), (b) wire publishing via `buildEnvelope` + outbox, (c) confirm audit handler picks them up via `runDeduped`. All known patterns; no new infra. Just confirm contract file exists and append.

---

## Recommendations to Orchestrator

1. **Run researcher BEFORE planner** with a mandatory `04-SCHEMA-MAP.md` deliverable. Planner refuses to start until that document is present and the user has reviewed it. (This is the H3 gate.)

2. **Recommend splitting Phase 04 into 04a (schema + API) and 04b (admin UI)** during plan-phase. User decides — but the planner surfaces this as the default split. (H2.)

3. **Force a decision on D-10 mechanics during plan-phase.** Two options: snapshot-table (complex) or delayed-publish (simple). My recommendation as CTO: delayed-publish. The toast says "Published" for 5s but the actual publish event fires only after the window. This is honest with the outbox, honest with the audit log, honest with subscribers, and zero compensating-event complexity. The user perceives "instant" because the UI shows published state immediately. (H1, M4, M6.)

4. **Schema-map decisions that ripple into Phase 7 (Ordering) and MVP-3 (iiko adapter) get a one-line "downstream consequence" annotation in `04-SCHEMA-MAP.md`.** Specifically: sizes-as-entity flows into order_lines; modifier-group rename flows into cart-line modifier reference; nutrition fields flow into qr-menu filters. Make those downstream notes visible to future-self. (M2.)

5. **Stop-list semantics decided in plan-phase, not deferred to execution.** Either separate table + read-path overlay, or status field with short cache TTL. (M3.)

---

## What I Did NOT Review

- `apps/admin/` current UI components — I trust D-01..D-13 captures the intent and shadcn primitives are already wired (per CONTEXT `<code_context>`). UI-quality review is the product-strategist's lens, not mine.
- `apps/qr-menu/` and `apps/website/` consumer code — Phase 05/06 problem; reviewed only at the `/v1/menu` contract surface.
- iiko actual API docs — I deferred to the researcher's mandate per CONTEXT; my findings assume the schema-map will be produced before planning.
- Performance/load — no benchmarks reviewed. Public menu read path is well-cached and has been operational; redesign should not degrade it but plan must include a regression test.
- Permission model — assumed `staff:menu:write` / `staff:menu:publish` tokens exist or will be added per CONTEXT note; not verified here.
- ADR-0020 invariants in detail — confirmed they ARE the law of the land (per packages/db/CLAUDE.md, packages/CLAUDE.md), did not re-read the ADR itself.

---

**Bottom line:** The phase has the right ambition (align with iiko early when migrations are free) and the right architectural seams (extend existing catalog context, ScopedTx + RLS already correct, public DTO is the contract boundary). The risks are entirely about scope, sequencing, and one under-specified backend capability (undo). All three are addressable in plan-phase. Strong recommend: **researcher-gates + 04a/04b split + delayed-publish for undo**. Then this phase ships cleanly.
