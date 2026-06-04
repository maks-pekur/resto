# Item Form Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-tab item editor at `/dashboard/menu/items/[id]` with a 2-column scrolling layout grouped into 6 semantic cards (Basics, Price/Sizes, Composition, Nutrition, Allergens, SEO) + a sticky aside (Photo, Status, Tech info), and ship 3 new fields (`ingredients`, `metaTitle`, `metaDescription`) end-to-end across DB → domain → API → admin.

**Architecture:** A single `<form id="item-form">` mounted by `ItemDetailFormClient` wraps all 6 main cards via RHF `<FormProvider>`. Sizes and Modifier-groups cards live inside the form (as children of `ItemDetailFormClient`) so they can read `basePrice` / `ingredients` from `useFormContext()`, but each owns its own non-RHF persistence path. The shell renders only `PageHeading` + 2-column grid, with the save button placed in `PageHeading.action` and bound to the form via HTML `form` attribute. Three independent save paths: Path A (main form → `upsertItemAction`), Path B (sizes batch → per-row `upsertItemSizeAction`), Path C (modifier-group attach/detach → auto-sync via `upsertItemModifierGroupsAction`).

**Tech Stack:** Drizzle ORM 0.45 (Postgres), `@resto/domain` Zod schemas, NestJS 10 + `nestjs-zod` for API DTOs, `openapi-typescript` codegen for `@resto/api-client`, Next.js 16 App Router (admin), `react-hook-form` 7 + `@hookform/resolvers/zod`, shadcn/ui `new-york` + Tailwind 4, Vitest + `@testing-library/react` for admin tests, Vitest unit tests for API services.

**Spec deviations:**

- Spec mentions migration `0041_catalog_item_ingredients_seo.sql`. Latest existing migration is `0042_catalog_phase4b_categories_status.sql`. New migration will be `0043_catalog_item_ingredients_seo.sql`.
- Spec mentions a `@ApiProperty` controller annotation step. The catalog controllers already use `createZodDto(...)` which auto-derives Swagger from Zod — adding the fields to the Zod input/response schemas in `application/dto.ts` is sufficient. No controller edits required for OpenAPI other than rerunning the emit step.

---

## File Structure

### Files created

| Path                                                                         | Responsibility                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/migrations/0043_catalog_item_ingredients_seo.sql`               | Additive ALTER TABLE adding `ingredients text[]`, `meta_title text`, `meta_description text` to `menu_items`. Auto-generated via `pnpm db:generate` (file name only suggested — Drizzle picks the suffix). |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-aside-client.tsx` | Right-column sticky aside. Renders Photo card (existing `PhotoUploadClient`), Status card (read-only badge + hint), Tech-info card (slug key/value row).                                                   |
| `apps/admin/test/item-aside-client.spec.tsx`                                 | Renders status badge text, slug row, and mocked PhotoUploadClient.                                                                                                                                         |
| `apps/admin/test/item-detail-form-client.spec.tsx`                           | Replaces `item-detail-tab-client.spec.tsx`. Ports existing cases + adds `ingredients` / `metaTitle` / `metaDescription` round-trip.                                                                        |
| `apps/admin/test/item-sizes-card-client.spec.tsx`                            | Replaces `item-sizes-tab-client.spec.tsx`. Ports existing cases + asserts `basePrice` shown in card but does NOT trigger sizes save.                                                                       |
| `apps/admin/test/item-modifier-groups-card-client.spec.tsx`                  | Replaces `item-modifiers-tab-client.spec.tsx`. Ports existing auto-sync cases + asserts `ingredients` field belongs to main RHF form, not the auto-sync path.                                              |

### Files renamed (git mv) + reshaped

