# Phase 4b: Catalog Admin UI - Context

**Gathered:** 2026-05-31
**Status:** Ready for `/gsd:ui-phase 4b` (UI-SPEC.md), then `/gsd:plan-phase 4b`
**Parent reviews inherited:** `../04-catalog-admin/PERSONA-REVIEWS.md` (4 personas, 14 HIGH / 16 MED / 9 LOW reviewed on the pre-split Phase 4 — decisions below honor or explicitly reject each HIGH).

<domain>
## Phase Boundary

**`apps/admin` CRUD UX over the 4a-finalized catalog schema.** Backend (schema, services, public `/v1/menu`, HTTP endpoints, OpenAPI drift-gate) is DONE in 4a — this phase is **frontend-only**: Next.js 15 RSC pages, server actions, shadcn/ui composition, form clients.

**Surfaces delivered:**

1. Sidebar `Menu` expandable group with sub-routes: Categories / Items / Modifier Groups / Stop-list.
2. Categories CRUD page (2-level hierarchy support — indented flat list, see D-4b-01).
3. Items list (compact table) + full-page item editor (`/dashboard/menu/items/[id]`) with tabs `Detail` / `Sizes` / `Modifiers`.
4. Modifier groups CRUD page (`/dashboard/menu/modifier-groups`) + assignment UI inside item editor's Modifiers tab.
5. Stop-list: inline switch in items row + "Today's 86" dashboard widget + stale warning at >24h.
6. Draft / Publish flow: auto-save-draft (1.5s debounce) + explicit Publish button + status badges + sticky publish bar + 5s Sonner undo toast for delayed-publish.

**Out of scope:**

- Customer-facing surfaces (`apps/qr-menu` polish → Phase 6; `apps/website` → Phase 5).
- Schema or API changes (locked in 4a; if 4b discovers a gap, surface as deferred — do NOT extend schema in 4b).
- AI assistant in admin (MVP-2).
- Multi-photo gallery, multilingual editor, bulk operations, recipe/ТТК, auto-reset cron, reason-on-stop-list, confirm modal on publish (all deferred per parent CONTEXT).

</domain>

<decisions>
## Implementation Decisions

### Inherited (from `../04-catalog-admin/04-CONTEXT.md`, unchanged after 4a)

