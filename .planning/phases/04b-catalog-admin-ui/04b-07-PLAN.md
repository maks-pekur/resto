---
phase: 04b-catalog-admin-ui
plan: 07
type: execute
wave: 5
depends_on: ['04b-01', '04b-02', '04b-03', '04b-04', '04b-05', '04b-06']
files_modified:
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/page.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-detail-tab-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-sizes-tab-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/photo-upload-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-size-action.ts
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/photo-upload-url-action.ts
  - apps/admin/components/menu/bju-row.tsx
  - apps/admin/lib/menu/use-auto-save.ts
  - apps/admin/lib/menu/zod-schemas.ts
autonomous: false
requirements: [CAT-02, CAT-03, CAT-05]
must_haves:
  truths:
    - 'Item editor lives at /dashboard/menu/items/[id] and /dashboard/menu/items/new (D-04 full-page editor)'
    - 'Editor uses tabs: Детали (Detail) / Размеры (Sizes) / Модификаторы (Modifiers — Plan 08 mounts the Modifiers tab content)'
    - 'Detail tab uses react-hook-form + zodResolver(ItemEditorFormSchema); auto-save on blur / 1.5s debounce per D-4b-02'
    - 'AutoSaveIndicator (from Plan 04) shows Сохранение… / Сохранено Xс назад / Не сохранено — повторить (UI-SPEC §Auto-Save Indicator Spec)'
    - 'Auto-save concurrency guard: monotonic requestId; only latest request transitions indicator state (Pitfall #5)'
    - 'Single-photo upload via native HTML5 input + dragover/drop; calls photoUploadUrlAction → browser PUTs directly to S3 → upsertItemAction with photos[0] (D-07, CAT-03)'
    - 'Photo upload allowlist: image/jpeg, image/png, image/webp; size cap 5 MiB; mismatched type or size shows Russian inline error'
    - "Sizes tab: inline rows [Name] [Price (absolute, in tenant currency)] [Default radio] [× remove] + 'Добавить размер'; auto-save inherits per D-4b-04"
    - "Absolute price semantics for sizes — label 'Цена' not 'Доплата' (D-4b-04 confirms 4a rename)"
    - 'БЖУ row: 4 inputs Б Ж У ккал per 100g + AI-оценка badge when nutrition_estimated=true (D-06, UI-SPEC §БЖУ section)'
    - "Hidden 'Добавить ещё фото' button shown as disabled with v2 Tooltip (D-07, UI-SPEC §Photo Upload Spec)"
    - 'Category selector in Detail tab uses CategorySelect in item-picker mode (Plan 05)'
    - 'Slug helper text under name field shows server-derived slug (display-only — UI does not transliterate)'
    - 'All catalog mutations go through apiFetchInternal (server-only, holds INTERNAL_API_TOKEN); never expose this in a client component'
    - 'Every server action revalidates /dashboard/menu layout to refresh the sticky publish bar diff'
    - 'Russian copy is canonical for all user-facing strings (D-05 single-locale MVP-1)'
    - "Hard deletes are forbidden — sizes 'remove' soft-deletes via API (existing 4a behavior)"
  artifacts:
    - path: 'apps/admin/app/dashboard/(workspace)/menu/items/[id]/page.tsx'
      provides: 'RSC item editor (fetches /items/:id + categories list)'
      contains: 'apiFetchInternal'
    - path: 'apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client.tsx'
      provides: 'Tabs container + AutoSaveIndicator wiring'
      contains: 'TabsList'
    - path: 'apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-detail-tab-client.tsx'
      provides: 'RHF form for Detail tab; auto-save'
      contains: 'react-hook-form'
    - path: 'apps/admin/app/dashboard/(workspace)/menu/items/[id]/photo-upload-client.tsx'
      provides: 'Native file input + presigned PUT direct-to-S3'
      contains: "method: 'PUT'"
    - path: 'apps/admin/lib/menu/use-auto-save.ts'
      provides: 'Custom hook: RHF watch+debounce → server action with request-id concurrency guard'
      exports: ['useDebouncedAutosave']
    - path: 'apps/admin/components/menu/bju-row.tsx'
      provides: 'БЖУ 4-input row with AI-оценка badge'
      contains: 'ккал'
  key_links:
    - from: 'items/[id]/page.tsx'
      to: 'apiFetchInternal'
      via: 'GET /internal/v1/catalog/items/:id + GET /categories'
      pattern: '/internal/v1/catalog/items/'
    - from: 'item-detail-tab-client.tsx'
      to: 'useDebouncedAutosave'
      via: 'watch+debounce → upsertItemAction'
      pattern: 'useDebouncedAutosave'
    - from: 'photo-upload-client.tsx'
      to: 'browser direct-PUT to S3'
      via: "fetch(uploadUrl, { method: 'PUT' })"
      pattern: "method: 'PUT'"
    - from: 'photo-upload-url-action.ts'
      to: 'apiFetchInternal'
      via: 'POST /internal/v1/catalog/photo-upload-url (Plan 03)'
      pattern: 'photo-upload-url'