| From                                                                                 | To                                                               | Notes                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-detail-tab-client.tsx`    | `item-detail-form-client.tsx`                                    | Mounts `FormProvider` + `<form id="item-form">` containing 6 cards. ① Basics, ④ Nutrition, ⑤ Allergens, ⑥ SEO are inline components; ② and ③ are imported children. Public component renamed `ItemDetailTabClient` → `ItemDetailFormClient`. |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-sizes-tab-client.tsx`     | `item-sizes-card-client.tsx`                                     | Card ② shell. Top half: `basePrice` field via `useFormContext()` (Path A). Bottom half: existing sizes batch with own save button (Path B). Component renamed `ItemSizesTabClient` → `ItemSizesCardClient`.                                  |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-modifiers-tab-client.tsx` | `item-modifier-groups-card-client.tsx`                           | Card ③ shell. Top half: chip-list (auto-sync, Path C). Bottom half: `ingredients` field via `useFormContext()` (Path A). Component renamed `ItemModifiersTabClient` → `ItemModifierGroupsCardClient`.                                        |
| `apps/admin/test/item-detail-tab-client.spec.tsx`                                    | DELETE (replaced by `item-detail-form-client.spec.tsx`)          | —                                                                                                                                                                                                                                            |
| `apps/admin/test/item-sizes-tab-client.spec.tsx`                                     | DELETE (replaced by `item-sizes-card-client.spec.tsx`)           | —                                                                                                                                                                                                                                            |
| `apps/admin/test/item-modifiers-tab-client.spec.tsx`                                 | DELETE (replaced by `item-modifier-groups-card-client.spec.tsx`) | —                                                                                                                                                                                                                                            |

### Files modified (no rename)

| Path                                                                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/menu.ts`                                                    | Add `ingredients`, `metaTitle`, `metaDescription` columns to `menuItems` table (nullable, no defaults).                                                                                                                                                                                                                                                                                                                                              |
| `packages/domain/src/schema/menu-item.ts`                                           | Extend `MenuItem` schema with the three fields (nullable, with `.max()` caps per packages/CLAUDE.md).                                                                                                                                                                                                                                                                                                                                                |
| `apps/api/src/contexts/catalog/application/dto.ts`                                  | Add the three fields to `UpsertItemInputSchema` (with defaults) and `ItemDetailResponseSchema`.                                                                                                                                                                                                                                                                                                                                                      |
| `apps/api/src/contexts/catalog/domain/ports.ts`                                     | Add the three fields to `UpsertItemRow` and `ItemDetailRow`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `apps/api/src/contexts/catalog/application/upsert-item.service.ts`                  | Pass three fields into `repo.upsertItem`.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/api/src/contexts/catalog/application/get-item.service.ts`                     | Map three fields from `row` into response.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`        | INSERT/UPDATE/onConflictDoUpdate include three new columns; SELECT in `getItemById` projects them into `ItemDetailRow`.                                                                                                                                                                                                                                                                                                                              |
| `apps/api/test/unit/catalog/upsert-item.service.spec.ts`                            | Extend `baseInput` and assertions with the three fields.                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/api/openapi.yaml`                                                             | Regenerated by `pnpm openapi:emit`.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `packages/api-client/src/generated/api.ts`                                          | Regenerated by `pnpm gen` (from packages/api-client).                                                                                                                                                                                                                                                                                                                                                                                                |
| `apps/admin/lib/menu/zod-schemas.ts`                                                | Add `ingredients` (default `[]`), `metaTitle`, `metaDescription` to `ItemEditorFormSchema`.                                                                                                                                                                                                                                                                                                                                                          |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/types.ts`                     | Extend `ItemDetailApi` with three fields.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts`        | Forward three fields to `apiFetchInternal` payload.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/page.tsx`                     | Pass new fields through to shell (only forwarding; no behavior change at server layer).                                                                                                                                                                                                                                                                                                                                                              |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client.tsx` | Drop `Tabs/*`. Render `PageHeading` + 2-col grid (`lg:grid-cols-[1.7fr_1fr]`, gap-6). Continue tracking `detailState` for save button. Pass new field values into `initialValues`. Use single constant `ITEM_FORM_ID = 'item-form'`.                                                                                                                                                                                                                 |
| `apps/admin/lib/i18n/messages/ru.json`                                              | Add keys under `menu.editor`: `ingredientsLabel`, `ingredientsPlaceholder`, `seoSectionTitle`, `metaTitleLabel`, `metaTitleHint`, `metaDescriptionLabel`, `metaDescriptionHint`, `basicsSectionTitle`, `priceSectionTitle`, `compositionSectionTitle`, `statusSectionTitle`, `statusReadonlyHint`, `techInfoSectionTitle`, `slugLabel`. Also keep `tabDetail/tabSizes/tabModifiers` (still used in items list breadcrumbs — verify before deleting). |
| `apps/admin/lib/i18n/messages/en.json`                                              | Same keys mirrored in English.                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## Task 1: Database migration — add ingredients + SEO columns

**Files:**

- Modify: `packages/db/src/schema/menu.ts`
- Create: `packages/db/migrations/0043_catalog_item_ingredients_seo.sql` (generated)

- [x] **Step 1: Edit schema to add new columns to `menuItems`**

In `packages/db/src/schema/menu.ts`, inside the `menuItems` `pgTable` definition, add three columns next to `allergens` (around line 89):

```ts
allergens: text('allergens').array(),
// SEO + composition fields shipped with the item editor redesign (2026-06-02).
ingredients: text('ingredients').array(),
metaTitle: text('meta_title'),
metaDescription: text('meta_description'),
// Per 100g, all nullable until a recipe lands.
proteins: numeric('proteins', { precision: 5, scale: 2 }),
```

(All three nullable, no defaults, no NOT NULL — additive, matches `allergens`.)

- [x] **Step 2: Generate migration SQL**

Run: `pnpm db:generate`

Expected: a new file `packages/db/migrations/0043_<auto-suffix>.sql` containing three `ALTER TABLE menu_items ADD COLUMN` statements (`ingredients`, `meta_title`, `meta_description`). Drizzle picks the suffix — if it doesn't match `0043_catalog_item_ingredients_seo`, rename the file AND its entry in `packages/db/migrations/meta/_journal.json` accordingly. Verify the SQL is purely additive (no `NOT NULL`, no `DROP`, no `DEFAULT` populated).

- [x] **Step 3: Apply the migration locally**

Run: `pnpm db:migrate`

Expected: migration applies cleanly; no errors. (Run from repo root; requires `DATABASE_ADMIN_URL` in env or the dev fallback.)

- [x] **Step 4: Smoke verify columns exist**

Run:

```bash
psql "$DATABASE_URL" -c "\d menu_items" | grep -E "(ingredients|meta_title|meta_description)"
```

Expected: three matching rows, all nullable.

- [x] **Step 5: Commit**

```bash
git add packages/db/src/schema/menu.ts packages/db/migrations/0043_*.sql packages/db/migrations/meta/_journal.json packages/db/migrations/meta/0043_snapshot.json
git commit -m "feat(db): add ingredients + SEO columns to menu_items"
```

---

## Task 2: Domain schema — extend MenuItem

**Files:**

- Modify: `packages/domain/src/schema/menu-item.ts`

- [x] **Step 1: Add three fields to the `MenuItem` Zod schema**

In `packages/domain/src/schema/menu-item.ts`, extend the `z.object({...})` block (after the `allergens` field, before `status`):

```ts
allergens: z.array(z.string().min(1)).nullable(),
// Composition + SEO (item editor redesign 2026-06-02). All nullable; HTTP cap per packages/CLAUDE.md free-text rule.
ingredients: z.array(z.string().min(1).max(100)).max(50).nullable(),
metaTitle: z.string().max(70).nullable(),
metaDescription: z.string().max(160).nullable(),
status: MenuItemStatus,
```

- [x] **Step 2: Run typecheck for the domain package**

Run: `pnpm -F @resto/domain typecheck` (or `pnpm -F @resto/domain build`)

Expected: PASS — `z.infer<typeof MenuItem>` now includes the new fields.

- [x] **Step 3: Commit**

```bash
git add packages/domain/src/schema/menu-item.ts
git commit -m "feat(domain): extend MenuItem with ingredients + SEO fields"
```

---

## Task 3: API DTO — extend UpsertItemInput + ItemDetailResponse

**Files:**

- Modify: `apps/api/src/contexts/catalog/application/dto.ts`
- Modify: `apps/api/src/contexts/catalog/domain/ports.ts`

- [x] **Step 1: Write the failing test (extend upsert-item spec)**

In `apps/api/test/unit/catalog/upsert-item.service.spec.ts`, extend `baseInput` (the const around line 25):

```ts
const baseInput = {
  categoryId: CATEGORY_ID,
  slug: Slug.parse('caesar-salad'),
  name: LocalizedText.parse({ en: 'Caesar Salad' }),
  description: null,
  basePrice: MoneyAmount.parse('12.50'),
  currency: Currency.parse('USD'),
  photos: [],
  allergens: null,
  ingredients: ['romaine', 'parmesan'],
  metaTitle: 'Caesar Salad — Bistro Lyon',
  metaDescription: 'Crisp romaine, parmesan, anchovy dressing.',
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  nutritionEstimated: false,
  source: 'manual' as const,
  needsReview: false,
  sourceExternalId: null,
  status: 'draft' as const,
  sortOrder: 0,
};
```

And extend the assertion in the first test (`forwards a tenant-scoped row…`):

```ts
expect(repo.upsertItem).toHaveBeenCalledWith({
  tenantId: TENANT_ID,
  brandId: null,
  categoryId: CATEGORY_ID,
  slug: 'caesar-salad',
  name: { en: 'Caesar Salad' },
  description: null,
  basePrice: '12.50',
  currency: 'USD',
  photos: [],
  allergens: null,
  ingredients: ['romaine', 'parmesan'],
  metaTitle: 'Caesar Salad — Bistro Lyon',
  metaDescription: 'Crisp romaine, parmesan, anchovy dressing.',
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  nutritionEstimated: false,
  source: 'manual',
  needsReview: false,
  sourceExternalId: null,
  status: 'draft',
  sortOrder: 0,
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm -F api test -- upsert-item.service.spec`

Expected: FAIL — either type error (`ingredients` not in `UpsertItemInput`) or assertion mismatch.

- [x] **Step 3: Extend `UpsertItemInputSchema` and `ItemDetailResponseSchema`**

In `apps/api/src/contexts/catalog/application/dto.ts`, modify `UpsertItemInputSchema` — add three fields between `allergens` and `proteins` (around line 60):

```ts
  allergens: z.array(z.string().min(1).max(100)).max(50).nullable().default(null),
  ingredients: z.array(z.string().min(1).max(100)).max(50).nullable().default(null),
  metaTitle: z.string().max(70).nullable().default(null),
  metaDescription: z.string().max(160).nullable().default(null),
  proteins: z.number().min(0).max(999.99).nullable().default(null),
```

And modify `ItemDetailResponseSchema` — add the same three fields between `allergens` and `proteins` (around line 186):

```ts
  allergens: z.array(z.string()).nullable(),
  ingredients: z.array(z.string()).nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  proteins: z.number().nullable(),
```

- [x] **Step 4: Extend `UpsertItemRow` and `ItemDetailRow` in ports.ts**

In `apps/api/src/contexts/catalog/domain/ports.ts`:

For `UpsertItemRow` (between `allergens` and `proteins`, around line 108):

```ts
  readonly allergens: readonly string[] | null;
  readonly ingredients: readonly string[] | null;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly proteins: number | null;
```

For `ItemDetailRow` (between `allergens` and `proteins`, around line 206):

```ts
  readonly allergens: readonly string[] | null;
  readonly ingredients: readonly string[] | null;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly proteins: number | null;
```

- [x] **Step 5: Commit (test still fails — service code change comes next)**

```bash
git add apps/api/src/contexts/catalog/application/dto.ts apps/api/src/contexts/catalog/domain/ports.ts apps/api/test/unit/catalog/upsert-item.service.spec.ts
git commit -m "feat(api): add ingredients + SEO fields to catalog DTOs and ports"
```

---

## Task 4: API upsert-item service — forward new fields to repository

**Files:**

- Modify: `apps/api/src/contexts/catalog/application/upsert-item.service.ts`

- [x] **Step 1: Forward fields into repo call**

In `apps/api/src/contexts/catalog/application/upsert-item.service.ts`, extend the `this.repo.upsertItem({...})` call to include the three new fields, immediately after `allergens`:

```ts
      photos,
      allergens: input.allergens,
      ingredients: input.ingredients,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      proteins: input.proteins,
```

- [x] **Step 2: Run upsert-item spec — expect it to pass**

Run: `pnpm -F api test -- upsert-item.service.spec`

Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add apps/api/src/contexts/catalog/application/upsert-item.service.ts
git commit -m "feat(api): upsert-item service forwards new fields to repo"
```

---

## Task 5: API repository — INSERT/UPDATE/SELECT new columns

**Files:**

- Modify: `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`

- [x] **Step 1: Add fields to the three write paths in `upsertItem`**

In `catalog-drizzle.repository.ts`, find the three places that pass column values into `insertInto(schema.menuItems, ...)` / `updateTable(schema.menuItems, ...)` / `onConflictDoUpdate({ set: ... })` (around lines 330–434). Each block currently includes `allergens`. Add immediately after `allergens` in **all three blocks**:

```ts
              allergens: input.allergens ? [...input.allergens] : null,
              ingredients: input.ingredients ? [...input.ingredients] : null,
              metaTitle: input.metaTitle,
              metaDescription: input.metaDescription,
              proteins: input.proteins === null ? null : input.proteins.toString(),
```

(The `set:` block inside `onConflictDoUpdate` also needs the same three additions.)

- [x] **Step 2: Add fields to `getItemById` SELECT projection**

Find `getItemById` (around line 875). In the `return { ... }` mapper, add immediately after `allergens`:

```ts
        allergens: r.allergens ?? null,
        ingredients: r.ingredients ?? null,
        metaTitle: r.metaTitle ?? null,
        metaDescription: r.metaDescription ?? null,
        proteins: r.proteins === null ? null : Number(r.proteins),
```

- [x] **Step 3: Typecheck the API**

Run: `pnpm -F api typecheck`

Expected: PASS.

- [x] **Step 4: Run full catalog unit test suite**

Run: `pnpm -F api test -- catalog/`

Expected: all PASS. (The upsert-item spec is the only one with new assertions; others should be unaffected.)

- [x] **Step 5: Commit**

```bash
git add apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
git commit -m "feat(api): catalog repository persists + reads ingredients/SEO columns"
```

---

## Task 6: API get-item service — return new fields

**Files:**

- Modify: `apps/api/src/contexts/catalog/application/get-item.service.ts`

- [x] **Step 1: Map fields from row into response**

In `apps/api/src/contexts/catalog/application/get-item.service.ts`, extend the `return { ... }` (around line 31) immediately after `allergens`:

```ts
      allergens: row.allergens ? [...row.allergens] : null,
      ingredients: row.ingredients ? [...row.ingredients] : null,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      proteins: row.proteins,
```

- [x] **Step 2: Run get-menu-item / get-item spec**

Run: `pnpm -F api test -- catalog/`

Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add apps/api/src/contexts/catalog/application/get-item.service.ts
git commit -m "feat(api): get-item service returns ingredients + SEO fields"
```

---

## Task 7: Regenerate OpenAPI + api-client

**Files:**

- Modify: `docs/api/openapi.yaml` (generated)
- Modify: `packages/api-client/src/generated/api.ts` (generated)

- [x] **Step 1: Regenerate OpenAPI YAML**

Run: `pnpm -F api openapi:emit`

Expected: `docs/api/openapi.yaml` updated. Verify diff includes the three new fields under both `UpsertItemInputDto` and `ItemDetailResponseDto` component schemas.

- [x] **Step 2: Regenerate api-client types**

Run: `pnpm -F @resto/api-client gen`

Expected: `packages/api-client/src/generated/api.ts` updated with the three new fields in the relevant request/response shapes.

- [x] **Step 3: Run openapi-check (consistency guard)**

Run: `pnpm openapi:check`

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add docs/api/openapi.yaml packages/api-client/src/generated/api.ts
git commit -m "chore(api): regen openapi.yaml + api-client after catalog DTO update"
```

---

## Task 8: Admin Zod form schema + types + i18n

**Files:**

- Modify: `apps/admin/lib/menu/zod-schemas.ts`
- Modify: `apps/admin/app/dashboard/(workspace)/menu/items/[id]/types.ts`
- Modify: `apps/admin/lib/i18n/messages/ru.json`
- Modify: `apps/admin/lib/i18n/messages/en.json`

- [x] **Step 1: Extend `ItemEditorFormSchema`**

In `apps/admin/lib/menu/zod-schemas.ts`, modify `ItemEditorFormSchema` (around line 50). The form value of `ingredients` is the parsed array (the UI keeps a separate raw-string local state, same pattern as `allergens`). Add fields after `allergens`:

```ts
export const ItemEditorFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(4096).nullable(),
  categoryId: z.string().uuid(),
  basePrice: z.number().min(0),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  allergens: z.array(z.string().min(1).max(100)).max(50),
  ingredients: z.array(z.string().min(1).max(100)).max(50),
  metaTitle: z.string().max(70).nullable(),
  metaDescription: z.string().max(160).nullable(),
  proteins: z.number().min(0).max(999.99).nullable(),
  fats: z.number().min(0).max(999.99).nullable(),
  carbs: z.number().min(0).max(999.99).nullable(),
  kcal: z.number().int().min(0).max(32000).nullable(),
  nutritionEstimated: z.boolean(),
});
```

- [x] **Step 2: Extend `ItemDetailApi`**

In `apps/admin/app/dashboard/(workspace)/menu/items/[id]/types.ts`, add three fields to `ItemDetailApi` (after `allergens`):

```ts
  readonly allergens: readonly string[];
  readonly ingredients: readonly string[] | null;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly proteins: number | null;
```

- [x] **Step 3: Add i18n keys (Russian)**

In `apps/admin/lib/i18n/messages/ru.json`, inside `menu.editor` (after `validateForm` around line 128), add:

```json
      "validateForm": "Проверьте поля формы.",
      "basicsSectionTitle": "Основное",
      "priceSectionTitle": "Цена и размеры",
      "compositionSectionTitle": "Состав",
      "ingredientsLabel": "Ингредиенты",
      "ingredientsPlaceholder": "Курица, помидоры, соус терияки",
      "seoSectionTitle": "SEO",
      "metaTitleLabel": "Meta title",
      "metaTitleHint": "До 70 символов — отображается в выдаче поисковика и заголовке вкладки.",
      "metaDescriptionLabel": "Meta description",
      "metaDescriptionHint": "До 160 символов — короткое описание для поисковика и соцсетей.",
      "statusSectionTitle": "Статус",
      "statusReadonlyHint": "Управляется из списка блюд.",
      "techInfoSectionTitle": "Тех. информация",
      "slugLabel": "Slug"
```

- [x] **Step 4: Add i18n keys (English)**

In `apps/admin/lib/i18n/messages/en.json`, mirror the same keys under `menu.editor`:

```json
      "basicsSectionTitle": "Basics",
      "priceSectionTitle": "Price & sizes",
      "compositionSectionTitle": "Composition",
      "ingredientsLabel": "Ingredients",
      "ingredientsPlaceholder": "Chicken, tomato, teriyaki sauce",
      "seoSectionTitle": "SEO",
      "metaTitleLabel": "Meta title",
      "metaTitleHint": "Up to 70 chars — shown in search results and the browser tab title.",
      "metaDescriptionLabel": "Meta description",
      "metaDescriptionHint": "Up to 160 chars — short summary for search and social previews.",
      "statusSectionTitle": "Status",
      "statusReadonlyHint": "Managed from the items list.",
      "techInfoSectionTitle": "Tech info",
      "slugLabel": "Slug"
```

- [x] **Step 5: Typecheck admin**

Run: `pnpm -F admin typecheck`

Expected: PASS. (Existing admin files still reference `ItemEditorForm` without `ingredients` etc; TS will start complaining once consumers read those fields — but the schema add is itself fine.)

- [x] **Step 6: Commit**

```bash
git add apps/admin/lib/menu/zod-schemas.ts apps/admin/app/dashboard/(workspace)/menu/items/[id]/types.ts apps/admin/lib/i18n/messages/ru.json apps/admin/lib/i18n/messages/en.json
git commit -m "feat(admin): extend item editor schema + i18n with ingredients + SEO"
```

---

## Task 9: Admin server action — forward new fields

**Files:**

- Modify: `apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts`

- [x] **Step 1: Write the failing test (extend upsert-item-action spec)**

In `apps/admin/test/upsert-item-action.spec.ts`, find an existing happy-path test that builds a `values` object. Add an assertion (or add a new test) that the payload sent to `apiFetchInternal` includes the three new fields:

```ts
it('forwards ingredients + metaTitle + metaDescription to apiFetchInternal', async () => {
  apiFetchInternalMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { id: 'new-id' },
  });
  const values: ItemEditorForm = {
    name: 'Carbonara',
    description: null,
    categoryId: '11111111-1111-4111-8111-111111111111',
    basePrice: 9.5,
    currency: 'EUR',
    allergens: [],
    ingredients: ['pasta', 'egg', 'pancetta'],
    metaTitle: 'Carbonara — Trattoria',
    metaDescription: 'Classic Roman pasta with pancetta and egg yolk.',
    proteins: null,
    fats: null,
    carbs: null,
    kcal: null,
    nutritionEstimated: false,
  };
  await upsertItemAction('new', values, null);
  const callBody = apiFetchInternalMock.mock.calls[0]?.[1]?.body as Record<
    string,
    unknown
  >;
  expect(callBody.ingredients).toEqual(['pasta', 'egg', 'pancetta']);
  expect(callBody.metaTitle).toBe('Carbonara — Trattoria');
  expect(callBody.metaDescription).toBe(
    'Classic Roman pasta with pancetta and egg yolk.',
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin test -- upsert-item-action`

Expected: FAIL — payload does not contain the new fields.

- [x] **Step 3: Forward fields in the action**

In `apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts`, modify the `payload` object (around line 29). Add three lines immediately after `allergens`:

```ts
const payload: Record<string, unknown> = {
  categoryId: parsed.data.categoryId,
  name: toLocalizedText(parsed.data.name),
  description: parsed.data.description
    ? toLocalizedText(parsed.data.description)
    : null,
  basePrice: parsed.data.basePrice.toFixed(2),
  currency: parsed.data.currency,
  allergens: parsed.data.allergens,
  ingredients: parsed.data.ingredients,
  metaTitle: parsed.data.metaTitle,
  metaDescription: parsed.data.metaDescription,
  proteins: parsed.data.proteins,
  fats: parsed.data.fats,
  carbs: parsed.data.carbs,
  kcal: parsed.data.kcal,
  nutritionEstimated: parsed.data.nutritionEstimated,
  source: 'manual',
  photos: photoS3Key
    ? [{ s3Key: photoS3Key, sortOrder: 0, isPrimary: true }]
    : [],
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm -F admin test -- upsert-item-action`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts apps/admin/test/upsert-item-action.spec.ts
git commit -m "feat(admin): upsert-item action forwards ingredients + SEO fields"
```

---

## Task 10: Admin page.tsx — pass new fields to shell

**Files:**

- Modify: `apps/admin/app/dashboard/(workspace)/menu/items/[id]/page.tsx`

- [x] **Step 1: No change needed in `page.tsx` body**

The page already passes `initialItem={item}` (the entire `ItemDetailApi`) to `ItemEditorShellClient`. Once `ItemDetailApi` includes the three new fields (Task 8 Step 2) and the API actually returns them (Tasks 5–6), the shell's `valuesFromItem` mapper picks them up automatically — but `valuesFromItem` lives inside the shell and needs the explicit mapping (Task 13). No edits to `page.tsx` itself.

Mark this task complete with no file change — but verify by running `pnpm -F admin typecheck` and confirming `page.tsx` still compiles. No commit needed.

---

## Task 11: Aside client — Photo + Status + Tech info

**Files:**

- Create: `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-aside-client.tsx`
- Create: `apps/admin/test/item-aside-client.spec.tsx`

- [x] **Step 1: Write the failing test**

Create `apps/admin/test/item-aside-client.spec.tsx`:

```tsx
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '../app/dashboard/(workspace)/menu/items/[id]/photo-upload-client',
  () => ({
    PhotoUploadClient: () => <div data-testid="photo-upload" />,
  }),
);

const { ItemAsideClient } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/item-aside-client');

const ITEM_ID = '11111111-1111-4111-8111-111111111111';

describe('ItemAsideClient', () => {
  it('renders the embedded PhotoUploadClient', () => {
    render(
      <ItemAsideClient
        itemId={ITEM_ID}
        currentPhotoS3Key={null}
        currentPhotoUrl={null}
        onPhotoChange={() => undefined}
        status="draft"
        slug="kapuchino"
      />,
    );
    expect(screen.getByTestId('photo-upload')).toBeInTheDocument();
  });

  it('renders the status as a read-only badge with the managed-from-list hint', () => {
    render(
      <ItemAsideClient
        itemId={ITEM_ID}
        currentPhotoS3Key={null}
        currentPhotoUrl={null}
        onPhotoChange={() => undefined}
        status="published"
        slug="kapuchino"
      />,
    );
    expect(
      screen.getByText(/Управляется из списка блюд\./u),
    ).toBeInTheDocument();
  });

  it('renders the slug in the tech-info row', () => {
    render(
      <ItemAsideClient
        itemId={ITEM_ID}
        currentPhotoS3Key={null}
        currentPhotoUrl={null}
        onPhotoChange={() => undefined}
        status="draft"
        slug="kapuchino"
      />,
    );
    expect(screen.getByText('kapuchino')).toBeInTheDocument();
  });

  it('renders an em-dash for empty slug (new item)', () => {
    render(
      <ItemAsideClient
        itemId="new"
        currentPhotoS3Key={null}
        currentPhotoUrl={null}
        onPhotoChange={() => undefined}
        status="draft"
        slug=""
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin test -- item-aside-client`

Expected: FAIL — `ItemAsideClient` not found.

- [x] **Step 3: Implement `ItemAsideClient`**

Create `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-aside-client.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PhotoUploadClient } from './photo-upload-client';
import type { Status } from '@/lib/menu/types';

export interface ItemAsideClientProps {
  readonly itemId: string;
  readonly currentPhotoS3Key: string | null;
  readonly currentPhotoUrl: string | null;
  readonly onPhotoChange: (s3Key: string) => void;
  readonly status: Status;
  readonly slug: string;
}

const STATUS_VARIANT: Record<Status, 'secondary' | 'default' | 'outline'> = {
  draft: 'outline',
  published: 'default',
  archived: 'secondary',
};

export function ItemAsideClient({
  itemId,
  currentPhotoS3Key,
  currentPhotoUrl,
  onPhotoChange,
  status,
  slug,
}: ItemAsideClientProps): React.ReactElement {
  const t = useTranslations('menu.editor');
  const tStatus = useTranslations('menu.status');
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('photoTitle')}</CardTitle>
          <CardDescription>{t('photoDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUploadClient
            itemId={itemId}
            currentS3Key={currentPhotoS3Key}
            currentPhotoUrl={currentPhotoUrl}
            onUploaded={onPhotoChange}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('statusSectionTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Badge variant={STATUS_VARIANT[status]} className="w-fit">
            {tStatus(status)}
          </Badge>
          <p className="text-xs text-muted-foreground">
            {t('statusReadonlyHint')}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('techInfoSectionTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[6rem_1fr] items-baseline gap-2 text-sm">
            <span className="text-muted-foreground">{t('slugLabel')}</span>
            <span className="font-mono break-all">{slug || '—'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

Note: `menu.status.draft|published|archived` keys must already exist in i18n. If not, add them to both `ru.json` and `en.json` as part of Task 8.

- [x] **Step 4: Verify `menu.status` namespace exists**

Run: `grep -n "\"status\":" apps/admin/lib/i18n/messages/ru.json | head -3`

If `menu.status.draft|published|archived` is missing, add this block under `menu` in both ru.json and en.json:

```json
    "status": {
      "draft": "Черновик",
      "published": "Опубликовано",
      "archived": "Архив"
    },
```

(English: `Draft`, `Published`, `Archived`.)

- [x] **Step 5: Run test to verify it passes**

Run: `pnpm -F admin test -- item-aside-client`

Expected: PASS (4/4).

- [x] **Step 6: Commit**

```bash
git add apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-aside-client.tsx apps/admin/test/item-aside-client.spec.tsx apps/admin/lib/i18n/messages/ru.json apps/admin/lib/i18n/messages/en.json
git commit -m "feat(admin): item editor aside (photo + status + tech info)"
```

---

## Task 12: Sizes card — wrap basePrice + sizes batch (rename + reshape)

**Files:**

- Rename: `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-sizes-tab-client.tsx` → `item-sizes-card-client.tsx`
- Rename: `apps/admin/test/item-sizes-tab-client.spec.tsx` → `item-sizes-card-client.spec.tsx`
- Modify: both newly renamed files

- [x] **Step 1: Rename source + test via git**

Run:

```bash
git mv apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-sizes-tab-client.tsx apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-sizes-card-client.tsx
git mv apps/admin/test/item-sizes-tab-client.spec.tsx apps/admin/test/item-sizes-card-client.spec.tsx
```

- [x] **Step 2: Update test for renamed component + new behavior**

In `apps/admin/test/item-sizes-card-client.spec.tsx`:

a. Rename import path on line ~18 from `item-sizes-tab-client` to `item-sizes-card-client`.
b. Rename `ItemSizesTabClient` → `ItemSizesCardClient` (both import line and JSX usages).
c. Wrap every `render(<ItemSizesCardClient {...} />)` call in a `FormProvider`. Helper at top of file:

```tsx
import { FormProvider, useForm } from 'react-hook-form';

function WithForm({
  children,
  defaultBasePrice = 4.5,
  defaultCurrency = 'EUR',
}: {
  children: React.ReactNode;
  defaultBasePrice?: number;
  defaultCurrency?: string;
}): React.ReactElement {
  const form = useForm({
    defaultValues: { basePrice: defaultBasePrice, currency: defaultCurrency },
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

const renderCard = (props: React.ComponentProps<typeof ItemSizesCardClient>) =>
  render(
    <WithForm>
      <ItemSizesCardClient {...props} />
    </WithForm>,
  );
```

Replace all bare `render(<ItemSizesCardClient ... />)` calls with `renderCard({ ... })`. The existing assertions stay the same (button names, behaviors).

d. Add new test "shows the base price input but clicking Сохранить размеры does not call upsertItemAction":

```tsx
it('renders the base price input inside the card without triggering the main form save', () => {
  upsertItemSizeActionMock.mockResolvedValue({ ok: true, id: SIZE_ID_M });
  renderCard({ itemId: ITEM_ID, sizes: [], onSizesChange: () => undefined });
  // The base price input is visible inside the sizes card.
  expect(screen.getByLabelText(/Цена$/u)).toBeInTheDocument();
  // Clicking the sizes save (disabled here) must not have triggered upsertItemAction.
  expect(upsertItemSizeActionMock).not.toHaveBeenCalled();
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `pnpm -F admin test -- item-sizes-card-client`

Expected: FAIL — `ItemSizesCardClient` is still exported as `ItemSizesTabClient`, no base price input rendered.

- [x] **Step 4: Reshape `item-sizes-card-client.tsx`**

In `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-sizes-card-client.tsx`:

a. Rename the component:

```ts
export function ItemSizesCardClient({ ... }: ItemSizesCardClientProps): React.ReactElement {
```

and rename `ItemSizesTabClientProps` → `ItemSizesCardClientProps`.

b. Add imports at the top:

```ts
import { useFormContext } from 'react-hook-form';
import { FormField } from '@/components/ui/form';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';
```

c. Inside the component, immediately above `const t = useTranslations('menu.sizes');`, pull form context:

```ts
const form = useFormContext<ItemEditorForm>();
const tEditor = useTranslations('menu.editor');
```

d. Inside `<CardContent>`, before the rows block, add a base-price block:

```tsx
      <CardContent className="flex flex-col gap-3">
        <FormField
          control={form.control}
          name="basePrice"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.error ? true : undefined}>
              <FieldLabel htmlFor={field.name}>{tEditor('price')}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={field.name}
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  aria-invalid={fieldState.error ? true : undefined}
                  name={field.name}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  value={field.value}
                  onChange={(e) => {
                    const n = Number.parseFloat(e.target.value);
                    field.onChange(Number.isFinite(n) ? n : 0);
                  }}
                />
                <InputGroupAddon align="inline-end">{form.watch('currency')}</InputGroupAddon>
              </InputGroup>
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
            </Field>
          )}
        />
        <hr className="border-border" />
        {!isNewItem && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
        ) : null}
        {/* …existing rows block… */}
