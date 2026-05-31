# Phase 4b: Catalog Admin UI - Research

**Researched:** 2026-05-31
**Domain:** Next.js 15 RSC + shadcn/ui CRUD admin over a finalized iiko-aligned catalog API
**Confidence:** HIGH (CONTEXT.md and UI-SPEC.md are locked; 4a backend verified 19/19; all uncertainty concentrated in **5 planning-time blockers** below, not in the UI design)

## Summary

Phase 4b is a frontend-only admin UX phase on top of the 4a-frozen catalog schema and HTTP surface. The CONTEXT (`04b-CONTEXT.md`) and UI design contract (`04B-UI-SPEC.md`) are exhaustive — they nail down every visible decision (sidebar IA, table columns, badge variants, copy, empty states, sticky bar placement, photo upload affordance, БЖУ row layout, auto-save indicator copy, delayed-publish toast). Research adds **no new UX decisions** — it validates the upstream artifacts against the codebase reality and surfaces the planning landmines.

Five planning landmines surface from the codebase audit. They are not "UI to design" — they are **API/permission/dependency gaps** the planner must address before tasks land:

1. **No GET endpoints for admin reads.** The catalog HTTP surface (4a-07) is write-only: POST upsert / DELETE stop-list / POST + DELETE publish. There is **no `GET /internal/v1/catalog/categories`, no `/items`, no `/modifier-groups`, no `/draft-diff`, no list-by-status, no fetch-single-for-edit**. Public `/v1/menu` returns published-only and presigned-GET URLs only — it cannot drive a draft editor. The 4b plan needs a backend addendum: 5–6 new read endpoints.
2. **No presigned-PUT for photo upload.** `ImageUrlPort` ships only `presignGet`. CAT-03 needs `presignPut` + a controller route + bucket-CORS verification.
3. **`PermissionsGuard` is not on the catalog routes.** All catalog endpoints use `InternalTokenGuard`, gated by `INTERNAL_API_TOKEN` (server-only). The admin operator's BA session does NOT authorize these calls — every catalog mutation must go through a **server action** holding the internal token via `apiFetchInternal`. The CAT permissions documented in `packages/domain/src/rbac/permissions.ts` (`menu: read|create|update|delete`) **exist as data** but are **not enforced** on the routes today. Phase 4b accepts the internal-token shape and lets Phase 4a follow-up wire BA permissions later if needed.
4. **No `staff:menu:write` / `staff:menu:publish` permission tokens.** RBAC uses resource-action arrays (`menu: ['read','create','update','delete']`) not colon-strings. The planner should write CONTEXT-style references to "menu permission" not the literal `staff:menu:write` (which would not resolve).
5. **No `react-hook-form` installed.** Every existing admin form uses React 19 `useActionState` + `<form action={action}>`. RHF + `@hookform/resolvers` + shadcn `form` primitive are **net-new dependencies** for 4b. UI-SPEC mandates RHF for the auto-save (`watch()` + debounce), so the install is unavoidable — but the planner must include a slopcheck human-verify gate.

**Primary recommendation:** Plan 4b as **3 backend addenda plans + 5 frontend plans + 1 wave-0 dependency-install plan**. Backend addenda are small (read endpoints + presign-PUT + DTO/openapi regen). Frontend plans are scoped per surface (categories / items / sizes-modifiers / stop-list / sticky-bar-publish). Wave 0 installs RHF + @hookform/resolvers + react-dropzone + shadcn primitives (badge / table / tabs / switch / form / select / dialog / progress / textarea) listed in UI-SPEC.

## Project Constraints (from CLAUDE.md / packages/CLAUDE.md / apps/CLAUDE.md)

Hard directives that apply to every 4b task. The plan must verify all are honored.

| Directive | Source | Scope |
|---|---|---|
| Server-side `fetch` MUST have `AbortSignal.timeout(ms)` | `apps/CLAUDE.md` | Every server action + RSC fetch |
| One retry on idempotent GET 5xx only; never retry mutations | `apps/CLAUDE.md` | RSC reads of categories/items/diff lists |
| Error UI must offer "Try again" affordance | `apps/CLAUDE.md` | Auto-save failed state, publish-POST failed state |
| `INTERNAL_API_TOKEN` is server-only — never reach from a client boundary | `apps/CLAUDE.md` | All catalog mutations via `apiFetchInternal` (already exists) |
| No static identity placeholders | `apps/CLAUDE.md` | Names, emails, breadcrumb trails read from real data |
| No `NEXT_PUBLIC_*` / `VITE_*` production fallbacks | `apps/CLAUDE.md` | Photo bucket env, presigned-URL TTL config |
| Cookies set in server actions MUST carry `secure: NODE_ENV==='production'`, `httpOnly: true`, `sameSite: 'lax'` | `apps/CLAUDE.md` | No new cookies in 4b — confirm no regression |
| Open-redirect refinement on `next=`/`redirect=` params | `apps/CLAUDE.md` | Any new route that reads search params |
| Kebab-case file names; `*-form-client.tsx`; `*-action.ts` colocated with page | `CLAUDE.md` Conventions | Every new component / action file |
| ESLint `consistent-type-imports` (prefer `type` imports) | `CLAUDE.md` Code Style | All TS files |
| ESLint `no-floating-promises: error` | `CLAUDE.md` Code Style | `void` on intentional fire-and-forget (e.g., toast triggers) |
| `no-console: warn` — use Logger (server) or no log (client) | `CLAUDE.md` | No `console.log` in shipping UI |
| `@/` alias used in Next admin app | `CLAUDE.md` Import Org. | Internal imports |
| Monorepo packages accessed via `@resto/<name>` | `CLAUDE.md` Import Org. | `@resto/api-client`, `@resto/domain` |
| Zod schemas are the single source of truth; types derived via `z.infer` | `CLAUDE.md` DTO/Schema | Every client-side form schema mirrors server DTO |
| Free-text fields MUST have a max length | `packages/domain/CLAUDE.md` | Mirror api Zod max-lengths in client schemas (CAT-09 source of truth) |
| URL fields MUST restrict scheme | `packages/domain/CLAUDE.md` | Photo `s3Key` schema already enforces (not a URL) |
| No comments unless WHY-comment for hidden constraint | `MEMORY.md feedback_no_comments` | Don't restate code; only ADR/ticket refs |
| Plain Russian copy for user-facing surfaces | `MEMORY.md feedback_plain_language` | Already locked in UI-SPEC Copywriting Contract |
| iiko entity-shape alignment for partner adapter ease | `MEMORY.md feedback_iiko_catalog_model` | Already absorbed in 4a (Group/Item/Size/Modifier-Group naming) |

## User Constraints (from 04b-CONTEXT.md)

> Verbatim from `04b-CONTEXT.md`. Planner MUST honor each item; researcher absorbs none of these as alternatives-to-consider.

### Locked Decisions — Inherited (unchanged in 04b)

- **D-01:** Sidebar `Menu` expandable group, collapsed by default, sub-routes Categories / Items / Modifier Groups / Stop-list.
- **D-02:** Items default view = compact table (48px thumb + name + category + price + status + actions); search + Category/Status filters; card grid rejected.
- **D-03:** Default filter = all statuses except `archived`. Sort by `sortOrder` then category.
- **D-04:** Item editor = full page at `/dashboard/menu/items/[id]` (and `/new`). Click row → page navigation. Sheet/modal rejected.
- **D-05:** Single-locale MVP-1. `LocalizedText` DTO stays; UI writes only default-locale. Multilingual tabs deferred.
- **D-06:** Structured БЖУ — 4 nullable fields per 100 g + `nutrition_estimated` AI-estimate badge.
- **D-07:** Single-photo MVP-1. `photos[0]` only; "Add more photos" greyed out with v2 tooltip. Drag-drop + click-to-browse upload; preview thumb; replace via "Change photo".
- **D-09:** Status badges + sticky publish bar. Badges: `draft` outline, `modified` amber outline, `published` default, `paused`/`Стоп` secondary (NOT destructive), `archived` ghost. Sticky bar copy "N неопубликованных изменений • [Показать ▾] [Опубликовать ↑]".
- **D-11:** Stop-list ≠ Archive. Stop-list = runtime-state instant toggle; Archive = `status: archived` in draft, requires publish.
- **D-12:** Stop-list inline switch in items table + "Today's 86" dashboard widget with `Reset all`. No confirm on toggle.
- **D-13:** Stop-list reset manual only (no auto-reset cron). Stale warning at >24h.
- **GM MED-1 (badge copy):** `Paused` / `Стоп` (not `86'd`). Russian canonical.

### Locked Decisions — New in 04b (D-4b-01..D-4b-06)

