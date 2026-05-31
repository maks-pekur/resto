---
phase: 04b-catalog-admin-ui
plan: 08
type: execute
wave: 6
depends_on: ["04b-01", "04b-02", "04b-04", "04b-05", "04b-06", "04b-07"]
files_modified:
  - apps/admin/app/dashboard/(workspace)/menu/modifier-groups/page.tsx
  - apps/admin/app/dashboard/(workspace)/menu/modifier-groups/modifier-groups-table-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/page.tsx
  - apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-group-form-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-options-list-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/modifier-groups/upsert-modifier-group-action.ts
  - apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/upsert-modifier-option-action.ts
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-modifiers-tab-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-modifier-groups-action.ts
  - apps/admin/lib/menu/zod-schemas.ts
  # Extended from Plan 07 — see Task 4 (parallel fetch of /modifier-groups + prop wiring through shell)
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/page.tsx
  - apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client.tsx
autonomous: false
requirements: [CAT-04]
must_haves:
  truths:
    - "Operator sees modifier groups at /dashboard/menu/modifier-groups as a table with name + min/max + option count + usage count + actions (UI-SPEC §Modifier groups list page)"
    - "Operator opens a group editor at /dashboard/menu/modifier-groups/[id] with two sections: Основное (name, min, max) + Варианты (inline options table)"
    - "Each option row carries name, priceDelta (наценка), default_amount (По ум.), free_amount (Бесп.) per iiko alignment (UI-SPEC §Modifier group editor page + D-4b-05)"
    - "Item editor Модификаторы tab uses chip-picker: assigned groups appear as chips with × remove; + Добавить группу opens Sheet listing available groups (D-4b-05 two-surface model)"
    - "Sheet inside item editor: searchable list of groups for the current brand; each group has + Добавить action button; + Создать новую группу link redirects to top-level editor (UI-SPEC §Modifiers tab layout)"
    - "Group form uses RHF + zodResolver — same pattern as item editor; auto-save on 1500ms debounce (per D-4b-02 since modifier group editor is the same surface category as item editor)"
    - "Modifier options edit inline (no auto-save — per-row blur fires upsert mirror of sizes tab in Plan 07)"
    - "Item↔modifier-group assignment: chip add/remove fires upsertItemModifierGroupsAction({ itemId, modifierGroupIds: [...] }) → POST /internal/v1/catalog/items with full modifierGroupIds array"
    - "All catalog mutations go through apiFetchInternal (server-only, holds INTERNAL_API_TOKEN); never expose this in a client component"
    - "Every server action revalidates /dashboard/menu layout to refresh the sticky publish bar diff"
    - "Russian copy is canonical for all user-facing strings (D-05 single-locale MVP-1)"
  artifacts:
    - path: "apps/admin/app/dashboard/(workspace)/menu/modifier-groups/page.tsx"
      provides: "Modifier groups list RSC"
      contains: "apiFetchInternal"
    - path: "apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/page.tsx"
      provides: "Group editor RSC"
      contains: "/internal/v1/catalog/modifier-groups/"
    - path: "apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-group-form-client.tsx"
      provides: "RHF group form with auto-save"
      contains: "useDebouncedAutosave"
    - path: "apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-options-list-client.tsx"
      provides: "Inline options editor (per-row save on blur)"
      contains: "По ум."
    - path: "apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-modifiers-tab-client.tsx"
      provides: "Item editor Modifiers tab — chip picker + Sheet"
      contains: "+ Добавить группу"
  key_links:
    - from: "modifier-groups/page.tsx"
      to: "apiFetchInternal"
      via: "GET /internal/v1/catalog/modifier-groups"
      pattern: "/internal/v1/catalog/modifier-groups"
    - from: "modifier-groups/[id]/page.tsx"
      to: "apiFetchInternal"
      via: "GET /internal/v1/catalog/modifier-groups/:id"
      pattern: "/internal/v1/catalog/modifier-groups/"
    - from: "item-modifiers-tab-client.tsx"
      to: "upsertItemModifierGroupsAction"
      via: "POST /internal/v1/catalog/items"
      pattern: "modifierGroupIds"
---

<objective>
Wave 6 frontend: modifier groups two-surface model (D-4b-05) — top-level CRUD page + group editor with options inline + item-editor Модификаторы tab (chip picker + Sheet for quick-add). CAT-04 ships here.

Output: Modifier groups list, group editor with options, item-editor Modifiers tab integration, three server actions.
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
<!-- Backend (Plan 02 + 4a-07 live): -->

