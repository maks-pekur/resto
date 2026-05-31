---
phase: 04b-catalog-admin-ui
plan: 04
type: execute
wave: 3
depends_on: ["04b-01", "04b-02"]
files_modified:
  - apps/admin/components/app-sidebar.tsx
  - apps/admin/app/dashboard/(workspace)/menu/layout.tsx
  - apps/admin/components/menu/sticky-publish-bar.tsx
  - apps/admin/components/menu/sticky-publish-bar-client.tsx
  - apps/admin/components/menu/publish-countdown-toast.tsx
  - apps/admin/components/menu/status-badge.tsx
  - apps/admin/components/menu/auto-save-indicator.tsx
  - apps/admin/lib/menu/schedule-publish-action.ts
  - apps/admin/lib/menu/cancel-publish-action.ts
  - apps/admin/lib/menu/types.ts
  - apps/admin/lib/menu/format-age.ts
autonomous: false
requirements: [CAT-08]
must_haves:
  truths:
    - "Sidebar Menu group is collapsed by default, scope: 'brand'; sub-routes Категории / Блюда / Модификаторы / Стоп-лист (D-01, D-4b-01)"
    - "StickyPublishBar mounts in /dashboard/menu route-group layout only (not global dashboard layout)"
    - "Sticky bar reads draft-diff from GET /internal/v1/catalog/draft-diff via apiFetchInternal in a server component"
    - "Click 'Опубликовать меню' → POST /internal/v1/catalog/publish → Sonner countdown toast with id 'publish-countdown' (D-4b-03)"
    - "Sonner countdown toast shows linear progress bar + 'Отменить' button; 5s timer client-side; 100ms tick (UI-SPEC §Delayed-Publish Toast Spec)"
    - "Undo within 5s → DELETE /internal/v1/catalog/publish → toast replaced with 'Публикация отменена' (same id)"
    - "5s elapsed → toast replaced with 'Опубликовано' (3s auto-dismiss, same id)"
    - "DELETE returning 'already published' → info toast 'Уже опубликовано — окно отмены истекло' (D-4b-03)"
    - "Re-click protection: 'Опубликовать меню' button is disabled while a countdown is active (D-4b-03)"
    - "Diff count = 0 → sticky bar hidden (UI-SPEC §Sticky Publish Bar Spec)"
    - "StatusBadge component supports draft|modified|published|paused|archived with the variants defined in UI-SPEC §Status badge color semantics"
    - "AutoSaveIndicator component supports idle|saving|saved|failed states with Russian copy per UI-SPEC §Auto-Save Indicator Spec"
    - "All catalog mutations go through apiFetchInternal (server-only, holds INTERNAL_API_TOKEN); never expose this in a client component"
    - "Every server action revalidates /dashboard/menu layout to refresh the sticky publish bar diff"
    - "Russian copy is canonical for all user-facing strings (D-05 single-locale MVP-1)"
    - "Category tree depth is capped at 2 (D-4b-01) — enforced in downstream plans, surfaced via StatusBadge variant choice (no archived-cascading here)"
  artifacts:
    - path: "apps/admin/components/app-sidebar.tsx"
      provides: "Menu group + 4 sub-routes"
      contains: "Меню"
    - path: "apps/admin/app/dashboard/(workspace)/menu/layout.tsx"
      provides: "Route-group layout mounting sticky publish bar"
      contains: "StickyPublishBar"
    - path: "apps/admin/components/menu/sticky-publish-bar.tsx"
      provides: "RSC entry that reads draft-diff"
      contains: "apiFetchInternal"
    - path: "apps/admin/components/menu/sticky-publish-bar-client.tsx"
      provides: "Client island with Sonner countdown lifecycle"
      contains: "use client"
    - path: "apps/admin/components/menu/publish-countdown-toast.tsx"
      provides: "Sonner toast.custom content with countdown + Undo"
      contains: "publish-countdown"
    - path: "apps/admin/components/menu/status-badge.tsx"
      provides: "Status badge component (5 variants per UI-SPEC)"
      contains: "modified"
    - path: "apps/admin/components/menu/auto-save-indicator.tsx"
      provides: "Auto-save state UI used by item editor in Plan 06"
      contains: "Сохранение"
  key_links:
    - from: "apps/admin/components/app-sidebar.tsx"
      to: "apps/admin/components/nav-main.tsx"
      via: "navMain array — adds Menu group with items[]"
      pattern: "Меню"
    - from: "apps/admin/app/dashboard/(workspace)/menu/layout.tsx"
      to: "apiFetchInternal"
      via: "Server-side fetch of draft-diff"
      pattern: "apiFetchInternal.*draft-diff"
    - from: "apps/admin/lib/menu/schedule-publish-action.ts"
      to: "apiFetchInternal"
      via: "POST /internal/v1/catalog/publish"
      pattern: "method: 'POST'"
    - from: "apps/admin/lib/menu/cancel-publish-action.ts"
      to: "apiFetchInternal"
      via: "DELETE /internal/v1/catalog/publish"
      pattern: "method: 'DELETE'"