---

<objective>
Wave 5 frontend: the full-page item editor — the largest single surface in 4b. Tabs container (Детали / Размеры / Модификаторы), RHF auto-save for Detail tab, photo upload via presigned PUT, sizes inline editor with auto-save. The Модификаторы tab landing site is created here as an empty placeholder; Plan 08 fills its content.

Purpose: CAT-02 form layout, CAT-03 photo upload UX, CAT-05 sizes UX all ship here. This is the auto-save surface — D-4b-02's RHF + watch+debounce pattern lives in `useDebouncedAutosave`.

Output: 1 RSC route, 1 tabs shell, 2 tab client components, 3 server actions, 1 hook, 1 BJU row component, extended Zod schemas.
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
<!-- Backend (Plan 02 live): -->

GET /internal/v1/catalog/items/:id → ItemDetailResponseDto:

```typescript
type ItemDetail = {
  id: string;
  name: Record<string, string>;
  description: Record<string, string> | null;
  categoryId: string;
  basePrice: string; // numeric → string
  currency: string;
  allergens: string[];
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  kcal: number | null;
  nutritionEstimated: boolean;
  source: 'manual' | 'ai_generated' | 'imported_iiko' | 'imported_csv';
  photos: Array<{
    s3Key: string;
    sortOrder: number;
    isPrimary: boolean;
    url?: string;
  }>;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  sizes: Array<{
    id: string;
    name: Record<string, string>;
    price: string;
    isDefault: boolean;
  }>;
  modifierGroupIds: string[];
};
```

POST /internal/v1/catalog/items — UpsertItemInput (existing 4a-07).
POST /internal/v1/catalog/item-sizes — UpsertItemSizeInput (existing 4a-07).
DELETE /internal/v1/catalog/item-sizes/:id — soft-delete (existing).
POST /internal/v1/catalog/photo-upload-url (Plan 03) → { uploadUrl, s3Key }.

