# Phase 4b: Catalog Admin UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `04b-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 4b-catalog-admin-ui
**Areas discussed:** Hierarchical categories UX, Auto-save vs explicit Save, 5s undo toast UX, Sizes + Modifier groups location

---

## Pre-flight context

Loaded:

- `.planning/PROJECT.md` (post-4a evolution)
- `.planning/phases/04-catalog-admin/04-CONTEXT.md` (pre-split D-01..D-13)
- `.planning/phases/04-catalog-admin/PERSONA-REVIEWS.md` (4 personas, 14 HIGH / 16 MED / 9 LOW)
- `.planning/phases/04a-catalog-schema-api/04a-CONTEXT.md` (backend foundation D-4a-01..D-4a-10)
- `.planning/phases/04b-catalog-admin-ui/04b-README.md` (split rationale + expected workflow)

`todo.match-phase 04b` → matches: [] (no folded todos despite count: 1).

Pre-split persona reviews inherited; no fresh persona round spawned for 04b (mechanical UX wiring; parent reviews covered architecture / scope / growth / product-fit). Memory rule "spawn CTO + skeptic on every discuss-phase" explicitly exempted with rationale in CONTEXT.md.

---

## Area 1 — Hierarchical categories UX (revises D-01 / D-02 IA assumptions)

**Context:** 4a added nullable `menu_categories.parent_id` (composite tenant self-FK). Original pre-split CONTEXT assumed flat categories — needed UX revision.

**Sub-question 1: How deep will categories actually nest in MVP-1?**

| Option                                    | Description                                                                                                | Selected |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| 1 level — effectively flat                | parent_id in schema (for iiko-import in MVP-3), but UI doesn't allow creating sub-categories               |          |
| 2 levels max (Напитки → Горячие/Кофе/Чай) | Realistic max for café/restaurant. Indented flat list, dropdown with indents, sidebar stays flat           | ✓        |
| 3+ levels — full tree                     | iiko-style. Requires tree-view UI with drag-drop, breadcrumb sidebar modes, tree-picker. Much more UX code |          |

**User's choice:** 2 levels max.
**Notes:** Schema permits deeper trees; frontend Zod refine enforces `depth <= 2`. Drag-drop reorder = Claude's discretion (skip-acceptable for MVP-1; baseline is integer `sortOrder` + up/down).

---

## Area 2 — Auto-save-draft vs explicit Save (revises D-08)

**Context:** Product Strategist HIGH-2 in PERSONA-REVIEWS recommended auto-save to align with MVP-2 AI flow. Original D-08 was explicit Save.

**Sub-question 1: How are draft changes saved?**