---

<objective>
Wave 3 frontend foundation: add the `Menu` sidebar group, the `/dashboard/menu` route-group layout that mounts the `StickyPublishBar`, the publish countdown toast component, the publish/cancel server actions, plus two shared display primitives (`StatusBadge`, `AutoSaveIndicator`) consumed by Plans 05-08. CAT-08 (diff UX — badges + sticky bar) lands here.

Purpose: Every downstream menu page lives under `/dashboard/menu/*` and depends on the sticky bar reading draft-diff per navigation. The sticky bar and its delayed-publish UX are decoupled from category/item CRUD plans so executors can ship the foundation in isolation and the downstream plans can focus on data surfaces.

Output: Sidebar extension, layout, sticky bar (server + client islands), countdown toast component, schedule/cancel publish server actions, shared StatusBadge + AutoSaveIndicator components.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/04b-catalog-admin-ui/04b-CONTEXT.md
@.planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md
@.planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md
@.planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md
@apps/CLAUDE.md
@CLAUDE.md

<interfaces>
<!-- Existing sidebar shape: apps/admin/components/app-sidebar.tsx + nav-main.tsx (collapsible group with items[]) -->

NavMainItem with sub-items pattern (from nav-main.tsx lines 66-95):
```typescript
{
  title: 'Меню',
  url: '/dashboard/menu/items',
  icon: UtensilsCrossed,  // lucide-react
  scope: 'brand',
  isActive: false,  // collapsed by default
  items: [
    { title: 'Категории', url: '/dashboard/menu/categories' },
    { title: 'Блюда', url: '/dashboard/menu/items' },
    { title: 'Модификаторы', url: '/dashboard/menu/modifier-groups' },
    { title: 'Стоп-лист', url: '/dashboard/menu/stop-list' },
  ],
}
```

Draft-diff response shape (matches Plan 02 backend DraftDiffResponseDto):
```typescript
interface DraftDiff {
  readonly unpublishedCount: number;
  readonly truncatedCount: number;
  readonly items: ReadonlyArray<{
    readonly entityType: 'item' | 'category' | 'modifier-group';
    readonly id: string;
    readonly name: string;
    readonly status: 'draft' | 'modified' | 'archived';
  }>;
}
```

Sonner constant id pattern (RESEARCH.md Pattern 2 + UI-SPEC §Delayed-Publish Toast Spec):
```typescript
const TOAST_ID = 'publish-countdown' as const;
// publish kicks off countdown:
toast.custom((t) => <CountdownToast toastId={t} onCancel={...} onElapse={...} />, { id: TOAST_ID, duration: Infinity });
// on elapse:
toast.success('Опубликовано', { id: TOAST_ID, duration: 3000 });
// on cancel:
toast.success('Публикация отменена', { id: TOAST_ID });
// on cancel-but-expired:
toast.info('Уже опубликовано — окно отмены истекло', { id: TOAST_ID });
// on POST publish error:
toast.error('Не удалось опубликовать — проверьте соединение', { id: TOAST_ID });
```

AutoSaveIndicator state union (UI-SPEC §Auto-Save Indicator Spec):
```typescript
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'failed'; retry: () => void };
```