Auto-save hook (RESEARCH.md Pattern 1, extended with request-id guard per Pitfall #5):

```typescript
export const useDebouncedAutosave = <TForm extends FieldValues>(
  form: UseFormReturn<TForm>,
  onPersist: (values: TForm) => Promise<{ ok: boolean }>,
  onState: (s: SaveState) => void,
): void;
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend zod-schemas with ItemEditorFormSchema + SizeFormSchema; build useDebouncedAutosave hook with request-id guard</name>
  <files>apps/admin/lib/menu/zod-schemas.ts, apps/admin/lib/menu/use-auto-save.ts</files>
  <behavior>
    - `ItemEditorFormSchema`: name (string min 1 max 255), description (string max 4096 nullable), categoryId (uuid), basePrice (coerce.number min 0), currency (regex /^[A-Z]{3}$/), allergens (array of strings max 100 chars each, max 50 entries), proteins/fats/carbs (coerce.number min 0 max 999.99 nullable), kcal (coerce.number int min 0 max 32000 nullable), nutritionEstimated (boolean default false)
    - `SizeFormSchema`: name (string min 1 max 100), price (coerce.number min 0), isDefault (boolean default false)
    - `useDebouncedAutosave(form, onPersist, onState)` subscribes to `form.watch(cb)` with `type === 'change'` filter; 1500ms debounce; on timer fire: transitions onState('saving'), generates monotonic `requestId`, calls `onPersist(values)`, transitions onState based on response — but ONLY when `requestId === currentRequestId.current` (Pitfall #5 race-id guard); cleans up on unmount
    - Hook does NOT call onPersist when there are no field changes (programmatic resets ignored via `type !== 'change'` filter)
  </behavior>
  <read_first>
    - apps/admin/lib/menu/zod-schemas.ts (Plan 05 — extend with new schemas)
    - apps/api/src/contexts/catalog/application/dto.ts (UpsertItemInputSchema — source of truth for max lengths)
    - apps/admin/app/(onboarding)/onboarding/brand/brand-form-client.tsx (lines 61-97 — setTimeout + requestId.current race-id pattern; the canonical in-repo debounce shape)
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pattern 1 (watch+debounce) + §Pitfall 5 (concurrent saves)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — use-auto-save.ts + §Frontend Zod schemas
    - apps/admin/lib/menu/types.ts (SaveState from Plan 04)
  </read_first>
  <action>
    Extend `apps/admin/lib/menu/zod-schemas.ts` with `ItemEditorFormSchema` + `SizeFormSchema` (literal shapes from behavior). Mirror CAT-09 max-lengths from `apps/api/.../application/dto.ts`. Export inferred types `ItemEditorForm`, `SizeForm`.

    Create `apps/admin/lib/menu/use-auto-save.ts`:
    - `'use client'`
    - Constant `DEBOUNCE_MS = 1500`
    - Export `useDebouncedAutosave<TForm extends FieldValues>(form: UseFormReturn<TForm>, onPersist: (values: TForm) => Promise<{ ok: boolean }>, onState: (s: SaveState) => void): void`
    - Implementation:
      - `const requestIdRef = useRef(0); const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);`
      - In `useEffect([form, onPersist, onState])`:
        - `const subscription = form.watch((_values, { type }) => { if (type !== 'change') return; if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => { const myReqId = ++requestIdRef.current; onState({ kind: 'saving' }); void form.handleSubmit(async (values) => { const res = await onPersist(values as TForm); if (myReqId !== requestIdRef.current) return; // newer save in flight — discard this response onState(res.ok ? { kind: 'saved', at: Date.now() } : { kind: 'failed', retry: () => { /* re-invoke via form.handleSubmit */ } }); })(); }, DEBOUNCE_MS); });`
        - `return () => { if (timerRef.current) clearTimeout(timerRef.current); subscription.unsubscribe(); };`
    - Add WHY-comment block at top: `// Auto-save via RHF watch+debounce (RESEARCH.md Pattern 1, community-canonical for RHF).` and `// requestId guard prevents older saves overwriting newer indicator state (RESEARCH.md Pitfall #5).`

    Tests:
    - `apps/admin/lib/menu/zod-schemas.spec.ts` (extend existing): assert ItemEditorFormSchema accepts a complete payload; rejects name=''; rejects basePrice=-1; accepts proteins=null; rejects kcal=32001
    - `apps/admin/lib/menu/use-auto-save.spec.tsx` (new — uses RTL + RHF testing utilities + vi.useFakeTimers): assert (a) field change triggers onPersist after 1500ms exactly once; (b) two rapid changes within 1500ms result in one onPersist call (debounce); (c) when persist returns ok → onState transitions to 'saved'; (d) when persist returns !ok → onState transitions to 'failed'; (e) when a newer save starts before an older save resolves, only the newer save's onState transition is honored; (f) cleanup runs on unmount (no stale timer fires)

  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run lib/menu/zod-schemas.spec.ts lib/menu/use-auto-save.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Both schemas exist with correct max lengths; useDebouncedAutosave hook covers debounce, race-id guard, and cleanup; specs pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Server actions — upsert-item (auto-save target), upsert-item-size, photo-upload-url</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts, apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-size-action.ts, apps/admin/app/dashboard/(workspace)/menu/items/[id]/photo-upload-url-action.ts</files>
  <behavior>
    - `upsertItemAction(itemId: 'new' | string, values: ItemEditorForm, photoS3Key: string | null)`:
      - Parse values via ItemEditorFormSchema (returns Russian error on validation failure)
      - Build payload: `{ id: itemId === 'new' ? undefined : itemId, categoryId, name: toLocalizedText(values.name), description: values.description ? toLocalizedText(values.description) : null, basePrice: values.basePrice.toFixed(2), currency, allergens, proteins, fats, carbs, kcal, nutritionEstimated, source: 'manual', photos: photoS3Key ? [{ s3Key: photoS3Key, sortOrder: 0, isPrimary: true }] : [] }`
      - POST /internal/v1/catalog/items via apiFetchInternal
      - On !ok → return `{ ok: false, error: <Russian> }`
      - On ok → revalidatePath('/dashboard/menu', 'layout') and revalidatePath(`/dashboard/menu/items/${res.data.id}`); return `{ ok: true, id: res.data.id }`
    - `upsertItemSizeAction(itemId, values: SizeForm & { sizeId?: string }, isDelete?: boolean)`:
      - if isDelete + sizeId → DELETE /internal/v1/catalog/item-sizes/${sizeId}
      - else POST /internal/v1/catalog/item-sizes with `{ id: values.sizeId, itemId, name: toLocalizedText(values.name), price: values.price.toFixed(2), isDefault: values.isDefault }`
      - On ok → revalidatePath('/dashboard/menu', 'layout') and revalidatePath(`/dashboard/menu/items/${itemId}`); return `{ ok: true }`
    - `photoUploadUrlAction(contentType, sizeBytes)` → POST /internal/v1/catalog/photo-upload-url (Plan 03 endpoint); returns `{ ok: true; uploadUrl: string; s3Key: string } | { ok: false; error: string }`
    - All 'use server'; never expose INTERNAL_API_TOKEN
  </behavior>
  <read_first>
    - apps/admin/lib/menu/zod-schemas.ts (Task 1 — schemas)
    - apps/admin/lib/menu/localized.ts (Plan 05)
    - apps/admin/app/dashboard/(workspace)/menu/categories/upsert-category-action.ts (Plan 05 — analog shape)
    - apps/api/src/contexts/catalog/application/dto.ts (UpsertItemInputDto payload contract)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Server actions + §Pattern S1 + §Pattern S8
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pitfall 10 (Drizzle numeric — toFixed) + §Pitfall 9 (LocalizedText)
  </read_first>
  <action>
    Create the three server actions per behavior, mirroring Plan 05's structure. Each uses `apiFetchInternal`. Russian friendly errors per UI-SPEC §Error states. All call `revalidatePath('/dashboard/menu', 'layout')` on success per Pattern S8 + Pitfall #4.
    Tests: one spec per action, stub apiFetchInternal:
    - `upsert-item-action.spec.ts`: assert validation failure short-circuits; assert ok response calls revalidatePath both layout and detail path; assert payload toFixed(2) is applied to basePrice; assert photoS3Key=null sends empty photos[]; photoS3Key='abc' sends single-entry photos[]
    - `upsert-item-size-action.spec.ts`: assert isDelete=true DELETEs the right path; isDelete=false POSTs with toLocalizedText name and toFixed(2) price; both revalidate layout
    - `photo-upload-url-action.spec.ts`: assert POSTs payload `{ contentType, sizeBytes }`; rejects oversized payload before reaching api (defensive client-side check or rely on api)
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/items/\\[id\\]/upsert-item-action.spec.ts app/dashboard/\\(workspace\\)/menu/items/\\[id\\]/upsert-item-size-action.spec.ts app/dashboard/\\(workspace\\)/menu/items/\\[id\\]/photo-upload-url-action.spec.ts --no-coverage</automated>
  </verify>
  <done>
    Three server actions exist with documented signatures + revalidation; specs pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Item editor RSC + shell client (tabs + AutoSaveIndicator) + Detail tab client (RHF + auto-save) + BJU row</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/items/[id]/page.tsx, apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client.tsx, apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-detail-tab-client.tsx, apps/admin/components/menu/bju-row.tsx</files>
  <behavior>
    - RSC `[id]/page.tsx` reads `params.id`; when `id === 'new'`, renders editor with empty defaults (no GET); else GET /internal/v1/catalog/items/:id; parallel GET /categories for the dropdown
    - 404 from api → render `<EmptyState variant="empty" title="Блюдо не найдено" description="Возможно, оно было удалено." />`
    - Page header: TenantBreadcrumb trail `Меню › Блюда › {fromLocalizedText(item.name) || 'Новое блюдо'}`; flush-right `<AutoSaveIndicator state={...} />` (state managed by shell client)
    - Tabs: shadcn Tabs with `defaultValue="detail"`; TabsList items `Детали` / `Размеры` / `Модификаторы`
    - Tab switch DOES NOT trigger save (UI-SPEC: tab switching is view-only; auto-save is field-change driven). Form state stays mounted across tab switches.
    - Detail tab uses RHF with `useDebouncedAutosave(form, persistFn, setSaveState)`; persistFn calls `upsertItemAction(itemId, values, currentPhotoS3Key)`
    - For new items: first auto-save creates the item (POST without id); response `id` is captured; `router.replace('/dashboard/menu/items/${newId}')` to flip URL (per UI-SPEC §Item editor navigation)
    - Detail tab two-column layout per UI-SPEC §Item editor: left flex-1 (Название, Описание, Категория CategorySelect item-picker, Цена, БЖУ row, Аллергены), right w-64/w-72 (PhotoUploadClient — Task 4)
    - Аллергены: comma-separated text input → array (split + trim + filter); display as comma-separated string in form
    - Slug helper text under Название shows `slug` field from item detail (read-only, muted text); empty for new items until first save
    - БЖУ row uses `<BjuRow proteins={...} fats={...} carbs={...} kcal={...} nutritionEstimated={...} onChange={...} />`
    - All form fields use shadcn Form primitives (FormField, FormItem, FormLabel, FormControl, FormMessage)
    - Russian labels per UI-SPEC §Item editor: Название, Описание, Категория, Цена, Аллергены, "на 100 г"
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/items/page.tsx (Plan 06 — items list RSC redirect pattern)
    - apps/admin/components/ui/{tabs,form,input,textarea,select,badge}.tsx (Plan 01 installs)
    - apps/admin/components/menu/auto-save-indicator.tsx (Plan 04)
    - apps/admin/components/menu/category-select.tsx (Plan 05)
    - apps/admin/components/menu/status-badge.tsx (Plan 04)
    - apps/admin/lib/menu/use-auto-save.ts (Task 1)
    - apps/admin/lib/menu/zod-schemas.ts (Task 1 — ItemEditorFormSchema)
    - apps/admin/lib/menu/localized.ts (Plan 05)
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Item editor page + §Detail tab layout + §БЖУ section + §Auto-Save Indicator Spec
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Form clients (Auto-save editor) + §Frontend Zod schemas
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Code Examples (Server action for auto-save)
  </read_first>
  <action>
    Create `apps/admin/components/menu/bju-row.tsx`:
    - `'use client'`
    - Props: `{ proteins: number | null; fats: number | null; carbs: number | null; kcal: number | null; nutritionEstimated: boolean; onChange: (field: 'proteins'|'fats'|'carbs'|'kcal', value: number | null) => void }`
    - Render 4 Input number fields side by side (`grid grid-cols-4 gap-2`): labels Б, Ж, У, ккал; step="0.1" for proteins/fats/carbs; step="1" for kcal
    - Below grid: `<p className="text-xs text-muted-foreground">на 100 г{nutritionEstimated ? <Badge variant="secondary" className="text-xs ml-2">AI-оценка</Badge> : null}</p>`
    - Empty input handling: empty string in input → onChange(field, null); else `Number.parseFloat(value)` (or Int for kcal)

    Create `apps/admin/app/dashboard/(workspace)/menu/items/[id]/page.tsx` (RSC):
    1. `apiFetch<MeResponse>('/v1/me')` + redirect check
    2. `const isNew = params.id === 'new'`
    3. Parallel fetches: `isNew ? null : apiFetchInternal<ItemDetail>(\`/internal/v1/catalog/items/${params.id}\`)`, `apiFetchInternal<CategoryListResponse>('/internal/v1/catalog/categories')`
    4. If item fetch returns 404 → render `<EmptyState variant="empty" title="Блюдо не найдено" description="Возможно, оно было удалено." />`
    5. Render shell with header + `<ItemEditorShellClient initialItem={item ?? null} categories={categories} itemId={params.id} />`

    Create `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client.tsx`:
    - `'use client'`
    - Props: `{ initialItem: ItemDetail | null; categories: ...; itemId: 'new' | string }`
    - Local state: `currentItemId: 'new' | string` (initialized from prop; flips to real id after first save), `currentPhotoS3Key: string | null` (initialized from initialItem?.photos[0]?.s3Key), `saveState: SaveState` (idle initially), `currentSizes: ItemDetail['sizes']` (managed locally for sizes tab)
    - Header row: TenantBreadcrumb + `<AutoSaveIndicator state={saveState} />`
    - Tabs: shadcn Tabs with `defaultValue="detail"`; TabsList items Детали / Размеры / Модификаторы (Plan 08 renders Модификаторы content)
    - Wire `<ItemDetailTabClient initialValues={...} categories={categories} currentPhotoS3Key={currentPhotoS3Key} onPhotoChange={(s3Key) => setCurrentPhotoS3Key(s3Key)} currentItemId={currentItemId} onFirstSave={(newId) => { setCurrentItemId(newId); router.replace(\`/dashboard/menu/items/${newId}\`); }} onSaveState={setSaveState} />`
    - Wire `<ItemSizesTabClient itemId={currentItemId} sizes={currentSizes} onSizesChange={setCurrentSizes} />` — Task 5 (or stub a placeholder if breaking into Task 5)
    - Wire `<ItemModifiersTabClient itemId={currentItemId} initialModifierGroupIds={initialItem?.modifierGroupIds ?? []} />` — placeholder div with text `Модификаторы` until Plan 08 lands it

    Create `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-detail-tab-client.tsx`:
    - `'use client'`
    - Props: `{ initialValues: ItemEditorForm; categories: ReadonlyArray<{ id: string; name: string; parentId: string | null }>; currentPhotoS3Key: string | null; onPhotoChange: (s3Key: string) => void; currentItemId: 'new' | string; onFirstSave: (newId: string) => void; onSaveState: (s: SaveState) => void; slug?: string; nutritionEstimated: boolean }`
    - `const form = useForm<ItemEditorForm>({ resolver: zodResolver(ItemEditorFormSchema), defaultValues: initialValues });`
    - `useDebouncedAutosave(form, async (values) => { const res = await upsertItemAction(currentItemId, values, currentPhotoS3Key); if (res.ok && currentItemId === 'new') onFirstSave(res.id); return { ok: res.ok }; }, onSaveState);`
    - Render two-column layout per UI-SPEC §Detail tab layout:
      - Left flex-1: Form fields using shadcn FormField — Название (Input), Описание (Textarea max 4096), Категория (CategorySelect item-picker), Цена (Input number step=0.01), `<BjuRow>` (subscribe to form.watch for the 4 BJU fields; onChange via setValue), Аллергены (Input with comma-separated parse)
      - Right w-72: `<PhotoUploadClient itemId={currentItemId} currentS3Key={currentPhotoS3Key} onUploaded={onPhotoChange} />` — Task 4 ships this
    - Below Название: slug helper `<p className="text-xs text-muted-foreground">{slug || '—'}</p>` per UI-SPEC §Detail tab layout

    Tests (RTL):
    - `bju-row.spec.tsx`: assert 4 inputs render with correct labels; assert nutritionEstimated=true shows AI-оценка badge; assert empty input → onChange(null)
    - `[id]/page.spec.tsx`: assert RSC for id='new' renders editor with empty defaults; assert id=valid renders prefilled
    - `item-detail-tab-client.spec.tsx`: assert form prefilled; assert field change after 1500ms calls upsertItemAction; assert onFirstSave triggered for new items (mock router.replace)

  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run components/menu/bju-row.spec.tsx app/dashboard/\\(workspace\\)/menu/items/\\[id\\]/page.spec.tsx app/dashboard/\\(workspace\\)/menu/items/\\[id\\]/item-detail-tab-client.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Item editor renders Detail tab with prefilled or empty fields; auto-save fires after 1500ms; new-item URL flip works; BJU row + AI-оценка badge render per UI-SPEC.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: PhotoUploadClient — native drag-drop + presigned PUT direct-to-S3</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/items/[id]/photo-upload-client.tsx</files>
  <behavior>
    - Renders UI-SPEC §Photo Upload Spec drop zone: `w-full h-48` (mobile) / `w-64 h-48` (desktop right column), `rounded-lg border-2 border-dashed border-input bg-muted/40`, centered ImageIcon + "Нажмите или перетащите фото" + "JPG, PNG, WEBP до 5 МБ"
    - Native `<input type="file" accept="image/*" className="sr-only" />` wrapped in `<label>` for click-to-browse
    - Drag-drop via `onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}` on the label
    - After file selected/dropped:
      1. Client-side allowlist check: `file.type ∈ {image/jpeg, image/png, image/webp}` AND `file.size <= 5_242_880` (5 MiB); on failure → inline destructive text `Только JPG/PNG/WEBP до 5 МБ`
      2. Call `photoUploadUrlAction(file.type, file.size)`; on !ok → inline destructive text + retry button
      3. `await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } })` — direct to S3
      4. On PUT 200: call `onUploaded(s3Key)` so the parent persists via the next auto-save
      5. Display preview via `URL.createObjectURL(file)` after success; `<img src={objectURL} className="w-full h-full object-cover rounded-lg" />` with overlay "Изменить фото" ghost button bottom-right
    - When `currentS3Key` is non-null at mount: display presignGet URL via prop or fall back to a placeholder until first replace (RSC fetches photoUrl as part of ItemDetail)
    - Upload-in-progress: `<Progress value={progressPercent} className="h-1" />` below drop zone; fetch PUT has no native progress callback, so simulate progress via interval (or use XMLHttpRequest if precise progress needed — keep MVP-1 simple with indeterminate "Загружаем…" text instead of pretending precise progress)
    - "Добавить ещё фото" button: `<Button variant="ghost" size="sm" disabled><Tooltip content="Несколько фото — в следующей версии">+ Добавить ещё фото</Tooltip></Button>` per UI-SPEC §Photo Upload Spec
    - Accessibility: label wraps zone with `htmlFor` matching hidden input; zone has `role="button" tabIndex={0}` with Enter/Space handler opening file dialog (UI-SPEC §Accessibility Contracts)
    - Error states use Russian copy per UI-SPEC §Error states row 2
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/items/[id]/photo-upload-url-action.ts (Task 2)
    - apps/admin/components/ui/{progress,button,tooltip}.tsx
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Photo Upload Spec + §Accessibility Contracts + §Error states
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pattern 4 + §Pitfall 2 (CORS + Content-Type binding) + §Security Domain V12
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Photo upload client
  </read_first>
  <action>
    Create the file per behavior. Use `'use client'`. Props: `{ itemId: 'new' | string; currentS3Key: string | null; currentPhotoUrl?: string | null; onUploaded: (s3Key: string) => void }`. Local state: `uploadState: 'idle' | 'validating' | 'requesting' | 'uploading' | 'done' | 'error'`, `previewUrl: string | null` (object URL from `URL.createObjectURL`), `errorMsg: string | null`.
    On file pick/drop:
    1. Validate type + size client-side (defensive — server enforces too per Plan 03)
    2. Set state to 'requesting'; `const urlRes = await photoUploadUrlAction(file.type, file.size);` — on !ok return error
    3. Set state to 'uploading'; `const putRes = await fetch(urlRes.uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type }, signal: AbortSignal.timeout(60_000) });` — 60s timeout for upload (large-ish files)
    4. On putRes.ok: set previewUrl = URL.createObjectURL(file); set state='done'; call `onUploaded(urlRes.s3Key)`
    5. On error in any step: set state='error', set errorMsg
    Cleanup previewUrl via `useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl])` (prevent memory leak).
    Tests (RTL): assert (a) invalid type → inline error; (b) oversized → inline error; (c) valid file → photoUploadUrlAction called with correct args; (d) PUT 200 → onUploaded called with s3Key; (e) PUT 500 → error state with retry button. Mock global fetch for the PUT step.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/items/\\[id\\]/photo-upload-client.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Photo upload component supports drag-drop + click + allowlist + presigned PUT + preview; specs cover happy/error paths.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Sizes tab client + integration with shell</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-sizes-tab-client.tsx</files>
  <behavior>
    - Renders UI-SPEC §Sizes tab layout: inline editable rows with grid `grid-cols-[1fr_120px_80px_40px] gap-2 items-center` per row: `[Name Input]` `[Price Input number]` `[Default radio]` `[× remove Button ghost]`
    - "+ Добавить размер" button (variant="outline" size="sm") below rows
    - Empty state inline helper text `Нет размеров — блюдо использует базовую цену.` when sizes.length === 0
    - Adding a new row creates a local-only stub `{ id: undefined, name: '', price: '0', isDefault: sizes.length === 0 }` then on blur of name input fires `upsertItemSizeAction({ sizeId: undefined, itemId, ... })`; response id flows back to local state
    - Editing a row: each input blur triggers `upsertItemSizeAction({ sizeId: row.id, ... })` (per-row auto-save; no whole-tab debounce since rows are simpler than item editor)
    - Default radio: clicking sets isDefault=true on the clicked row + false on all others; each impacted row triggers an upsert
    - Remove × button: confirms via inline shadcn AlertDialog? — UI-SPEC says no confirm for sizes; use direct call `upsertItemSizeAction({ sizeId, isDelete: true })`; row disappears on ok
    - Russian copy: input placeholders Название, Цена; toast on save failure
    - Calls onSizesChange callback to bubble updated list to shell client
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-size-action.ts (Task 2)
    - apps/admin/components/ui/{input,button}.tsx
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Sizes tab layout
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Form clients
  </read_first>
  <action>
    Create the file. Use `'use client'`. Props: `{ itemId: 'new' | string; sizes: ItemDetail['sizes']; onSizesChange: (sizes: ItemDetail['sizes']) => void }`. Local state mirrors sizes prop. Disable adding rows when `itemId === 'new'` with helper text "Сначала введите название блюда — оно сохранится автоматически" (because item must exist before sizes can attach).
    Implement per behavior. On row blur, call `upsertItemSizeAction(itemId, { sizeId, name, price, isDefault })`; update local state with returned id (for new rows).
    Tests (RTL): assert (a) empty state renders helper text; (b) add-size button appends a new row; (c) blur on row name → upsertItemSizeAction called; (d) toggle Default → two upserts fire (the new default + the old default); (e) × remove fires DELETE call; (f) itemId='new' hides Add button and shows helper.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/items/\\[id\\]/item-sizes-tab-client.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Sizes tab renders inline editor; per-row save fires on blur; default-radio swap fires two upserts; remove fires delete; new-item gate prevents premature size attach.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                                                  | Description                                                                   |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Browser → S3 (direct PUT)                                                 | Operator's browser uploads photo bytes using presigned URL (Plan 03 endpoint) |
| Admin server actions → api `/internal/v1/catalog/items` and `/item-sizes` | apiFetchInternal carries INTERNAL_API_TOKEN                                   |
| RHF form watch → server action                                            | Form values flow client → server boundary on every debounce fire              |

## STRIDE Threat Register

| Threat ID   | Category               | Component                                          | Disposition | Mitigation Plan                                                                                                                                       |
| ----------- | ---------------------- | -------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04b-07-01 | Information Disclosure | INTERNAL_API_TOKEN in client bundle                | mitigate    | photoUploadUrlAction is 'use server'; client only sees `uploadUrl, s3Key` — never the api token                                                       |
| T-04b-07-02 | Tampering              | Browser PUT to wrong key                           | mitigate    | s3Key is server-generated tenant-scoped (Plan 03 Task 2); browser receives both uploadUrl + s3Key from server action, cannot influence key derivation |
| T-04b-07-03 | DoS                    | Auto-save spam from operator typing fast           | mitigate    | 1500ms debounce + request-id guard prevents reorderings; existing api rate-limit covers spam (RESEARCH.md Security Domain)                            |
| T-04b-07-04 | Repudiation            | Older save overwriting newer indicator state       | mitigate    | useDebouncedAutosave request-id guard (Task 1, Pitfall #5)                                                                                            |
| T-04b-07-05 | Tampering              | XSS via LocalizedText input → admin render         | mitigate    | React auto-escapes; no dangerouslySetInnerHTML anywhere in editor; ItemEditorFormSchema max-lengths enforced (CAT-09)                                 |
| T-04b-07-06 | Tampering              | Operator uploads non-image file by extension trick | mitigate    | Client validates MIME type via `file.type`; server validates via Plan 03 Zod enum; SigV4 binds Content-Type into presigned URL (Pitfall #2)           |
| T-04b-07-07 | DoS                    | Photo upload hanging admin tab                     | mitigate    | PUT fetch carries AbortSignal.timeout(60_000) — 60s for upload                                                                                        |
| T-04b-07-08 | Information Disclosure | Object URL leaking after preview discarded         | mitigate    | useEffect cleanup calls URL.revokeObjectURL on unmount or replace                                                                                     |

</threat_model>

<verification>
- /dashboard/menu/items/new opens editor with empty defaults; first auto-save creates the item and URL flips to /items/[id]
- Detail tab field change → 1500ms later → upsertItemAction fires
- AutoSaveIndicator transitions idle → saving → saved with Russian copy
- Photo drag-drop or click works; PUT to S3 succeeds; preview appears; "+ Добавить ещё фото" is disabled with v2 Tooltip
- Sizes tab: add row → save; edit name + price → save; default-radio swap → two saves
- Categories dropdown shows indented child options (Plan 05 CategorySelect item-picker mode)
- БЖУ row renders 4 inputs + AI-оценка badge when nutrition_estimated=true
- Sticky bar count refreshes after each auto-save (revalidatePath)
</verification>

<success_criteria>

1. Item editor full page with tabs Детали / Размеры / Модификаторы (Plan 08 fills last)
2. ItemEditorFormSchema + SizeFormSchema + useDebouncedAutosave hook with race-id guard
3. Detail tab auto-saves on 1500ms blur/debounce per D-4b-02
4. Photo upload uses presigned PUT direct-to-S3; allowlist enforced client + server
5. Sizes tab per-row save on blur; default-radio swap fires both upserts
6. BJU row renders 4 inputs + "на 100 г" + AI-оценка badge per UI-SPEC
7. New-item URL flip after first auto-save
8. All specs pass
   </success_criteria>

<output>
Create `.planning/phases/04b-catalog-admin-ui/04b-07-SUMMARY.md` when done.
</output>
