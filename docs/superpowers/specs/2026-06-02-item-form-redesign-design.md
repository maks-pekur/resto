# Item Form Redesign — Design Spec

**Date:** 2026-06-02
**Surface:** `apps/admin` — `/dashboard/menu/items/[id]`
**Status:** Approved for implementation planning

## Context

The item create/edit screen currently uses a 3-tab layout (Detail / Sizes / Modifiers). The Detail tab contains all primary fields in a single `FieldGroup` stacked vertically next to a Photo card. The visual hierarchy is flat — there is no grouping that signals where the primary fields end and the secondary ones begin. Operators have to scan a long list of fields without anchoring landmarks.

This design replaces the tabbed editor with a single-scroll layout grouped into semantic cards, in line with how the user (operator) thinks about an item: photo + identity at a glance, then composition, then nutritional info, then SEO.

Three new fields land alongside the redesign: `ingredients` (text[]), `metaTitle`, `metaDescription`. These are required by the layout (cards ③ and ⑥) and have been agreed as in scope.

## Goal

Replace the current 3-tab editor with a 2-column scrolling layout that has clear visual hierarchy, integrates Sizes and Modifier Groups as inline cards, and ships the 3 new content fields end-to-end.

## Out of scope

- Inventory / stock fields.
- Variants beyond size (e.g. flavor matrix).
- Status changes (publish / unpublish / archive) from the editor — those continue to live in the items list.
- Markdown / rich text in description (stays plain Textarea).
- Image library (single primary photo only).
- Per-size modifiers, sized nutrition.

## Layout

### Shell

```text
<ItemEditorShellClient>
  PageHeading title={…} action={<SaveButton form="item-form" />}

  grid 1.7fr / 1fr at lg, 1col below lg
  ├── main (left column)
  │   └── ItemDetailFormClient (FormProvider + <form id="item-form"> wraps ALL 6 cards)
  │       ├── ItemBasicsCard          (inline, card ①)
  │       ├── ItemSizesCardClient     (card ②, separate file — uses useFormContext for basePrice)
  │       ├── ItemModifierGroupsCardClient (card ③, separate file — uses useFormContext for ingredients)
  │       ├── ItemNutritionCard       (inline, card ④)
  │       ├── ItemAllergensCard       (inline, card ⑤)
  │       └── ItemSeoCard             (inline, card ⑥)
  └── aside (right column, lg:sticky lg:top-[header+1rem])
      └── ItemAsideClient (photo + status + tech-info)
```

`ItemSizesCardClient` and `ItemModifierGroupsCardClient` are children of `ItemDetailFormClient` precisely because they consume `useFormContext()`. The shell renders only `ItemDetailFormClient` on the left side, not the size / modifier cards directly.

The `Tabs / TabsList / TabsTrigger / TabsContent` primitives are removed from the shell.

### Card breakdown

**Main column (1.7fr):**

| #   | Card           | Fields                                                                                             | RHF?  |
| --- | -------------- | -------------------------------------------------------------------------------------------------- | ----- |
| ①   | Основное       | `name` (Input), `description` (Textarea), `categoryId` (CategorySelect)                            | yes   |
| ②   | Цена и размеры | `basePrice` (InputGroup + currency addon) — RHF. Sizes rows + own save button — local batch state. | mixed |
| ③   | Состав         | Modifier-groups chips (auto-sync) + `ingredients` (Input, comma-list) — RHF                        | mixed |
| ④   | Питание (БЖУ)  | `proteins / fats / carbs / kcal` (BjuRow), `nutritionEstimated` (AI badge, read-only display)      | yes   |
| ⑤   | Аллергены      | `allergens` (Input, comma-list)                                                                    | yes   |
| ⑥   | SEO            | `metaTitle` (Input, max 70), `metaDescription` (Textarea, max 160)                                 | yes   |

**Aside column (1fr, sticky on lg+):**