| Option                                                    | Description                                                                                                                                         | Selected |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Auto-save on 1.5s debounce + explicit Publish (PS HIGH-2) | Draft saves automatically on field-blur / debounce. "Saved 2s ago" indicator in top-right. Publish remains explicit via sticky bar                  | ✓        |
| Explicit Save + explicit Publish (original D-08)          | "Save draft" button + beforeunload warning. Simpler, predictable, but breaks MVP-2 AI flow (AI generates 50 items, operator visits each and Save's) |          |

**User's choice:** Auto-save.
**Notes:** No `beforeunload` warning needed (state is persistent). Original explicit "Save draft" button removed from D-08.

---

## Area 3 — 5s undo toast UX for delayed-publish (wires D-4a-05)

**Context:** 4a's `DelayedPublishService` is ready (5s in-memory timer + `cancel()`). UX needed wiring.

**Sub-question 1: Toast presentation?**

| Option                                                            | Description                                                                                                                       | Selected |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Sonner toast bottom-right, countdown progress bar + "Undo" button | 5s linear progress, auto-dismisses. Sonner already in admin (shadcn pack). Undo click → DELETE /publish, toast swaps              | ✓        |
| Modal-banner at bottom (sticky publish bar morphs)                | Sticky bar transforms to "Publishing in 5s… [Cancel]". More visually prominent but more code (publish-bar state machine coupling) |          |

**Sub-question 2: Re-click Publish behavior inside 5s window?**

| Option                                                   | Description                                                                                                         | Selected |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| Publish button disabled while timer is active            | Simple — no race, operator sees state in toast                                                                      | ✓        |
| Re-click cancels and reschedules (backend supports this) | DelayedPublishService.schedule already cancels-and-reschedules, but UX behavior less obvious — toast confusion risk |          |

**Sub-question 3 (originally proposed): First-publish celebration + Preview-as-customer link?**

User pushed back: "зачем нам это вообще". Discussion clarified:

- qr-menu is in placeholder state until Phase 6
- `apps/website` (the real customer surface) is Phase 5
- Pre-paying-customer "celebration toast" has no audience
- Activation funnel tracking (Phase 13/14) is far future

**User's choice:** Remove both — celebration AND mandatory Preview-as-customer link. Plain `Published` / `Publish cancelled` toasts. Re-evaluate at Phase 5.
**Notes:** Backend `MenuFirstPublishedV1` event still emits (data lands regardless of UI). GM HIGH-1 + GM HIGH-3 explicitly rejected for 04b, moved to deferred under Phase 5.

---

## Area 4 — Sizes + Modifier groups location

**Context:** 4a renamed `variants → menu_item_sizes` (absolute price) and `modifiers → menu_modifier_groups`. Where do they live in the UI?

**Sub-question 1: Sizes editor location?**

| Option                                                | Description                                                                                                           | Selected |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| Tab "Sizes" inside item editor (consistent with D-04) | Inline rows: [Name] [Price (absolute)] [Default ●] [× remove] + Add. Sizes are tied to item — logically live together | ✓        |
| Inline in Detail tab under price — no separate tab    | If sizes empty, show plain price. Form gets conditional (price OR sizes-list) — more complex                          |          |

**Sub-question 2: Modifier groups editor location?**

| Option                                                                                 | Description                                                                                                                      | Selected |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Separate sidebar section `/dashboard/menu/modifier-groups` + assignment in item editor | Modifier groups CRUD on their own page (reusable across items). Item editor's Modifiers tab uses multi-select of existing groups | ✓        |
| Only in item context (tab + inline create)                                             | No separate section. Hurts reuse — operator can't browse "all my groups" without finding an item that uses one                   |          |

**User's choice:** Sizes inside item editor tab; Modifier groups on their own page + assignment UI in item editor.
**Notes:** Two-surface model for modifier groups: top-level CRUD page is primary creation path; item editor offers quick-create via side-sheet but the dedicated page is authoritative.

---

## Claude's Discretion

- Exact shadcn variants (Badge variants for `paused` / `modified`, Sheet for quick-create modifier group)
- Drag-drop reorder library (or skip drag-drop, use up/down buttons) for category reorder
- Sonner timing variants
- Form library inside `*-form-client.tsx` files (react-hook-form is established pattern)
- Sticky publish bar exact positioning
- Photo upload component (react-dropzone vs native HTML5)
- "Stop active for >24h" warning copy + styling — designer's call inside `/gsd:ui-phase 4b`
- Category depth ≤ 2 enforcement mechanism (Zod refine OR disabled-parent dropdown OR both)

## Deferred Ideas

- **Preview-as-customer link** — Phase 5 (Customer Site) when there's a real storefront
- **First-publish celebration / activation moment** — Phase 5 + Phase 13/14 funnel work
- **QR-menu styled UI surfacing new fields (БЖУ filters, photo carousel, modifier-group selector)** — Phase 6
- **Multi-photo gallery editor** — v2 (schema ready)
- **Multilingual editor (locale tabs)** — v2
- **3+ deep category nesting** — v2 (schema permits, UX expand on demand)
- **Bulk operations** — v2
- **Auto-reset stop-list cron** — v2 (D-13 stays manual)
- **Stop-list reason field UI** — v2 (schema ready, plain toggle in MVP-1)
- **Confirm-modal before publish** — superseded by delayed-publish; revisit only after a real "accidentally published" incident
- **Recipe / ТТК entity** — v2 (iiko full Технико-Технологическая Карта)
- **Drag-drop reorder for categories** — Claude's discretion; can skip in MVP-1
- **Slug history UI** — v2 (alias table is auto-populated by 4a; UX surface optional)