```

e. Update `<CardTitle>` to use the editor title (Price + sizes):

```tsx
<CardTitle>{tEditor('priceSectionTitle')}</CardTitle>
```

The existing `<CardDescription>` (saveFirstHint / description) and the existing rows/save button logic stay unchanged.

- [x] **Step 5: Run tests to verify they pass**

Run: `pnpm -F admin test -- item-sizes-card-client`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-sizes-card-client.tsx apps/admin/test/item-sizes-card-client.spec.tsx
git commit -m "refactor(admin): reshape item sizes tab into card with basePrice via useFormContext"
```

---

## Task 13: Modifier-groups card — chip-list + ingredients (rename + reshape)

**Files:**

- Rename: `item-modifiers-tab-client.tsx` → `item-modifier-groups-card-client.tsx`
- Rename: `item-modifiers-tab-client.spec.tsx` → `item-modifier-groups-card-client.spec.tsx`
- Modify: both newly renamed files

- [x] **Step 1: Rename source + test via git**

```bash
git mv apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-modifiers-tab-client.tsx apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-modifier-groups-card-client.tsx
git mv apps/admin/test/item-modifiers-tab-client.spec.tsx apps/admin/test/item-modifier-groups-card-client.spec.tsx
```

- [x] **Step 2: Update test for renamed component + new ingredients behavior**