| Card            | Content                                                           | Source           |
| --------------- | ----------------------------------------------------------------- | ---------------- |
| Фото            | `<PhotoUploadClient/>`                                            | Unchanged        |
| Статус          | `<StatusBadge/>` read-only with hint "управляется из списка блюд" | Existing         |
| Тех. информация | Slug (key/value row)                                              | From `item.slug` |

### Responsive

- `lg` (≥ 1024px) — two columns, aside sticky.
- Below `lg` — single column stack: main cards first, then aside cards.
- `px-4 lg:px-6` matches the rest of the admin surfaces.

## Save semantics

Three independent save paths, no atomic combined endpoint.

**Path A — Main form (cards ①③④⑤⑥):**

- `ItemDetailFormClient` mounts `<FormProvider {...form}>` with RHF.
- `<form id="item-form" onSubmit={…}>` wraps the cards that need RHF.
- `<SaveButton form="item-form" type="submit">` rendered by the shell inside `PageHeading.action`. Triggers submit via HTML `form` attribute even though it sits outside the `<form>` element. This matches the pattern already in production for the existing editor save lift.
- State (`isNew`, `isDirty`, `isPending`) is reported up via `onStateChange` callback from form to shell. Shell computes the button label / disabled state. `isDirty` = RHF dirty OR `currentPhotoS3Key !== initialPhotoS3Key` (preserved).
- Submit calls `upsertItemAction` (now accepting `ingredients`, `metaTitle`, `metaDescription`).

**Path B — Sizes (card ②):**

- `ItemSizesCardClient` owns its own local batch state (array of draft rows).
- Internal save button "Сохранить размеры" inside the card. Disabled while not dirty or `isNew`.
- Submit iterates dirty rows, calls `upsertItemSizeAction` per row + delete action for removed rows. Same logic as the current sizes tab.
- Independent from Path A. Two clicks if user changes both the name and a size.

**Path C — Modifier groups (card ③, top half):**

- Auto-sync. Click "+ группа" or "✕" calls `upsertItemModifierGroupsAction` immediately.
- Optimistic UI with rollback on error toast.
- No save button.

**Edge cases (`isNew`):**

- Sizes card disabled — shows existing hint `menu.sizes.saveFirstHint`.
- Modifier groups card disabled — shows existing hint `menu.modifiers.newItemHint`.
- Ingredients field (inside the Modifier groups card) is part of the main form and works on `new` — saves with the first create.

## Backend changes

Three new columns on `menu_items`. Owned by `packages/db`.

### Schema (`packages/db/src/schema/menu.ts`)

```ts
ingredients: text('ingredients').array(),
metaTitle: text('meta_title'),
metaDescription: text('meta_description'),
```

All nullable. Same pattern as `allergens` for the array.

### Migration

`pnpm db:generate` produces `migrations/0041_catalog_item_ingredients_seo.sql`. The migration is additive — no `NOT NULL` constraints, no defaults, no data backfill needed.

### Domain layer (`packages/domain/src/menu-item.ts` or equivalent)

Per `packages/CLAUDE.md` free-text rule — every text field has a `.max()`.

```ts
ingredients: z.array(z.string().min(1).max(100)).max(50).optional().nullable(),
metaTitle: z.string().max(70).optional().nullable(),         // SEO best practice
metaDescription: z.string().max(160).optional().nullable(),  // SEO best practice
```

### API layer (`apps/api/src/contexts/catalog/`)

| File                                     | Change                                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| `application/dto.ts`                     | `UpsertItemInputDto` + `ItemDetailDto` add the 3 fields |
| `application/upsert-item.service.ts`     | Pass new fields into repository.save                    |
| `application/get-item.service.ts`        | Return the 3 fields in the response                     |
| `infrastructure/*-drizzle.repository.ts` | INSERT / UPDATE / SELECT include the new columns        |
| `interfaces/http/*.controller.ts`        | `@ApiProperty` Swagger annotations for the 3 fields     |

### OpenAPI regeneration

