---
phase: 04b-catalog-admin-ui
plan: 06
type: execute
wave: 4
depends_on: ['04b-01', '04b-02', '04b-04', '04b-05']
files_modified:
  - apps/admin/app/dashboard/(workspace)/menu/items/page.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/items-filter-bar-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/archive-item-action.ts
  - apps/admin/app/dashboard/(workspace)/menu/items/toggle-stop-list-action.ts
  - apps/admin/lib/menu/zod-schemas.ts
autonomous: false
requirements: [CAT-02, CAT-07]
must_haves:
  truths:
    - 'Operator sees all items at /dashboard/menu/items as a compact table with 48px thumbnail + name + category + price + status + stop-list switch + actions (D-02)'
    - 'Default filter excludes archived items (D-03)'
    - 'Operator can filter by category (indented dropdown — Plan 05 CategorySelect in item-picker mode) and status; search input filters by name'
    - "Stop-list switch in items row is an inline toggle — click = instant publish (no confirm modal, D-12); toast 'Блюдо добавлено в стоп-лист' / 'Блюдо возобновлено' (UI-SPEC §Stop-list switch)"
    - 'Toggle error: switch snaps back to previous state + Sonner error toast (UI-SPEC §Stop-list switch)'
    - 'Row click → navigate to /dashboard/menu/items/[id] (full-page editor — Plan 07 handles)'
    - "Archive action via DropdownMenu → AlertDialog confirm; archive sets status='archived' (D-09 archive variant)"
    - "Status badges per row use the shared StatusBadge component (Plan 04); 'modified' detection: status='published' AND updated_at > tenants.menu_first_published_at (computed in backend Plan 02)"
    - "Price column shows 'от {basePrice}₽' when item has sizes; else plain basePrice (Open Question #3 — backend returns hasSizes flag)"
    - 'Category cell shows parent → child prefix when child (UI-SPEC §Items table category column)'
    - 'Pagination: 50 items per page; offset-based via search params; URL preserves filter + page state (?status=&category=&q=&page=)'
    - 'All catalog mutations go through apiFetchInternal (server-only, holds INTERNAL_API_TOKEN); never expose this in a client component'
    - 'Every server action revalidates /dashboard/menu layout to refresh the sticky publish bar diff'
    - 'Russian copy is canonical for all user-facing strings (D-05 single-locale MVP-1)'
  artifacts:
    - path: 'apps/admin/app/dashboard/(workspace)/menu/items/page.tsx'
      provides: 'RSC items list with filters + pagination'
      contains: 'apiFetchInternal'
    - path: 'apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx'
      provides: 'Client-side row interactions (stop-list toggle, actions menu, AlertDialog)'
      contains: 'use client'
    - path: 'apps/admin/app/dashboard/(workspace)/menu/items/items-filter-bar-client.tsx'
      provides: 'Search + category + status filters'
      contains: 'Поиск блюд'
    - path: 'apps/admin/app/dashboard/(workspace)/menu/items/toggle-stop-list-action.ts'
      provides: 'POST/DELETE stop-list server action'
      contains: "method: 'POST'"
    - path: 'apps/admin/app/dashboard/(workspace)/menu/items/archive-item-action.ts'
      provides: 'PATCH archive item server action'
      contains: "method: 'PATCH'"
  key_links:
    - from: 'items/page.tsx'
      to: 'apiFetchInternal'
      via: 'GET /internal/v1/catalog/items + GET /internal/v1/catalog/categories'
      pattern: '/internal/v1/catalog/items'
    - from: 'toggle-stop-list-action.ts'
      to: 'apiFetchInternal'
      via: 'POST/DELETE /internal/v1/catalog/stop-list'
      pattern: 'stop-list'
    - from: 'archive-item-action.ts'
      to: 'apiFetchInternal'
      via: 'PATCH /internal/v1/catalog/items/:id/archive'
      pattern: "method: 'PATCH'"
---

