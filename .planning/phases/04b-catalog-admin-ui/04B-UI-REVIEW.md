# Phase 04b — UI Review

**Audited:** 2026-08-19
**Baseline:** `.planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md` (approved contract), cross-checked against `04b-01..09-SUMMARY.md` for intent
**Screenshots:** not captured — no dev server running on 3000/5173/8080; this is a static code audit
**Scope note:** Phase 04b shipped on Next.js App Router; `apps/admin` was migrated to Vite + React 19 + TanStack Router in Phase 07.6. All findings below are against the CURRENT code in `apps/admin/src/components/menu/**` and `apps/admin/src/routes/(protected)/$brandSlug/menu/**`. The leftover `apps/admin/app/` directory (Next-era) was not audited — it is dead code. Findings about the brand switcher and the orders surface are explicitly out of scope per the task brief and were not raised.

---

## Pillar Scores

| Pillar               | Score | Key Finding                                                                                                                                                                                                                                                                             |
| -------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Copywriting       | 2/4   | Two confirmed sites leak a raw HTTP status code (`"404"`, `"500"`) as the user-facing error message; the fully-translated not-found/load-failed copy sits unused in `ru.json`                                                                                                           |
| 2. Visuals           | 2/4   | "Paused" status renders in the alarming `destructive` (red) badge in two places, contradicting the shared `StatusBadge` component two files away; item editor lost its tabbed focal layout in favor of one long stacked-card scroll                                                     |
| 3. Color             | 2/4   | The phase's own named decision (GM-MED-1/D-09: stop-list pause is NOT destructive) is directly violated twice in shipped code                                                                                                                                                           |
| 4. Typography        | 3/4   | Menu-local usage is clean (2 sizes, 2 weights); shared `PageHeading` h1 uses `text-2xl` where spec declares `text-xl` for page titles                                                                                                                                                   |
| 5. Spacing           | 2/4   | The spec's own named touch-target exception (44px min for "stop-list switch column, action icon buttons in table rows") is missed at every site it names                                                                                                                                |
| 6. Experience Design | 1/4   | No error/pending route components anywhere in the app; a deleted/invalid item or group id silently renders as a blank untitled "new" form instead of a not-found state; the phase's signature auto-save UX was replaced by three different, inconsistent manual-save models on one page |

**Overall: 12/24**

---

## Top 3 Priority Fixes

1. **Deleted/invalid item or modifier-group id silently becomes a blank "new" editor instead of a not-found state** — `apps/admin/src/routes/(protected)/$brandSlug/menu/items.$id.tsx` and `modifier-groups.$id.tsx` never check `res.ok`/404 on the detail fetch; `item-editor-shell.tsx:70` (`isNew = currentItemId === 'new'`) treats any non-`'new'` id as an existing, editable record even when the fetch actually failed. An operator who follows a stale link or a deleted item's bookmark sees an empty form under that item's real id and can save into it, risking silent data corruption. Fix: check `result.ok` in both route components, and render the already-translated `menu.editor.notFound`/`notFoundDescription` and `menu.modifierGroups.groupNotFound`/`groupNotFoundDescription` `<EmptyState>` instead of falling through to the empty-form path.
2. **No error or loading state exists anywhere in the admin router** — `apps/admin/src/main.tsx:94-98` calls `createRouter({ routeTree, context, defaultPreload: 'intent' })` with no `defaultErrorComponent`/`defaultPendingComponent`, and none of the 6 menu route files (`items.tsx`, `items.$id.tsx`, `categories.tsx`, `modifier-groups.tsx`, `modifier-groups.$id.tsx`, `stop-list.tsx`) define their own. A transient API failure or slow network while opening any catalog page leaves the operator on a blank or frozen screen with no message and no retry — a direct violation of the apps/CLAUDE.md rule that "the error UI must offer a 'Try again' affordance." Fix: add a shared, Russian, retry-capable `errorComponent`/`pendingComponent` at the router root (or at minimum on the `/menu` layout route) reusing the `loadFailed` strings that already exist in `ru.json` but are currently unused.
3. **"Paused" (stop-listed) status renders in the destructive red badge in two places** — `apps/admin/src/components/menu/item-aside.tsx:8-14` (`STATUS_VARIANT.paused = 'destructive'`) and `apps/admin/src/components/menu/todays-86-widget.tsx:19` (`variant={isEmpty ? 'secondary' : 'destructive'}`). This directly contradicts the phase's own decision, correctly implemented and commented three lines away in `status-badge.tsx:8` ("`paused` is secondary (GM MED-1: must NOT render destructive)"). An operator opening an item's own page or the dashboard widget sees a routine "stopped selling this item" state painted as an alarming/destructive action, while the same item shows calm gray everywhere else (items table, stop-list table, sticky-bar diff list). Fix: change both to `'secondary'`, ideally by deleting the second hand-rolled `STATUS_VARIANT` map in `item-aside.tsx` and reusing the shared `<StatusBadge>` component instead.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