In `apps/admin/test/item-modifier-groups-card-client.spec.tsx`:

a. Rename import path: `item-modifiers-tab-client` → `item-modifier-groups-card-client`.
b. Rename `ItemModifiersTabClient` → `ItemModifierGroupsCardClient` everywhere.
c. Add a `FormProvider` wrapper helper (same pattern as Task 12 Step 2.c — default `ingredients: []`):

```tsx
import { FormProvider, useForm } from 'react-hook-form';

function WithForm({
  children,
  defaultIngredients = [],
}: {
  children: React.ReactNode;
  defaultIngredients?: string[];
}): React.ReactElement {
  const form = useForm({ defaultValues: { ingredients: defaultIngredients } });
  return <FormProvider {...form}>{children}</FormProvider>;
}

const renderCard = (
  props: React.ComponentProps<typeof ItemModifierGroupsCardClient>,
) =>
  render(
    <WithForm>
      <ItemModifierGroupsCardClient {...props} />
    </WithForm>,
  );
```

Replace all `render(...)` calls.

d. Add a new test asserting the ingredients input is in the card and editing it does NOT call `upsertItemModifierGroupsAction`:

```tsx
it('renders the ingredients input but typing into it does not trigger auto-sync', () => {
  renderCard({
    itemId: ITEM_ID,
    initialModifierGroupIds: [],
    availableGroups: [],
  });
  const ingredientsInput = screen.getByLabelText(
    /Ингредиенты/u,
  ) as HTMLInputElement;
  fireEvent.change(ingredientsInput, { target: { value: 'курица, томат' } });
  expect(upsertItemModifierGroupsActionMock).not.toHaveBeenCalled();
});
```

