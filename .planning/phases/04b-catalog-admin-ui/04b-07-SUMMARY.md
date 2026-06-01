---
phase: 04b-catalog-admin-ui
plan: 07
type: execute
status: completed
requirements: [CAT-02, CAT-03, CAT-05]
---

# Plan 04b-07 — Item editor

## Outcome

Full-page item editor at `/dashboard/menu/items/[id]` (and `/items/new`). Tabs container Детали / Размеры / Модификаторы; RHF + zodResolver auto-save on the Detail tab; photo upload via presigned PUT direct-to-S3; per-row sizes editor. The Модификаторы tab landing page is wired but content is deferred to Plan 04b-08.

CAT-02 form layout, CAT-03 photo upload UX, and CAT-05 sizes UX all ship here. The auto-save pattern (`useDebouncedAutosave`) lives in `apps/admin/lib/menu/use-auto-save.ts` and applies the request-id guard from RESEARCH.md Pitfall #5.

## Tasks shipped

| #   | Commit                            | What                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `2bc4e69` + `a9bd3eb`             | `ItemEditorFormSchema` + `SizeFormSchema` in `lib/menu/zod-schemas.ts`; `useDebouncedAutosave` hook with debounce + race-id guard + cleanup                                                                                                                                            |
| 2   | `c2dfec8`                         | Server actions: `upsertItemAction`, `upsertItemSizeAction`, `photoUploadUrlAction`                                                                                                                                                                                                     |
| 3   | `0db800e` + `de71892` + `3f1cff8` | RSC `[id]/page.tsx` (operator gate + parallel fetches + 404 EmptyState), `item-editor-shell-client.tsx` (tabs + AutoSaveIndicator), `item-detail-tab-client.tsx` (RHF + auto-save + two-column layout), `components/menu/bju-row.tsx`. Header breadcrumb removed per operator request. |
| 4   | `b32ccbb`                         | `photo-upload-client.tsx` — drag-drop + native file input + allowlist + presigned PUT direct-to-S3 + preview via `URL.createObjectURL` + disabled "+ Добавить ещё фото" tooltip                                                                                                        |
| 5   | `5451638`                         | `item-sizes-tab-client.tsx` — inline rows (Название / Цена / По умолч. radio / × remove), per-row auto-save on blur, default-radio swap fires two upserts, soft-delete via DELETE                                                                                                      |

## Tests

10 new spec files in `apps/admin/test/`, 73 specs passing:

- `menu-zod-schemas.spec.ts` — extended with `ItemEditorFormSchema` (7) + `SizeFormSchema` (3) coverage
- `menu-use-auto-save.spec.tsx` (7) — debounce, race-id guard, cleanup, programmatic-reset filter
- `upsert-item-action.spec.ts` (7) — payload shape, toFixed(2), new-vs-existing id, photo array, validation gate, revalidate
- `upsert-item-size-action.spec.ts` (6) — POST + DELETE paths, sizeId routing, schema gate, revalidate
- `photo-upload-url-action.spec.ts` (5) — content-type/size allowlist, payload shape, friendly error
- `bju-row.spec.tsx` (6) — 4 inputs, AI-оценка badge, empty→null, int vs float parse
- `items-id-page.spec.tsx` (4) — new vs existing render, 404 EmptyState, /login redirect
- `item-detail-tab-client.spec.tsx` (3) — prefilled values, debounced upsert, new-item URL flip
- `photo-upload-client.spec.tsx` (6) — drop zone copy, invalid type / oversized rejection, PUT happy path, error fallback
- `item-sizes-tab-client.spec.tsx` (7) — empty state, new-item gate, add row, blur save, delete (draft vs persisted), default swap fires two upserts

`pnpm --filter @resto/admin exec tsc -p tsconfig.json --noEmit` clean; `eslint --max-warnings=0` clean across all touched files.

## Deviations from PLAN.md

- **Spec paths flattened to `apps/admin/test/*.spec.ts(x)`.** Plan called out colocated spec files (`lib/menu/use-auto-save.spec.tsx`, `[id]/upsert-item-action.spec.ts`, …). The repo's existing convention is a flat `apps/admin/test/` directory wired into vitest via `include: ['test/**/*.{spec,test}.{ts,tsx}']`. Followed existing convention, not plan literal.
- **Schema: dropped `z.coerce.number()` in favour of plain `z.number()`.** Plan asked for `z.coerce.number()` on `basePrice` + BJU + size price. `z.coerce` widens `z.input` ≠ `z.output`, which collides with RHF's `Control<TFieldValues, TContext, TTransformedValues>` variance and surfaces as `Control … TFieldValues vs {output}` errors in every `FormField`. Conversion happens in the form `onChange` handlers (Input `value` is a string, parsed before `field.onChange`). Test `coerces a stringified basePrice` flipped to "rejects a stringified basePrice (form layer parses before submit)".
- **Tenant breadcrumb removed from editor header.** Operator request mid-task. Header now renders only the AutoSaveIndicator flush-right (UI-SPEC still satisfied; breadcrumb wasn't a documented hard requirement of the editor).
- **`photoUploadUrlAction` rejects under-cap allowed types but uses one friendly error string** (`Только JPG, PNG или WEBP до 5 МБ.`) for both the disallowed-type case and the oversized case, for consistency with UI-SPEC §Error states. Plan asked for separate strings.
- **Sticky bar refresh after auto-save** relies on the existing `revalidatePath('/dashboard/menu', 'layout')` in actions; no extra plumbing introduced in the editor.

## Follow-ups

- **`friendlyCatalogError` returns English strings** — pre-existing from Plan 05; not in scope to translate here, but UI-SPEC says Russian copy is canonical. Worth promoting to its own follow-up before MVP-1 ship.
- **Categories list refetch on category create from item editor** — D-13 says no in-line "create category" in the item editor, so no immediate gap. Listed for awareness.
- **`+ Добавить ещё фото`** wraps a disabled button in a `<span tabIndex={0}>` to keep the Tooltip clickable while disabled. If we end up enabling multi-photo, the wrapper has to come off.