**What's right:** `ru.json`'s `menu.*` namespace is comprehensive and matches the UI-SPEC's Copywriting Contract close to verbatim — e.g. `menu.items.archiveDialogDescription` = _«Блюдо «{{name}}» будет скрыто из меню. Действие обратимо — снимите архивацию в фильтре статусов.»_ matches the spec's row-2 destructive copy exactly, and all primary CTAs (`+ Добавить блюдо`, `+ Создать категорию`, `Сбросить всё`, etc.) match. No hardcoded English UI text was found in any `components/menu/*.tsx` JSX (a targeted grep for literal capitalized English phrases in text nodes returned zero hits).

**Confirmed defects:**

- `apps/admin/src/components/menu/category-form.tsx:47` — on save failure, `setError(String(res.status))` renders the raw numeric HTTP status (e.g. `"409"`) as the field-level error text, alongside a separate, correct toast. The operator sees a bare number with no explanation.
- `apps/admin/src/components/menu/photo-upload.tsx:63` — same pattern: `setState({ kind: 'error', message: String(urlRes.status) })` when the presign-URL request fails.
- These two are the same bug shape in two independent files, not a one-off typo — worth a `friendlyCatalogError`-style helper applied consistently rather than ad hoc `res.status` fallbacks.
- `apps/admin/src/lib/i18n/messages/ru.json` — `menu.stopList.resetAllAriaLabel: "Сбросить весь стоп-листа"` (wrong case ending; should be «стоп-лист») and `menu.stopList.resetSuccess: "Стоп-лист сбросен"` (not a real word; correct past-passive form is «сброшен»). Low visibility for sighted users but a screen reader reads the aria-label verbatim.
- `menu.editor.notFound` / `notFoundDescription`, `menu.modifierGroups.groupNotFound` / `groupNotFoundDescription`, `menu.categories.loadFailed`, `menu.items.loadFailed` all exist with correct, on-brand Russian copy in `ru.json` but are never referenced by any component (`grep -rn "loadFailed|notFound|groupNotFound" src/components/menu src/routes` returns zero matches outside `photoUploadFailed`). This is copy that was written and translated but never wired — see Pillar 6 for the functional consequence.
- `apps/admin/src/lib/menu/catalog-errors.ts` — `friendlyCatalogError` is a dead, English-only file (`'Category not found.'`, `'Server error. Please try again.'`), unused anywhere in the current app (confirmed via repo-wide grep). Not user-visible today, but it is stale Next-era clutter contradicting the "all copy is Russian" contract if anyone ever wires it up as-is.

### Pillar 2: Visuals (2/4)

- **Status color inconsistency undermines hierarchy** — see Pillar 3; the same item shows a calm gray "Стоп" badge in `items-table.tsx`/`stop-list-table.tsx` but a red "destructive" badge on its own detail page (`item-aside.tsx`) and on the dashboard widget (`todays-86-widget.tsx`). This is as much a visual-hierarchy problem as a color-token problem: red is supposed to be reserved for genuinely destructive, rare actions (archive confirm), and its accidental reuse here dilutes the signal value red is supposed to carry elsewhere in the same UI.
- **Item editor lost its focal, tabbed layout** — `apps/admin/src/components/menu/item-editor-shell.tsx:114-156` renders `ItemDetailForm` as one long vertical stack of Cards (Basics → Sizes → Modifiers → Nutrition → Allergens → SEO) inside a two-column grid with a photo aside, instead of the spec's `Tabs` container (`Детали / Размеры / Модификаторы`, UI-SPEC "Item editor page" section). There is no `Tabs`/`TabsList`/`TabsContent` anywhere in `item-editor-shell.tsx`, `item-detail-form.tsx`, `item-sizes-card.tsx`, or `item-modifier-groups-card.tsx`. The page has no single focal point — it is a long scroll with six cards of near-equal visual weight, which is materially different from the spec's stated intent of three focused, switchable sections.
- **Undiscoverable interaction** — `apps/admin/src/components/menu/categories-table.tsx:42,272-278` implements a 600ms "hold over a parent row while dragging" gesture to nest a category, replacing the spec's up/down-button reorder. There is no instructional text, tooltip, or affordance anywhere in the row that hints this gesture exists; the only visual cue (`isPendingNestTarget` ring highlight) appears only after the operator has already been holding for 600ms mid-drag.
- **Pass:** icon-only buttons that were checked (`Pencil` edit, `X` remove-row, `MoreHorizontal` row actions) all carry `aria-label`; `StatusBadge` and `AutoSaveIndicator` (where used) also carry `aria-label`/`aria-live`.