- [x] **Step 3: Run tests to verify failure**

Run: `pnpm -F admin test -- item-modifier-groups-card-client`

Expected: FAIL — component name mismatch + missing ingredients input.

- [x] **Step 4: Reshape `item-modifier-groups-card-client.tsx`**

In `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-modifier-groups-card-client.tsx`:

a. Rename exports + props:

```ts
export interface ItemModifierGroupsCardClientProps { /* same body */ }
export function ItemModifierGroupsCardClient({ ... }: ItemModifierGroupsCardClientProps): React.ReactElement { ... }
```

b. Add imports:

```ts
import { useFormContext } from 'react-hook-form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';
```

c. Inside the component, pull form context + `commaListFromInput` helper. Add after existing `const isNewItem = ...`:

```ts
const form = useFormContext<ItemEditorForm>();
const tEditor = useTranslations('menu.editor');
const tCommonShared = useTranslations('common');
const [ingredientsText, setIngredientsText] = React.useState(
  (form.getValues('ingredients') ?? []).join(', '),
);
const commaListFromInput = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
```

d. Replace the `isNewItem` early return with an updated version that still renders the ingredients field (ingredients should be editable on new items, since they save with the main form):

```tsx
const ingredientsField = (
  <Field>
    <FieldLabel htmlFor="ingredients">{tEditor('ingredientsLabel')}</FieldLabel>
    <Input
      id="ingredients"
      value={ingredientsText}
      placeholder={tEditor('ingredientsPlaceholder')}
      onChange={(e) => {
        setIngredientsText(e.target.value);
        form.setValue('ingredients', commaListFromInput(e.target.value), {
          shouldDirty: true,
          shouldTouch: true,
        });
      }}
    />
    <FieldDescription>{tCommonShared('comma')}</FieldDescription>
  </Field>
);

if (isNewItem) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tEditor('compositionSectionTitle')}</CardTitle>
        <CardDescription>{t('newItemHint')}</CardDescription>
      </CardHeader>
      <CardContent>{ingredientsField}</CardContent>
    </Card>
  );
}
```