<objective>
Wave 3 frontend: Items list page at `/dashboard/menu/items` — compact table per D-02, filters per D-03, stop-list switch per D-12, archive AlertDialog per UI-SPEC §Destructive actions. CAT-02 list surface + CAT-07 stop-list inline switch ship here. The full item editor (CAT-02 form, CAT-03 photo upload, CAT-04 modifiers tab, CAT-05 sizes tab) is Plan 07.

Output: Items RSC page; client filter bar + table with stop-list switch + archive AlertDialog; two server actions (toggle-stop-list, archive-item); URL-driven filter state.
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
<!-- Backend from Plan 02 (live): -->

GET /internal/v1/catalog/items?status=&categoryId=&q=&limit=50&offset=0 → ItemListResponseDto:

```typescript
type ItemListItem = {
  id: string;
  name: Record<string, string>; // LocalizedText
  categoryId: string;
  categoryName: Record<string, string>;
  parentCategoryName: Record<string, string> | null;
  photoUrl: string | null; // presignGet URL for photos[0] (existing api behavior)
  basePrice: string; // Drizzle numeric → string; coerce client-side
  currency: string;
  status: 'draft' | 'published' | 'modified' | 'paused' | 'archived';
  hasSizes: boolean;
  stoppedAt: string | null; // ISO timestamp if currently stop-listed
};
type ItemListResponse = {
  items: ItemListItem[];
  total: number;
  limit: number;
  offset: number;
};
```

POST /internal/v1/catalog/stop-list — body `{ itemId: string; reason: null }` (Plan 02; reason kept null per D-13).
DELETE /internal/v1/catalog/stop-list/:itemId — returns 204.

PATCH /internal/v1/catalog/items/:id/archive — empty body; returns 204.

URL search params (operator-friendly, bookmarkable):