### Pillar 3: Color (2/4)

- No hardcoded hex/`rgb()` colors found anywhere under `components/menu/` or the menu routes (clean token usage throughout).
- Accent (`variant="default"` → `--primary`) is applied consistently and only to the spec's declared elements: `Опубликовать меню` (`sticky-publish-bar.tsx:137`), the `+ Добавить …` / `Создать …` buttons across categories/items/modifier-groups pages, and the item/group editor Save buttons — no accent overuse found.
- **Confirmed, repeated violation of a named decision:** `item-aside.tsx:8-14` and `todays-86-widget.tsx:19` both map the `paused` status to the shadcn `destructive` (red) variant. The UI-SPEC's own Color section states explicitly: _"`paused` / Стоп → `secondary` → Muted grey fill → Operational pause — NOT destructive per D-09 / GM-MED-1"_, and the shared `status-badge.tsx:8-14` implements this correctly with an inline comment restating the rule. This is not a subjective color-taste issue; it is a direct, named-decision violation that appears twice, independently, meaning the two hand-rolled variant maps were never reconciled against the canonical one.

### Pillar 4: Typography (3/4)

- Font-size usage inside `components/menu/**` and the menu routes is clean: only `text-sm` (18 occurrences) and `text-xs` (20 occurrences) are used directly, both within the spec's declared Body/Label scale.
- Font-weight usage is clean: `font-medium` (5) and `font-semibold` (1), within the spec's ≤2-weight guidance.
- **One systemic deviation:** `apps/admin/src/components/page-heading.tsx:29` — `<h1 className="truncate text-2xl font-semibold leading-tight tracking-tight">` — renders every catalog page's `<h1>` at `text-2xl` (24px), while UI-SPEC's Typography table declares the page-level Display token as `text-xl font-semibold` (20px). `PageHeading` is a shared, app-wide component (not authored by 04b), so this is inherited rather than catalog-specific, but it is the literal h1 on every one of the five catalog pages this review covers (Categories, Items, Modifier Groups, Stop-list, Item/Group editors) and is the most visible typographic element on each. Scored as a minor, not blocking, deviation given its shared-component origin.

### Pillar 5: Spacing (2/4)