e. In the main return (the non-new branch), update the card title and append `ingredientsField` at the bottom of `<CardContent>`:

```tsx
<CardHeader>
  <CardTitle>{tEditor('compositionSectionTitle')}</CardTitle>
  <CardDescription>{t('cardDescription')}</CardDescription>
</CardHeader>
<CardContent className="flex flex-col gap-4">
  {/* …existing chip-list + Add Group button… */}
  <hr className="border-border" />
  {ingredientsField}
</CardContent>
```

- [x] **Step 5: Run tests to verify they pass**

Run: `pnpm -F admin test -- item-modifier-groups-card-client`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-modifier-groups-card-client.tsx apps/admin/test/item-modifier-groups-card-client.spec.tsx
git commit -m "refactor(admin): reshape modifiers tab into composition card with ingredients via useFormContext"
```

---

## Task 14: Detail form client — rename + 6 cards

**Files:**

- Rename: `item-detail-tab-client.tsx` → `item-detail-form-client.tsx`
- Rename: `item-detail-tab-client.spec.tsx` → `item-detail-form-client.spec.tsx`
- Modify: both newly renamed files

- [x] **Step 1: Rename via git**

```bash
git mv apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-detail-tab-client.tsx apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-detail-form-client.tsx
git mv apps/admin/test/item-detail-tab-client.spec.tsx apps/admin/test/item-detail-form-client.spec.tsx
```

- [x] **Step 2: Update test (rename + add round-trip cases)**

In `apps/admin/test/item-detail-form-client.spec.tsx`:

a. Rename import path: `item-detail-tab-client` → `item-detail-form-client`.
b. Rename `ItemDetailTabClient` → `ItemDetailFormClient` everywhere.
c. Update `FORM_ID` constant from `'item-detail-form'` to `'item-form'`.
d. Update `defaultProps.initialValues` to include the three new fields:

```tsx
  initialValues: {
    name: 'Капучино',
    description: 'Кофейный напиток',
    categoryId: CATEGORY_ID,
    basePrice: 4.5,
    currency: 'EUR',
    allergens: ['молоко'],
    ingredients: [],
    metaTitle: null,
    metaDescription: null,
    proteins: 3.2,
    fats: 4.1,
    carbs: 6.8,
    kcal: 80,
    nutritionEstimated: false,
  },
```

e. Note that `ItemDetailFormClient` now no longer renders Sizes / Modifier-groups (Tasks 12-13 own those). Remove any props that no longer exist on the new component:

- `currentPhotoS3Key`, `currentPhotoUrl`, `initialPhotoS3Key`, `onPhotoChange` — kept (form still tracks photo dirtiness, but no longer renders the Photo card itself; pass through still).
- `availableModifierGroups`, `initialModifierGroupIds`, `sizes` — these props belong to ItemSizesCardClient / ItemModifierGroupsCardClient, NOT ItemDetailFormClient. They were never in defaultProps so no change.

Actually — `ItemDetailFormClient` is now the **outer FormProvider** which renders the Sizes + ModifierGroups cards as children (per spec, lines 38–46). It owns the form but delegates Photo to the aside. Update props accordingly. The shell now passes the sizes/modifier-groups bits THROUGH to the form client which then forwards to its child cards. Tests must reflect this:

```tsx
const defaultProps = {
  initialValues: {
    /* …above… */
  },
  categories: [{ id: CATEGORY_ID, name: 'Кофе', parentId: null }],
  currentItemId: ITEM_ID,
  initialItemSizes: [],
  onSizesChange: vi.fn(),
  availableModifierGroups: [],
  initialModifierGroupIds: [],
  onSaved: vi.fn(),
  slug: 'kapuchino',
  formId: FORM_ID,
  onStateChange: vi.fn(),
  initialPhotoS3Key: null as string | null,
  currentPhotoS3Key: null as string | null,
};
```

And add mocks for the two child card clients (so the test isolates ItemDetailFormClient's own logic):

```tsx
vi.mock(
  '../app/dashboard/(workspace)/menu/items/[id]/item-sizes-card-client',
  () => ({
    ItemSizesCardClient: () => <div data-testid="sizes-card" />,
  }),
);
vi.mock(
  '../app/dashboard/(workspace)/menu/items/[id]/item-modifier-groups-card-client',
  () => ({
    ItemModifierGroupsCardClient: () => (
      <div data-testid="modifier-groups-card" />
    ),
  }),
);
```

f. Add three new cases at the bottom of the `describe` block:

```tsx
it('round-trips ingredients into upsertItemAction', async () => {
  upsertItemActionMock.mockResolvedValue({ ok: true, id: ITEM_ID });
  render(
    <ItemDetailFormClient
      {...defaultProps}
      initialValues={{
        ...defaultProps.initialValues,
        ingredients: ['курица', 'томат'],
      }}
    />,
  );
  await act(async () => {
    submitForm();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(upsertItemActionMock.mock.calls[0]?.[1].ingredients).toEqual([
    'курица',
    'томат',
  ]);
});

it('round-trips metaTitle and metaDescription into upsertItemAction', async () => {
  upsertItemActionMock.mockResolvedValue({ ok: true, id: ITEM_ID });
  render(
    <ItemDetailFormClient
      {...defaultProps}
      initialValues={{
        ...defaultProps.initialValues,
        metaTitle: 'Капучино — Кофейня',
        metaDescription: 'Кофе с молоком, классика.',
      }}
    />,
  );
  await act(async () => {
    submitForm();
    await Promise.resolve();
    await Promise.resolve();
  });
  const values = upsertItemActionMock.mock.calls[0]?.[1];
  expect(values.metaTitle).toBe('Капучино — Кофейня');
  expect(values.metaDescription).toBe('Кофе с молоком, классика.');
});

it('renders the SEO card with metaTitle and metaDescription inputs', () => {
  render(<ItemDetailFormClient {...defaultProps} />);
  expect(screen.getByLabelText(/Meta title/u)).toBeInTheDocument();
  expect(screen.getByLabelText(/Meta description/u)).toBeInTheDocument();
});
```

- [x] **Step 3: Run tests to verify failure**

Run: `pnpm -F admin test -- item-detail-form-client`

Expected: FAIL — component name mismatch, missing SEO inputs, missing FormProvider wrapping child cards.

- [x] **Step 4: Rewrite `item-detail-form-client.tsx`**

Replace the body of `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-detail-form-client.tsx` with:

```tsx
'use client';

// Render contract: this component is the SOLE owner of the RHF FormProvider for the item editor.
// Child cards (ItemSizesCardClient, ItemModifierGroupsCardClient) rely on useFormContext() and MUST be
// rendered as descendants of this component, never composed by the shell directly.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CategorySelect } from '@/components/menu/category-select';
import { BjuRow, type BjuField } from '@/components/menu/bju-row';
import {
  ItemEditorFormSchema,
  type ItemEditorForm,
} from '@/lib/menu/zod-schemas';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertItemAction } from './upsert-item-action';
import { ItemSizesCardClient } from './item-sizes-card-client';
import {
  ItemModifierGroupsCardClient,
  type AvailableGroup,
} from './item-modifier-groups-card-client';
import type { CategoryOption, ItemSizeApi } from './types';

export interface ItemDetailFormState {
  readonly isNew: boolean;
  readonly isDirty: boolean;
  readonly isPending: boolean;
}

export interface ItemDetailFormClientProps {
  readonly initialValues: ItemEditorForm;
  readonly categories: readonly CategoryOption[];
  readonly currentItemId: string;
  readonly initialItemSizes: readonly ItemSizeApi[];
  readonly onSizesChange: (sizes: readonly ItemSizeApi[]) => void;
  readonly availableModifierGroups: readonly AvailableGroup[];
  readonly initialModifierGroupIds: readonly string[];
  readonly onSaved: (savedId: string) => void;
  readonly slug: string;
  readonly formId: string;
  readonly onStateChange: (state: ItemDetailFormState) => void;
  readonly currentPhotoS3Key: string | null;
  readonly initialPhotoS3Key: string | null;
}

const commaListFromInput = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export function ItemDetailFormClient({
  initialValues,
  categories,
  currentItemId,
  initialItemSizes,
  onSizesChange,
  availableModifierGroups,
  initialModifierGroupIds,
  onSaved,
  slug,
  formId,
  onStateChange,
  currentPhotoS3Key,
  initialPhotoS3Key,
}: ItemDetailFormClientProps): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('menu.editor');
  const tCommon = useTranslations('common');
  const [pending, setPending] = React.useState(false);
  const form = useForm<ItemEditorForm>({
    resolver: zodResolver(ItemEditorFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const isNew = currentItemId === 'new';
  const isFormDirty = form.formState.isDirty;
  const isPhotoDirty = currentPhotoS3Key !== initialPhotoS3Key;
  const isDirty = isFormDirty || isPhotoDirty;

  React.useEffect(() => {
    onStateChange({ isNew, isDirty, isPending: pending });
  }, [isNew, isDirty, pending, onStateChange]);

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    const res = await upsertItemAction(
      currentItemId,
      values,
      currentPhotoS3Key,
    );
    setPending(false);
    if (!res.ok) {
      showError(res.error, t('saveFailed'));
      return;
    }
    showSuccess(isNew ? t('itemCreated') : tCommon('saved'), {
      duration: 1500,
    });
    onSaved(res.id);
    if (isNew) {
      router.replace(`/dashboard/menu/items/${res.id}`);
    } else {
      form.reset(values);
    }
  });

  return (
    <FormProvider {...form}>
      <form
        id={formId}
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="flex flex-col gap-6"
      >
        <ItemBasicsCard categories={categories} slug={slug} />
        <ItemSizesCardClient
          itemId={currentItemId}
          sizes={initialItemSizes}
          onSizesChange={onSizesChange}
        />
        <ItemModifierGroupsCardClient
          itemId={currentItemId}
          initialModifierGroupIds={initialModifierGroupIds}
          availableGroups={availableModifierGroups}
        />
        <ItemNutritionCard />
        <ItemAllergensCard initialAllergens={initialValues.allergens} />
        <ItemSeoCard />
      </form>
    </FormProvider>
  );
}

function ItemBasicsCard({
  categories,
  slug,
}: {
  readonly categories: readonly CategoryOption[];
  readonly slug: string;
}): React.ReactElement {
  const t = useTranslations('menu.editor');
  const form = useFormContext<ItemEditorForm>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('basicsSectionTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FormField
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('name')}</FieldLabel>
                <Input
                  id={field.name}
                  maxLength={255}
                  aria-invalid={fieldState.error ? true : undefined}
                  {...field}
                />
                <FieldDescription>
                  {slug || t('slugPlaceholder')}
                </FieldDescription>
                {fieldState.error ? (
                  <FieldError>{fieldState.error.message}</FieldError>
                ) : null}
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('description')}</FieldLabel>
                <Textarea
                  id={field.name}
                  maxLength={4096}
                  rows={4}
                  aria-invalid={fieldState.error ? true : undefined}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(
                      e.target.value.length === 0 ? null : e.target.value,
                    );
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                />
                {fieldState.error ? (
                  <FieldError>{fieldState.error.message}</FieldError>
                ) : null}
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('category')}</FieldLabel>
                <CategorySelect
                  categories={categories}
                  value={field.value || null}
                  onChange={(v) => {
                    field.onChange(v ?? '');
                  }}
                  mode="item-picker"
                />
                {fieldState.error ? (
                  <FieldError>{fieldState.error.message}</FieldError>
                ) : null}
              </Field>
            )}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ItemNutritionCard(): React.ReactElement {
  const t = useTranslations('menu.editor');
  const form = useFormContext<ItemEditorForm>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('nutritionTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend variant="label">{t('nutritionTitle')}</FieldLegend>
          <BjuRow
            proteins={form.watch('proteins')}
            fats={form.watch('fats')}
            carbs={form.watch('carbs')}
            kcal={form.watch('kcal')}
            nutritionEstimated={form.watch('nutritionEstimated')}
            onChange={(name: BjuField, value: number | null) => {
              form.setValue(name, value, {
                shouldDirty: true,
                shouldTouch: true,
              });
            }}
          />
        </FieldSet>
      </CardContent>
    </Card>
  );
}