- **D-01:** Sidebar `Menu` expandable group (collapsed by default) with sub-routes `Categories` / `Items` / `Modifier Groups` / `Stop-list`. One top-level entry, hierarchy expands inline.
- **D-02:** Items default view — compact table with 48px thumbnail + name + category + price + status + actions. Header has Category/Status filters + search box. Card grid rejected (200+ items scan poorly).
- **D-03:** Default filter — all statuses except `archived` (draft + published + paused/86'd visible). Archived available via explicit filter. Sort by `sortOrder` then category.
- **D-04:** Item editor — full page at `/dashboard/menu/items/[id]` (and `/new`). Click row in table → page navigation. Sheet/modal rejected (too many fields, deep-link suffers).
- **D-05:** Single-locale MVP-1. `LocalizedText` DTO stays but UI writes only default-locale. Multilingual tabs deferred.
- **D-06:** Structured БЖУ — 4 nullable numeric fields (proteins / fats / carbs / kcal) per 100g + `nutrition_estimated` indicator (4a added this flag — UI surfaces it as a small "AI-estimated" badge next to БЖУ when true).
- **D-07:** Single-photo MVP-1. Schema is `photos JSONB[]` (locked in 4a as D-4a-02). UI uses `photos[0]` only; "Add more photos" greyed out with "v2" tooltip. Drag-drop + click-to-browse for upload; preview thumb after upload; "Change photo" replaces `photos[0]`.
- **D-09:** Status badges + sticky publish bar. Badges: `draft` (outline-secondary), `modified` (yellow outline), `published` (default), `paused` / `стоп` (secondary, NOT destructive — GM MED-1), `archived` (ghost). Sticky bar shows "N unpublished changes • [View list ▾] [Publish ↑]"; clicking "View list" expands inline list.
- **D-11:** Stop-list ≠ Archive. Stop-list = runtime-state toggle (publishes immediately, no draft/publish dance); Archive = `status: archived` in draft, requires publish.
- **D-12:** Stop-list toggle — inline switch in items table `Stop` column + "Today's 86" dashboard widget with `Reset all` button. Click switch = instant publish (no confirm).
- **D-13:** Stop-list reset is **manual only**. No auto-reset cron. (Schema has nullable `reason` and `stopped_by_user_id` from 4a but MVP-1 UI is plain on/off — fields stay nullable in payloads.) Stale-stop-list warning surface at >24h (Skeptic MED — small "Stop active for 36h" banner next to badge).
- **GM MED-1 (badge copy):** `Paused` / `Стоп` (not `86'd`). Russian is canonical for MVP-1 single-locale.

### Revised / new in 04b (this session, 2026-05-31)

- **D-4b-01 (Hierarchical categories — 2 levels max, supersedes IA assumptions in D-01/D-02):** 4a added nullable `menu_categories.parent_id` (composite tenant self-FK), so the schema supports trees. UX commits to **2 levels max** for MVP-1 (e.g., `Напитки → Горячие/Кофе/Чай`).
  - **Categories page:** indented flat list (1-level visual indent for children). Plain CRUD (create / edit / delete / reorder). Drag-drop reorder is _Claude's discretion_ (skip-acceptable for MVP-1; sort via integer `sortOrder` field + up/down buttons is the safe baseline).
  - **Sidebar:** stays the way D-01 described — flat `Menu` expandable group with 4 sub-routes. No category tree in sidebar.
  - **Items filter:** category dropdown with indented options (`Напитки`, `↳ Кофе`, `↳ Чай`). No tree-picker UI.
  - **Item editor category selector:** same indented dropdown.
  - **Deeper-than-2 nesting:** schema permits, UX does NOT — frontend Zod validation enforces `depth <= 2`. Revisit at v2 if real demand surfaces.

- **D-4b-02 (Auto-save-draft + explicit Publish, supersedes D-08):** Per Product Strategist HIGH-2 — auto-save on field blur / 1.5s debounce. Indicator in top-right of editor: `Saved 2s ago` / `Saving…` / `Failed to save — retry?`. Publish remains a separate explicit action via sticky bar. No `beforeunload` warning needed (state is persistent). Aligns with MVP-2 AI flow ("AI generates → operator edits → publishes"). Original explicit `Save draft` button removed.

- **D-4b-03 (Delayed-publish UX, wires D-4a-05 backend):** Click `Publish` in sticky bar → POST `/internal/v1/catalog/publish` → DelayedPublishService schedules 5s timer.
  - **UI:** Sonner toast bottom-right with **linear countdown progress bar** + `Undo` button.
  - **Undo within 5s:** click `Undo` → DELETE `/internal/v1/catalog/publish` → toast replaced with `Publish cancelled` (default Sonner success-style, ~2s auto-dismiss).
  - **Timer elapses:** toast replaced with `Published` (plain success-style; no celebration variants — see D-4b-06).
  - **Re-click protection:** `Publish` button is **disabled** while a timer is active for the current tenant; tooltip explains "Publishing in 5s — undo first to reschedule." Backend `DelayedPublishService.schedule` _can_ cancel-and-reschedule, but the UI hides that capability to prevent toast-spam ambiguity.
  - **Network failures:** if POST `/publish` returns non-2xx → error toast, sticky bar stays in dirty state. If DELETE `/publish` after the 5s window returns "already published" → success toast `Publish cancelled (just missed)` is NOT used; instead show `Already published — undo window expired.` and keep the new published state.

- **D-4b-04 (Sizes editor location):** Tab `Sizes` inside item editor (consistent with D-04). Each size is an inline row: `[Name]` `[Price (absolute, in tenant currency)]` `[Default ●]` `[× remove]`. `+ Add size` button below the list. Empty state: "No sizes — item uses base price." Saving a size = same auto-save behavior as the rest of the editor (D-4b-02). Note: 4a renamed `variants → sizes` with **absolute price semantics** (not delta) — UI labels reflect that ("Цена" not "Доплата").

- **D-4b-05 (Modifier groups editor location):** Two-surface model.
  - **Top-level CRUD page** at `/dashboard/menu/modifier-groups`: list table (name + min/max selectable + option-count + usage-count) + full-page editor for a single group with inline `Options` list (each option carries `name`, `priceDelta`, `default_amount`, `free_amount` per 4a iiko alignment). Modifier groups are reusable across items — operator manages the library here.
  - **Item editor `Modifiers` tab:** multi-select / chip-picker of existing modifier groups + reorder for the item's `modifierGroupIds[]`. New groups can be opened in a side-sheet quick-create (which redirects to the top-level editor on save) — but the primary creation path is the dedicated page.

- **D-4b-06 (NO first-publish celebration, NO "Preview as customer" link in 04b):** Explicitly rejected GM HIGH-1 and GM HIGH-3 in this discussion. Reasoning:
  - qr-menu is itself in placeholder state until Phase 6; `apps/website` (the real customer surface) is Phase 5.
  - Pre-paying-customer "celebration toast" has no audience.
  - Activation funnel tracking (Phase 13/14) is far future; backend already emits `MenuFirstPublishedV1` so the data lands regardless of UI.
  - Re-evaluate at Phase 5 when there's a real storefront to preview.

### Inherited persona decisions (held — no challenge in 04b session)

- Phase split into 4a (backend) + 4b (UI) — CTO HIGH-2 + Skeptic HIGH-4 convergence honored ✓
- 4-persona reviewer set covers MVP-1 catalog ✓ — 04b does NOT spawn a fresh persona round. Net new 04b decisions (D-4b-01..D-4b-06) are mechanical UX wiring on top of locked parent decisions; the parent review already addressed scope, architecture, growth, and product-fit. The user-requested `Per-memory feedback_persona_agents_in_discuss` rule of "spawn CTO + skeptic on every discuss-phase" is explicitly exempted here because the parent's persona pass covered the same surface area; if 04b research surfaces new risks, those can spawn personas at planning time.

### Claude's Discretion

- Exact shadcn component variants (Badge variants for `paused`/`modified`, Sheet variant for quick-create modifier group).
- Drag-drop library for category reorder if implemented (vs simple up/down buttons — both acceptable; pick the smaller surface).
- Sonner timing variants (Sonner already in shadcn pack).
- Form library inside `*-form-client.tsx` files (react-hook-form is the established pattern from Phase 02/03).
- Sticky publish bar exact positioning (bottom of viewport vs sticky bottom of content area — both acceptable).
- Photo upload component (react-dropzone vs native HTML5 `<input type="file">`).
- "Stop active for >24h" warning copy and exact styling (small Badge or inline-text helper — designer's call inside `/gsd:ui-phase 4b`).
- The "category depth ≤ 2" enforcement: Zod `.refine(...)` on category-create payload AND a disable-state on the parent-select dropdown when picking a category that's already a child. Either or both — pick whatever Yields better forms.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 4a foundation (locked schema + services + events — read first)

- `.planning/phases/04a-catalog-schema-api/04a-CONTEXT.md` — backend decisions D-4a-01..D-4a-10 (source/photos[]/БЖУ/slug/delayed-publish/first-vs-republish/Redis fallback/OpenAPI gate/public DTO)
- `.planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md` — iiko entity ↔ RestOS entity mapping table; canonical naming
- `.planning/phases/04a-catalog-schema-api/04A-RESEARCH.md` — researcher's recommendations + pitfalls (Pattern 1-5)
- `.planning/phases/04a-catalog-schema-api/04a-VERIFICATION.md` — 19/19 must_haves verified; what's actually in the codebase
- `.planning/phases/04a-catalog-schema-api/04A-0{1,2,3,4,5,6,7}-SUMMARY.md` — per-plan summaries (read 06 + 07 for service + HTTP shapes)

### Parent persona reviews (inherited — no fresh round in 04b)

- `.planning/phases/04-catalog-admin/PERSONA-REVIEWS.md` — 4-persona aggregate (CTO / Skeptic / Product Strategist / Growth Marketer)
- `.planning/phases/04-catalog-admin/PERSONA-CTO.md` — architectural concerns (snapshot table, ADRs)
- `.planning/phases/04-catalog-admin/PERSONA-SKEPTIC.md` — YAGNI / over-engineering challenges
- `.planning/phases/04-catalog-admin/PERSONA-PRODUCT-STRATEGIST.md` — D-08 auto-save rationale (HIGH-2)
- `.planning/phases/04-catalog-admin/PERSONA-GROWTH-MARKETER.md` — badge copy MED-1; HIGH-1 (Preview link) + HIGH-3 (celebration) explicitly REJECTED for 04b — see D-4b-06

### Project artifacts

- `.planning/PROJECT.md` §"Catalog" — what's now validated (post-4a evolution)
- `.planning/REQUIREMENTS.md` §"Catalog Admin (CAT)" — CAT-01..CAT-08 (4b owns the admin UX side of CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-07, CAT-08; CAT-09 / CAT-10 closed in 4a)
- `.planning/ROADMAP.md` §"Phase 4b" — goal + 6 success criteria (auto-save + delayed-publish + stop-list + sidebar IA + badge copy)
- `.planning/phases/02-admin-shell/02-CONTEXT.md` — admin shell conventions (URL patterns, signed `resto.active_brand` cookie, `<EmptyState>` variants, sidebar conventions)
- `.planning/phases/03-auth-completion/03-VERIFICATION.md` — auth + RBAC foundations (PermissionsGuard, role tokens)

### Codebase entry points (admin app)

- `apps/admin/app/dashboard/(workspace)/` — current routed pages (Brands, Settings) — pattern for new `/dashboard/menu/*` routes
- `apps/admin/components/app-sidebar.tsx` — sidebar component; add `Menu` expandable group following phase-02 patterns
- `apps/admin/lib/api-server.ts:apiFetch` — server-only HTTP client (Phase 3 hardened: Set-Cookie forward → redirect order, parseSetCookie via split('=', 2))
- `apps/admin/components/ui/` — shadcn primitives already installed (Table, Sheet, Tabs, Badge, Button, Form, Switch, Sonner toast, Dropdown, Select)
- `apps/admin/lib/env.ts` — env access; no NEXT_PUBLIC fallbacks (apps/CLAUDE.md rule)
- Phase 03 form patterns: `*-form-client.tsx`, `*-action.ts` co-located with the page

### Codebase entry points (api — read-only for 4b)

- `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` — endpoints 4b will call (full list in 04A-07-SUMMARY.md)
- `docs/api/openapi.yaml` + `packages/api-client/src/generated/api.ts` — generated client types (4b uses these via `apiFetch`)
- `apps/api/src/contexts/catalog/application/dto.ts` — Zod DTOs (CAT-09 max-lengths are the source of truth — frontend Zod must match for forms)

### Codebase maps

- `.planning/codebase/STRUCTURE.md` — repo layout
- `.planning/codebase/STACK.md` — Next.js 16, React 19, Tailwind 4, shadcn new-york/neutral
- `.planning/codebase/CONVENTIONS.md` — naming (`*-form-client.tsx`, action files, `apiFetch` pattern)
- `.planning/codebase/ARCHITECTURE.md` §"`apps/admin`" — admin shell context

### apps-level rules (HARD constraints for 4b implementation)

- `apps/CLAUDE.md` — server-fetch must have `AbortSignal.timeout`; `INTERNAL_API_TOKEN` is server-only; static identity placeholders forbidden in shipping UI; no `NEXT_PUBLIC_*` production fallbacks; no source maps in production
- `.planning/PROJECT.md` §"Architecture" — admin imports only from `@resto/*` packages; no app-to-app imports

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`<EmptyState>` component (variants: `forbidden`, `empty`)** — perfect for empty items / categories / stop-list / modifier-groups lists.
- **`apiFetch` server-only HTTP client** — used for every server action that calls api; respects BA session cookie forward + redirect-after-Set-Cookie ordering (fixed in phase 03).
- **shadcn primitives already installed:** Table, Sheet, Tabs, Badge, Button, Form (with react-hook-form integration in workspace forms), Switch, Sonner toast, DropdownMenu, Select, Dialog (for confirms).
- **Sidebar pattern (`apps/admin/components/app-sidebar.tsx`):** existing `Dashboard / Brands / Settings` set — extend with collapsed-by-default `Menu` group containing 4 sub-routes per D-01.
- **`packages/domain` value-objects (`LocalizedText`, `Slug`, `MoneyAmount`, `CurrencyValue`)** — reuse in 4b client Zod schemas where forms validate before submission (mirror api-side DTOs for fast feedback; api remains authoritative).
- **Generated `@resto/api-client` types** — strongly-typed payloads / responses for every endpoint 4b consumes (regenerated in 4a per D-4a-08; `pnpm openapi:check` keeps them honest).

### Established Patterns

- **Server actions per mutation** (`*-action.ts`): create-category-action, update-category-action, delete-category-action, upsert-item-action, toggle-stop-list-action, schedule-publish-action, cancel-publish-action, upsert-modifier-group-action, upsert-modifier-option-action, upsert-item-size-action.
- **`*-form-client.tsx`** for interactive forms: `EditItemFormClient` / `EditCategoryFormClient` / `EditModifierGroupFormClient`. Form state managed by react-hook-form; submit calls server action.
- **Auto-save debounce** is NEW for 4b (no prior precedent in admin). Use react-hook-form's `watch()` + `useEffect` + 1.5s setTimeout pattern. Cancel + reschedule on each watched-change; submit on timer fire.
- **Sticky publish bar:** new component; lives in dashboard layout when on a `/dashboard/menu/*` route. Reads "unpublished count" from a server component that queries the api's `/internal/v1/catalog/draft-diff` (verify endpoint exists from 4a; if not, surface as plan-time research item).
- **Sonner toast for delayed-publish countdown:** custom toast component with `useEffect` interval driving a CSS-only `width` transition. Sonner's `t.duration` doesn't expose mid-flight cancellation cleanly, so the toast holds its own `setTimeout` cancellable handle.

### Integration Points

- **api → admin via apiFetch:** every catalog mutation goes through `internal-catalog.controller.ts` endpoints. 4b enumerates them from the generated client.
- **PermissionsGuard tokens:** catalog actions require `staff:menu:write` / `staff:menu:publish` permissions (verify they exist in SYSTEM_ROLES — research item; if missing, surface to planner).
- **Audit trail:** every mutation in 4b produces an audit row via the api's existing flow (4a wired audit ACTION*TARGET_KIND for `catalog.menu*\_`and`catalog.item\_\_` events). No 4b work — confirm at verification time.
- **Stop-list cache invalidation:** 4a's `StopListService` already calls `CatalogCachePort.invalidate(...)` after write. 4b just wires the UI; cache behavior is transparent.

</code_context>

<specifics>
## Specific Ideas

- **Auto-save indicator copy:** `Saved <relative-time>` (e.g., "Saved 2s ago", "Saved 1m ago"). Failure: `Couldn't save — retry?` with retry-button. Use `react-time-ago` style or a 60s-resolution string-formatter (Claude's discretion).
- **БЖУ row layout in Detail tab:** single line under price — `[Б 0.0]` `[Ж 0.0]` `[У 0.0]` `[ккал 0]`. Helper text "на 100 г". When `nutrition_estimated = true`, show a small `AI-оценка` badge next to the BJU group.
- **Status badge colors (revisit at `/gsd:ui-phase 4b`):** `draft` = outline, `modified` = warning-yellow outline, `published` = default (success), `paused` (стоп) = secondary (NOT destructive — GM MED-1), `archived` = ghost.
- **Sticky publish bar copy:** "**N неопубликованных изменений** • [Показать ▾] [Опубликовать ↑]". Clicking "Показать" expands an inline list of changed items/categories grouped by entity type.
- **Items table category column:** display category name with the parent prefix when child (`Напитки → Кофе`). Operator visual hierarchy without a separate breadcrumb column.
- **Modifier group editor — options inline:** each option row carries `[name]` `[priceDelta]` `[default_amount]` `[free_amount]` `[× remove]`. Default + free amounts are iiko fields (4a D-4a iiko alignment); MVP-1 surfaces them but most operators will leave them 0.

</specifics>

<deferred>
## Deferred Ideas

### Phase 5 — Customer Site (apps/website)

- **"Preview as customer" link from admin to live storefront** — Growth Marketer HIGH-1; explicitly out of 04b per D-4b-06. Resurfaces naturally when apps/website ships.
- **First-publish celebration / activation moment** — Growth Marketer HIGH-3; explicitly out of 04b per D-4b-06. Belongs to Phase 5+13/14 funnel work when there's a real customer surface and an analytics layer.

### Phase 6 — QR-menu polish

- QR-menu styled UI surfacing new fields (БЖУ filters, photo carousel, modifier-group selector with default_amount + free_amount UX).

### v2 (post first paying customer)

- **Multi-photo gallery editor** (schema is ready as `photos JSONB[]` — UI adds carousel + reorder + multi-upload).
- **Multilingual editor** (LocalizedText supports it; add locale tabs in editors).
- **3+ deep category nesting** (schema permits; relax `depth <= 2` Zod refine if real demand surfaces).
- **Bulk operations** (mass-raise prices, archive whole category, bulk stop-list toggle).
- **Auto-reset stop-list cron** at tenant-local 03:00 (D-13 stays manual until operator feedback says otherwise).
- **Stop-list reason field UI** (schema columns `reason` + `stopped_by_user_id` exist nullable from 4a; UI is plain toggle in MVP-1, add reason input + "stopped by" attribution in v2).
- **Confirm-modal before publish** (current 5s undo replaces this; revisit if a real "accidentally published draft" incident happens).
- **Recipe / ТТК entity** (full iiko Технико-Технологическая Карта with ingredients + cost breakdown + yield).
- **Drag-drop reorder for categories** (acceptable to skip in MVP-1; add when ergonomics demand it).
- **Slug history UI** (alias table is populated automatically by 4a's UpsertItemService; admin doesn't need to surface it unless operator asks).

### Reviewed Todos (not folded)

None — `gsd-sdk query todo.match-phase 04b` returned `matches: []` despite `todo_count: 1` (no overlap with 04b scope).

</deferred>

---

_Phase: 4b-catalog-admin-ui_
_Context gathered: 2026-05-31_