- General padding/margin/gap usage is clean and 8-point-scale-aligned throughout (`gap-2/3/4/6`, `px-4/6`, `py-1/2`, etc. — no stray odd values found). Arbitrary `grid-cols-[...]` and `w-[...px]` values (sizes/modifier-options row grids, table column widths) match the UI-SPEC's own explicit pixel contracts for those exact layouts — not a violation.
- **Confirmed touch-target violations at the exact two locations the spec names.** UI-SPEC's Spacing Scale "Exceptions" row states: _"Touch target minimum: 44px (`min-h-11`) — stop-list switch column, action icon buttons in table rows."_
  - Stop-list / stop-toggle switch: `items-table.tsx:250-258` and `stop-list-table.tsx:107-116` render a bare shadcn `<Switch>` with no enlarging wrapper. `apps/admin/src/components/ui/switch.tsx:20` sizes the default track at `h-[1.15rem] w-8` (≈18×32px) — well under 44px, and this is the single highest-frequency action an operator performs on this surface (86'ing an item mid-service).
  - Row action icon buttons: `categories-table.tsx:124-131` (edit `Pencil`), `items-table.tsx:262-273` (`MoreHorizontal` actions trigger), `item-sizes-card.tsx:235-245` (remove-row `X`) all use `<Button variant="ghost" size="icon">`. `apps/admin/src/components/ui/button.tsx:26` sizes `icon` at `size-9` (36px) — under the spec's 44px minimum for exactly this category of control.
  - This is a kitchen-tablet-facing surface per the audit brief and the project's own operating context; a 32×18px hit target for the most-used control on the page is a real usability risk, not a cosmetic nit.

### Pillar 6: Experience Design (1/4)

**Missing error/loading states (systemic):**

- `apps/admin/src/main.tsx:94-98` — `createRouter(...)` has no `defaultErrorComponent` or `defaultPendingComponent`. A repo-wide grep for `errorComponent`/`ErrorBoundary` across `apps/admin/src` returns zero hits. None of the 6 menu route files define a per-route `errorComponent` or `pendingComponent` either. A transient API failure or slow connection on any catalog page (Items, Categories, Modifier Groups, Stop-list, Item/Group editor) has no defined recovery UI — this directly contradicts apps/CLAUDE.md's "the error UI must offer a 'Try again' affordance" rule, and the `loadFailed` strings that exist for exactly this purpose in `ru.json` are unused.

**Confirmed not-found mishandling (data-risk level):**

- `apps/admin/src/routes/(protected)/$brandSlug/menu/items.$id.tsx:32-45` uses `useQuery` (not `useSuspenseQuery`) for the item detail fetch, and `apiFetch` (`apps/admin/src/lib/api-client.ts:42`) never throws on non-2xx — it resolves to `{ ok: false, ... }`. The component does `const item = isNew ? null : (itemResult?.data ?? null)` without ever checking `itemResult?.ok`. A 404 (deleted item, stale bookmark, mistyped id) is indistinguishable from "still loading" or "brand-new item" — the operator lands on a blank form. Worse, `item-editor-shell.tsx:70` computes `isNew = currentItemId === 'new'` from the URL param alone, so the form is NOT treated as new — `item-detail-form.tsx:100` will call `upsertItem(brandSlug, currentItemId, data)` against the original (non-existent) id on save, an upsert against a phantom id.
- The identical pattern exists in `apps/admin/src/routes/(protected)/$brandSlug/menu/modifier-groups.$id.tsx:23-29`.
- `ru.json` already has `menu.editor.notFound`/`notFoundDescription` ("Блюдо не найдено" / "Возможно, оно было удалено.") and `menu.modifierGroups.groupNotFound`/`groupNotFoundDescription` — matching UI-SPEC intent — sitting completely unused. This is strong evidence the not-found state was designed and even localized, then dropped during the port.

**Auto-save contract abandoned, replaced by three inconsistent save models on one page:**

- UI-SPEC's Auto-Save Indicator Spec (D-4b-02) and Copywriting Contract both state the item editor is "(auto-saved; no explicit save button)." The shipped `AutoSaveIndicator` component (`apps/admin/src/components/menu/auto-save-indicator.tsx`) and `useDebouncedAutosave` hook (`apps/admin/src/lib/menu/use-auto-save.ts`) both exist, are unit-tested in isolation, and are imported by **nothing** else in the app (confirmed via repo-wide grep — only their own spec files reference them).
- In their place, `item-editor-shell.tsx:103-112` renders an explicit `Создать`/`Сохранить` `Button` in the page header, enabled only when `isDirty`, submitted via `item-detail-form.tsx:111-136` (`form.handleSubmit` → `upsertMutation.mutateAsync`).
- Meanwhile `item-sizes-card.tsx:250-263` has its own, separate `Сохранить размеры` button with independent dirty-tracking, saving via a different mutation than the main form.
- Meanwhile `item-modifier-groups-card.tsx:93-120` saves chip add/remove **instantly**, no button, optimistic with rollback-on-failure.
- One page, three different persistence models, none of them the one the design contract specifies. An operator has no single, consistent answer to "did my change save?"

**Missing empty state on the most common page state:**

- `apps/admin/src/components/menu/stop-list-table.tsx` and `stop-list-aggregate-table.tsx` render a `<Table>` unconditionally — when `items`/`aggregateItems` is empty, the result is a bare header-only table, not the spec's `<EmptyState title="Стоп-лист пуст" description="Все позиции в меню сейчас доступны для заказа."/>`. `ru.json`'s `menu.stopList.title`/`titleDescription` hold this exact copy, verbatim, unused (confirmed: `grep -rln "EmptyState" components/menu routes/.../menu` does not include either stop-list file). Given a healthy restaurant's stop-list is empty most of the time, this is the common case, not an edge case.

**Categories archive action missing from the UI entirely:**

- `apps/admin/src/components/menu/categories-table.tsx` has no archive icon/action anywhere in the Actions column (only the edit `Pencil`), and no "Показать архив" toggle exists to reveal archived rows — `visible = localCategories.filter(c => c.status !== 'archived')` is a one-way filter with no way back in this UI. `archiveCategory` (`apps/admin/src/lib/queries/catalog.ts:242`) exists but is called from nowhere (confirmed via grep). An operator cannot archive, or recover a view of, a category from this surface at all, despite UI-SPEC's explicit table-column contract calling for an archive icon.

**Keyboard/interaction gaps:**

- `categories-table.tsx:221` — `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))` wires only a pointer sensor for drag-reorder-and-nest; no `KeyboardSensor` is configured. A keyboard-only operator has no way to reorder or nest categories at all — a regression from the spec's original up/down-button design, which was naturally Tab/Enter-operable.
- `items-table.tsx:260-304` — the row actions menu is a hand-rolled `role="menu"`/`role="menuitem"` `<div>` (substituted for Radix `DropdownMenu` per a documented Plan 06 test-tooling deviation), but ships with no outside-click and no `Escape`-to-close handling (confirmed: no `mousedown`/`keydown`/`Escape`/`onBlur` handler anywhere in the file). Once opened, it can only be dismissed by choosing one of its two items.

**Supporting signal — test coverage regression:** only two spec files reference anything in `components/menu` or `lib/menu` in the ported Vite app (`apps/admin/test/catalog-spa.spec.tsx` — a thin query-key/render smoke test — and the orphaned `use-auto-save.spec.ts` for now-dead code), versus the hundreds of behavioral tests the Next-era plans (04b-05..09 SUMMARYs) report shipping. This is consistent with, and likely explanatory of, why the gaps above (dead auto-save, dead not-found copy, dead archive action, unwired error states) survived the port undetected.

**needs_human_review:** actual contrast ratios, real focus order through the Sheet/Dialog/AlertDialog stack, and rendered behavior at 768px tablet width could not be verified from static code alone — these should be spot-checked in a browser against a running dev server before sign-off, in addition to fixing the findings above.

---

## Registry Safety

`components.json` is present (shadcn initialized). UI-SPEC's Registry Safety table lists no third-party registries (`Registry: shadcn official | Third-party: none`). Registry audit: 0 third-party blocks checked, no flags.

---

## Files Audited

**Components:** `apps/admin/src/components/menu/{sticky-publish-bar,publish-countdown-toast,status-badge,auto-save-indicator,categories-table,category-form,category-select,items-table,items-filter-bar,item-editor-shell,item-detail-form,item-aside,bju-row,item-sizes-card,item-modifier-groups-card,modifier-options-list,modifier-group-form,group-editor-shell,photo-upload,stop-list-table,stop-list-aggregate-table,todays-86-widget,todays-86-reset-button}.tsx`

**Routes:** `apps/admin/src/routes/(protected)/$brandSlug/menu/{_layout,items,items.$id,categories,modifier-groups,modifier-groups.$id,stop-list}.tsx`

**Supporting:** `apps/admin/src/lib/menu/{catalog-errors,use-auto-save,localized,zod-schemas,format-age}.ts`, `apps/admin/src/lib/ui/toast-helpers.ts`, `apps/admin/src/lib/api-client.ts`, `apps/admin/src/lib/hooks/use-effective-location.ts`, `apps/admin/src/lib/i18n/messages/{ru,en}.json`, `apps/admin/src/components/{page-heading,ui/button,ui/switch}.tsx`, `apps/admin/src/main.tsx`, `apps/admin/components.json`

**Planning artifacts:** `04B-UI-SPEC.md`, `04B-PATTERNS.md` (headers only — Next-era, intent reference), `04b-01..09-SUMMARY.md`, `apps/CLAUDE.md`, `.planning/codebase/CONVENTIONS.md`

**Not audited:** `apps/admin/app/` (untracked, dead Next-era directory), orders surface, brand switcher.
