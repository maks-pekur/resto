---
phase: 04b-catalog-admin-ui
plan: 05
type: execute
wave: 3
depends_on: ['04b-01', '04b-02', '04b-04']
files_modified:
  - apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx
  - apps/admin/app/dashboard/(workspace)/menu/categories/category-form-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/categories/categories-table-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/categories/upsert-category-action.ts
  - apps/admin/app/dashboard/(workspace)/menu/categories/archive-category-action.ts
  - apps/admin/app/dashboard/(workspace)/menu/categories/reorder-category-action.ts
  - apps/admin/components/menu/category-select.tsx
  - apps/admin/lib/menu/zod-schemas.ts
  - apps/admin/lib/menu/localized.ts
autonomous: false
requirements: [CAT-01]
must_haves:
  truths:
    - 'Operator can list categories at /dashboard/menu/categories'
    - 'Operator can create a category (name, parentId optional, sortOrder)'
    - 'Operator can edit a category name + parent + sortOrder'
    - "Operator can archive a category via AlertDialog confirmation; archive sets status='archived' (D-4b-07)"
    - 'Operator can reorder categories via up/down buttons (drag-drop deferred per D-4b-01)'
    - 'Category tree depth is capped at 2 (D-4b-01) — enforced via Zod refine AND UI disable-state on Parent Select'
    - "Hard deletes are forbidden in the database — soft-archive via status='archived' (D-4b-07)"
    - 'All catalog mutations go through apiFetchInternal (server-only, holds INTERNAL_API_TOKEN); never expose this in a client component'
    - 'Every server action revalidates /dashboard/menu layout to refresh the sticky publish bar diff'
    - 'Russian copy is canonical for all user-facing strings (D-05 single-locale MVP-1)'
    - "Indented dropdown displays parents flush + children prefixed with '↳' (RESEARCH.md Pattern 5)"
    - 'Status badges on categories use the same 5-variant StatusBadge as items (Plan 04 component)'
  artifacts:
    - path: 'apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx'
      provides: 'RSC list page for categories'
      contains: 'apiFetchInternal'
    - path: 'apps/admin/app/dashboard/(workspace)/menu/categories/category-form-client.tsx'
      provides: 'Create/edit form (server-action driven via useActionState)'
      contains: 'use client'
    - path: 'apps/admin/components/menu/category-select.tsx'
      provides: 'Indented Select component with depth-2 disable-state'
      contains: '↳'
    - path: 'apps/admin/lib/menu/zod-schemas.ts'
      provides: 'CategoryFormSchema + refineCategoryDepth'
      contains: 'refineCategoryDepth'
    - path: 'apps/admin/lib/menu/localized.ts'
      provides: 'toLocalizedText + fromLocalizedText boundary helpers'
      contains: 'toLocalizedText'
  key_links:
    - from: 'categories/page.tsx'
      to: 'apiFetchInternal'
      via: 'GET /internal/v1/catalog/categories'
      pattern: '/internal/v1/catalog/categories'
    - from: 'upsert-category-action.ts'
      to: 'apiFetchInternal'
      via: 'POST /internal/v1/catalog/categories'
      pattern: "method: 'POST'"
    - from: 'archive-category-action.ts'
      to: 'apiFetchInternal'
      via: 'PATCH /internal/v1/catalog/categories/:id/archive'
      pattern: "method: 'PATCH'"
    - from: 'category-form-client.tsx'
      to: 'CategorySelect'
      via: 'Parent picker'
      pattern: 'CategorySelect'
---

<objective>
Wave 3 frontend: Categories CRUD page at `/dashboard/menu/categories`. Indented flat list (2-level hierarchy per D-4b-01), create/edit form in a Sheet, archive via AlertDialog, reorder via up/down buttons. Depth ≤ 2 enforced via Zod refine + disable-state on Parent Select.

Purpose: CAT-01 ships here. Categories are the IA backbone for items (Plan 06) — operator needs to add `Напитки → Кофе/Чай` before they can categorize items.

Output: Categories RSC page; client table with archive + reorder; create/edit form with indented Parent Select; 3 server actions; shared CategorySelect + localized boundary helpers + base Zod schemas.
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
<!-- Backend interface from Plan 02 (now live): -->

GET /internal/v1/catalog/categories?parentId=<id|none> → CategoryListResponseDto:

```typescript
type CategoryListItem = {
  id: string;
  name: { ru?: string; en?: string; [locale: string]: string | undefined };
  parentId: string | null;
  sortOrder: number;
  status: 'draft' | 'published' | 'archived';
};
type CategoryListResponse = CategoryListItem[];
```

POST /internal/v1/catalog/categories — body matches existing UpsertCategoryInputDto from 4a:

```typescript
type UpsertCategoryInput = {
  id?: string; // omit for create; supply for update
  name: { [locale: string]: string }; // LocalizedText
  parentId: string | null;
  sortOrder: number;
};
```

PATCH /internal/v1/catalog/categories/:id/archive — empty body; returns 204.

Indented dropdown (RESEARCH.md Pattern 5):

```tsx
<Select onValueChange={onChange} value={value}>
  <SelectTrigger>
    <SelectValue placeholder="Выберите категорию" />
  </SelectTrigger>
  <SelectContent>
    {categories.map((c) => (
      <SelectItem
        key={c.id}
        value={c.id}
        disabled={c.parentId !== null && fieldIsParentSelector}
        className={c.parentId === null ? '' : 'pl-8'}
      >
        {c.parentId === null ? c.name : `↳ ${c.name}`}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Localized boundary helpers (RESEARCH.md Pitfall #9):

```typescript
toLocalizedText(plain: string, locale: string): Record<string, string>;
fromLocalizedText(value: Record<string, string>, locale: string): string;
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Shared Zod schemas + localized boundary helpers + CategorySelect</name>
  <files>apps/admin/lib/menu/zod-schemas.ts, apps/admin/lib/menu/localized.ts, apps/admin/components/menu/category-select.tsx</files>
  <behavior>
    - `CategoryFormSchema = z.object({ name: z.string().trim().min(1).max(255), parentId: z.string().uuid().nullable(), sortOrder: z.number().int().nonneg() })` — mirrors backend CAT-09 max-length
    - `refineCategoryDepth(schema, parentMap)` returns a refined schema that adds an issue on path `['parentId']` when the picked parent is itself a child (depth-3+ attempt)
    - `toLocalizedText(plain, locale)` returns `{ [locale]: plain }` (no extra keys)
    - `fromLocalizedText(value, locale)` returns `value[locale] ?? value['en'] ?? Object.values(value).find(Boolean) ?? ''`
    - Default locale source: const `DEFAULT_LOCALE = 'ru'` (Open Question #1 — pinned for MVP-1; v2 reads from tenant)
    - `CategorySelect` renders indented options; parent (parentId === null) options flush left; child (parentId !== null) options indented with `↳ ` prefix + `pl-8`; child options disabled when `mode='parent-picker'` to enforce depth ≤ 2
    - All copy Russian; placeholder `Выберите категорию` (parent picker) or `Категория не выбрана` (item picker — Plan 06 reuses)
  </behavior>
  <read_first>
    - apps/admin/lib/actions/create-brand.ts (analog — small Zod schema mirroring API DTO)
    - apps/api/src/contexts/catalog/application/dto.ts (existing UpsertCategoryInputDto — source of truth for max lengths)
    - apps/admin/components/ui/select.tsx (shadcn Select installed in Plan 01)
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pattern 5 + §Pitfall 9 (LocalizedText) + §Open Questions #1
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Frontend Zod schemas + §Wave 3 — Category Select (no analog row)
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Category depth enforcement (Interaction Contracts)
  </read_first>
  <action>
    Create `apps/admin/lib/menu/zod-schemas.ts`:
    - Import `z`
    - Export `CategoryFormSchema` (literal shape from behavior block)
    - Export `refineCategoryDepth(schema, parentIdToCategory: ReadonlyMap<string, { parentId: string | null }>)` returning `schema.superRefine((data, ctx) => { if (!data.parentId) return; const parent = parentIdToCategory.get(data.parentId); if (parent && parent.parentId !== null) { ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parentId'], message: 'Уровень вложенности ограничен двумя — родитель уже является подкатегорией.' }); } })`
    - Export type `CategoryForm = z.infer<typeof CategoryFormSchema>`
    Create `apps/admin/lib/menu/localized.ts`:
    - Export `DEFAULT_LOCALE = 'ru' as const`
    - Export `toLocalizedText(plain: string, locale: string = DEFAULT_LOCALE): Record<string, string>` returning `{ [locale]: plain }`
    - Export `fromLocalizedText(value: Record<string, string> | undefined | null, locale: string = DEFAULT_LOCALE): string` returning `value?.[locale] ?? value?.['en'] ?? (value ? Object.values(value).find((v): v is string => Boolean(v)) ?? '' : '')`
    Create `apps/admin/components/menu/category-select.tsx`:
    - `'use client'`
    - Props: `{ categories: ReadonlyArray<{ id: string; name: string; parentId: string | null }>; value: string | null; onChange: (v: string | null) => void; mode: 'parent-picker' | 'item-picker'; disabled?: boolean }`
    - Render shadcn Select per the interfaces block
    - For `mode='parent-picker'`: first option `<SelectItem value="__none__">— Без родителя —</SelectItem>`; child options (parentId !== null) get `disabled={true}` with `aria-disabled="true"` and the label `<span className="text-muted-foreground">{child name} (уже является подкатегорией)</span>`
    - For `mode='item-picker'`: all options selectable; children indented with `↳ ` and `pl-8`
    - `onValueChange` handler: when value is `"__none__"` call `onChange(null)` else call `onChange(value)`
    Tests:
    - `apps/admin/lib/menu/zod-schemas.spec.ts`: (a) valid input passes; (b) name length 256 fails; (c) parentId pointing to a child fails with the Russian message; (d) parentId pointing to a parent (parentId=null) passes
    - `apps/admin/lib/menu/localized.spec.ts`: (a) `toLocalizedText('Капучино')` returns `{ ru: 'Капучино' }`; (b) `fromLocalizedText({ ru: 'Капучино' })` returns `'Капучино'`; (c) `fromLocalizedText({ en: 'Cappuccino' })` returns `'Cappuccino'` (fallback chain); (d) `fromLocalizedText(undefined)` returns `''`
    - `apps/admin/components/menu/category-select.spec.tsx`: (a) parent-picker mode disables child options + shows muted label; (b) item-picker mode renders all options with ↳ prefix on children; (c) clicking "— Без родителя —" calls onChange(null)
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run lib/menu/zod-schemas.spec.ts lib/menu/localized.spec.ts components/menu/category-select.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Schemas, helpers, and CategorySelect ship with documented behavior; specs pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Server actions — upsert / archive / reorder category</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/categories/upsert-category-action.ts, apps/admin/app/dashboard/(workspace)/menu/categories/archive-category-action.ts, apps/admin/app/dashboard/(workspace)/menu/categories/reorder-category-action.ts</files>
  <behavior>
    - `upsertCategoryAction(_prev, FormData)` parses CategoryFormSchema; on validation failure returns `{ error: <Russian>, success: null }`; on success POSTs to `/internal/v1/catalog/categories` with `{ id?, name: toLocalizedText(plain), parentId, sortOrder }`; on api 409 returns friendly Russian copy; revalidates layout
    - `archiveCategoryAction(_prev, { id })` PATCHes `/internal/v1/catalog/categories/:id/archive`; on api 404 returns `{ error: 'Категория не найдена', success: null }`; on api ok returns `{ error: null, success: true }`; revalidates layout
    - `reorderCategoryAction(_prev, { id, direction })` reads current categories via GET, computes neighbor swap (current.sortOrder ↔ neighbor.sortOrder), POSTs two upsert calls (or single batch if backend supports — Plan 02 does not, so two sequential upserts); on either failure returns error; revalidates layout
    - All three are `'use server'` and use `apiFetchInternal`; INTERNAL_API_TOKEN never reaches client
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/settings/invite-action.ts (analog — useActionState-compatible action shape)
    - apps/admin/lib/actions/create-brand.ts (analog — friendly() error mapper)
    - apps/admin/lib/menu/schedule-publish-action.ts (Plan 04 — apiFetchInternal POST pattern)
    - apps/admin/lib/menu/zod-schemas.ts (created in Task 1)
    - apps/admin/lib/menu/localized.ts (created in Task 1)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Server actions + Pattern S1 + Pattern S8
  </read_first>
  <action>
    Create the three server actions per behavior. Use `'use server'` directive on each file.
    Shared `friendly(status, body)` mapper (inline in upsert-category-action.ts; reused via local function): 409 with `catalog.menu_category_not_found` → `'Категория не найдена.'`; 409 with `catalog.menu_category_slug_taken` (if applicable) → `'Категория с таким названием уже существует.'`; 400 → `body?.message ?? 'Проверьте поля формы.'`; 5xx → `'Серверная ошибка. Попробуйте ещё раз.'`; else `body?.detail ?? \`Запрос не выполнен (${status}).\``.
    `upsertCategoryAction` signature `(prev: { error: string | null; success: { id: string } | null }, formData: FormData): Promise<UpsertCategoryActionState>`:
    1. `const raw = Object.fromEntries(formData);` — extract name, parentId (or empty string), sortOrder, id (optional)
    2. Parse via `CategoryFormSchema` with `parentId` empty string normalized to null and `sortOrder` coerced to number
    3. If invalid → `{ error: parsed.error.issues[0]?.message ?? 'Проверьте поля.', success: null }`
    4. Build payload: `{ id: raw.id || undefined, name: toLocalizedText(parsed.data.name), parentId: parsed.data.parentId, sortOrder: parsed.data.sortOrder }`
    5. POST via apiFetchInternal; on !ok → friendly error
    6. revalidatePath('/dashboard/menu', 'layout')
    7. Return `{ error: null, success: { id: res.data.id } }`
    `archiveCategoryAction` signature `(prev: { error: string | null; success: boolean }, input: { id: string }): Promise<...>`:
    1. PATCH apiFetchInternal `/internal/v1/catalog/categories/${id}/archive`
    2. On !ok with status 404 → `'Категория не найдена.'`; else friendly mapper
    3. revalidatePath('/dashboard/menu', 'layout')
    4. Return `{ error: null, success: true }`
    `reorderCategoryAction` signature `(prev: ..., input: { id: string; direction: 'up' | 'down' }): Promise<...>`:
    1. GET /internal/v1/catalog/categories — find current + neighbor (same parentId scope; sorted by sortOrder ASC)
    2. If no neighbor in the requested direction → `{ error: null, success: true }` (no-op edge case)
    3. Swap sortOrder values via two POST upserts (preserve name + parentId from current rows; only sortOrder changes; LocalizedText name must be sent back as-is, not as plain string — use `value` from GET response directly)
    4. Either failure rolls back nothing (best-effort) but returns error
    5. revalidatePath('/dashboard/menu', 'layout')
    Tests: stub apiFetchInternal in each spec file. Assert: upsert validation failure short-circuits; upsert success calls revalidatePath; archive 404 returns Russian error; reorder swaps sortOrders via two POSTs.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/categories/upsert-category-action.spec.ts app/dashboard/\\(workspace\\)/menu/categories/archive-category-action.spec.ts app/dashboard/\\(workspace\\)/menu/categories/reorder-category-action.spec.ts --no-coverage</automated>
  </verify>
  <done>
    Three server actions with documented signatures; revalidatePath called on every success; specs pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Categories page (RSC) + categories-table-client + category-form-client (Sheet)</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx, apps/admin/app/dashboard/(workspace)/menu/categories/categories-table-client.tsx, apps/admin/app/dashboard/(workspace)/menu/categories/category-form-client.tsx</files>
  <behavior>
    - `/dashboard/menu/categories` RSC fetches via `apiFetchInternal<CategoryListResponse>('/internal/v1/catalog/categories')`; on api error renders `<EmptyState variant="forbidden">` (403) or empty list state
    - Page chrome matches UI-SPEC §Shell chrome: header with SidebarTrigger + Separator + TenantBreadcrumb `Меню › Категории` + flush-right `+ Создать категорию` Button (primary)
    - Table columns: `[↑↓ buttons] | Название | Родитель | Позиция | Статус | [edit] [archive]` per UI-SPEC §Categories page
    - Child rows visually indented (`pl-4` + `↳ ` prefix in name cell)
    - Click `+ Создать категорию` or edit icon → opens Sheet with `CategoryFormClient`
    - Click archive icon → opens AlertDialog with copy from UI-SPEC §Destructive actions row 1
    - Reorder up/down buttons hidden when row has no neighbor in that direction
    - Empty state: `<EmptyState variant="empty" title="Категории не добавлены" description="Добавьте первую категорию, чтобы сгруппировать блюда в меню." action={<Button>Создать категорию</Button>} />`
    - StatusBadge column renders all 5 variants; default filter on this page is "all except archived" (consistent with items page) — Archived filter toggle deferred to v2 here; render archived if returned but UI default GET request includes `status=draft,published` query? Backend Plan 02 default returns all statuses, frontend filters client-side to default-exclude archived. Provide a Show archived toggle.
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/settings/page.tsx (analog — header chrome + EmptyState pattern + me/redirect)
    - apps/admin/app/dashboard/(workspace)/settings/invite-form-client.tsx (analog — useActionState + form pattern; categories use the same simple form, not RHF, since auto-save is item-only per D-4b-02)
    - apps/admin/components/empty-state.tsx (reuse — variants 'empty' / 'forbidden')
    - apps/admin/components/tenant-breadcrumb.tsx (analog header)
    - apps/admin/components/menu/category-select.tsx (created in Task 1 — Parent picker)
    - apps/admin/components/menu/status-badge.tsx (Plan 04)
    - apps/admin/components/ui/{table,sheet,alert-dialog,dropdown-menu,button,input,label}.tsx
    - apps/admin/lib/menu/localized.ts (fromLocalizedText for display)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — RSC pages + §Wave 3 — Form clients (Simple form)
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Categories page + §Destructive actions
  </read_first>
  <action>
    Create `apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx` (RSC):
    1. `apiFetch<MeResponse>('/v1/me')` → if not operator, `redirect('/login')` (mirror settings/page.tsx lines 24-32)
    2. `apiFetchInternal<CategoryListResponse>('/internal/v1/catalog/categories')` → if `res.status === 403`, render forbidden EmptyState
    3. Compute parent map (Map<id, {parentId, name}>) and pass to client component for the indented Select
    4. Render UI-SPEC §Shell chrome with TenantBreadcrumb trail `Меню › Категории`
    5. If `categories.length === 0` → empty EmptyState with `<Button>` triggering open of Sheet (managed by client component)
    6. Else: render `<CategoriesTableClient categories={...} parentsMap={...} />`

    Create `apps/admin/app/dashboard/(workspace)/menu/categories/categories-table-client.tsx`:
    - `'use client'`
    - Local state: `editingId: string | null`, `showArchived: boolean = false`
    - Filter `categories` by `showArchived` (else `s.status !== 'archived'`)
    - Sort: parents first by sortOrder, then their children by sortOrder (compute tree client-side)
    - Render shadcn `<Table>` with columns per behavior; child rows use `pl-4` cell padding + `↳ ` prefix in the Название cell
    - Reorder column: two `<Button size="icon" variant="ghost" aria-label="Поднять выше">` / `aria-label="Опустить ниже"` calling `reorderCategoryAction({ id, direction })`; hide when no neighbor
    - Edit action: opens Sheet with `<CategoryFormClient mode="edit" category={...} parentsMap={...} onClose={...} />`
    - Archive action: opens AlertDialog with title `Архивировать категорию?` and body `Категория «{name}» будет скрыта. Все блюда в ней останутся в черновике. Действие можно отменить, опубликовав категорию снова.` from UI-SPEC §Destructive actions; confirm button `Архивировать` (variant="destructive") calls `archiveCategoryAction({ id })`; cancel button `Отмена`
    - Top-right toggle: `<Button variant="ghost" onClick={() => setShowArchived(v => !v)}>{showArchived ? 'Скрыть архив' : 'Показать архив'}</Button>`

    Create `apps/admin/app/dashboard/(workspace)/menu/categories/category-form-client.tsx`:
    - `'use client'`
    - Props: `{ mode: 'create' | 'edit'; category?: CategoryListItem; parentsMap: Map<string, { parentId: string | null; name: string }>; onClose: () => void; allCategories: ReadonlyArray<CategoryListItem> }`
    - Use `useActionState(upsertCategoryAction, { error: null, success: null })` per the project pattern (no RHF — categories form is small and doesn't need auto-save per D-4b-02 which is item-only)
    - Render `<form action={action}>` containing:
      - Hidden `<input type="hidden" name="id" value={category?.id ?? ''} />`
      - `<Label htmlFor="cat-name">Название</Label><Input id="cat-name" name="name" required maxLength={255} defaultValue={category ? fromLocalizedText(category.name) : ''} />`
      - `<Label>Родитель</Label><CategorySelect categories={allCategories.map(c => ({ id: c.id, name: fromLocalizedText(c.name), parentId: c.parentId }))} value={category?.parentId ?? null} onChange={(v) => setParentId(v)} mode="parent-picker" />` — pair with a hidden input `<input type="hidden" name="parentId" value={parentId ?? ''} />`
      - `<Label htmlFor="cat-sort">Позиция</Label><Input id="cat-sort" name="sortOrder" type="number" min="0" defaultValue={category?.sortOrder ?? 0} />`
    - On submit pending: show submit button as `Сохраняем…`
    - On `state.error`: render `<p role="alert" className="text-destructive text-sm">{state.error}</p>`
    - On `state.success !== null`: call `onClose()` from `useEffect(() => { if (state.success) onClose(); }, [state.success])`
    - Wrap form in shadcn `<Sheet>` (controlled open prop from parent)

    Tests (RTL):
    - `categories/page.spec.tsx`: stub apiFetchInternal → assert table renders with parent + child indentation
    - `categories/categories-table-client.spec.tsx`: assert archive button opens AlertDialog with UI-SPEC copy; assert reorder buttons hidden at boundaries; assert showArchived toggle filters rows
    - `categories/category-form-client.spec.tsx`: assert form submission calls action with toLocalizedText payload; assert validation error renders inline; assert Sheet closes on success

  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/categories/page.spec.tsx app/dashboard/\\(workspace\\)/menu/categories/categories-table-client.spec.tsx app/dashboard/\\(workspace\\)/menu/categories/category-form-client.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Page renders categories tree, supports CRUD via Sheet + AlertDialog, reorder buttons swap sortOrder via two POSTs, archive confirms via shadcn AlertDialog using UI-SPEC copy; specs pass.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                                     | Description                                              |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Admin server actions → api `/internal/v1/catalog/categories` | apiFetchInternal carries INTERNAL_API_TOKEN; server-only |

## STRIDE Threat Register

| Threat ID   | Category               | Component                                                     | Disposition | Mitigation Plan                                                                                                                          |
| ----------- | ---------------------- | ------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| T-04b-05-01 | Tampering              | Operator constructs depth-3+ tree via API                     | mitigate    | Zod refineCategoryDepth on the form payload AND disable-state on Parent Select per D-4b-01 (both belt + suspenders)                      |
| T-04b-05-02 | Tampering              | Bypassing soft-archive via direct API call                    | accept      | Backend has no DELETE on menu_categories (per ADR-0020 + Plan 02); only PATCH archive endpoint exists                                    |
| T-04b-05-03 | Information Disclosure | LocalizedText leaking other-locale data into single-locale UI | mitigate    | fromLocalizedText fallback chain prefers ru; if absent, falls back to en or first non-empty value (no leak risk, but consistent display) |
| T-04b-05-04 | DoS                    | Reorder action firing two POST calls with no batch            | accept      | Categories are <100 per tenant in MVP-1; two POSTs is acceptable load                                                                    |
| T-04b-05-05 | Tampering              | CSRF on server actions                                        | mitigate    | Next.js 15 server actions ship built-in CSRF token                                                                                       |
| T-04b-05-06 | Repudiation            | Sticky bar count stale after upsert                           | mitigate    | All three server actions call revalidatePath('/dashboard/menu', 'layout') per Pattern S8                                                 |

</threat_model>

<verification>
- /dashboard/menu/categories renders categories sorted parent → children with indent
- Create → Sheet opens with form; submit → row appears in table
- Edit → Sheet opens prefilled; submit → row updates
- Archive → AlertDialog opens with UI-SPEC copy; confirm → row disappears (or shows archived when toggle on)
- Reorder ↑↓ swaps sortOrder; buttons hidden at boundaries
- Depth-3+ attempt: Parent Select disables already-child options; if bypassed, Zod refine adds issue path 'parentId'
- Sticky publish bar count refreshes after each mutation (revalidatePath layout)
</verification>

<success_criteria>

1. CategoryFormSchema + refineCategoryDepth + toLocalizedText + fromLocalizedText available for downstream plans
2. CategorySelect component renders indented options + disable-state for parent-picker mode
3. 3 server actions (upsert, archive, reorder) revalidate layout
4. Categories page renders tree with archive AlertDialog + reorder buttons
5. Russian copy matches UI-SPEC §Destructive actions row 1 verbatim
6. All RTL + unit specs pass
   </success_criteria>

<output>
Create `.planning/phases/04b-catalog-admin-ui/04b-05-SUMMARY.md` when done.
</output>