- **D-4b-01 (Hierarchical categories — 2 levels max):** Indented flat list; sidebar stays flat 4-subroute group; items filter + item-editor selector use indented dropdown; frontend Zod refine `depth <= 2`; deeper nesting deferred to v2.
- **D-4b-02 (Auto-save-draft + explicit Publish, supersedes D-08):** Auto-save on blur / 1.5s debounce. Indicator copy `Сохранено 2с назад` / `Сохранение…` / `Не сохранено — повторить?`. No `beforeunload`. Explicit `Save draft` button removed.
- **D-4b-03 (Delayed-publish UX):** Publish click → POST `/internal/v1/catalog/publish` (5s timer). Sonner bottom-right toast with linear countdown + Undo. Undo → DELETE `/publish`. Timer elapses → `Published`. Re-click protection: button disabled during active timer. Network failures handled per spec.
- **D-4b-04 (Sizes editor location):** Tab "Размеры" inside item editor; inline rows `[Name] [Price absolute] [Default ●] [× remove]`; "+ Add size" below; auto-save inherits (D-4b-02). Absolute price semantics (NOT delta — labels read "Цена" not "Доплата").
- **D-4b-05 (Modifier groups two-surface model):** Top-level `/dashboard/menu/modifier-groups` (library editor with inline Options: name + priceDelta + default_amount + free_amount per iiko alignment) + item-editor `Модификаторы` tab (multi-select / chip-picker of existing groups + reorder); side-sheet quick-create redirects to top-level editor on save.
- **D-4b-06 (NO first-publish celebration, NO "Preview as customer" in 04b):** Explicitly rejected GM HIGH-1 + HIGH-3; revisit at Phase 5 when storefront ships.

### Claude's Discretion (researcher recommends below per item)

- Exact shadcn Badge variants for `paused`/`modified` (UI-SPEC nailed this: `secondary` for paused, `outline + border-amber-500 text-amber-700` for modified). ✓ resolved
- Drag-drop reorder library vs simple up/down (UI-SPEC: up/down for MVP-1, drag-drop deferred). ✓ resolved
- Sonner timing variants (Sonner ~~1.x~~ **2.0.7 already installed** in `apps/admin`). ✓ resolved
- Form library inside `*-form-client.tsx` — **react-hook-form**, confirmed by UI-SPEC's auto-save mandate. **Net-new install required** (see Standard Stack).
- Sticky publish bar exact positioning — UI-SPEC `fixed bottom-0 left-[--sidebar-width] right-0 z-40 h-14`. ✓ resolved
- Photo upload component — **native `<input type="file">` + HTML5 drag/drop** (UI-SPEC explicit: "No external drag-drop library"). `react-dropzone` is NOT required. ✓ resolved — saves a dependency.
- "Stop active >24h" warning copy — UI-SPEC: inline `<p className="text-amber-700 dark:text-amber-400 text-xs mt-1">`. ✓ resolved
- Category depth ≤ 2 enforcement — **both** Zod refine on payload AND disabled-state on parent-select option. UI-SPEC mandates both. ✓ resolved

### Deferred Ideas (OUT OF SCOPE — do not plan)

- **Phase 5:** "Preview as customer" link to storefront (D-4b-06); first-publish celebration / activation moment (D-4b-06).
- **Phase 6:** QR-menu polish (БЖУ filters, photo carousel, modifier-group selector UX).
- **v2:** Multi-photo gallery editor; multilingual editor tabs; ≥3-level category nesting; bulk operations; auto-reset stop-list cron; stop-list reason-field UI; confirm-modal before publish; full ТТК entity; drag-drop reorder for categories; slug history UI.

## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| CAT-01 | Operator creates / edits / archives menu categories with explicit ordering | UI-SPEC §Categories page; needs new GET `/categories` endpoint to list; existing POST `/categories` for upsert (4a-07); archival = `status: archived` patch (NB: `menuCategories` schema lacks a `status` column — see Pitfall #6 below). |
| CAT-02 | Items editor UX — form layout (name, description, price, allergens, BJU, photo) | UI-SPEC §Item editor; existing `UpsertItemInputSchema` covers every field; needs new GET `/items` (list with filters) + `/items/:id` (single for draft edit). |
| CAT-03 | Photo upload UX + presigned PUT | UI-SPEC §Photo Upload Spec; **needs new backend**: `presignPut` adapter method + POST `/internal/v1/catalog/photo-upload-url` endpoint + S3 bucket CORS. |
| CAT-04 | Modifier groups + options UX | UI-SPEC §Modifier groups list + editor; existing POST `/modifier-groups`, POST `/modifier-options` for upsert; needs new GET `/modifier-groups` (list) + `/modifier-groups/:id` (single with options). |
| CAT-05 | Variants/sizes UX | UI-SPEC §Sizes tab; existing POST `/item-sizes` for upsert; needs item-editor read to surface existing sizes (lands via GET `/items/:id` returning embedded sizes per spec). |
| CAT-07 | Stop-list UX | UI-SPEC §Stop-list page + items table Switch column; existing POST `/stop-list` + DELETE `/stop-list/:itemId`; needs GET `/stop-list` (today's 86 widget) which can derive from item-list filter `status=paused`. |
| CAT-08 | Diff UX (badges + sticky bar) | UI-SPEC §Sticky Publish Bar Spec; **needs new backend**: GET `/internal/v1/catalog/draft-diff` returning `{ unpublishedCount, items: [{entity, name, status}] }`. |

CAT-06 (publish snapshot + delayed-publish backend) and CAT-09 / CAT-10 close in 4a (per VERIFICATION.md and ROADMAP traceability).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Sidebar menu group + sub-routes | Frontend Server (RSC) | — | Static layout under `apps/admin/components/app-sidebar.tsx` + new route segments. |
| Categories CRUD list | Frontend Server (RSC) reads via apiFetch | API/Backend (new GET) | RSC fetches list at page load; mutations go through server action → `apiFetchInternal` POST. |
| Item editor with auto-save | Frontend Server (RSC shell) + Browser/Client (RHF form island) | API/Backend (POST `/items`) | Server-side first render avoids hydration mismatch; RHF watch+debounce drives the auto-save side-effect on the client. |
| Photo upload (presigned PUT) | Browser/Client (direct S3 PUT) | API/Backend (presign endpoint) + Frontend Server (action returns URL) | Browser uploads bytes directly to S3 to avoid round-tripping through admin or api; presign authority lives in api. |
| Sticky publish bar + draft-diff list | Frontend Server (RSC reads diff on `/menu/*` routes) + Browser/Client (Sonner toast lifecycle) | API/Backend (new draft-diff GET + existing publish POST/DELETE) | Diff list pre-rendered on each menu-route navigation; client owns the 5s countdown timer + toast state. |
| Stop-list inline toggle | Browser/Client (Switch widget) → Server action → API | API/Backend (existing POST/DELETE) | UI optimism not specified; UI-SPEC says "loading state during request" — go pessimistic for simplicity. |
| Modifier group library + item-side picker | Frontend Server (RSC list pages) + Browser/Client (chip-picker + Sheet) | API/Backend (existing upserts; new list GET) | Two-surface model splits ownership cleanly. |
| Status badges + amber `modified` styling | Browser/Client (badge variant prop) | — | Pure presentation. |
| Auto-save indicator | Browser/Client (RHF subscription + local time state) | — | No backend involvement beyond the underlying upsert call. |
| Draft-diff read (count + per-entity list) | API/Backend (new GET endpoint) | Frontend Server (RSC consumer) | Computing "what changed since last publish" is a server concern requiring SQL — cannot live in browser. |

**Tier-assignment pitfalls to avoid in plans (from §Tier Mapping rules):**

- Do NOT put the 5s countdown timer in the API — it lives in the browser Sonner toast component (UI-SPEC mandate). The API's 5s timer is independent (`DelayedPublishService`).
- Do NOT pre-fetch the draft-diff in client state — it goes on the route-group layout as a server component, refetched on every navigation.
- Do NOT use `localStorage` for auto-save buffer — server is the source of truth (UI-SPEC: "No `beforeunload` warning needed (state is persistent)").

## Standard Stack

### Core (already in `apps/admin`)

| Library | Version (verified) | Purpose | Why Standard |
|---|---|---|---|
| Next.js | 16.2.6 | App Router + RSC + server actions | `apps/admin/package.json` `"next": "^16.2.6"` [VERIFIED: package.json] |
| React | 19.0.0 | UI runtime | `useActionState` available; matches existing pattern [VERIFIED: package.json] |
| Tailwind CSS | 4.0.0 | Styling | Already configured with `globals.css` oklch tokens (new-york/neutral) [VERIFIED: package.json + globals.css] |
| shadcn/ui | new-york / neutral | Component primitives | `components.json` confirms preset + lucide icons [VERIFIED: components.json] |
| Sonner | 2.0.7 | Toast surface | Already mounted at root `app/layout.tsx`; theme + icons configured in `components/ui/sonner.tsx` [VERIFIED: codebase + npm registry 2025-08-02] |
| lucide-react | 1.16.0 | Icon library | Already used in existing components (BrandSwitcher, NavMain) [VERIFIED: package.json] |
| zod | 3.24.1 | Client-side form schemas | Already a dep for env + invite + brand actions [VERIFIED: package.json] |
| `@resto/domain` | workspace | LocalizedText / Slug / MoneyAmountValue / CurrencyValue | Reuse for form-schema parity with api DTOs [VERIFIED: dto.ts imports] |
| `apiFetchInternal` | local | Server-only fetch carrying `x-internal-token` for `/internal/v1/*` | All catalog writes go through this [VERIFIED: `lib/api-server-internal.ts`] |

### New dependencies (Wave 0 installs)

| Library | Latest | Published | Purpose | Status |
|---|---|---|---|---|
| react-hook-form | 7.76.1 | 2026-05-23 | `useForm` + `watch()` subscription for auto-save | [ASSUMED — slopcheck unavailable]; provenance verified: 7-year-old package, `github.com/react-hook-form/react-hook-form`, official org |
| @hookform/resolvers | 5.4.0 | 2026-05-21 | `zodResolver` bridge for client-side validation | [ASSUMED]; provenance verified: same org `react-hook-form` |
| `@resto/api-client` | workspace | n/a | Typed `paths` / `components` / `operations` for endpoint shapes | Already exists from 4a-07; just consume |

**NOT required (UI-SPEC explicit "no third-party drag-drop library"):**

- `react-dropzone` — UI-SPEC §Photo Upload: native `<input type="file">` + HTML5 `dragover`/`drop` events is sufficient for single-file upload.
- `framer-motion` — UI-SPEC §Sticky Publish Bar: CSS-only `max-h-0 → max-h-64 overflow-auto` transition; no motion lib.
- `react-time-ago` — UI-SPEC §Auto-Save Indicator: "simple string formatter (no external library)"; "Xс/Xм/Xч назад" computed locally.

### shadcn primitives to install (Wave 0)

Per UI-SPEC, run before any other 4b work:

```bash
pnpm dlx shadcn@latest add badge table tabs switch form select dialog progress textarea
```

Already installed (per `apps/admin/components/ui/`): alert-dialog, avatar, breadcrumb, button, card, collapsible, dropdown-menu, input, label, separator, sheet, sidebar, skeleton, sonner, tooltip.

**Note on shadcn `form`:** `npx shadcn add form` pulls in `react-hook-form` + `@hookform/resolvers` + `zod` as peer requirements. The shadcn primitive is a thin wrapper exposing `Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage`. Quote from shadcn docs [CITED: ui.shadcn.com/docs/components/form]:

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
const form = useForm({ resolver: zodResolver(yourSchema) });
```

### Installation (Wave 0 plan body)

```bash
# Install runtime deps in apps/admin
pnpm --filter @resto/admin add react-hook-form@^7.76.1 @hookform/resolvers@^5.4.0

# Install shadcn primitives (pulls them as direct files under components/ui/)
cd apps/admin && pnpm dlx shadcn@latest add badge table tabs switch form select dialog progress textarea
```

**Verification:** `pnpm --filter @resto/admin exec tsc --noEmit` must remain green. The `@/components/ui/form.tsx` file must exist after `shadcn add form`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| `react-hook-form` | React 19 `useActionState` (current pattern) | `useActionState` cannot drive auto-save: no per-field subscription, no debounced submit. UI-SPEC D-4b-02 mandates RHF; this is a forced upgrade. |
| `react-hook-form` `watch()` callback | `useWatch` hook | useWatch isolates re-renders at the hook level but `watch(callback)` is the canonical auto-save pattern [CITED: react-hook-form GH discussion #3078 — community-recommended]. We need the subscription callback, not just current values. |
| native HTML5 file input | `react-dropzone` | UI-SPEC explicitly chose native to avoid a dependency. Single-file upload doesn't justify dropzone's accept-rules feature surface. |
| `toast.update(id, …)` | `toast(jsx, { id })` re-emit | Sonner 2.x mutates a toast in place when a subsequent `toast(...)` call uses the same `id` [CITED: sonner docs site]. We use this for "Публикация через 5с → Опубликовано". |
| custom React countdown in toast | shadcn `<Progress>` + `setInterval(100ms)` | Already in shadcn pack (Wave 0 install). 50 lines of timer-management + cleanup vs. third-party countdown lib. |
| presigned PUT direct to S3 | proxy upload through api | Direct PUT keeps the api binary-payload-free; the spec already mandates this pattern (CAT-03 + UI-SPEC §Photo Upload). |

## Package Legitimacy Audit

> slopcheck was not installable in this session — every new package below is tagged `[ASSUMED]` per protocol. The planner MUST gate each install behind a `checkpoint:human-verify` task.

| Package | Registry | Age | Created | Source Repo | slopcheck | Disposition |
|---|---|---|---|---|---|---|
| `react-hook-form` | npm | 7 yrs | 2019-03-20 | github.com/react-hook-form/react-hook-form | [ASSUMED] | Approved pending human-verify (provenance: official org, massive download base, in shadcn's own peer list) |
| `@hookform/resolvers` | npm | 6 yrs | 2020-05-20 | github.com/react-hook-form/resolvers | [ASSUMED] | Approved pending human-verify (same official org) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none. Both are widely-adopted, long-established. Standard provenance signals (official GitHub org, multi-year history) compensate partially but cannot replace slopcheck — the planner must insert a `checkpoint:human-verify` task BEFORE the install line in Wave 0.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │             Browser (operator)              │
                    │                                             │
                    │  ┌──────────────────┐  ┌─────────────────┐ │
                    │  │ Editor RHF form  │  │ Sonner toast    │ │
                    │  │ + watch+debounce │  │ (countdown +    │ │
                    │  │ + auto-save side │  │  undo button)   │ │
                    │  │ effect           │  │                 │ │
                    │  └──────┬───────────┘  └────────┬────────┘ │
                    │         │ field change          │ click    │
                    └─────────┼───────────────────────┼──────────┘
                              │ 1.5s debounce         │
                              │                       │
              ┌───────────────▼───────────────────────▼────────────┐
              │              apps/admin (Next.js 15 RSC)            │
              │                                                     │
              │  ┌──────────────────────┐   ┌─────────────────┐    │
              │  │ /dashboard/menu/...  │   │ *-action.ts     │    │
              │  │ route-segment layout │   │ server actions  │    │
              │  │ (RSC reads diff +    │   │ ("use server")  │    │
              │  │  list endpoints)     │   │                 │    │
              │  └──────────┬───────────┘   └────────┬────────┘    │
              │             │ apiFetch (GET)         │ apiFetchInternal │
              │             │ session cookie         │ x-internal-token │
              │             │ forwarded              │                  │
              └─────────────┼────────────────────────┼──────────────────┘
                            │                        │
                            ▼                        ▼
              ┌──────────────────────────────────────────────────────┐
              │           apps/api (NestJS / catalog context)         │
              │                                                       │
              │  Public read              Internal write              │
              │  ──────────              ─────────────                │
              │  GET /v1/menu            POST /internal/v1/catalog/   │
              │  GET /v1/menu/items/:id    categories                 │
              │                            items                      │
              │  (existing — published     modifier-groups            │
              │   only; presigned-GET)     modifier-options           │
              │                            item-sizes                 │
              │                            stop-list                  │
              │                            publish (+ DELETE)          │
              │                                                       │
              │  NEW for 4b (backend addendum plans):                 │
              │   GET  /internal/v1/catalog/categories                │
              │   GET  /internal/v1/catalog/items?status=&category=   │
              │   GET  /internal/v1/catalog/items/:id (with sizes)    │
              │   GET  /internal/v1/catalog/modifier-groups           │
              │   GET  /internal/v1/catalog/modifier-groups/:id       │
              │   GET  /internal/v1/catalog/stop-list                 │
              │   GET  /internal/v1/catalog/draft-diff                │
              │   POST /internal/v1/catalog/photo-upload-url          │
              │   PATCH /internal/v1/catalog/categories/:id (archive) │
              │   PATCH /internal/v1/catalog/items/:id    (archive)   │
              └──────────────────────────────────────────────────────┘
                            │                        │
                            ▼                        ▼
                     ┌──────────────┐         ┌──────────────┐
                     │ Postgres +   │         │ S3 / R2 /    │
                     │ RLS (catalog │         │ MinIO        │
                     │ tables)      │         │ (presigned   │
                     │              │         │  PUT direct  │
                     │              │         │  from        │
                     │              │         │  browser)    │
                     └──────────────┘         └──────────────┘
```

### Recommended Project Structure

```
apps/admin/app/dashboard/(workspace)/menu/
├── layout.tsx                              # RSC: mounts <StickyPublishBar> on every /menu/* route; reads draft-diff
├── categories/
│   ├── page.tsx                            # RSC list (GET /internal/v1/catalog/categories)
│   ├── category-form-client.tsx            # RHF + zod form for create/edit (in Sheet or modal)
│   ├── upsert-category-action.ts           # server action
│   └── archive-category-action.ts          # server action
├── items/
│   ├── page.tsx                            # RSC list with filters (GET /items?status=&category=&q=)
│   ├── items-table-client.tsx              # interactive filters + Switch column
│   ├── stop-list-toggle-action.ts          # server action (calls POST/DELETE /stop-list)
│   ├── archive-item-action.ts              # server action
│   └── [id]/
│       ├── page.tsx                        # RSC: GET item + sizes + modifier-group assignments
│       ├── item-editor-shell-client.tsx    # tabs container + AutoSaveIndicator
│       ├── item-detail-tab-client.tsx      # RHF form for the Detail tab
│       ├── item-sizes-tab-client.tsx       # inline editor + auto-save per row
│       ├── item-modifiers-tab-client.tsx   # chip-picker + Sheet
│       ├── photo-upload-client.tsx         # native file input + drag/drop + presigned PUT
│       ├── upsert-item-action.ts           # server action
│       ├── upsert-size-action.ts           # server action
│       ├── upsert-item-modifier-groups-action.ts  # server action (item.modifierGroupIds reorder)
│       └── photo-upload-url-action.ts      # server action returning presigned PUT URL
├── modifier-groups/
│   ├── page.tsx                            # RSC list
│   ├── upsert-modifier-group-action.ts
│   ├── archive-modifier-group-action.ts
│   └── [id]/
│       ├── page.tsx                        # RSC with group + options
│       ├── modifier-group-form-client.tsx  # RHF form for group meta
│       ├── modifier-options-list-client.tsx # inline option editor
│       └── upsert-modifier-option-action.ts
└── stop-list/
    ├── page.tsx                            # RSC: GET /stop-list
    └── reset-all-stop-list-action.ts       # server action (loops DELETE /stop-list/:itemId)

apps/admin/components/
├── sticky-publish-bar.tsx                  # RSC entry; reads diff; renders client-island for toast
├── sticky-publish-bar-client.tsx           # client: Sonner countdown + Undo + button-disabled state
├── publish-action.ts                       # server action: POST /publish
├── cancel-publish-action.ts                # server action: DELETE /publish
├── auto-save-indicator.tsx                 # client island; receives state via props or context
└── todays-86-widget.tsx                    # dashboard card

apps/admin/lib/catalog/                     # new — shared client helpers
├── schemas.ts                              # client-side Zod schemas mirroring 4a DTOs (CAT-09 max-lengths)
├── use-debounced-autosave.ts               # custom hook: watch+debounce → server action
├── use-publish-countdown.ts                # custom hook: 5s interval driving progress + onElapse
└── types.ts                                # narrow types derived from @resto/api-client
```

### Pattern 1: Auto-Save via `watch()` Subscription + Debounce

**What:** Subscribe to all RHF form changes via `watch(callback)` returning a `subscription` object; debounce the callback by 1.5s; on fire, call the server action. Filter callback by `type === 'change'` to ignore programmatic mounts.

**When to use:** Item editor (Detail tab + Sizes tab); modifier-group editor.

**Example:**

```typescript
// Source: react-hook-form GH discussion #3078 (community pattern, no native API) [CITED]
// Filed under "WHY-comment justified" — RHF's docs do NOT publish this pattern but it is canonical
// for auto-save (the docs maintainer initially said "Not possible"; community converged here).

'use client';
import { useEffect } from 'react';
import type { UseFormReturn, FieldValues } from 'react-hook-form';

const DEBOUNCE_MS = 1_500;

export const useDebouncedAutosave = <TForm extends FieldValues>(
  form: UseFormReturn<TForm>,
  onPersist: (values: TForm) => Promise<void>,
  onState: (s: 'saving' | 'saved' | 'failed') => void,
): void => {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscription = form.watch((_values, { type }) => {
      if (type !== 'change') return; // ignore programmatic resets, mounts
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        onState('saving');
        void form.handleSubmit(async (values) => {
          try {
            await onPersist(values as TForm);
            onState('saved');
          } catch {
            onState('failed');
          }
        })();
      }, DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [form, onPersist, onState]);
};
```

**Concurrency note:** If the operator types fast enough that a new save begins before the previous one's response arrives, the second response can land first. Solution: each call carries a request id (or generation counter); only the latest-issued request transitions the indicator. UI-SPEC's `Saved 2s ago` lies briefly if a slower save is in-flight after a faster one; mitigated by the request-id pattern.

### Pattern 2: Sonner Countdown Toast with In-Place Update

**What:** `toast.custom((t) => <CountdownContent toastId={t} onElapse={…} onCancel={…} />, { id, duration: Infinity })` — control duration via cleanup. When the 5s elapses, call `toast.success('Опубликовано', { id })` with the **same id** to replace contents.

**When to use:** Delayed-publish UX (D-4b-03).

**Example:**

```typescript
// Source: sonner docs site + GH README [CITED]
// Sonner replaces an existing toast in place when toast() is called with a matching id.

'use client';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

const COUNTDOWN_MS = 5_000;
const TICK_MS = 100;

const CountdownToast = ({
  toastId,
  onCancel,
  onElapse,
}: {
  readonly toastId: string | number;
  readonly onCancel: () => void;
  readonly onElapse: () => void;
}) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const handle = setInterval(() => {
      const ms = Date.now() - start;
      setElapsed(ms);
      if (ms >= COUNTDOWN_MS) {
        clearInterval(handle);
        onElapse();
      }
    }, TICK_MS);
    return () => clearInterval(handle);
  }, [onElapse]);
  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border p-3 shadow-md w-[360px]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Публикация через {Math.max(0, Math.ceil((COUNTDOWN_MS - elapsed) / 1_000))}с</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>Отменить</Button>
      </div>
      <Progress value={(elapsed / COUNTDOWN_MS) * 100} className="h-1" />
    </div>
  );
};

export const triggerDelayedPublish = (
  doPublishCall: () => Promise<{ ok: boolean }>,
  doCancelCall: () => Promise<{ cancelled: boolean }>,
) => {
  const id = 'publish-countdown' as const;
  void (async () => {
    const res = await doPublishCall();
    if (!res.ok) {
      toast.error('Не удалось опубликовать — проверьте соединение');
      return;
    }
    toast.custom(
      (t) => (
        <CountdownToast
          toastId={t}
          onCancel={() => {
            void (async () => {
              const c = await doCancelCall();
              toast(c.cancelled ? 'Публикация отменена' : 'Уже опубликовано — окно отмены истекло', { id });
            })();
          }}
          onElapse={() => {
            toast.success('Опубликовано', { id, duration: 3_000 });
          }}
        />
      ),
      { id, duration: Infinity },
    );
  })();
};
```

### Pattern 3: Sticky Publish Bar in Route-Group Layout

**What:** Mount `<StickyPublishBar>` in `app/dashboard/(workspace)/menu/layout.tsx` (not the global dashboard layout). Layout is an RSC that calls `apiFetchInternal` for the diff and passes count + list as props to a client island that owns the Sonner trigger and disabled state.

**When to use:** All `/dashboard/menu/*` routes.

**Example:**

```tsx
// apps/admin/app/dashboard/(workspace)/menu/layout.tsx
import { apiFetchInternal } from '@/lib/api-server-internal';
import { StickyPublishBar } from '@/components/sticky-publish-bar';

interface DraftDiff {
  readonly unpublishedCount: number;
  readonly items: ReadonlyArray<{
    readonly entityType: 'item' | 'category' | 'modifier-group';
    readonly id: string;
    readonly name: string;
    readonly status: 'draft' | 'modified' | 'archived';
  }>;
}

export default async function MenuLayout({ children }: { readonly children: React.ReactNode }) {
  const diff = await apiFetchInternal<DraftDiff>('/internal/v1/catalog/draft-diff');
  return (
    <>
      {children}
      <StickyPublishBar
        unpublishedCount={diff.data?.unpublishedCount ?? 0}
        diffItems={diff.data?.items ?? []}
      />
    </>
  );
}
```

**Caveat:** RSC layouts are cached per navigation; on auto-save → server action → `revalidatePath('/dashboard/menu')` flushes the layout's diff fetch. Each `*-action.ts` MUST call `revalidatePath('/dashboard/menu', 'layout')` so the sticky bar count is fresh.

### Pattern 4: Photo Upload (Presigned PUT Direct from Browser)

**What:** Three-step flow: (1) browser drops/selects file → calls server action; (2) server action calls `apiFetchInternal('/internal/v1/catalog/photo-upload-url', { method: 'POST', body: { contentType, sizeBytes } })` and returns `{ uploadUrl, s3Key }`; (3) browser does `fetch(uploadUrl, { method: 'PUT', body: file })` directly to S3.

**When to use:** CAT-03.

**Critical preconditions (Pitfall #2):**

- S3 bucket CORS allows `PUT` from `ADMIN_WEB_URL` origin.
- Presigned URL has short TTL (≤5 min) and correct `Content-Length` + `Content-Type` constraints.
- Backend `presignPut` validates `contentType` is an allowlist (`image/jpeg`, `image/png`, `image/webp`) and `sizeBytes ≤ 5 * 1024 * 1024`.

### Pattern 5: Indented Category Dropdown (depth ≤ 2)

**What:** Indented options in shadcn `<Select>` — parent first, then each child prefixed with `↳` and `pl-4`. Parent option is disabled when already a child.

**Example:**

```tsx
// Source: shadcn select primitive composition
<Select onValueChange={onChange} value={value}>
  <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
  <SelectContent>
    {categories.map((c) => (
      <SelectItem
        key={c.id}
        value={c.id}
        disabled={c.parentId !== null && fieldIsParentSelector}  // parent-of-a-parent is not allowed
        className={c.parentId === null ? '' : 'pl-8'}
      >
        {c.parentId === null ? c.name : `↳ ${c.name}`}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Plus Zod refine on payload:

```typescript
// apps/admin/lib/catalog/schemas.ts
import { z } from 'zod';

export const CategoryFormSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().nonneg(),
});