StatusBadge variant table (UI-SPEC §Status badge color semantics):
| Status | Badge variant | Extra className |
| draft | outline | — |
| modified | outline | border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-400 |
| published | default | — |
| paused | secondary | — |
| archived | ghost | text-muted-foreground |
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Sidebar Menu group + types + StatusBadge + AutoSaveIndicator primitives</name>
  <files>apps/admin/components/app-sidebar.tsx, apps/admin/components/menu/status-badge.tsx, apps/admin/components/menu/auto-save-indicator.tsx, apps/admin/lib/menu/types.ts, apps/admin/lib/menu/format-age.ts</files>
  <behavior>
    - Sidebar shows a `Меню` collapsible group with `UtensilsCrossed` icon, collapsed by default, scope `'brand'`; clicking expands to 4 sub-routes (Категории, Блюда, Модификаторы, Стоп-лист)
    - Sidebar visible only when an active brand is selected (existing `scope: 'brand'` gate handles this)
    - `StatusBadge` renders 5 distinct visual variants matching UI-SPEC §Status badge color semantics
    - `StatusBadge` carries `aria-label="Статус: {labelFor(status)}"` where labels are Черновик / Изменено / Опубликовано / Стоп / Архив
    - `AutoSaveIndicator` renders null on `idle`; renders `text-xs text-muted-foreground` for `saving`/`saved`; renders `text-xs text-destructive` for `failed` with a `повторить` link button
    - `AutoSaveIndicator` `saved` state uses `formatAge(timestampMs)` to display `Xс назад` / `Xм назад` / `Xч назад`
    - All copy is Russian per D-05
  </behavior>
  <read_first>
    - apps/admin/components/app-sidebar.tsx (existing navMain array — extend, do not rewrite)
    - apps/admin/components/nav-main.tsx (collapsible mechanism — items[] pattern lines 66-95)
    - apps/admin/components/empty-state.tsx (variant-prop pattern for StatusBadge analog)
    - apps/admin/app/(onboarding)/onboarding/brand/brand-form-client.tsx (SlugAvailabilityHint lines 150-211 — discriminated-union + aria-live pattern for AutoSaveIndicator)
    - apps/admin/components/ui/badge.tsx (variants available after Plan 01 install)
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Status badge color semantics + §Auto-Save Indicator Spec
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Sidebar extension + §Status badge component + §Auto-save indicator
  </read_first>
  <action>
    Import `UtensilsCrossed` from `lucide-react` in `app-sidebar.tsx`. Insert the `Меню` NavMainItem into the `navMain` array immediately before the existing `Settings` entry, with the exact items[] structure from the interfaces block above (Russian labels). Preserve `scope: 'brand'` so the group is hidden until an active brand is selected. Preserve `isActive: false` for collapsed-by-default behavior.
    Create `apps/admin/lib/menu/types.ts` with the shared types Plans 04-08 consume: `Status = 'draft' | 'modified' | 'published' | 'paused' | 'archived'`, `SaveState` union from the interfaces block, `DraftDiff` interface (use API response shape from Plan 02 — import from `@resto/api-client/src/generated/api.ts` if the generated types include it; otherwise mirror the shape locally with `readonly`).
    Create `apps/admin/lib/menu/format-age.ts` exporting `formatAge(timestampMs: number): string` — branches: `<60_000ms` returns `'Xс назад'`, `<3_600_000ms` returns `'Xм назад'`, else `'Xч назад'`. Unit tests included.
    Create `apps/admin/components/menu/status-badge.tsx` per the variant table in the interfaces block. Use the shadcn `Badge` import from `@/components/ui/badge`. Export `StatusBadge({ status }: { readonly status: Status })`. Russian labels: draft → Черновик, modified → Изменено, published → Опубликовано, paused → Стоп, archived → Архив. The `modified` variant uses `Badge variant="outline" className="border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-400"`.
    Create `apps/admin/components/menu/auto-save-indicator.tsx` per UI-SPEC. `'use client'` directive. Discriminated-union prop `state: SaveState`. Renders nothing on idle; renders `Сохранение…` on saving; renders `Сохранено {formatAge(state.at)}` on saved; renders `Не сохранено — ` + `<button onClick={state.retry}>повторить</button>` on failed. Use `aria-live="polite"` per UI-SPEC §Accessibility Contracts. No external time-ago library.
    Tests: add `apps/admin/components/menu/status-badge.spec.tsx` (RTL) asserting each variant renders the correct Russian label + className contains amber color for `modified`. Add `apps/admin/lib/menu/format-age.spec.ts` covering the 3 buckets + boundaries. Add `apps/admin/components/menu/auto-save-indicator.spec.tsx` covering all 4 states and retry button click.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run components/menu/status-badge.spec.tsx components/menu/auto-save-indicator.spec.tsx lib/menu/format-age.spec.ts --no-coverage</automated>
  </verify>
  <done>
    Sidebar adds the Меню group; StatusBadge + AutoSaveIndicator render per UI-SPEC; format-age covers 3 buckets; specs pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Publish + cancel server actions</name>
  <files>apps/admin/lib/menu/schedule-publish-action.ts, apps/admin/lib/menu/cancel-publish-action.ts</files>
  <behavior>
    - `schedulePublishAction()` POSTs to `/internal/v1/catalog/publish` via `apiFetchInternal`; returns `{ ok: true, error: null, scheduledAt: number }` on success or `{ ok: false, error: string, scheduledAt: null }` on failure
    - `cancelPublishAction()` DELETEs `/internal/v1/catalog/publish` via `apiFetchInternal`; returns `{ ok: true, cancelled: true, expired: false }` if backend reports cancelled=true, or `{ ok: true, cancelled: false, expired: true }` if backend reports cancelled=false (already published), or `{ ok: false, error: string }` on network/5xx failure
    - Both actions are `'use server'` and call `revalidatePath('/dashboard/menu', 'layout')` after success so sticky bar diff refreshes
    - Both actions return Russian error strings per UI-SPEC §Error states
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/settings/actions.ts (analog — scheduleOffboardingAction lines 59-89, friendly() helper)
    - apps/admin/lib/actions/create-brand.ts (analog — friendly() error mapper lines 34-44)
    - apps/admin/lib/api-server-internal.ts (hardened in Plan 01 — confirm method type includes 'POST' and 'DELETE')
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts (existing POST /publish + DELETE /publish from 4a-07 — confirm response shapes: `{ scheduled: true, cancelAfterMs }` and `{ cancelled: boolean }`)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Server actions + Pattern S1 + Pattern S8
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Error states + §Publish flow
  </read_first>
  <action>
    Create `apps/admin/lib/menu/schedule-publish-action.ts`:
    - `'use server'` directive
    - Import `apiFetchInternal`, `revalidatePath`
    - Export interface `SchedulePublishActionResult = { ok: true; scheduledAt: number; error: null } | { ok: false; scheduledAt: null; error: string }`
    - Export async `schedulePublishAction(): Promise<SchedulePublishActionResult>`:
      1. Call `apiFetchInternal<{ scheduled: boolean; cancelAfterMs: number }>('/internal/v1/catalog/publish', { method: 'POST' })`
      2. If `!res.ok`: return `{ ok: false, scheduledAt: null, error: 'Не удалось опубликовать — проверьте соединение' }`
      3. Else: `revalidatePath('/dashboard/menu', 'layout')` and return `{ ok: true, scheduledAt: Date.now(), error: null }`
    Create `apps/admin/lib/menu/cancel-publish-action.ts`:
    - `'use server'` directive
    - Export interface `CancelPublishActionResult = { ok: true; cancelled: boolean; expired: boolean } | { ok: false; error: string }`
    - Export async `cancelPublishAction(): Promise<CancelPublishActionResult>`:
      1. Call `apiFetchInternal<{ cancelled: boolean }>('/internal/v1/catalog/publish', { method: 'DELETE' })`
      2. If `!res.ok`: return `{ ok: false, error: 'Не удалось отменить публикацию — попробуйте снова' }`
      3. Else: `revalidatePath('/dashboard/menu', 'layout')` and return `{ ok: true, cancelled: res.data?.cancelled === true, expired: res.data?.cancelled === false }`
    Tests: add `apps/admin/lib/menu/schedule-publish-action.spec.ts` + `cancel-publish-action.spec.ts`. Use `vi.mock('@/lib/api-server-internal', ...)` to stub apiFetchInternal. Assert: (a) POST → revalidatePath called, success result; (b) POST 500 → error result with Russian copy; (c) DELETE cancelled=true → `expired: false`; (d) DELETE cancelled=false → `expired: true`; (e) DELETE 500 → error result.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run lib/menu/schedule-publish-action.spec.ts lib/menu/cancel-publish-action.spec.ts --no-coverage</automated>
  </verify>
  <done>
    Both server actions exist with documented signatures; revalidate the layout on success; specs cover ok/error/expired branches.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: PublishCountdownToast component + StickyPublishBar (server + client islands) + route-group layout</name>
  <files>apps/admin/components/menu/publish-countdown-toast.tsx, apps/admin/components/menu/sticky-publish-bar.tsx, apps/admin/components/menu/sticky-publish-bar-client.tsx, apps/admin/app/dashboard/(workspace)/menu/layout.tsx</files>
  <behavior>
    - `PublishCountdownToast` renders inside `sonner.toast.custom`; holds its own `setInterval(100ms)` clock; computes `secondsElapsed` from `Date.now()` baseline (not the render count, to avoid drift); cleans up on unmount; calls `onElapse` exactly once at 5000ms boundary
    - `StickyPublishBar` (RSC at `apps/admin/components/menu/sticky-publish-bar.tsx`) receives `unpublishedCount + diffItems` via props; passes them to `StickyPublishBarClient`
    - `StickyPublishBarClient` is a `'use client'` island holding the Sonner trigger + button-disabled state; on click `'Опубликовать меню'` calls `schedulePublishAction()` then mounts the countdown toast with id `'publish-countdown'`
    - On countdown elapse: `toast.success('Опубликовано', { id: 'publish-countdown', duration: 3000 })` AND set local `isPublishing=false`
    - On Undo: call `cancelPublishAction()`; on cancelled=true → `toast.success('Публикация отменена', { id: 'publish-countdown' })`; on expired → `toast.info('Уже опубликовано — окно отмены истекло', { id: 'publish-countdown' })`
    - Bar is `fixed bottom-0 left-[--sidebar-width] right-0 z-40 h-14` per UI-SPEC; hidden when `unpublishedCount === 0`
    - `Опубликовать меню` button is `disabled` with Tooltip `Публикация через 5с — нажмите Отменить` while countdown is active
    - Inline diff list expansion: `Показать ▾` button toggles `max-h-0 → max-h-64 overflow-auto` transition
    - `role="region" aria-label="Управление публикацией"` on the bar per UI-SPEC §Accessibility Contracts
    - Layout mounts the RSC bar; calls `apiFetchInternal<DraftDiff>('/internal/v1/catalog/draft-diff')`
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/layout.tsx (analog — workspace-level RSC layout fetching data + conditional render)
    - apps/admin/app/layout.tsx (Sonner Toaster mount confirmation — line 22)
    - apps/admin/components/ui/sonner.tsx (Toaster customization — preserve)
    - apps/admin/components/ui/button.tsx + badge.tsx + progress.tsx (variants available after Plan 01)
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pattern 2 (Sonner countdown toast) + §Pattern 3 (Sticky bar in route-group layout) + §Pitfall 3 (Sonner id) + §Pitfall 4 (revalidate layout)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Menu route-group layout + §Sonner countdown toast + §Wave 3 — Sticky publish bar
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Sticky Publish Bar Spec + §Delayed-Publish Toast Spec + §Publish flow (Interaction Contracts)
  </read_first>
  <action>
    Create `apps/admin/components/menu/publish-countdown-toast.tsx`:
    - `'use client'` directive
    - Constants `COUNTDOWN_MS = 5_000`, `TICK_MS = 100`
    - Export `PublishCountdownToast({ onCancel, onElapse }: { readonly onCancel: () => void; readonly onElapse: () => void })`
    - Internal `useEffect` captures `start = Date.now()`; `setInterval(TICK_MS)` updates local `elapsed` state; when `elapsed >= COUNTDOWN_MS` clearInterval + call `onElapse()` exactly once (guard via `ref.current.elapsed = true`)
    - Cleanup: clear interval on unmount
    - Render UI-SPEC §Delayed-Publish Toast Spec layout: row 1 `Публикация через {Math.max(0, Math.ceil((COUNTDOWN_MS - elapsed) / 1000))}с` + Отменить ghost button; row 2 `<Progress value={(elapsed / COUNTDOWN_MS) * 100} className="h-1 mt-2" />`
    - `aria-live="polite"` on the countdown text per UI-SPEC §Accessibility Contracts
    - Width: `w-[360px]` per UI-SPEC

    Create `apps/admin/components/menu/sticky-publish-bar.tsx` (RSC):
    - Accept props `{ unpublishedCount: number; diffItems: DraftDiff['items']; truncatedCount?: number }`
    - Render `<StickyPublishBarClient unpublishedCount={...} diffItems={...} truncatedCount={...} />`

    Create `apps/admin/components/menu/sticky-publish-bar-client.tsx`:
    - `'use client'` directive
    - Local state: `isPublishing: boolean` (true while countdown active), `isDiffOpen: boolean` (inline list expansion)
    - Import `schedulePublishAction`, `cancelPublishAction`, `PublishCountdownToast`
    - On `Опубликовать меню` click:
      1. Set `isPublishing = true`
      2. Call `schedulePublishAction()`; if `!ok` → `toast.error('Не удалось опубликовать — проверьте соединение', { id: 'publish-countdown' })`, set `isPublishing = false`, return
      3. Mount countdown: `toast.custom((t) => <PublishCountdownToast onCancel={...} onElapse={...} />, { id: 'publish-countdown', duration: Infinity })`
      4. `onElapse`: `toast.success('Опубликовано', { id: 'publish-countdown', duration: 3000 })`, `setIsPublishing(false)`
      5. `onCancel`: `await cancelPublishAction()`; on cancelled=true → `toast.success('Публикация отменена', { id: 'publish-countdown' })`; on expired → `toast.info('Уже опубликовано — окно отмены истекло', { id: 'publish-countdown' })`; on !ok → `toast.error('Не удалось отменить публикацию — попробуйте снова', { id: 'publish-countdown' })`; always `setIsPublishing(false)`
    - Render: when `unpublishedCount === 0` return null. Otherwise render `<div role="region" aria-label="Управление публикацией" className="fixed bottom-0 left-[--sidebar-width] right-0 z-40 h-14 bg-card border-t border-border shadow-lg flex items-center px-6 gap-4">` containing:
      - `<span className="text-sm font-semibold">{unpublishedCount} неопубликованных изменений</span>` (use plural-form formatter `pluralizeChanges(count)` — write a small util that returns `1 неопубликованное изменение` / `N неопубликованных изменения` / `N неопубликованных изменений` per Russian grammar; co-locate in `lib/menu/pluralize-changes.ts` and unit-test)
      - `<Button variant="ghost" size="sm" onClick={() => setIsDiffOpen(v => !v)}>Показать ▾</Button>` (or `▴` when open)
      - Inline expanded list: `<div className={cn("transition-[max-height]", isDiffOpen ? "max-h-64 overflow-auto" : "max-h-0 overflow-hidden")}>` containing diffItems grouped by `entityType` with StatusBadge per item; if `truncatedCount > 0` show `<p className="text-xs text-muted-foreground">+ ещё {truncatedCount}</p>` at bottom of list
      - Right-flushed `<Tooltip>` wrapping `<Button variant="default" size="sm" disabled={isPublishing} onClick={...}>Опубликовать меню</Button>`; Tooltip content when `isPublishing` = `Публикация через 5с — нажмите Отменить`

    Create `apps/admin/app/dashboard/(workspace)/menu/layout.tsx`:
    - Async server component
    - `const diff = await apiFetchInternal<DraftDiff>('/internal/v1/catalog/draft-diff');`
    - Render `<>{children}<StickyPublishBar unpublishedCount={diff.data?.unpublishedCount ?? 0} diffItems={diff.data?.items ?? []} truncatedCount={diff.data?.truncatedCount} /></>`

    Also create `apps/admin/lib/menu/pluralize-changes.ts` exporting `pluralizeChanges(n: number): string` covering Russian grammar (1 → "неопубликованное изменение", 2-4 → "неопубликованных изменения", 5+ → "неопубликованных изменений", endings with 1 except 11 → singular form, etc. — write standard `russianPluralize` logic; tests cover edge cases 0, 1, 2, 5, 11, 21, 22, 25).

    Tests:
    - `apps/admin/lib/menu/pluralize-changes.spec.ts` covering 0, 1, 2, 5, 11, 21, 22, 25
    - `apps/admin/components/menu/publish-countdown-toast.spec.tsx` (RTL + `vi.useFakeTimers()`): asserts onElapse fires exactly once after 5000ms; asserts onCancel fires when ghost button clicked; asserts countdown text updates with fake timer advance
    - `apps/admin/components/menu/sticky-publish-bar-client.spec.tsx` (RTL): mocks schedulePublishAction + cancelPublishAction + Sonner; asserts publish click → toast.custom called with id 'publish-countdown'; asserts undo click → toast.success/info called with same id; asserts disabled button + tooltip text during countdown; asserts unpublishedCount === 0 renders null
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run lib/menu/pluralize-changes.spec.ts components/menu/publish-countdown-toast.spec.tsx components/menu/sticky-publish-bar-client.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Layout mounts the bar; bar shows unpublished count + diff expansion; publish click runs the full 5s countdown flow with Sonner id; undo replaces toast in place; tests pass for plurals + countdown + sticky bar client.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin browser → admin server action | Next.js 15 server actions are CSRF-protected by framework (built-in token, ADR-relevant) |
| Admin server action → api `/internal/v1/catalog/publish` | apiFetchInternal carries INTERNAL_API_TOKEN; server-only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04b-04-01 | Tampering | CSRF on publish/cancel server actions | mitigate | Next.js 15 server actions ship with built-in CSRF token (framework-level); no manual mitigation needed (RESEARCH.md Security Domain V4) |
| T-04b-04-02 | Information Disclosure | INTERNAL_API_TOKEN leaking to client bundle | mitigate | Server actions are 'use server'; `apiFetchInternal` carries `import 'server-only'`; never imported into client component (RESEARCH.md Pitfall #3) |
| T-04b-04-03 | DoS | Operator clicks Publish repeatedly during countdown | mitigate | `isPublishing` local state disables button + Tooltip explains (D-4b-03 re-click protection); backend DelayedPublishService can cancel-and-reschedule, but UI hides it to prevent toast-spam |
| T-04b-04-04 | Repudiation | Sticky bar diff count stale after mutation | mitigate | schedulePublishAction + cancelPublishAction call `revalidatePath('/dashboard/menu', 'layout')` per Pitfall #4 |
| T-04b-04-05 | Spoofing | Sonner toast id collision producing duplicate countdowns | mitigate | Constant `id = 'publish-countdown'` threaded through every toast.* call (RESEARCH.md Pitfall #3) |
| T-04b-04-06 | DoS | draft-diff fetch hangs admin RSC render | mitigate | apiFetchInternal carries AbortSignal.timeout(10s) for GET per Plan 01 |
</threat_model>

<verification>
- Sidebar renders `Меню` collapsible group on a dev session with active brand
- Sticky bar appears on `/dashboard/menu/*` routes; hidden on `/dashboard` and `/dashboard/settings`
- Sticky bar reports `unpublishedCount` from draft-diff
- Publish click → 5s Sonner countdown with linear progress bar
- Undo click within 5s → cancelled toast with same id (no second toast stack)
- 5s elapsed → success toast `Опубликовано` with same id
- StatusBadge component covers 5 variants; AutoSaveIndicator covers 4 states
</verification>

<success_criteria>
1. Sidebar Menu group added with 4 sub-routes; collapsed-by-default; scope: 'brand'
2. /dashboard/menu route-group layout exists and reads draft-diff via apiFetchInternal
3. StickyPublishBar mounts on every /dashboard/menu/* route; hidden when count === 0
4. schedulePublishAction + cancelPublishAction revalidate the layout segment
5. Sonner toast id is constant 'publish-countdown' across publish/cancel/elapse/error
6. Disabled button + Tooltip during active countdown
7. StatusBadge component used by downstream plans
8. AutoSaveIndicator + formatAge available for item editor (Plan 06)
9. Unit specs pass for sidebar group, format-age, plurals, toast, sticky bar client
</success_criteria>

<output>
Create `.planning/phases/04b-catalog-admin-ui/04b-04-SUMMARY.md` when done.
</output>