`pnpm openapi:generate` → updates `docs/api/openapi.yaml`. `pnpm openapi:codegen` → updates `packages/api-client/src/generated/api.ts`.

### Admin layer (`apps/admin/`)

| File                                                              | Change                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/menu/zod-schemas.ts`                                         | `ItemEditorFormSchema` adds `ingredients` (array, default `[]`), `metaTitle`, `metaDescription`                                                                                                        |
| `app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts` | Accepts the 3 new fields, forwards via `apiFetchInternal`                                                                                                                                              |
| `app/dashboard/(workspace)/menu/items/[id]/types.ts`              | `ItemDetailApi` adds the 3 fields                                                                                                                                                                      |
| `app/dashboard/(workspace)/menu/items/[id]/page.tsx`              | Reads `item.ingredients / metaTitle / metaDescription` from API response, forwards to shell                                                                                                            |
| `lib/i18n/messages/{ru,en}.json`                                  | New keys under `menu.editor`: `ingredients`, `ingredientsPlaceholder`, `seoTitle`, `metaTitleLabel`, `metaTitleHint`, `metaDescriptionLabel`, `metaDescriptionHint`, `slugLabel`, `statusReadonlyHint` |

## Component decomposition

All within `apps/admin/app/dashboard/(workspace)/menu/items/[id]/`.

| Action           | File                                                                                                                           | Responsibility                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RENAME           | `item-detail-tab-client.tsx` → `item-detail-form-client.tsx`                                                                   | Mounts RHF `<FormProvider>`, renders `<form id="item-form">` containing all 6 cards: ① ④ ⑤ ⑥ inline as local components, ② and ③ composed as imported child components that consume `useFormContext()` for the RHF-backed fields they own (basePrice in ②, ingredients in ③). |
| RENAME + RESHAPE | `item-sizes-tab-client.tsx` → `item-sizes-card-client.tsx`                                                                     | Card ② shell. Top: `basePrice` field via `useFormContext()` (Path A). Bottom: sizes batch list with own save button (Path B).                                                                                                                                                 |
| RENAME + RESHAPE | `item-modifiers-tab-client.tsx` → `item-modifier-groups-card-client.tsx`                                                       | Card ③ shell. Top: chip-list of attached groups + "+ group" sheet (Path C auto-sync). Bottom: `ingredients` field via `useFormContext()` (Path A).                                                                                                                            |
| NEW              | `item-aside-client.tsx`                                                                                                        | Sticky right column. Renders `<PhotoUploadClient/>` + status badge card + tech-info card (slug). Light client wrapper around mostly-static content; client because of `useTranslations` and the embedded `PhotoUploadClient`.                                                 |
| UPDATE           | `item-editor-shell-client.tsx`                                                                                                 | Drops `Tabs/*`. Renders `PageHeading` + 2-column grid. Continues to track `detailState` from `ItemDetailFormClient` for the save button.                                                                                                                                      |
| UPDATE           | `page.tsx`                                                                                                                     | Forwards new fields.                                                                                                                                                                                                                                                          |
| UPDATE           | `types.ts`                                                                                                                     | `ItemDetailApi` extended.                                                                                                                                                                                                                                                     |
| UPDATE           | `upsert-item-action.ts`                                                                                                        | Extended.                                                                                                                                                                                                                                                                     |
| KEEP             | `photo-upload-client.tsx`, `photo-upload-url-action.ts`, `upsert-item-modifier-groups-action.ts`, `upsert-item-size-action.ts` | No changes.                                                                                                                                                                                                                                                                   |

### Card components inside `item-detail-form-client.tsx`

The four "thin" cards (① Основное, ④ Питание, ⑤ Аллергены, ⑥ SEO) are presentational with no logic of their own — they read fields via `useFormContext()` and render shadcn primitives. Defined inline within `item-detail-form-client.tsx` as local components (`ItemBasicsCard`, `ItemNutritionCard`, `ItemAllergensCard`, `ItemSeoCard`). If the file grows beyond ~400 lines they get extracted to a `cards/` subfolder; until then inline keeps the form-state plumbing readable.

## Testing

| Test                                                 | Action                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/item-detail-tab-client.spec.tsx`               | RENAME → `test/item-detail-form-client.spec.tsx`. Existing cases (state reporting via `onStateChange`, submit via form id, success / failure flows) continue to apply. Add cases: form values for `ingredients` / `metaTitle` / `metaDescription` round-trip into `upsertItemAction`. |
| NEW `test/item-sizes-card-client.spec.tsx`           | Port existing sizes-tab cases. Add: price input rendered visually inside the card but does NOT trigger the sizes save (paths are independent).                                                                                                                                        |
| NEW `test/item-modifier-groups-card-client.spec.tsx` | Port existing modifiers-tab cases (auto-sync add / remove). Add: ingredients field is part of the main form, not the auto-sync path.                                                                                                                                                  |
| NEW `test/item-aside-client.spec.tsx`                | Renders status badge, slug row, embedded `PhotoUploadClient` (mocked).                                                                                                                                                                                                                |
| `test/item-editor-shell-client.spec.tsx` (if exists) | Update for 2-column grid + dropped Tabs.                                                                                                                                                                                                                                              |

Backend testing follows existing `apps/api` patterns — extending the upsert-item service spec and the read-item service spec with the new fields. No new integration tests are required because no new table or RLS surface is introduced.

## Risks

| Risk                                                                                                                                          | Mitigation                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<form id="x">` + external `<button form="x">` works in modern browsers but can confuse RHF if multiple form ids collide.                     | Use a single constant `ITEM_FORM_ID = 'item-form'`. Validate with the existing editor-save pattern in production.                                                                                            |
| `useFormContext()` inside `ItemSizesCardClient` and `ItemModifierGroupsCardClient` requires those cards to be rendered inside `FormProvider`. | `ItemDetailFormClient` mounts `FormProvider` and renders both card components as its own children. The shell never composes them directly. Encoded as a comment at the top of `item-detail-form-client.tsx`. |
| Adding `ingredients` as `text[]` mirrors `allergens` — but client encodes as comma-separated string in the input.                             | Reuse existing `allergensFromForm` / `allergensToText` helper pattern; rename to `commaListFromInput` / `commaListToInput` or duplicate inline.                                                              |
| 3 new fields cross 5 layers (db, domain, api, openapi, admin). Migration must merge before frontend can read the fields.                      | Single PR ships all layers together. Migration runs as part of CI deploy job before the new admin code is reachable in prod.                                                                                 |
| Sticky aside on long forms — if user scrolls past last card, the aside extends past it.                                                       | Aside uses `lg:self-start` so it follows content height naturally. Aside is `position: sticky` with `top: calc(var(--header-height) + 1rem)`.                                                                |
| Visual regression in items list / other surfaces from updated translation keys.                                                               | New keys are additive under `menu.editor.*`, no existing keys renamed or removed.                                                                                                                            |

## Acceptance criteria

1. `/dashboard/menu/items/[id]` renders the 2-column grid with the 6 main cards and 3 aside cards per the wireframe.
2. PageHeading save button submits the main form (cards ① ④ ⑤ ⑥ plus the `basePrice` from ② and `ingredients` from ③) atomically via `upsertItemAction`.
3. Sizes batch save inside card ② is independent of the main save.
4. Modifier groups attachment + detach auto-syncs.
5. New fields `ingredients`, `metaTitle`, `metaDescription` round-trip from DB → API → admin form → API → DB.
6. Form character limits respected: `metaTitle` ≤ 70, `metaDescription` ≤ 160, ingredient strings ≤ 100 each, ingredients array ≤ 50.
7. `isNew` mode disables Sizes and Modifier-groups cards with existing hints; ingredients and SEO fields stay editable and save with the first create.
8. Mobile (< 1024px) collapses to single column.
9. tsc and vitest pass.