- `?status=published` (default: all-except-archived; sentinel value "all-including-archived" exposes archived)
- `?category=<uuid>`
- `?q=<plain string>`
- `?page=<n>` (1-based)
  </interfaces>
  </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Stop-list toggle + archive-item server actions</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/items/toggle-stop-list-action.ts, apps/admin/app/dashboard/(workspace)/menu/items/archive-item-action.ts</files>
  <behavior>
    - `toggleStopListAction({ itemId, next: 'paused' | 'published' })`:
      - if next === 'paused' → POST /internal/v1/catalog/stop-list with `{ itemId, reason: null }`
      - if next === 'published' → DELETE /internal/v1/catalog/stop-list/${itemId}
      - on !ok → return `{ ok: false, error: <Russian> }`; on ok → revalidatePath('/dashboard/menu', 'layout') and return `{ ok: true, error: null }`
    - `archiveItemAction({ id })` → PATCH /internal/v1/catalog/items/${id}/archive; mirror archive-category-action.ts from Plan 05
    - Both 'use server'; never expose INTERNAL_API_TOKEN
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/categories/archive-category-action.ts (Plan 05 analog — same shape)
    - apps/admin/lib/api-server-internal.ts (Plan 01 hardened — confirm PATCH/POST/DELETE supported)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Server actions + Pattern S1 + Pattern S8
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Stop-list switch (Interaction Contracts) + §Destructive actions row 2
  </read_first>
  <action>
    Create `toggle-stop-list-action.ts` per behavior. Friendly errors: 409 with `catalog.menu_item_not_found` → `'Блюдо не найдено.'`; 409 with `catalog.stop_list_item_not_found` → `'Блюдо не в стоп-листе.'`; 5xx → `'Не удалось обновить стоп-лист. Попробуйте ещё раз.'`.
    Create `archive-item-action.ts` per behavior (mirror Plan 05 archive-category-action). Friendly: 404 → `'Блюдо не найдено.'`; 5xx → generic Russian server error.
    Tests:
    - `toggle-stop-list-action.spec.ts`: assert next='paused' POSTs the right body; next='published' DELETEs the right path; 500 returns error result; revalidatePath called on success
    - `archive-item-action.spec.ts`: mirror archive-category-action.spec.ts
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/items/toggle-stop-list-action.spec.ts app/dashboard/\\(workspace\\)/menu/items/archive-item-action.spec.ts --no-coverage</automated>
  </verify>
  <done>
    Both server actions exist with documented signatures; revalidatePath called on success; specs pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Items page (RSC) + filter bar + table with stop-list switch + archive AlertDialog</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/items/page.tsx, apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx, apps/admin/app/dashboard/(workspace)/menu/items/items-filter-bar-client.tsx, apps/admin/lib/menu/zod-schemas.ts</files>
  <behavior>
    - Page renders shell chrome with TenantBreadcrumb trail `Меню › Блюда` + flush-right `+ Добавить блюдо` Button (primary) linking to `/dashboard/menu/items/new`
    - Filter bar layout: `[search input w-64 placeholder="Поиск блюд…"]` `[Select category — indented options]` `[Select status]` per UI-SPEC §Items list page
    - Status select options: `Все кроме архива` (default), `Черновики`, `Опубликованные`, `Стоп`, `Архив` (when archived selected, status query is 'archived')
    - URL search params drive state via `useRouter` + `useSearchParams`; filter changes call `router.push('/dashboard/menu/items?status=...&category=...&q=...&page=1')`
    - Search input is debounced 300ms before pushing to URL (mirror onboarding/brand-form-client.tsx slug debounce pattern)
    - Table columns per UI-SPEC §Items list page: Photo (48px) | Название (with parent → child prefix under name in muted xs) | Цена | Статус | Стоп (Switch) | Actions (DropdownMenu Edit / Archive)
    - Photo cell: `<img src={item.photoUrl} className="size-10 rounded object-cover" />` when present; else `<div className="size-10 rounded bg-muted flex items-center justify-center"><ImageIcon className="size-4 text-muted-foreground" /></div>`
    - Price cell: `от {coerced basePrice}₽` when `hasSizes === true`; else `{coerced basePrice}₽` (use `z.coerce.number()` per Pitfall #10)
    - Stop-list Switch: `aria-label="Добавить в стоп-лист"` when published, `aria-label="Убрать из стоп-листа"` when paused; click sets local optimistic-but-then-pessimistic state → calls `toggleStopListAction({ itemId, next })` → on ok, toast.success with Russian copy; on error, snap back + toast.error
    - During request: switch shows `opacity-50 pointer-events-none` per UI-SPEC §Stop-list switch
    - Status badge column uses StatusBadge component
    - Row click → `router.push('/dashboard/menu/items/${id}')` (avoid <Link> wrapping <tr> to keep table semantics)
    - Actions DropdownMenu: Edit (→ navigates to editor) / Archive (→ opens AlertDialog with UI-SPEC §Destructive actions row 2 copy)
    - AlertDialog confirm calls `archiveItemAction({ id })`; on ok, item disappears from default-filter list
    - Empty state: `<EmptyState variant="empty" title="Блюд пока нет" description="Добавьте первое блюдо, чтобы начать заполнять меню." action={<Link href="/dashboard/menu/items/new"><Button>Добавить блюдо</Button></Link>} />` per UI-SPEC §Empty states
    - Pagination: 50/page; show `Назад` / `Вперёд` buttons when `total > limit`; current page = `Math.floor(offset/limit) + 1`
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx (Plan 05 — analog for RSC page header + redirect)
    - apps/admin/app/(onboarding)/onboarding/brand/brand-form-client.tsx (lines 61-97 — debounce pattern for search input)
    - apps/admin/components/menu/status-badge.tsx (Plan 04)
    - apps/admin/components/menu/category-select.tsx (Plan 05 — item-picker mode for category filter)
    - apps/admin/lib/menu/zod-schemas.ts (Plan 05 — extend with ItemListFilterSchema if useful)
    - apps/admin/lib/menu/localized.ts (Plan 05 — fromLocalizedText for display)
    - apps/admin/components/ui/{table,switch,dropdown-menu,alert-dialog,select,input,button}.tsx (Plan 01 installs)
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Items list page + §Stop-list switch + §Destructive actions row 2 + §Empty states
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — RSC pages + §Wave 3 — Server actions
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pitfall 10 (Drizzle numeric → string)
  </read_first>
  <action>
    Extend `apps/admin/lib/menu/zod-schemas.ts` with a small helper `coerceStatusFilter(raw: string | undefined): 'all-except-archived' | 'draft' | 'published' | 'paused' | 'archived'` defaulting to `'all-except-archived'`.

    Create `apps/admin/app/dashboard/(workspace)/menu/items/page.tsx` (RSC):
    1. `apiFetch<MeResponse>('/v1/me')` + redirect check
    2. Read search params: `status`, `category`, `q`, `page`
    3. Build query string for `GET /internal/v1/catalog/items?status=...&categoryId=...&q=...&limit=50&offset=...`; when status is 'all-except-archived', omit the status query (backend default per Plan 02 excludes archived)
    4. Parallel `apiFetchInternal` for items + categories (latter needed by the filter bar's category dropdown — Promise.all)
    5. Render shell chrome with TenantBreadcrumb + `+ Добавить блюдо` Button linking to `/dashboard/menu/items/new`
    6. Render `<ItemsFilterBarClient categories={...} currentFilters={...} />` followed by `<ItemsTableClient items={...} totalCount={...} pagination={...} />`
    7. Empty state when `items.length === 0 AND no filters applied`

    Create `apps/admin/app/dashboard/(workspace)/menu/items/items-filter-bar-client.tsx`:
    - `'use client'`
    - Props: `{ categories: ReadonlyArray<{ id: string; name: string; parentId: string | null }>; currentFilters: { status: string; categoryId: string | null; q: string } }`
    - `useRouter` + `useSearchParams` for URL state
    - Search input with 300ms debounce (mirror brand-form-client.tsx pattern) → push to URL on debounced change
    - CategorySelect in `item-picker` mode for category filter (allows children); first option `Все категории` → null
    - Status Select with the 5 options (Russian labels)
    - Each filter change resets `page=1`

    Create `apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx`:
    - `'use client'`
    - Props: `{ items: ItemListItem[]; totalCount: number; pagination: { page: number; pageSize: number } }`
    - Local state per row for stop-list switch: `Record<itemId, 'paused' | 'published' | 'pending'>` initialized from item.status
    - On switch click:
      1. Set local state to 'pending' (disables switch via opacity-50)
      2. `const next = current === 'paused' ? 'published' : 'paused'`
      3. Call `toggleStopListAction({ itemId, next })`
      4. On `ok`: set local state to `next`; `toast.success(next === 'paused' ? 'Блюдо добавлено в стоп-лист' : 'Блюдо возобновлено', { duration: 1500 })`
      5. On `!ok`: revert local state; `toast.error(result.error)`
    - Table cells per behavior (Photo + Название + Цена + Статус + Switch + Actions DropdownMenu)
    - Actions DropdownMenu items:
      - `<DropdownMenuItem onClick={() => router.push(\`/dashboard/menu/items/${item.id}\`)}>Редактировать</DropdownMenuItem>`
      - `<DropdownMenuItem onClick={() => setArchiveTarget(item)} className="text-destructive">Архивировать</DropdownMenuItem>`
    - Single AlertDialog at component root, controlled by `archiveTarget: ItemListItem | null`; copy from UI-SPEC §Destructive actions row 2 (Title: "Архивировать блюдо?"; Body: "Блюдо «{name}» будет скрыто из меню. Действие обратимо — снимите архивацию в фильтре статусов."; Confirm: "Архивировать" destructive; Cancel: "Отмена"); confirm → `archiveItemAction({ id: archiveTarget.id })`; on ok close dialog + toast.success `'Блюдо архивировано'`
    - DropdownMenu trigger button: `aria-label={\`Действия с блюдом ${itemName}\`}` per UI-SPEC §Accessibility Contracts
    - Pagination: bottom-right `<div className="flex gap-2"><Button disabled={page===1} onClick={() => goToPage(page-1)}>Назад</Button><Button disabled={page*pageSize>=total} onClick={() => goToPage(page+1)}>Вперёд</Button></div>`

    Tests (RTL):
    - `items-filter-bar-client.spec.tsx`: assert search debounce pushes URL after 300ms; assert category/status select push immediately
    - `items-table-client.spec.tsx`: assert stop-list switch click calls action with next='paused'; assert error snaps state back + shows toast; assert archive Action opens AlertDialog with UI-SPEC copy; assert row click routes to editor; assert pagination buttons disabled at boundaries
    - `items/page.spec.tsx`: assert RSC builds correct query string from search params; assert apiFetchInternal called with the constructed URL

  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/items/items-filter-bar-client.spec.tsx app/dashboard/\\(workspace\\)/menu/items/items-table-client.spec.tsx app/dashboard/\\(workspace\\)/menu/items/page.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Items list renders with filters + pagination + stop-list switch + archive AlertDialog; URL drives filter state; Russian copy matches UI-SPEC; specs pass.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                                                             | Description                                              |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Admin server actions → api `/internal/v1/catalog/stop-list` and `/items/:id/archive` | apiFetchInternal carries INTERNAL_API_TOKEN; server-only |

## STRIDE Threat Register

| Threat ID   | Category               | Component                                                 | Disposition | Mitigation Plan                                                                                                                 |
| ----------- | ---------------------- | --------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| T-04b-06-01 | Tampering              | CSRF on toggle/archive server actions                     | mitigate    | Next.js 15 server actions ship built-in CSRF token                                                                              |
| T-04b-06-02 | Information Disclosure | INTERNAL_API_TOKEN in client bundle                       | mitigate    | 'use server' actions + server-only apiFetchInternal preserved                                                                   |
| T-04b-06-03 | DoS                    | Operator spam-toggles stop-list                           | mitigate    | Existing app-level rate-limit per 4a T-04a-07-05; local 'pending' state disables Switch during in-flight request                |
| T-04b-06-04 | Tampering              | URL query-param injection (XSS via q)                     | mitigate    | React auto-escapes text in cells; q is rendered only inside controlled Input value; backend Plan 02 LIKE-escapes                |
| T-04b-06-05 | Repudiation            | Sticky bar count stale after toggle                       | mitigate    | toggleStopListAction + archiveItemAction call revalidatePath('/dashboard/menu', 'layout')                                       |
| T-04b-06-06 | Tampering              | Operator constructs ?status=archived URL to view archived | accept      | Archived view is the intended exposure; archived items are not destructive — this is a UI filter, not an authorization boundary |

</threat_model>

<verification>
- /dashboard/menu/items renders compact table with thumbs
- Filter bar drives URL; search debounces 300ms
- Stop-list Switch click toggles instantly via toast (1.5s); error snaps back
- Archive action opens AlertDialog; confirm hides row from default filter
- Pagination works at 50/page
- Russian copy matches UI-SPEC §Empty states + §Destructive actions row 2 verbatim
</verification>

<success_criteria>

1. Items page renders backend data with photo + price + status + stop-list switch + actions
2. Filter bar pushes URL state for category/status/q/page
3. toggleStopListAction handles POST/DELETE branches + revalidates layout
4. archiveItemAction PATCHes + revalidates layout
5. AlertDialog confirms archive with UI-SPEC copy verbatim
6. Pagination supports 50-per-page with boundary disabling
7. RTL + RSC specs pass
   </success_criteria>

<output>
Create `.planning/phases/04b-catalog-admin-ui/04b-06-SUMMARY.md` when done.
</output>