function ItemAllergensCard({
  initialAllergens,
}: {
  readonly initialAllergens: readonly string[];
}): React.ReactElement {
  const t = useTranslations('menu.editor');
  const tCommon = useTranslations('common');
  const form = useFormContext<ItemEditorForm>();
  const [allergensText, setAllergensText] = React.useState(
    initialAllergens.join(', '),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('allergens')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="allergens">{t('allergens')}</FieldLabel>
          <Input
            id="allergens"
            value={allergensText}
            placeholder={t('allergensPlaceholder')}
            onChange={(e) => {
              setAllergensText(e.target.value);
              form.setValue('allergens', commaListFromInput(e.target.value), {
                shouldDirty: true,
                shouldTouch: true,
              });
            }}
          />
          <FieldDescription>{tCommon('comma')}</FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}

function ItemSeoCard(): React.ReactElement {
  const t = useTranslations('menu.editor');
  const form = useFormContext<ItemEditorForm>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('seoSectionTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FormField
            control={form.control}
            name="metaTitle"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>
                  {t('metaTitleLabel')}
                </FieldLabel>
                <Input
                  id={field.name}
                  maxLength={70}
                  aria-invalid={fieldState.error ? true : undefined}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(
                      e.target.value.length === 0 ? null : e.target.value,
                    );
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                />
                <FieldDescription>{t('metaTitleHint')}</FieldDescription>
                {fieldState.error ? (
                  <FieldError>{fieldState.error.message}</FieldError>
                ) : null}
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="metaDescription"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>
                  {t('metaDescriptionLabel')}
                </FieldLabel>
                <Textarea
                  id={field.name}
                  maxLength={160}
                  rows={3}
                  aria-invalid={fieldState.error ? true : undefined}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(
                      e.target.value.length === 0 ? null : e.target.value,
                    );
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                />
                <FieldDescription>{t('metaDescriptionHint')}</FieldDescription>
                {fieldState.error ? (
                  <FieldError>{fieldState.error.message}</FieldError>
                ) : null}
              </Field>
            )}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `pnpm -F admin test -- item-detail-form-client`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-detail-form-client.tsx apps/admin/test/item-detail-form-client.spec.tsx
git commit -m "refactor(admin): rewrite item detail tab as 6-card form-provider client with SEO + ingredients"
```

---

## Task 15: Editor shell — drop Tabs, render 2-column grid

**Files:**

- Modify: `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client.tsx`

- [x] **Step 1: Rewrite shell**

Replace the body of `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client.tsx` with:

```tsx
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/page-heading';
import { fromLocalizedText } from '@/lib/menu/localized';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';
import {
  ItemDetailFormClient,
  type ItemDetailFormState,
} from './item-detail-form-client';
import { ItemAsideClient } from './item-aside-client';
import type { AvailableGroup } from './item-modifier-groups-card-client';
import type { CategoryOption, ItemDetailApi, ItemSizeApi } from './types';

export interface ItemEditorShellClientProps {
  readonly title: string;
  readonly initialItem: ItemDetailApi | null;
  readonly categories: readonly CategoryOption[];
  readonly itemId: string;
  readonly defaultCurrency: string;
  readonly availableModifierGroups: readonly AvailableGroup[];
}

const ITEM_FORM_ID = 'item-form';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const emptyValues = (currency: string): ItemEditorForm => ({
  name: '',
  description: null,
  categoryId: NIL_UUID,
  basePrice: 0,
  currency,
  allergens: [],
  ingredients: [],
  metaTitle: null,
  metaDescription: null,
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  nutritionEstimated: false,
});

const valuesFromItem = (item: ItemDetailApi): ItemEditorForm => ({
  name: fromLocalizedText(item.name),
  description: item.description ? fromLocalizedText(item.description) : null,
  categoryId: item.categoryId,
  basePrice: Number.parseFloat(item.basePrice),
  currency: item.currency,
  allergens: [...item.allergens],
  ingredients: item.ingredients ? [...item.ingredients] : [],
  metaTitle: item.metaTitle,
  metaDescription: item.metaDescription,
  proteins: item.proteins,
  fats: item.fats,
  carbs: item.carbs,
  kcal: item.kcal,
  nutritionEstimated: item.nutritionEstimated,
});

export function ItemEditorShellClient({
  title,
  initialItem,
  categories,
  itemId,
  defaultCurrency,
  availableModifierGroups,
}: ItemEditorShellClientProps): React.ReactElement {
  const t = useTranslations('menu.editor');
  const tCommon = useTranslations('common');
  const [currentItemId, setCurrentItemId] = React.useState(itemId);
  const initialPhotoS3Key = initialItem?.photos[0]?.s3Key ?? null;
  const [currentPhotoS3Key, setCurrentPhotoS3Key] = React.useState<
    string | null
  >(initialPhotoS3Key);
  const [currentPhotoUrl, setCurrentPhotoUrl] = React.useState<string | null>(
    initialItem?.photos[0]?.url ?? null,
  );
  const [currentSizes, setCurrentSizes] = React.useState<
    readonly ItemSizeApi[]
  >(initialItem?.sizes ?? []);
  const [detailState, setDetailState] = React.useState<ItemDetailFormState>({
    isNew: itemId === 'new',
    isDirty: false,
    isPending: false,
  });

  const initialValues = React.useMemo(
    () =>
      initialItem ? valuesFromItem(initialItem) : emptyValues(defaultCurrency),
    [initialItem, defaultCurrency],
  );

  const handleDetailStateChange = React.useCallback(
    (next: ItemDetailFormState) => {
      setDetailState(next);
    },
    [],
  );

  const canSubmitDetail = detailState.isNew || detailState.isDirty;
  const saveLabel = detailState.isPending
    ? tCommon('saving')
    : detailState.isNew
      ? t('createBtn')
      : tCommon('save');

  const saveButton = (
    <Button
      type="submit"
      form={ITEM_FORM_ID}
      size="sm"
      disabled={detailState.isPending || !canSubmitDetail}
    >
      {saveLabel}
    </Button>
  );

  return (
    <>
      <PageHeading title={title} action={saveButton} />
      <div className="flex flex-1 flex-col px-4 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col gap-6">
            <ItemDetailFormClient
              initialValues={initialValues}
              categories={categories}
              currentItemId={currentItemId}
              initialItemSizes={currentSizes}
              onSizesChange={setCurrentSizes}
              availableModifierGroups={availableModifierGroups}
              initialModifierGroupIds={initialItem?.modifierGroupIds ?? []}
              onSaved={(savedId) => {
                setCurrentItemId(savedId);
              }}
              slug={initialItem?.slug ?? ''}
              formId={ITEM_FORM_ID}
              onStateChange={handleDetailStateChange}
              currentPhotoS3Key={currentPhotoS3Key}
              initialPhotoS3Key={initialPhotoS3Key}
            />
          </div>
          <aside className="lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
            <ItemAsideClient
              itemId={currentItemId}
              currentPhotoS3Key={currentPhotoS3Key}
              currentPhotoUrl={currentPhotoUrl}
              onPhotoChange={(s3Key) => {
                setCurrentPhotoS3Key(s3Key);
                setCurrentPhotoUrl(null);
              }}
              status={initialItem?.status ?? 'draft'}
              slug={initialItem?.slug ?? ''}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
```

- [x] **Step 2: Verify `--header-height` CSS variable exists**

Run: `grep -rn "header-height" apps/admin/app/globals.css apps/admin/styles 2>/dev/null`

If the variable is not defined, fall back to a hard value: replace `calc(var(--header-height)+1rem)` with `4.5rem` (typical sticky header offset). Confirm with the user before changing if uncertain.

- [x] **Step 3: Typecheck**

Run: `pnpm -F admin typecheck`

Expected: PASS.

- [x] **Step 4: Run all item-editor admin tests**

Run: `pnpm -F admin test -- "(item-detail-form-client|item-sizes-card-client|item-modifier-groups-card-client|item-aside-client|items-id-page|items-page|upsert-item-action)"`

Expected: PASS. If `items-id-page.spec.tsx` references the old shell internals (Tabs etc.), update its expectations there too — it likely only checks server-side fetch wiring, but verify.

- [x] **Step 5: Commit**

```bash
git add apps/admin/app/dashboard/\(workspace\)/menu/items/\[id\]/item-editor-shell-client.tsx
git commit -m "refactor(admin): drop tabs, render item editor as 2-column grid with sticky aside"
```

---

## Task 16: Cleanup stale i18n keys (optional housekeeping)

**Files:**

- Modify: `apps/admin/lib/i18n/messages/ru.json`
- Modify: `apps/admin/lib/i18n/messages/en.json`

- [x] **Step 1: Verify nobody still references `tabDetail` / `tabSizes` / `tabModifiers`**

Run: `grep -rn "tabDetail\|tabSizes\|tabModifiers" apps/admin/ 2>/dev/null`

Expected: only the JSON files themselves (no `.tsx` references).

- [x] **Step 2: Remove the three tab keys from both message files**

Edit `apps/admin/lib/i18n/messages/ru.json` — remove these three lines from `menu.editor`:

```json
      "tabDetail": "Детали",
      "tabSizes": "Размеры",
      "tabModifiers": "Модификаторы",
```

Same for `en.json`.

- [x] **Step 3: Run admin test suite**

Run: `pnpm -F admin test`

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add apps/admin/lib/i18n/messages/ru.json apps/admin/lib/i18n/messages/en.json
git commit -m "chore(admin): remove unused tab i18n keys from item editor"
```

---

## Task 17: End-to-end verification

**Files:** none

- [x] **Step 1: Full typecheck across workspace**

Run: `pnpm typecheck`

Expected: PASS.

- [x] **Step 2: Full test suite — admin + api + db**

Run: `pnpm -F admin test && pnpm -F api test && pnpm -F @resto/db test`

Expected: all PASS.

- [x] **Step 3: Lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 4: Manual browser smoke**

Start the dev stack:

```bash
pnpm dev:up   # docker (postgres, redis, nats, minio, mailhog, jaeger)
pnpm dev      # api + admin in parallel (or two terminals)
```

Open `http://localhost:3000/dashboard/menu/items/new` and confirm:

- 2-column grid renders at viewport ≥ 1024px.
- 6 cards visible left to right top to bottom: Основное, Цена и размеры, Состав, Питание, Аллергены, SEO.
- Aside on the right sticks to the top on scroll (Photo, Status, Tech info).
- Save button in `PageHeading` is enabled (new item, isNew=true means it's enabled).
- Type a name + pick a category + price + ingredients → click Save → page navigates to `/dashboard/menu/items/<new-id>`.
- Reload → form values persist (ingredients, metaTitle, metaDescription round-trip).
- Sizes card disabled with hint on `new`; enabled after first save.
- Modifier-groups card disabled on `new`; ingredients input still editable on `new`.
- Resize viewport below 1024px → single-column stack, aside drops below the main column.

If any check fails, stop and fix — do not proceed to commit.

- [x] **Step 5: No commit (verification only)**

Verification produces no artifacts; no commit needed. If fixes were needed, those went into the relevant task's commit.

---

## Task 18: Push branch

- [x] **Step 1: Confirm branch + push**

Confirm the branch name was decided at start (per user's task workflow). Run:

```bash
git log --oneline main..HEAD
git push -u origin <branch-name>
```

Show the user the branch name and ask whether to open a PR via `gh pr create` (account: `maks-pekur` for `~/projects/`).

---

## Self-Review Notes

- **Spec coverage:** All 6 cards (① Основное / ② Цена-размеры / ③ Состав / ④ БЖУ / ⑤ Аллергены / ⑥ SEO) + 3 aside cards (Фото / Статус / Тех.info) wired through Tasks 11, 12, 13, 14, 15. Three new fields covered through 5 layers in Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9. Save paths A/B/C addressed in Tasks 12 (B), 13 (C), 14 (A). isNew edge cases preserved (Task 12, 13). Acceptance criteria 1-9 covered by Tasks 11–17.
- **No placeholders:** Every code step shows the full block to write or modify. Migration step acknowledges Drizzle picks the suffix, with explicit rename guidance.
- **Type consistency:** Component names canonical (`ItemDetailFormClient`, `ItemSizesCardClient`, `ItemModifierGroupsCardClient`, `ItemAsideClient`). Form id constant `ITEM_FORM_ID = 'item-form'` used everywhere it matters (shell save button + form element). `commaListFromInput` helper defined locally in two places (Task 13, 14) — duplication intentional per spec note (would only extract if reused 3+ times).