GET /internal/v1/catalog/modifier-groups → ModifierGroupListResponseDto:
```typescript
type ModifierGroupListItem = {
  id: string;
  name: Record<string, string>;
  minSelectable: number;
  maxSelectable: number;
  optionCount: number;
  usageCount: number;
  status: 'draft' | 'published' | 'archived';
};
```

GET /internal/v1/catalog/modifier-groups/:id → ModifierGroupDetailResponseDto:
```typescript
type ModifierGroupDetail = ModifierGroupListItem & {
  options: Array<{
    id: string;
    name: Record<string, string>;
    priceDelta: string;  // numeric → string
    defaultAmount: number;
    freeAmount: number;
    sortOrder: number;
  }>;
};
```

POST /internal/v1/catalog/modifier-groups — UpsertModifierGroupInput (4a-07).
POST /internal/v1/catalog/modifier-options — UpsertModifierOptionInput (4a-07).

Item-editor assignment shape: full item POST includes `modifierGroupIds: string[]`. To add/remove a group from an item, the action calls upsertItemAction (Plan 07) with the existing form values + new modifierGroupIds array. The Modifiers tab carries its own action `upsertItemModifierGroupsAction({ itemId, modifierGroupIds })` that internally constructs a minimal POST body.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Zod schemas + server actions for modifier groups + options + item assignment</name>
  <files>apps/admin/lib/menu/zod-schemas.ts, apps/admin/app/dashboard/(workspace)/menu/modifier-groups/upsert-modifier-group-action.ts, apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/upsert-modifier-option-action.ts, apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-modifier-groups-action.ts</files>
  <behavior>
    - `ModifierGroupFormSchema`: `name: string min 1 max 255`, `minSelectable: coerce.number int min 0 max 99`, `maxSelectable: coerce.number int min 0 max 99`; refine `maxSelectable >= minSelectable` (or maxSelectable === 0 meaning unlimited per UI-SPEC §Modifier group editor page)
    - `ModifierOptionFormSchema`: `name: string min 1 max 255`, `priceDelta: coerce.number` (can be negative if iiko-style discount? — for MVP-1 enforce min 0), `defaultAmount: coerce.number int min 0 default 0`, `freeAmount: coerce.number int min 0 default 0`
    - `upsertModifierGroupAction({ groupId?: string, values: ModifierGroupForm })`: POST /internal/v1/catalog/modifier-groups; revalidate layout; return `{ ok: true, id }` or `{ ok: false, error }`
    - `upsertModifierOptionAction({ groupId, optionId?, values, isDelete? })`: POST /internal/v1/catalog/modifier-options when not isDelete; DELETE /internal/v1/catalog/modifier-options/:id when isDelete (verify endpoint exists in 4a-07; if not, surface — currently UpsertModifierOption uses POST upsert and there is no documented DELETE option endpoint; MVP-1 may treat option-delete as setting `sortOrder` invalid or just rely on archive; for MVP-1, OMIT delete option for modifier options since 4a-07 doesn't expose one — surface this as deferred and remove the × button if not supported)
    - `upsertItemModifierGroupsAction({ itemId, modifierGroupIds: string[] })`: reads existing item via GET, then POSTs full item with replaced modifierGroupIds; revalidate layout
    - All 'use server'; INTERNAL_API_TOKEN never reaches client
  </behavior>
  <read_first>
    - apps/api/src/contexts/catalog/application/dto.ts (UpsertModifierGroupInputDto + UpsertModifierOptionInputDto — source of truth)
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts (existing 4a-07 endpoints — confirm DELETE option route absence)
    - apps/admin/lib/menu/zod-schemas.ts (Plans 05, 07 — extend)
    - apps/admin/lib/menu/localized.ts
    - apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts (Plan 07 — analog for item-level POST + payload mapping)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Server actions + Pattern S1/S8
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Modifier group editor page + §Modifiers tab layout
  </read_first>
  <action>
    Extend `zod-schemas.ts` with `ModifierGroupFormSchema` + `ModifierOptionFormSchema`. Inferred types `ModifierGroupForm`, `ModifierOptionForm`.
    Create server actions per behavior. Russian friendly errors per UI-SPEC §Error states. revalidatePath on success.
    For `upsertItemModifierGroupsAction`, the minimal implementation:
    1. GET /internal/v1/catalog/items/:itemId
    2. Map response into UpsertItemInput shape (preserving all current fields)
    3. Replace `modifierGroupIds` with the new array
    4. POST /internal/v1/catalog/items with the merged body
    5. revalidatePath('/dashboard/menu', 'layout') + `/dashboard/menu/items/${itemId}`
    For option delete: VERIFY via grep on `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` whether a `@Delete('modifier-options/:id')` exists. If absent, do NOT include delete in the option action; remove the `× remove` UI affordance in Task 3 and document this in the SUMMARY as "Option delete deferred until backend exposes DELETE — operators can edit option to be effectively unused; archive of the entire group is the supported coarse delete." Conversely, if it exists, wire it.
    Tests: one spec per action; stub apiFetchInternal; assert validation, friendly errors, revalidatePath.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/modifier-groups/upsert-modifier-group-action.spec.ts app/dashboard/\\(workspace\\)/menu/modifier-groups/\\[id\\]/upsert-modifier-option-action.spec.ts app/dashboard/\\(workspace\\)/menu/items/\\[id\\]/upsert-item-modifier-groups-action.spec.ts --no-coverage</automated>
  </verify>
  <done>
    Schemas + 3 actions exist; option-delete behavior matches backend reality; specs pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Modifier groups list page (RSC + client table)</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/modifier-groups/page.tsx, apps/admin/app/dashboard/(workspace)/menu/modifier-groups/modifier-groups-table-client.tsx</files>
  <behavior>
    - Page renders shell chrome with TenantBreadcrumb `Меню › Модификаторы` + flush-right `+ Создать группу` Button linking to `/dashboard/menu/modifier-groups/new`
    - Table columns per UI-SPEC §Modifier groups list page: Название | Мин / Макс (e.g. `0–3`) | Вариантов (option count) | Используется в (usage count) | Actions (DropdownMenu Edit / Archive)
    - Status badge column uses StatusBadge from Plan 04
    - Row click → `router.push(\`/dashboard/menu/modifier-groups/${id}\`)`
    - Empty state: `<EmptyState variant="empty" title="Нет групп модификаторов" description="Создайте первую группу, чтобы добавлять дополнения к блюдам." action={<Link href="/dashboard/menu/modifier-groups/new"><Button>Создать группу</Button></Link>} />` (UI-SPEC §Empty states)
    - Archive action (if backend exposes — verify): AlertDialog per UI-SPEC §Destructive actions row 3 ("Архивировать группу?" / "Группа «{name}» больше не будет доступна для прикрепления к блюдам. Блюда, уже использующие её, продолжат работу до следующей публикации." / Confirm: "Архивировать" destructive). If no archive endpoint for modifier groups yet, omit this action and document. (NOTE: Plan 02 backend addendum does NOT enumerate a modifier-group archive endpoint — only categories + items. UI surfaces archive only for those two. Modifier group archive deferred unless explicitly added in Plan 02; for safety, omit the archive action in this list page and document the deferral.)
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx (Plan 05 — RSC pattern)
    - apps/admin/app/dashboard/(workspace)/menu/items/page.tsx (Plan 06 — pagination pattern; modifier groups typically <50 so pagination optional)
    - apps/admin/components/menu/status-badge.tsx (Plan 04)
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Modifier groups list page + §Empty states + §Destructive actions row 3
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — RSC pages
  </read_first>
  <action>
    Create the RSC page mirroring Plan 05 categories page. GET /internal/v1/catalog/modifier-groups; render table + empty state. Per the notes above, OMIT the Archive action (no backend endpoint) — only render Edit in the DropdownMenu. Surface in SUMMARY as "Modifier group archive deferred — backend endpoint not exposed in 4b scope".
    Tests: page.spec.tsx + table.spec.tsx as in Plans 05/06.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/modifier-groups/page.spec.tsx app/dashboard/\\(workspace\\)/menu/modifier-groups/modifier-groups-table-client.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    List page renders groups with option/usage counts; row click navigates to editor; empty state present.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Modifier group editor (RSC + group form + options list)</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/page.tsx, apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-group-form-client.tsx, apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-options-list-client.tsx</files>
  <behavior>
    - RSC `[id]/page.tsx`: if `params.id === 'new'`, render editor with empty defaults; else GET /internal/v1/catalog/modifier-groups/:id; on 404 render EmptyState "Группа не найдена"
    - Page header: TenantBreadcrumb `Меню › Модификаторы › {fromLocalizedText(group.name) || 'Новая группа'}` + AutoSaveIndicator
    - Two card-section layout per UI-SPEC §Modifier group editor page (no Tabs — simpler than item editor):
      1. **Основное** Card: ModifierGroupFormClient with name, minSelectable, maxSelectable
      2. **Варианты** Card: ModifierOptionsListClient with inline options table
    - ModifierGroupFormClient: uses RHF + ModifierGroupFormSchema + useDebouncedAutosave (same auto-save pattern as item editor); on first-save flip URL via router.replace
    - ModifierOptionsListClient: inline table with grid `grid-cols-[1fr_100px_80px_80px_40px] gap-2 items-center`; rows show Название, Наценка (price input number), По ум. (default_amount tiny number input), Бесп. (free_amount tiny number input), [× remove if backend supports — else hidden]. Tooltips on По ум. and Бесп. labels per UI-SPEC §Modifier group editor page ("По умолчанию" / "Бесплатно").
    - Per-row blur fires upsertModifierOptionAction (mirror sizes tab Plan 07 Task 5)
    - "+ Добавить вариант" Button below rows; disabled when groupId === 'new' with helper "Сначала сохраните название группы"
    - Russian copy per UI-SPEC §Modifier group editor page
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/items/[id]/page.tsx (Plan 07 RSC analog)
    - apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-detail-tab-client.tsx (Plan 07 — RHF + autoSave pattern)
    - apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-sizes-tab-client.tsx (Plan 07 — inline rows with per-row blur save)
    - apps/admin/components/ui/{form,input,card,tooltip}.tsx
    - apps/admin/lib/menu/use-auto-save.ts (Plan 07 hook)
    - apps/admin/lib/menu/zod-schemas.ts (Task 1 schemas)
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Modifier group editor page
  </read_first>
  <action>
    Create the three files per behavior.
    `[id]/page.tsx` (RSC): redirect check; isNew check; GET if not new; render shell with header + Cards containing the two client components.
    `modifier-group-form-client.tsx`: 'use client'; props `{ initialValues: ModifierGroupForm; groupId: 'new' | string; onFirstSave: (newId: string) => void; onSaveState: (s: SaveState) => void }`; RHF with zodResolver; useDebouncedAutosave wired to upsertModifierGroupAction; on first-save call onFirstSave with new id.
    `modifier-options-list-client.tsx`: 'use client'; props `{ groupId: 'new' | string; options: ModifierGroupDetail['options']; onOptionsChange: (opts) => void }`; mirror sizes tab pattern; per-row blur → upsertModifierOptionAction; new-row helper text when groupId === 'new'.
    Tests: page + form + options-list specs covering: prefilled load, auto-save fire, first-save URL flip, per-row blur save, helper text when groupId='new'.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/modifier-groups/\\[id\\]/page.spec.tsx app/dashboard/\\(workspace\\)/menu/modifier-groups/\\[id\\]/modifier-group-form-client.spec.tsx app/dashboard/\\(workspace\\)/menu/modifier-groups/\\[id\\]/modifier-options-list-client.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Group editor renders two-card layout; group form auto-saves; options list saves per-row on blur; new-id URL flip works.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Item editor Modifiers tab — chip picker + Sheet + quick-create redirect</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-modifiers-tab-client.tsx</files>
  <behavior>
    - Section title "Группы модификаторов для этого блюда"
    - Render chip list of currently-assigned groups (from props): each chip `<div className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-1 text-sm"><span>{name}</span><button aria-label="Убрать группу" onClick={() => removeGroup(id)}>×</button></div>`
    - "+ Добавить группу" Button (variant="outline") opens Sheet (right-side) containing a searchable list of all modifier groups for the brand
    - Sheet content: search Input at top; below, list of groups filtered by search; each row has name + option count + "+ Добавить" button; button disabled if already assigned
    - "+ Создать новую группу" link at bottom of Sheet → opens shadcn Dialog with name + min + max fields; on save calls upsertModifierGroupAction; on ok closes Dialog + navigates `/dashboard/menu/modifier-groups/${newId}` (per D-4b-05 redirect-to-top-level-editor)
    - Removing a chip: calls upsertItemModifierGroupsAction({ itemId, modifierGroupIds: current - removed })
    - Adding from Sheet: calls upsertItemModifierGroupsAction({ itemId, modifierGroupIds: current + added }); closes Sheet on success
    - Empty state inline: `Нет прикреплённых групп — нажмите «+ Добавить группу».` per UI-SPEC §Empty states
    - Russian copy per UI-SPEC §Modifiers tab layout
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client.tsx (Plan 07 — confirm placeholder slot for this tab + props passed)
    - apps/admin/components/ui/{sheet,dialog,input,button,badge}.tsx
    - apps/admin/lib/api-server-internal.ts (apiFetchInternal — for client-side GET of modifier groups; instead, RSC pre-fetches and passes to client component, since data is needed only when Sheet opens; for MVP-1 acceptable to pre-fetch on tab load)
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Modifiers tab layout
    - .planning/phases/04b-catalog-admin-ui/04b-CONTEXT.md §D-4b-05 (two-surface model)
  </read_first>
  <action>
    Create `item-modifiers-tab-client.tsx`. Props: `{ itemId: 'new' | string; initialModifierGroupIds: string[]; availableGroups: ReadonlyArray<{ id: string; name: string; optionCount: number }> }`. Local state: `assignedIds: string[]` (initialized from initialModifierGroupIds), `isSheetOpen: boolean`, `isQuickCreateOpen: boolean`, `searchQuery: string`.
    The shell client (Plan 07) MUST be updated to fetch availableGroups via apiFetchInternal in the RSC `[id]/page.tsx` and pass them down. Add the prop wiring in this task: extend the existing `[id]/page.tsx` to also fetch `/internal/v1/catalog/modifier-groups` in parallel and pass through `<ItemEditorShellClient ... availableModifierGroups={...} />` and onward to `<ItemModifiersTabClient ... availableGroups={availableModifierGroups} />`. (Light touch — surgical edit, not a rewrite.)
    Implement chip add/remove → upsertItemModifierGroupsAction.
    Quick-create Dialog: small RHF form with just name + min + max; on save invokes upsertModifierGroupAction; on ok closes Dialog + `router.push(\`/dashboard/menu/modifier-groups/${newId}\`)`.
    Tests (RTL): assert (a) chips render; (b) × remove calls action with reduced list; (c) +Добавить группу opens Sheet; (d) selecting a group from Sheet adds chip + closes Sheet; (e) +Создать новую группу opens Dialog; (f) Dialog save → navigation.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/items/\\[id\\]/item-modifiers-tab-client.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Modifiers tab renders chips, opens Sheet with searchable group list, supports add/remove + quick-create flow; specs pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin server actions → api `/internal/v1/catalog/modifier-groups` + `/modifier-options` + `/items` | apiFetchInternal carries INTERNAL_API_TOKEN |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04b-08-01 | Tampering | CSRF on group/option/assignment server actions | mitigate | Next.js 15 server actions ship built-in CSRF token |
| T-04b-08-02 | Information Disclosure | INTERNAL_API_TOKEN in client bundle | mitigate | All actions are 'use server'; apiFetchInternal carries server-only import |
| T-04b-08-03 | Tampering | Operator assigns modifier group from another tenant | mitigate | Backend Plan 02 list-modifier-groups uses ScopedTx; admin only displays groups within tenant scope; upsertItemAction (Plan 07) re-validates against ScopedTx on the api side |
| T-04b-08-04 | DoS | Quick-add flood from operator clicking + Добавить repeatedly | mitigate | Existing api rate-limit; chip-add button disabled (aria-disabled) when group is already assigned |
| T-04b-08-05 | Repudiation | Sticky bar count stale after group/option mutations | mitigate | All actions call revalidatePath('/dashboard/menu', 'layout') |
| T-04b-08-06 | Tampering | XSS via group name | mitigate | React auto-escapes; name has max 255 via ModifierGroupFormSchema |
</threat_model>

<verification>
- /dashboard/menu/modifier-groups renders groups with counts; row click navigates to editor
- Group editor /dashboard/menu/modifier-groups/[id] auto-saves group meta + per-row options
- Item editor Модификаторы tab shows chips for assigned groups; Sheet adds groups from brand library; quick-create Dialog opens + redirects to top-level editor on save
- Russian copy matches UI-SPEC verbatim
</verification>

<success_criteria>
1. ModifierGroupFormSchema + ModifierOptionFormSchema + 3 server actions
2. Modifier groups list page renders correctly
3. Group editor uses RHF + auto-save (group meta) + per-row save (options); URL flip for new groups
4. Item editor Modifiers tab supports chip add/remove + Sheet picker + quick-create with redirect
5. Specs pass for list, editor, options, item-modifiers tab
6. Backend option-delete absence handled gracefully (× remove omitted; documented)
7. Backend modifier-group-archive absence documented (no archive button in this plan)
</success_criteria>

<output>
Create `.planning/phases/04b-catalog-admin-ui/04b-08-SUMMARY.md` when done.
</output>