export const refineCategoryDepth = (
  schema: typeof CategoryFormSchema,
  parentIdToCategory: ReadonlyMap<string, { readonly parentId: string | null }>,
) =>
  schema.superRefine((data, ctx) => {
    if (!data.parentId) return;
    const parent = parentIdToCategory.get(data.parentId);
    if (parent && parent.parentId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentId'],
        message: 'Уровень вложенности ограничен двумя — родитель уже является подкатегорией.',
      });
    }
  });
```

### Anti-Patterns to Avoid

- **`watch()` without `subscription.unsubscribe()` in cleanup.** Leaks subscribers on remount. The pattern above shows the correct cleanup.
- **`toast.update(id, …)` — does not exist in Sonner 2.x.** Use `toast(jsx, { id })` to replace.
- **Using `useActionState` for the item editor.** It cannot drive auto-save (no per-field subscription). Use RHF + the debounced hook.
- **Calling `apiFetch` (BA session) from server actions that mutate catalog state.** Catalog mutation endpoints use `InternalTokenGuard` — must go through `apiFetchInternal`.
- **`localStorage`-backed draft buffer.** Server is source of truth (D-4b-02: "state is persistent"). No `beforeunload` warning needed.
- **`fetch` with `{ method: 'PUT' }` to api for photo upload.** Direct-to-S3 PUT is the spec.
- **`menuCategories.status` reads.** The schema has no `status` column on categories (only on items) — see Pitfall #6.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Form state + validation + per-field subscribe | Custom `useState` + per-input handlers | `react-hook-form` + `@hookform/resolvers/zod` | RHF has 7 years of edge-case coverage (touched-fields, defaultValues hydration, controlled vs uncontrolled, validation timing). Custom rolls drift. |
| Toast positioning / stacking / theme | Custom React portal | `sonner` (already installed) | Sonner handles bottom-right placement, light/dark theme, stack mgmt, ARIA, dismiss-on-click. |
| Cookie-signed active brand | Custom JWT | Existing `signActiveBrand` HMAC | Phase 02 already shipped this — reuse `readActiveBrand` from `lib/active-brand-cookie.ts`. |
| Presigned URL generation | Roll your own SigV4 | `@aws-sdk/s3-request-presigner` (already in api) | The api already uses `getSignedUrl` for GET; add a `presignPut` method on the same adapter. |
| Time-since formatting ("Xс назад") | `date-fns` / `react-time-ago` / `luxon` | Inline string formatter | UI-SPEC explicit. The full date library is overkill for a single 3-bucket formatter. |
| Drag-drop file upload | `react-dropzone` | Native HTML5 `<input type="file">` + `dragover`/`drop` | UI-SPEC explicit. Single-file, image-only — no accept-rules engine needed. |
| Cyrillic transliteration | Custom translit map | 4a-installed `transliteration@2.6.1` server-side | Already in api for slug derivation. Admin doesn't need to translit client-side — display the auto-derived slug as read-only helper text under name field. |
| Inbox-style optimistic UI | Custom revert-on-error logic | Pessimistic + `revalidatePath` | UI-SPEC §Stop-list interaction: "switch shows loading state during request"; revert via re-fetch on error toast. |

**Key insight:** All hand-roll temptations have either (a) an existing 4a/Phase-02 implementation to reuse, or (b) an explicit UI-SPEC instruction to use the platform primitive. The "auto-save" pattern is the **only** genuinely custom hook 4b authors — and even that is a known community pattern, not novel research.

## Common Pitfalls

### Pitfall 1: `react-hook-form` `watch()` re-render storm

**What goes wrong:** `watch()` returning values (no callback) re-renders the parent component on every keystroke. With a 20-field item editor, hydration cost piles up.
**Why:** `watch()` (no arg) subscribes the calling component to ALL fields.
**How to avoid:** Use `watch(callback)` form — subscription-only, no re-renders. Or `useWatch({ name: 'field' })` for the rare component that genuinely needs a single field's live value.
**Warning signs:** React DevTools shows the editor re-rendering on every input.

### Pitfall 2: Photo upload missing CORS / wrong `Content-Type`

**What goes wrong:** Presigned PUT URL returned, browser does `fetch(url, { method: 'PUT', body: file })`, S3 returns 403 (`SignatureDoesNotMatch`) because the presigner signed for a `Content-Type` the browser is sending differently, OR the browser hits a CORS preflight failure (`Access-Control-Allow-Origin` not configured for the admin origin).
**Why:** Presigned URLs lock in the exact request fingerprint the signer expects. MinIO default config does not allow PUT from another origin.
**How to avoid:**
1. Backend `presignPut` accepts the same `Content-Type` the browser will send — keep it deterministic (e.g., always `image/jpeg` or read from the file blob).
2. Add `PUT` and the admin origin to the bucket's CORS config (`infra/docker/minio-init.sh` and the production bucket config).
3. Browser PUT call sends matching `Content-Type` header explicitly.
4. **Verification step in plan:** Wave 0 includes a manual probe checking a real upload round-trips via the dev MinIO.

### Pitfall 3: Sonner toast `id` re-emit appears as new toast

**What goes wrong:** Calling `toast.success('Опубликовано')` after the countdown elapses creates a **second** toast next to the still-mounted countdown one because the `id` wasn't passed.
**Why:** Sonner replaces in place only when `id` matches an active toast.
**How to avoid:** Always thread the same constant `id` through every call (`'publish-countdown'`) — see Pattern 2.
**Warning signs:** Two toasts stack at bottom-right during the 5s window.

### Pitfall 4: Server action revalidation misses sticky-bar layout

**What goes wrong:** Operator edits an item; auto-save fires; sticky bar still shows "0 неопубликованных изменений" because the layout's diff RSC was cached.
**Why:** Next.js layouts cache per navigation. Server actions need to invalidate the layout segment.
**How to avoid:** Every catalog-mutating server action calls `revalidatePath('/dashboard/menu', 'layout')`. Auto-save firing also revalidates (acceptable cost — 1 SQL count query).
**Warning signs:** Sticky bar count stale until manual nav.

### Pitfall 5: Concurrent auto-save races

**What goes wrong:** User types fast; save A starts; save B starts before A returns; B returns first; A returns second and overwrites B's state with the older payload.
**Why:** Server actions are async; no built-in ordering.
**How to avoid:** Each save call carries a monotonic counter; only the latest-counter response transitions the `Saved` indicator. Cancel earlier in-flight via `AbortController` if the server action supports it (it doesn't in current `apiFetchInternal` — see Open Questions).
**Warning signs:** "Saved 2s ago" appears, then changes flip back when user reloads.

### Pitfall 6: `menuCategories` has no `status` column

**What goes wrong:** UI-SPEC says "Archive category" via `AlertDialog`, but the underlying schema (`packages/db/src/schema/menu.ts` lines 34–64) has no `status` enum on `menu_categories`. Only `menu_items` has `status: draft|published|archived`.
**Why:** 4a focused on item lifecycle; category archive is a 4b need that didn't drive 4a's schema.
**How to avoid (PLANNING LANDMINE):** This is a backend addendum the planner MUST schedule. Options:
- **Option A (cleanest):** add a `menu_categories.status` column via 4b-prefix migration + UpsertCategory accepts it + audit projection extended. Cost: 1 migration + 2 service updates + 1 DTO field.
- **Option B (cheap):** "archive" a category by soft-delete via a new `archivedAt` timestamp column. Same surface area, less semantic.
- **Option C (UX dodge):** drop "Archive category" from 4b scope; only support edit + reorder. Categories are few — operators can rename to "[archived]" manually. Surface as deferred-item.
**Recommendation:** Option A. Two-line schema change; consistency with `menu_items.status`; aligns with future v2 multi-status filters.
**Warning signs:** Planner writes "archive category action" without naming the schema column it patches.

### Pitfall 7: `apiFetchInternal` lacks AbortSignal.timeout

**What goes wrong:** `apiFetchInternal` (current code) does NOT set `AbortSignal.timeout` — only `apiFetch` does. A slow `/internal/v1/catalog/items` GET could hang an admin RSC render indefinitely.
**Why:** Phase 02 only hardened `apiFetch`; `apiFetchInternal` (which arrived later for the seed CLI) inherits the looser pattern.
**How to avoid:** Wave 0 or first 4b plan extends `apiFetchInternal` with `AbortSignal.timeout(10_000)` for GET, `30_000` for POST/DELETE. Also add the same retry-on-idempotent-GET-5xx logic. Mirrors `apiFetch`. Required by `apps/CLAUDE.md` network rules.
**Warning signs:** RSC render times spike on slow upstream.

### Pitfall 8: Draft-diff cardinality

**What goes wrong:** Tenant with 500 items + 200 categories triggers a draft-diff GET on every `/menu/*` navigation; SQL is O(N) and the layout becomes the bottleneck.
**Why:** Diff = "rows where `status === 'draft' OR (status === 'published' AND updated_at > last_publish_at)`".
**How to avoid:** Indexed query — use the existing `menu_items_tenant_status_sort_idx`. Cap response size at 100 items + a "+ N more" sentinel. Sticky bar shows the count regardless; the expanded list is paginated/truncated.
**Warning signs:** Layout RSC takes >500ms on a real-size tenant.

### Pitfall 9: `LocalizedText` write at single-locale UI

**What goes wrong:** UI writes `name: 'Капучино'` (plain string) but `UpsertItemInputSchema` expects `LocalizedText = { en?: string, ru?: string, … }`.
**Why:** D-05 keeps the `LocalizedText` DTO; UI writes only default-locale. Tenant default-locale is in BA org settings or tenant row.
**How to avoid:** Server actions wrap the plain string into `{ [defaultLocale]: value }` before posting. Read path inverts: prefer `value[defaultLocale] ?? value['en'] ?? Object.values(value)[0] ?? ''`. Add a `toLocalizedText(value, locale)` + `fromLocalizedText(value, locale)` helper in `apps/admin/lib/catalog/`.
**Warning signs:** Server returns 400 `validation.failed` on every category/item save.

### Pitfall 10: Drizzle `numeric` returned as string

**What goes wrong:** `proteins`, `fats`, `carbs`, `basePrice` are Postgres `numeric` — Drizzle emits them as **strings** (`"5.50"`), not numbers. RHF form expects `number` for `<input type="number">`.
**Why:** Drizzle's `numeric` mode preserves precision — float-conversion loses info. See e2e fixture in `catalog.e2e.spec.ts` (Task 2).
**How to avoid:** Read-side parses to number via the existing `MoneyAmountValue` schema (`z.coerce.number()`). Write-side sends number; api Zod coerces back to string for Drizzle. Already covered by 4a DTO — frontend just needs to know.
**Warning signs:** Number inputs render `"5.50"` instead of `5.5` because the string flows directly to the input value.

## Runtime State Inventory

Not applicable. Phase 4b is greenfield UI on top of finalized 4a schema; no renames, refactors, or migrations of existing tenant data. Stop-list overlay table and slug-aliases are 4a artifacts already populated by 4a's seed/test fixtures.

## Code Examples

### Mirror api Zod to client form schema (single source of truth at the boundary)

```typescript
// apps/admin/lib/catalog/schemas.ts
import { z } from 'zod';
// Reuse domain value-objects for boundary parity. Mirror 4a max-lengths.

export const ItemEditorFormSchema = z.object({
  name: z.string().trim().min(1).max(255), // mirrors LocalizedText cap from packages/domain
  description: z.string().max(4096).nullable().default(null),
  categoryId: z.string().uuid(),
  basePrice: z.coerce.number().min(0),     // Drizzle numeric → string; coerce on form load
  currency: z.string().regex(/^[A-Z]{3}$/),
  allergens: z.array(z.string().min(1).max(100)).max(50).default([]),
  proteins: z.coerce.number().min(0).max(999.99).nullable().default(null),
  fats: z.coerce.number().min(0).max(999.99).nullable().default(null),
  carbs: z.coerce.number().min(0).max(999.99).nullable().default(null),
  kcal: z.coerce.number().int().min(0).max(32000).nullable().default(null),
  nutritionEstimated: z.boolean().default(false),
  // photos[] managed by PhotoUploadClient, not by RHF directly
});
export type ItemEditorForm = z.infer<typeof ItemEditorFormSchema>;
```

### Server action for auto-save (calls existing 4a-07 POST endpoint)

```typescript
// apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts
'use server';
import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { ItemEditorFormSchema, type ItemEditorForm } from '@/lib/catalog/schemas';
import { toLocalizedText } from '@/lib/catalog/localized';

export interface UpsertItemActionState {
  readonly error: string | null;
  readonly savedAt: number | null;
}

export async function upsertItemAction(
  itemId: string,
  defaultLocale: string,
  values: ItemEditorForm,
): Promise<UpsertItemActionState> {
  const parsed = ItemEditorFormSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.', savedAt: null };
  }
  const payload = {
    id: itemId === 'new' ? undefined : itemId,
    categoryId: parsed.data.categoryId,
    name: toLocalizedText(parsed.data.name, defaultLocale),
    description: parsed.data.description ? toLocalizedText(parsed.data.description, defaultLocale) : null,
    basePrice: parsed.data.basePrice.toFixed(2),  // numeric → string for Drizzle
    currency: parsed.data.currency,
    allergens: parsed.data.allergens,
    proteins: parsed.data.proteins,
    fats: parsed.data.fats,
    carbs: parsed.data.carbs,
    kcal: parsed.data.kcal,
    nutritionEstimated: parsed.data.nutritionEstimated,
    source: 'manual',
    photos: [],  // photos managed separately via PhotoUploadClient
  };
  const res = await apiFetchInternal<{ id: string }>('/internal/v1/catalog/items', {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) {
    return { error: `Не удалось сохранить (${res.status}).`, savedAt: null };
  }
  revalidatePath('/dashboard/menu', 'layout');
  return { error: null, savedAt: Date.now() };
}
```

### Stop-list inline toggle

```tsx
// apps/admin/app/dashboard/(workspace)/menu/items/stop-list-toggle-action.ts
'use server';
import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';

export async function toggleStopListAction(
  itemId: string,
  next: 'paused' | 'published',
): Promise<{ readonly ok: boolean; readonly error: string | null }> {
  if (next === 'paused') {
    const res = await apiFetchInternal<{ id: string }>('/internal/v1/catalog/stop-list', {
      method: 'POST',
      body: { itemId, reason: null },
    });
    if (!res.ok) return { ok: false, error: 'Не удалось добавить в стоп-лист.' };
  } else {
    const res = await apiFetchInternal<void>(`/internal/v1/catalog/stop-list/${itemId}`, { method: 'DELETE' });
    if (!res.ok) return { ok: false, error: 'Не удалось убрать из стоп-листа.' };
  }
  revalidatePath('/dashboard/menu', 'layout');
  return { ok: true, error: null };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Single-photo `imageS3Key` column | `photos JSONB[]` array | 4a (2026-05-31) | Schema forward-compatible for multi-photo v2; UI ships single-photo |
| `menu_variants.priceDelta` | `menu_item_sizes.price` (absolute) | 4a (2026-05-31) | UI labels "Цена" not "Доплата"; aligns with iiko |
| Combined modifier/group entity | Separate `menu_modifier_groups` + `menu_modifier_options` | 4a (2026-05-31) | Two-surface UX possible; reusable groups |
| Immediate publish | Delayed-publish (5s window) | 4a (2026-05-31) | Sonner countdown UX possible; backend `DelayedPublishService` owns timer |
| `useActionState` for forms | `react-hook-form` for editors with auto-save | 4b (this phase) | Subscription-based change detection enables debounced auto-save |
| Form re-emit on every keystroke | `watch(callback)` subscription | n/a — best practice | No re-renders on parent; only side-effect fires |

**Deprecated/outdated:**

- `toast.update(id, …)` — never existed in Sonner. Use `toast(jsx, { id })` for in-place replace.
- `imageUrl` field on item DTO — kept as backward-compat (= `photos[0].url`) in qr-menu types, but admin UI should write/read `photos[]` directly.

## Assumptions Log

> Each `[ASSUMED]` claim needs user/planner confirmation before becoming a locked decision.

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Backend addendum (GET endpoints + presign-PUT + draft-diff + category status) is acceptable scope inside Phase 4b | Standard Stack + Architecture | If user wants strictly frontend-only 4b, the plan needs a Phase 4c interleave first. **HIGH risk — must confirm.** |
| A2 | `react-hook-form@7.76.1` + `@hookform/resolvers@5.4.0` are the slopcheck-clean canonical choices | Package Legitimacy Audit | Misidentified package = supply-chain risk. Mitigated by long provenance + planner human-verify gate. |
| A3 | Categories need a `status` column to support D-09 "archived" badge — Option A in Pitfall #6 | Pitfall 6 | Wrong choice = either over-engineering (Option A when nobody archives categories) or rebuild (Option C dropped, then user asks for it) |
| A4 | Sonner's `id`-based in-place replace works in 2.0.7 as documented | Pattern 2 | If Sonner 2.x changed behavior, countdown shows two toasts. Mitigated by Wave-0 smoke test. |
| A5 | `apiFetchInternal` needs hardening (timeout + retry) inside 4b scope | Pitfall 7 | If deferred to a hardening phase, 4b ships violating `apps/CLAUDE.md` rules. Recommend folding in. |
| A6 | Server actions can drive RHF auto-save without `useTransition`/`useActionState` because we own the result reporting | Pattern 1 | If React 19 stale-closure rules trip in production, indicator may lie about save state |
| A7 | Tenant default-locale lookup exists at the api boundary (so UI doesn't have to manage it for `LocalizedText` writes) | Pitfall 9 | Verify in api: where does tenant default-locale come from? If unset, admin needs a fallback constant (e.g., `'ru'`) and the planner must surface this. |
| A8 | Item `status === 'paused'` is computed from "row exists in `menu_stop_list`" at the read API — not a column on `menu_items` | UI-SPEC §Status badge | Confirmed via 4a `loadPublishedMenu` (filters out stop-listed); admin needs the same join for items-list status column. |
| A9 | Bucket CORS for direct-PUT from admin is acceptable infra change in 4b | Pitfall 2 | Without it, presign-PUT fails at runtime; lands as a backend addendum. |
| A10 | The "Modified" badge state (item edited after publish) is derivable as `updated_at > tenants.menu_first_published_at` AND `status === 'published'` — no new column needed | UI-SPEC §Status semantics | If not computable, schema needs a `last_published_at` per-item — planner must verify |

## Open Questions

1. **Default locale source.** Is it `tenants.defaultLocale`, BA org metadata, or `request.brand.locale`? Server actions need it to wrap plain-string UI inputs into `LocalizedText`. (A7)
   - What we know: D-05 single-locale, `LocalizedText` DTO stays.
   - What's unclear: where the active locale comes from at server-action time.
   - Recommendation: Planner reads `apps/api/src/contexts/tenancy/...` for tenant-default-locale + adds helper to `apps/admin/lib/me.ts` if not already exposed.

2. **`Modified` badge computation.** Is `updated_at > menu_first_published_at` sufficient, or does the spec want per-item "last_published_at"?
   - What we know: 4a tracks tenant-level first-publish.
   - What's unclear: whether per-item republish tracking exists.
   - Recommendation: For 4b, compute as `status === 'published' AND updated_at > tenants.menu_first_published_at`. If wrong-positives appear (e.g., right after first publish many items show modified), planner adds a per-item `last_published_at` column in a 4b backend addendum.

3. **`/internal/v1/catalog/items` list shape.** Should it return embedded sizes + modifier-group IDs, or thin rows? Single endpoint vs. multiple.
   - What we know: UI-SPEC table shows price + status + photo[0] + category-with-parent-prefix.
   - What's unclear: whether the items-list page wants size-cardinality info ("от N₽ if sizes exist") inline or just base price.
   - Recommendation: Return thin rows + a `hasSizes: boolean` flag for the "от" label. Editor reads sizes via a separate fetch on `[id]/page.tsx`.

4. **Stop-list `stoppedAt` exposure.** UI-SPEC needs ">24h" stale warning. Does `menu_stop_list.created_at` ship in the GET response?
   - What we know: Schema has timestamps (`timestampsColumns`).
   - What's unclear: whether the public/internal DTO surfaces it.
   - Recommendation: Confirm in backend addendum; if not exposed, surface `stoppedAt` in the new `GET /internal/v1/catalog/stop-list` response.

5. **Draft-diff scope.** Does diff include modifier-groups and categories, or only items?
   - What we know: UI-SPEC §Sticky Publish Bar "diff list items grouped by entity type".
   - What's unclear: which entity types are actually publishable. Currently `publish` only snapshots items (4a behavior).
   - Recommendation: Diff covers items first; modifier-groups + categories iff they have a publish lifecycle. Planner verifies in 4a `loadPublishedMenu` to see what's actually snapshotted.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | All admin work | ✓ | 22.x (>= 22.22.1 enforced) | — |
| pnpm | All admin work | ✓ | 9.15.0 | — |
| Docker Desktop (Postgres + MinIO + Redis + NATS) | Dev e2e + manual photo upload smoke | ✓ (per project setup) | — | — |
| MinIO (S3-compatible dev) | Photo upload presign-PUT smoke test | ✓ in dev stack | per `infra/docker/docker-compose.dev.yml` | Production uses AWS S3 / Cloudflare R2 (per ADR-0016) |
| `@aws-sdk/s3-request-presigner` | New `presignPut` method on existing adapter | ✓ Already installed | 3.1053.0 in repo (latest 3.1057.0 — bump optional) | — |
| `transliteration` | server-side slug derivation | ✓ Already installed (4a-01) | 2.6.1 | — |
| `react-hook-form` | item editor auto-save | ✗ NOT INSTALLED | — | Wave 0 install |
| `@hookform/resolvers` | RHF + zod bridge | ✗ NOT INSTALLED | — | Wave 0 install |
| shadcn primitives: badge, table, tabs, switch, form, select, dialog, progress, textarea | All editor surfaces | ✗ NOT INSTALLED | — | Wave 0: `pnpm dlx shadcn@latest add ...` |

**Missing dependencies with no fallback:** none — every missing dep has a Wave 0 install step.
**Missing dependencies with fallback:** none.

## Validation Architecture

> Project config: `.planning/config.json` was not inspected in this session; `nyquist_validation` defaults to enabled per protocol. Section included.

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 2.1.8 (unit) + Playwright 1.60.0 (e2e) |
| Config files | `apps/admin/vitest.config.ts`, `apps/admin/playwright.config.ts` |
| Quick run command | `pnpm --filter @resto/admin exec vitest run <path>` |
| Full suite command | `pnpm --filter @resto/admin exec vitest run && pnpm --filter @resto/admin e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| CAT-01 | Operator creates a category; appears in list | unit (RTL) + e2e | `pnpm --filter @resto/admin exec vitest run app/dashboard/.../categories/category-form-client.spec.tsx` | ❌ Wave 0 |
| CAT-01 | Operator edits category name; auto-save fires after debounce | unit (RTL with fake timers) | as above + new spec | ❌ Wave 0 |
| CAT-01 | Operator archives category; AlertDialog confirmation | e2e | `pnpm --filter @resto/admin e2e tests/catalog/categories.spec.ts` | ❌ Wave 0 |
| CAT-02 | Item editor renders all fields; auto-save triggers POST /items | unit (RTL with mocked server action) | new spec | ❌ Wave 0 |
| CAT-02 | Item editor switching tabs preserves form state | unit | as above | ❌ Wave 0 |
| CAT-03 | Photo drop zone accepts file; presigned PUT URL fetched; direct PUT fires | unit (RTL + msw) + e2e (against MinIO) | new spec; new playwright | ❌ Wave 0 |
| CAT-04 | Modifier-group editor lists options; add-option fires upsert | unit | new spec | ❌ Wave 0 |
| CAT-04 | Item's Modifiers tab adds existing group from sheet picker | unit | new spec | ❌ Wave 0 |
| CAT-05 | Sizes tab adds a row; Default radio enforces single-active | unit | new spec | ❌ Wave 0 |
| CAT-07 | Stop-list switch toggle calls POST/DELETE; sonner notice appears | unit | new spec | ❌ Wave 0 |
| CAT-07 | "Today's 86" dashboard widget renders count from `/stop-list` | unit | new spec | ❌ Wave 0 |
| CAT-08 | Sticky publish bar reads draft-diff; shows count | unit (server-component test) | new spec | ❌ Wave 0 |
| CAT-08 | Click Publish → POST `/publish` → Sonner countdown appears | e2e | new playwright | ❌ Wave 0 |
| CAT-08 | Click Undo within 5s → DELETE `/publish` → success toast | e2e | as above | ❌ Wave 0 |
| CAT-08 | Re-click protection: button disabled during active countdown | unit | new spec | ❌ Wave 0 |
| Backend addendum | New GET endpoints return expected shape | api e2e | `pnpm --filter @resto/api exec vitest run test/e2e/catalog.e2e.spec.ts` | partial — extend existing file |

### Sampling Rate

- **Per task commit:** `pnpm --filter @resto/admin exec vitest run <changed-file>` (target <30s)
- **Per wave merge:** `pnpm --filter @resto/admin exec vitest run` + `pnpm --filter @resto/api exec vitest run` (parallel)
- **Phase gate:** Full suite + Playwright e2e green before `/gsd:verify-work`. OpenAPI drift gate (`pnpm openapi:check`) re-runs after any backend addendum.

### Wave 0 Gaps

- [ ] `apps/admin/tests/catalog/` directory (Playwright e2e for categories, items, modifier-groups, stop-list, publish flow) — does not exist
- [ ] `apps/admin/app/.../*-form-client.spec.tsx` colocated unit tests — none for catalog
- [ ] Shared test fixtures for tenant + brand + seeded category/item/modifier-group — extend existing Playwright fixtures
- [ ] MSW (Mock Service Worker) handlers for `apiFetchInternal` if used in RTL tests — currently no msw setup in admin; consider `vi.mock('@/lib/api-server-internal')` pattern instead
- [ ] Framework install: none beyond Wave 0 deps (vitest + playwright already configured for admin)

## Security Domain

> `security_enforcement` is treated as enabled (config absent). Section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | Inherits BA session via `apiFetch`; catalog mutations use server-only `INTERNAL_API_TOKEN` via `apiFetchInternal` (no client exposure) |
| V3 Session Management | yes | `apps/CLAUDE.md` cookie triad enforced (already in `apiFetch.setForwardedCookie`) — no new cookies in 4b |
| V4 Access Control | yes | InternalTokenGuard on catalog routes; **`PermissionsGuard` NOT YET wired** for catalog (gap acknowledged in Pitfall #3) |
| V5 Input Validation | yes | Zod everywhere (4a DTOs + new client schemas); max-length enforced (CAT-09 source of truth) |
| V6 Cryptography | no | Photo upload uses AWS SDK presigner (already audited); no hand-rolled crypto in 4b |
| V11 Business Logic | yes | Delayed-publish 5s window enforced server-side (`DelayedPublishService`); admin UI is hint-only — backend is authoritative |
| V12 File and Resources | yes | Direct-PUT photo upload requires Content-Type allowlist + size cap in `presignPut` (Pitfall #2) |
| V13 API and Web Service | yes | OpenAPI drift gate (`pnpm openapi:check`) covers new endpoints; `@resto/api-client` types regenerated |

### Known Threat Patterns for Next.js 15 + NestJS

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| XSS via `LocalizedText` admin input → public menu | Tampering | Plain string render only (no `dangerouslySetInnerHTML`); React auto-escapes; existing pattern |
| SSRF via photo upload URL injection | Spoofing | `presignPut` returns server-generated URL; admin never accepts a URL from operator |
| CSRF on catalog mutations | Tampering | `INTERNAL_API_TOKEN` is server-only; no browser→api CSRF surface for catalog routes |
| Direct-PUT to wrong bucket / overwrite arbitrary key | Tampering | `presignPut` server-generates the `s3Key` (UUID-prefixed); operator cannot influence |
| Oversized photo upload | DoS | `presignPut` enforces `sizeBytes ≤ 5 MiB`; AWS SigV4 binds the size into the signed URL |
| Replay of presigned PUT URL | Spoofing | TTL ≤ 5 min on the URL; even with replay, key is server-chosen so no collision risk |
| Open redirect via `next=` on catalog deep-link | Tampering | No new `next=` params in 4b — verify; existing rule in `apps/CLAUDE.md` |
| Auto-save flooding (operator types fast) | DoS | 1.5s client debounce + server rate-limit on `/internal/v1/catalog/items` (rate-limit guard already exists per 4a Threat Flags) |
| Stop-list flood (operator toggles repeatedly) | DoS | Existing app-level rate-limit per 4a T-04a-07-05 |

## Sources

### Primary (HIGH confidence)

- **Codebase audit (definitive for surface area):**
  - `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` — endpoint inventory
  - `apps/api/src/contexts/catalog/application/dto.ts` — schema source of truth
  - `apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts` — `presignGet` only, no PUT
  - `apps/api/src/contexts/catalog/domain/ports.ts` — `ImageUrlPort.presignGet` interface
  - `apps/api/src/contexts/catalog/application/delayed-publish.service.ts` — 5s server-side timer
  - `packages/db/src/schema/menu.ts` — schema reality (categories have no status, item statuses)
  - `packages/domain/src/rbac/permissions.ts` + `system-roles.ts` — RBAC resource-action tokens
  - `apps/admin/lib/api-server.ts` — apiFetch hardened pattern
  - `apps/admin/lib/api-server-internal.ts` — apiFetchInternal pattern (lacks timeout — Pitfall #7)
  - `apps/admin/components.json` + `app/globals.css` — shadcn preset + token palette
  - `apps/admin/components/ui/sonner.tsx` + `app/layout.tsx` — Toaster already mounted
  - `.planning/phases/04a-catalog-schema-api/04a-VERIFICATION.md` — 19/19 must-haves passed
  - `.planning/phases/04a-catalog-schema-api/04A-07-SUMMARY.md` — HTTP endpoint map post-4a-07
- **Project canonical artifacts:**
  - `.planning/phases/04b-catalog-admin-ui/04b-CONTEXT.md` — locked decisions
  - `.planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md` — visual + interaction contract
  - `.planning/phases/04-catalog-admin/PERSONA-REVIEWS.md` — inherited reviewer findings
  - `.planning/phases/02-admin-shell/02-CONTEXT.md` — admin shell conventions
  - `CLAUDE.md` + `apps/CLAUDE.md` + `packages/CLAUDE.md` + `packages/domain/CLAUDE.md` + `packages/db/CLAUDE.md` — hard directives
- **npm registry version verification (live):**
  - react-hook-form 7.76.1, 2026-05-23 — registry.npmjs.org
  - @hookform/resolvers 5.4.0, 2026-05-21 — registry.npmjs.org
  - sonner 2.0.7, 2025-08-02 — already installed
  - @aws-sdk/s3-request-presigner 3.1057.0 — already installed (3.1053.0)

### Secondary (MEDIUM confidence)

- shadcn/ui Form docs ([ui.shadcn.com/docs/components/form](https://ui.shadcn.com/docs/components/form)) — install command + peer deps + named exports
- Sonner docs site ([sonner.emilkowal.ski](https://sonner.emilkowal.ski/toast)) — toast options including id, duration, action; in-place replace via same id
- react-hook-form discussion #3078 ([github.com/orgs/react-hook-form/discussions/3078](https://github.com/orgs/react-hook-form/discussions/3078)) — community-converged debounce-watch pattern; maintainer initially said "Not possible"
- dev.to "watch vs useWatch" article — confirms `useWatch` for performance-sensitive single-field; `watch(callback)` for subscriptions

### Tertiary (LOW confidence — flagged for human-verify)

- Slopcheck output for `react-hook-form` + `@hookform/resolvers` — tool unavailable; provenance-verified manually but tagged `[ASSUMED]`

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every choice validated against the codebase or upstream docs
- Architecture: HIGH — tier map and route layout derived from the locked UI-SPEC + existing route conventions
- Pitfalls: HIGH for Pitfalls 1–10 — each anchored to a specific file or known behavior; Pitfall 6 (categories no `status` column) is a **blocking finding** that the planner must address
- Backend gap inventory: HIGH — direct enumeration of `internal-catalog.controller.ts` confirms no GET endpoints, no presign-PUT, no draft-diff
- Auto-save concurrency: MEDIUM — pattern is well-known but request-id race resolution is a planner concern, not researcher
- Sonner in-place toast replace: MEDIUM — docs say it works; needs Wave-0 smoke verification

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (frontend stack moves slowly; shadcn primitives and Sonner are stable; revisit if react-hook-form ships a v8 in this window)
