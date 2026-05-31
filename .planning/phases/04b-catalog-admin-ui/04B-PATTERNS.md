# Phase 4b: Catalog Admin UI - Pattern Map

**Mapped:** 2026-05-31
**Files analyzed:** 37 new/modified files (1 wave-0 infra hardening, 9 backend addendum, 27 frontend)
**Analogs found:** 37 / 37 (all files have concrete in-repo analogs)

---

## File Classification

### Wave 0 — Dependency install + infra hardening

| New/Modified File                            | Role                | Data Flow        | Closest Analog                                | Match Quality |
| -------------------------------------------- | ------------------- | ---------------- | --------------------------------------------- | ------------- |
| `apps/admin/package.json` (deps)             | config              | n/a              | `apps/admin/package.json` (self)              | exact         |
| `apps/admin/components/ui/form.tsx`          | shadcn primitive    | n/a              | `apps/admin/components/ui/sonner.tsx`         | role-match    |
| `apps/admin/lib/api-server-internal.ts`      | server-fetch helper | request-response | `apps/admin/lib/api-server.ts`                | exact         |

### Wave 1 + 2 — Backend addendum (catalog GETs + archive + presign-PUT + migration)

| New/Modified File                                                                              | Role                  | Data Flow        | Closest Analog                                                                            | Match Quality |
| ---------------------------------------------------------------------------------------------- | --------------------- | ---------------- | ----------------------------------------------------------------------------------------- | ------------- |
| `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` (extend)        | NestJS controller     | request-response | self (extend the 9 existing POST/DELETE endpoints)                                        | exact         |
| `apps/api/src/contexts/catalog/application/list-categories.service.ts`                         | application service   | request-response | `apps/api/src/contexts/catalog/application/get-published-menu.service.ts`                 | role-match    |
| `apps/api/src/contexts/catalog/application/list-items.service.ts`                              | application service   | request-response | `apps/api/src/contexts/catalog/application/get-published-menu.service.ts`                 | role-match    |
| `apps/api/src/contexts/catalog/application/get-item.service.ts`                                | application service   | request-response | `apps/api/src/contexts/catalog/application/get-menu-item.service.ts`                      | exact         |
| `apps/api/src/contexts/catalog/application/list-modifier-groups.service.ts`                    | application service   | request-response | `apps/api/src/contexts/catalog/application/get-published-menu.service.ts`                 | role-match    |
| `apps/api/src/contexts/catalog/application/get-modifier-group.service.ts`                      | application service   | request-response | `apps/api/src/contexts/catalog/application/get-menu-item.service.ts`                      | exact         |
| `apps/api/src/contexts/catalog/application/get-stop-list.service.ts`                           | application service   | request-response | `apps/api/src/contexts/catalog/application/stop-list.service.ts`                          | role-match    |
| `apps/api/src/contexts/catalog/application/get-draft-diff.service.ts`                          | application service   | request-response | `apps/api/src/contexts/catalog/application/get-published-menu.service.ts`                 | role-match    |
| `apps/api/src/contexts/catalog/application/archive-category.service.ts`                        | application service   | CRUD             | `apps/api/src/contexts/catalog/application/upsert-category.service.ts`                    | exact         |
| `apps/api/src/contexts/catalog/application/archive-item.service.ts`                            | application service   | CRUD             | `apps/api/src/contexts/catalog/application/upsert-item.service.ts`                        | exact         |
| `apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts` (extend)         | adapter (S3)          | request-response | self (extend `presignGet` with `presignPut`)                                              | exact         |
| `apps/api/src/contexts/catalog/domain/ports.ts` (extend `ImageUrlPort`)                        | port interface        | n/a              | self (extend)                                                                             | exact         |
| `apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts` (extend if archive errors)    | error mapping         | request-response | self (extend)                                                                             | exact         |
| `apps/api/src/contexts/catalog/application/dto.ts` (extend with list/detail DTOs)              | Zod DTO schema        | request-response | self (extend)                                                                             | exact         |
| `apps/api/src/contexts/catalog/catalog.module.ts` (register new services)                      | NestJS module         | n/a              | self (extend providers array)                                                             | exact         |
| `packages/db/migrations/0042_catalog_phase4b_categories_status.sql`                            | SQL migration         | batch            | `packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql`                       | exact         |
| `packages/db/src/schema/menu.ts` (add `status` to `menuCategories`)                            | Drizzle schema        | n/a              | self (extend)                                                                             | exact         |
| `packages/db/migrations/meta/_journal.json`                                                    | migration journal     | n/a              | self (append)                                                                             | exact         |
| `docs/api/openapi.yaml` + `packages/api-client/src/generated/api.ts`                           | generated artifacts   | n/a              | re-emit via `pnpm openapi:check`                                                          | exact         |

### Wave 3+ — Frontend (Next.js admin pages, actions, client components)

| New/Modified File                                                                                                                  | Role             | Data Flow        | Closest Analog                                                                            | Match Quality |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- | ----------------------------------------------------------------------------------------- | ------------- |
| `apps/admin/components/app-sidebar.tsx` (extend `navMain`)                                                                         | client component | n/a              | self (add new `Menu` group following `NavMainItem.items` pattern)                          | exact         |
| `apps/admin/app/dashboard/(workspace)/menu/layout.tsx`                                                                              | RSC layout       | request-response | `apps/admin/app/dashboard/(workspace)/layout.tsx`                                          | role-match    |
| `apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx`                                                                     | RSC page         | request-response | `apps/admin/app/dashboard/(workspace)/settings/page.tsx`                                  | exact         |
| `apps/admin/app/dashboard/(workspace)/menu/categories/category-form-client.tsx`                                                     | client component | request-response | `apps/admin/app/dashboard/(workspace)/settings/invite-form-client.tsx` + RHF (new)         | role-match    |
| `apps/admin/app/dashboard/(workspace)/menu/categories/{create,update,archive,reorder}-category-action.ts`                          | server action    | CRUD             | `apps/admin/app/dashboard/(workspace)/settings/invite-action.ts`                          | exact         |
| `apps/admin/app/dashboard/(workspace)/menu/items/page.tsx`                                                                          | RSC page         | request-response | `apps/admin/app/dashboard/(workspace)/settings/page.tsx`                                  | exact         |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/page.tsx`                                                                     | RSC page         | request-response | `apps/admin/app/dashboard/(workspace)/settings/page.tsx`                                  | role-match    |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-editor-client.tsx`                                                       | client component | request-response | `apps/admin/app/(onboarding)/onboarding/brand/brand-form-client.tsx` (debounce pattern)    | role-match    |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/{upsert-item,archive-item,toggle-stop-list,upsert-item-size}-action.ts`     | server action    | CRUD             | `apps/admin/app/dashboard/(workspace)/settings/actions.ts` (scheduleOffboardingAction)    | exact         |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/photo-upload-client.tsx`                                                      | client component | file-I/O         | net-new (no in-repo analog)                                                               | no analog     |
| `apps/admin/app/dashboard/(workspace)/menu/items/[id]/photo-upload-url-action.ts`                                                   | server action    | request-response | `apps/admin/app/dashboard/(workspace)/settings/actions.ts`                                | exact         |
| `apps/admin/app/dashboard/(workspace)/menu/modifier-groups/page.tsx`                                                                | RSC page         | request-response | `apps/admin/app/dashboard/(workspace)/settings/page.tsx`                                  | exact         |
| `apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/page.tsx` + `modifier-group-editor-client.tsx`                     | RSC + client     | request-response | item editor pair                                                                         | role-match    |
| `apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/{upsert-modifier-group,upsert-modifier-option}-action.ts`         | server action    | CRUD             | `apps/admin/app/dashboard/(workspace)/settings/invite-action.ts`                          | exact         |
| `apps/admin/app/dashboard/(workspace)/menu/stop-list/page.tsx`                                                                      | RSC page         | request-response | `apps/admin/app/dashboard/(workspace)/settings/page.tsx`                                  | exact         |
| `apps/admin/app/dashboard/(workspace)/menu/stop-list/reset-stop-list-action.ts`                                                    | server action    | CRUD (batch)     | `apps/admin/app/dashboard/(workspace)/settings/actions.ts`                                | role-match    |
| `apps/admin/components/menu/sticky-publish-bar.tsx` (+ client island)                                                              | client component | event-driven     | net-new (no in-repo analog for Sonner+countdown)                                          | no analog     |
| `apps/admin/components/menu/publish-countdown-toast.tsx`                                                                            | client component | event-driven     | net-new (Sonner `toast.custom` pattern from RESEARCH.md Pattern 2)                         | no analog     |
| `apps/admin/components/menu/auto-save-indicator.tsx`                                                                                | client component | event-driven     | inline pattern from `apps/admin/app/(onboarding)/.../brand-form-client.tsx` (slug hint)    | role-match    |
| `apps/admin/components/menu/status-badge.tsx`                                                                                      | client component | n/a (presentation)| `apps/admin/components/empty-state.tsx` (variant prop pattern)                            | role-match    |
| `apps/admin/components/menu/category-select.tsx`                                                                                    | client component | request-response | net-new (indented shadcn Select)                                                          | no analog     |
| `apps/admin/components/menu/bju-row.tsx`                                                                                            | client component | n/a (presentation)| inline form row pattern                                                                  | no analog     |
| `apps/admin/components/menu/todays-86-widget.tsx`                                                                                  | RSC + client     | request-response | `apps/admin/components/setup-checklist-card.tsx` (RSC card + counters)                     | role-match    |
| `apps/admin/lib/menu/use-auto-save.ts`                                                                                              | client hook      | event-driven     | RESEARCH.md Pattern 1 (community RHF watch+debounce)                                       | no analog     |
| `apps/admin/lib/menu/{schedule-publish,cancel-publish}-action.ts`                                                                  | server action    | request-response | `apps/admin/app/dashboard/(workspace)/settings/actions.ts`                                | exact         |
| `apps/admin/lib/menu/zod-schemas.ts`                                                                                                | Zod schema       | n/a              | `apps/admin/lib/actions/create-brand.ts` (CreateBrandFormSchema)                          | role-match    |

---

## Pattern Assignments

### Wave 0 — `apps/admin/lib/api-server-internal.ts` (extend with AbortSignal.timeout + retry)

**Analog:** `apps/admin/lib/api-server.ts` (mirror its `executeWithRetry` helper exactly).

**AbortSignal + retry pattern** (`apps/admin/lib/api-server.ts` lines 8-42):

```typescript
const TIMEOUT_GET_MS = 10_000;
const TIMEOUT_MUTATION_MS = 30_000;
const RETRY_BACKOFF_MS = 500;

const isRetryableServerError = (status: number): boolean => status >= 500 && status <= 504;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const executeWithRetry = async (
  input: string,
  init: Omit<RequestInit, 'signal'>,
  opts: { readonly isGet: boolean; readonly timeoutMs: number },
): Promise<Response> => {
  const maxAttempts = opts.isGet ? 2 : 1;
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(input, { ...init, signal: AbortSignal.timeout(opts.timeoutMs) });
    if (!opts.isGet || !isRetryableServerError(res.status) || attempt >= maxAttempts) {
      return res;
    }
    await sleep(RETRY_BACKOFF_MS);
  }
};
```

**Existing shape to keep** (`apps/admin/lib/api-server-internal.ts` lines 1-41):

```typescript
import 'server-only';
import { apiOrigin, internalApiToken } from './env';

interface InternalRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
}
// Wrap the existing fetch call with executeWithRetry — see api-server.ts lines 199-220 for the
// AbortError/TimeoutError → { status: 0 } collapse pattern.
```

**WHY-comment required:** `apps/CLAUDE.md` "Server-side `fetch` must have `AbortSignal.timeout(...)`" — Pitfall #7 in RESEARCH.md.

---

### Wave 1 — Backend GET endpoints (extend `internal-catalog.controller.ts`)

**Analog:** existing `internal-catalog.controller.ts` POSTs (lines 87-205).

**Imports pattern** (lines 1-37):

```typescript
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { InternalTokenGuard } from '../../../../shared/api/internal-token.guard';
import { Public } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { mapCatalogError } from './error-mapping';

const wrap = wrapWith(mapCatalogError);
```

**Class-level decorators** (lines 65-69):

```typescript
@ApiTags('catalog/internal')
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal/v1/catalog')
export class InternalCatalogController {
```

**Existing POST shape to mirror for new GETs** (lines 87-96):

```typescript
@Post('categories')
@HttpCode(HttpStatus.OK)
@ApiBody({ type: UpsertCategoryInputDto })
@ApiOkResponse({ type: IdResponseDto })
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
category(
  @Body(new RestoZodValidationPipe(UpsertCategoryInputDto)) input: UpsertCategoryInputDto,
): Promise<IdResponseDto> {
  return wrap(() => this.upsertCategory.execute(input));
}
```

**New GET endpoint shape (apply to all 7 GETs)**:

```typescript
@Get('categories')
@HttpCode(HttpStatus.OK)
@ApiOkResponse({ type: CategoryListResponseDto })
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
listCategories(
  @Query('parentId') parentId?: string,
): Promise<CategoryListResponseDto> {
  return wrap(() => this.listCategoriesService.execute({ parentId: parentId ?? null }));
}
```

**New PATCH shape (archive endpoints)** — mirror DELETE pattern (lines 156-161):

```typescript
@Patch('categories/:id/archive')
@HttpCode(HttpStatus.NO_CONTENT)
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
archiveCategory(@Param('id') id: string): Promise<void> {
  return wrap(() => this.archiveCategoryService.execute(id));
}
```

**Add `Patch` to the `@nestjs/common` import list.**

---

### Wave 1 — Application services (list/get/archive)

**Analog for list services:** `apps/api/src/contexts/catalog/application/get-published-menu.service.ts` (read-only, repo-backed, `.execute()` shape).

**Service skeleton pattern** (lines 16-45):

```typescript
@Injectable()
export class GetPublishedMenuService {
  private readonly logger = new Logger(GetPublishedMenuService.name);

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(CATALOG_CACHE_PORT) private readonly cache: CatalogCachePort,
    @Inject(MENU_VERSION_PORT) private readonly versions: MenuVersionPort,
  ) {}

  async execute(rawTenantId: string): Promise<PublishedMenu> {
    const tenantId = TenantId.parse(rawTenantId);
    // ... repo call inside withTenant or via cache port
  }
}
```

**Analog for archive services:** `apps/api/src/contexts/catalog/application/upsert-category.service.ts` (lines 1-30) — same `.execute(input)` single method, same `requireTenantContext()` + `getBrandId()` boilerplate.

```typescript
@Injectable()
export class UpsertCategoryService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertCategoryInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const brandId = getBrandId() ?? null;
    // mutation via this.repo
  }
}
```

**Archive variant — call existing upsert path with `status: 'archived'`** rather than introducing a new repo method (smallest diff).

---

### Wave 2 — `s3-signed-image-url.adapter.ts` extend with `presignPut`

**Analog:** self — extend the existing `presignGet` method (lines 49-60).

**Existing `presignGet`** (lines 49-60):

```typescript
async presignGet(s3Key: string, ttlSeconds: number): Promise<string> {
  try {
    return await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
      { expiresIn: ttlSeconds },
    );
  } catch (err) {
    this.logger.warn({ err, s3Key }, 'Failed to presign image URL — falling back to empty.');
    return '';
  }
}
```

**New `presignPut` shape (mirror exactly + add Content-Type/Length signing)**:

```typescript
async presignPut(
  s3Key: string,
  contentType: string,
  contentLength: number,
  ttlSeconds: number,
): Promise<string> {
  // PutObjectCommand binds ContentType + ContentLength into the SigV4 signature so
  // operator-side fetch must send matching headers (Pitfall #2).
  return getSignedUrl(
    this.client,
    new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: ttlSeconds },
  );
}
```

**Add to imports** (line 1): `PutObjectCommand` alongside `GetObjectCommand`.

**Extend `ImageUrlPort` interface** (`apps/api/src/contexts/catalog/domain/ports.ts` lines 82-86):

```typescript
export interface ImageUrlPort {
  presignGet(s3Key: string, ttlSeconds: number): Promise<string>;
  presignPut(
    s3Key: string,
    contentType: string,
    contentLength: number,
    ttlSeconds: number,
  ): Promise<string>;
}
```

---

### Wave 1 — Migration 0042 `menu_categories.status` column

**Analog:** `packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql` (verbatim DDL idioms).

**Pattern to copy** (lines 1-22):

```sql
-- Phase 4b: add status to menu_categories. UI needs same badge surface as items + archive flow.
-- D-4b-07. Backfill existing rows to 'published' (they are already visible by definition).

ALTER TABLE menu_categories ADD COLUMN status text NOT NULL DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_status_chk CHECK (status IN ('draft','published','archived'));
--> statement-breakpoint
UPDATE menu_categories SET status = 'published' WHERE status = 'draft';
--> statement-breakpoint
```

**Drizzle schema patch** (`packages/db/src/schema/menu.ts` lines 34-64) — add `status` column to `menuCategories`:

```typescript
status: text('status').notNull().default('draft'),
```

Mirror the existing `menuItems.status` definition (line 115).

**Journal append:** add idx 42 entry to `packages/db/migrations/meta/_journal.json` (mirror 0041 entry).

---

### Wave 3 — Sidebar extension (`apps/admin/components/app-sidebar.tsx`)

**Analog:** self — add a new `NavMainItem` with `items: NavMainSubItem[]` (the collapsible group pattern is already implemented in `nav-main.tsx` lines 66-95).

**Pattern (insert after the `Settings` entry, line 38)**:

```typescript
import { LayoutDashboard, Settings2, Store, UtensilsCrossed } from 'lucide-react';
// ...
const navMain: NavMainItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, scope: 'any' },
  { title: 'Brands', url: '/dashboard', icon: Store, scope: 'tenant' },
  {
    title: 'Меню',
    url: '/dashboard/menu/items',
    icon: UtensilsCrossed,
    scope: 'brand',
    isActive: false,
    items: [
      { title: 'Категории', url: '/dashboard/menu/categories' },
      { title: 'Блюда', url: '/dashboard/menu/items' },
      { title: 'Модификаторы', url: '/dashboard/menu/modifier-groups' },
      { title: 'Стоп-лист', url: '/dashboard/menu/stop-list' },
    ],
  },
  { title: 'Settings', url: '/dashboard/settings', icon: Settings2, scope: 'tenant' },
];
```

**Existing collapsible mechanism — no changes** (`apps/admin/components/nav-main.tsx` lines 66-95): the `Collapsible` + `SidebarMenuSub` block already handles `items`. The `scope: 'brand'` gate uses the existing `isVisible` helper (lines 33-38).

---

### Wave 3 — Menu route-group layout (`menu/layout.tsx`)

**Analog:** `apps/admin/app/dashboard/(workspace)/layout.tsx` (workspace-level RSC layout that fetches data + conditionally renders).

**Pattern to mirror**:

```typescript
import { apiFetchInternal } from '@/lib/api-server-internal';
import { StickyPublishBar } from '@/components/menu/sticky-publish-bar';

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

**Caveat (Pitfall #4):** Every catalog server action MUST call `revalidatePath('/dashboard/menu', 'layout')` so the sticky bar re-fetches.

---

### Wave 3 — RSC pages (categories / items / modifier-groups / stop-list lists)

**Analog:** `apps/admin/app/dashboard/(workspace)/settings/page.tsx` — header + content pattern.

**Header chrome (verbatim)** (lines 36-42):

```tsx
<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
  <div className="flex items-center gap-2 px-4">
    <SidebarTrigger className="-ml-1" />
    <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
    <TenantBreadcrumb trail="Меню › Категории" />
  </div>
</header>
<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
  {/* content */}
</div>
```

**Data fetch + redirect pattern** (lines 24-32):

```typescript
const me = await apiFetch<MeResponse>('/v1/me');
if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
  redirect('/login');
}
// New catalog reads go through apiFetchInternal — InternalTokenGuard not BA session:
const categoriesRes = await apiFetchInternal<CategoryListResponse>('/internal/v1/catalog/categories');
```

**Empty state pattern (verbatim from items/categories/modifier-groups when count = 0)**:

```tsx
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

<EmptyState
  variant="empty"
  title="Категории не добавлены"
  description="Добавьте первую категорию, чтобы сгруппировать блюда в меню."
  action={<Button>Создать категорию</Button>}
/>
```

The component is already at `apps/admin/components/empty-state.tsx` (lines 1-55).

---

### Wave 3 — Server actions (mutations on catalog endpoints)

**Analog:** `apps/admin/app/dashboard/(workspace)/settings/actions.ts` (lines 59-89) — the `scheduleOffboardingAction` shape (auth check + `apiFetchInternal` + `revalidatePath` + structured result).

**Pattern**:

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';

interface ProblemDetails { type?: string; detail?: string; message?: string; code?: string; }

export interface UpsertItemActionState {
  readonly error: string | null;
  readonly savedAt: number | null;
}

export async function upsertItemAction(
  _prev: UpsertItemActionState,
  payload: ItemEditorForm,
): Promise<UpsertItemActionState> {
  // (1) Validate input with Zod (mirror create-brand.ts lines 49-56).
  const parsed = ItemEditorFormSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.', savedAt: null };
  }
  // (2) Call apiFetchInternal — InternalTokenGuard not BA session.
  const res = await apiFetchInternal<{ id: string }>('/internal/v1/catalog/items', {
    method: 'POST',
    body: { /* map ItemEditorForm → UpsertItemInputDto */ },
  });
  if (!res.ok) {
    return { error: `Не удалось сохранить (${res.status}).`, savedAt: null };
  }
  revalidatePath('/dashboard/menu', 'layout');
  return { error: null, savedAt: Date.now() };
}
```

**Friendly-error mapper pattern** (`apps/admin/lib/actions/create-brand.ts` lines 34-44):

```typescript
const friendly = (status: number, body: ProblemDetails | null): string => {
  if (status === 409 && body?.code === 'catalog.menu_category_not_found') return 'Категория не найдена.';
  if (status === 400) return body?.message ?? body?.detail ?? 'Проверьте поля формы.';
  if (status >= 500) return 'Серверная ошибка. Попробуйте ещё раз.';
  return body?.detail ?? `Запрос не выполнен (${status.toString()}).`;
};
```

---

### Wave 3 — Form clients (`*-form-client.tsx`)

**Analog:** `apps/admin/app/dashboard/(workspace)/settings/invite-form-client.tsx` (existing form pattern using `useActionState`) **for simple forms**, plus react-hook-form (new) **for the item editor** that needs auto-save.

**Simple form (e.g., create-category)** — `useActionState` pattern from `invite-form-client.tsx` (lines 29-77):

```tsx
'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createCategoryAction, type CreateCategoryActionState } from './create-category-action';

const initial: CreateCategoryActionState = { error: null, success: null };

export const CategoryForm = () => {
  const [state, action, pending] = useActionState(createCategoryAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="cat-name">Название</Label>
        <Input id="cat-name" name="name" required maxLength={255} />
      </div>
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Создать'}
      </Button>
    </form>
  );
};
```

**Auto-save editor (item editor only)** — react-hook-form pattern (new) from RESEARCH.md Pattern 1; shadcn `form` primitive wraps RHF:

```typescript
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { useDebouncedAutosave } from '@/lib/menu/use-auto-save';
import { ItemEditorFormSchema, type ItemEditorForm } from '@/lib/menu/zod-schemas';

const form = useForm<ItemEditorForm>({
  resolver: zodResolver(ItemEditorFormSchema),
  defaultValues: initialValues,
});
useDebouncedAutosave(form, async (values) => upsertItemAction(itemId, values), setSaveState);
```

**Debounce pattern proven in this repo** (`apps/admin/app/(onboarding)/onboarding/brand/brand-form-client.tsx` lines 61-97) — the `setTimeout(handle, DEBOUNCE_MS)` + `requestId.current` race-id pattern (Pitfall #5 prevention) is already exercised; mirror it for the auto-save concurrency guard.

---

### Wave 3 — Photo upload client (`photo-upload-client.tsx`)

**Analog:** no in-repo file analog. RESEARCH.md Pattern 4 + UI-SPEC §Photo Upload Spec.

**Flow:**

1. Browser drops/selects file → server action `photoUploadUrlAction({ contentType, sizeBytes })` returns `{ uploadUrl, s3Key }`.
2. Browser does `fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } })`.
3. Browser calls `upsertItemAction` with the new `photos: [{ s3Key, sortOrder: 0, isPrimary: true }]`.

**Critical preconditions** (Pitfall #2):

- Server-side `presignPut` MUST receive the same `Content-Type` the browser will send.
- MinIO/S3 bucket CORS allows `PUT` from `ADMIN_WEB_URL`.
- Allowlist `contentType` to `image/jpeg | image/png | image/webp`; cap `sizeBytes ≤ 5 MiB`.

**Native HTML5 drop zone (UI-SPEC explicit: no react-dropzone)**:

```tsx
'use client';
<label
  htmlFor="photo-input"
  className="rounded-lg border-2 border-dashed border-input bg-muted/40 w-full h-48 flex flex-col items-center justify-center gap-2"
  onDragOver={(e) => e.preventDefault()}
  onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
>
  <input id="photo-input" type="file" accept="image/*" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
  <ImageIcon className="size-8 text-muted-foreground" />
  <p className="text-sm text-muted-foreground">Нажмите или перетащите фото</p>
</label>
```

---

### Wave 3 — Sonner countdown toast (`publish-countdown-toast.tsx`)

**Analog:** no in-repo. RESEARCH.md Pattern 2 + UI-SPEC §Delayed-Publish Toast Spec.

**Constant toast id + in-place replace** (sonner 2.x — already installed):

```tsx
'use client';
import { toast } from 'sonner';
const id = 'publish-countdown' as const;

toast.custom(
  (t) => <CountdownToast toastId={t} onCancel={...} onElapse={...} />,
  { id, duration: Infinity },
);
// later, after elapse:
toast.success('Опубликовано', { id, duration: 3_000 });
```

**Sonner Toaster already mounted** at `apps/admin/app/layout.tsx` line 22 — no provider work needed.

**Critical** (Pitfall #3): always pass `{ id: 'publish-countdown' }` to every related `toast(...)` call so Sonner replaces in place rather than stacking.

---

### Wave 3 — Status badge component

**Analog:** `apps/admin/components/empty-state.tsx` (variant-prop pattern — `'empty' | 'forbidden'` discriminated union).

**Pattern (variant prop + className mapping)**:

```tsx
'use client';
import { Badge } from '@/components/ui/badge'; // installed via shadcn add in Wave 0
type Status = 'draft' | 'modified' | 'published' | 'paused' | 'archived';

const variantFor = (s: Status): { variant: 'outline' | 'default' | 'secondary' | 'ghost'; className?: string } => {
  if (s === 'modified') return { variant: 'outline', className: 'border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-400' };
  if (s === 'paused') return { variant: 'secondary' };
  if (s === 'archived') return { variant: 'ghost' };
  if (s === 'published') return { variant: 'default' };
  return { variant: 'outline' };
};

export const StatusBadge = ({ status }: { readonly status: Status }) => {
  const cfg = variantFor(status);
  return <Badge variant={cfg.variant} className={cfg.className} aria-label={`Статус: ${labelFor(status)}`}>{labelFor(status)}</Badge>;
};
```

---

### Wave 3 — Auto-save indicator (`auto-save-indicator.tsx`)

**Analog:** `apps/admin/app/(onboarding)/onboarding/brand/brand-form-client.tsx` `SlugAvailabilityHint` (lines 150-211) — discriminated-union state + inline `aria-live` text.

**Pattern**:

```tsx
'use client';
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'failed'; retry: () => void };

export const AutoSaveIndicator = ({ state }: { readonly state: SaveState }) => {
  if (state.kind === 'idle') return null;
  if (state.kind === 'saving') {
    return <p className="text-xs text-muted-foreground" aria-live="polite">Сохранение…</p>;
  }
  if (state.kind === 'saved') {
    return <p className="text-xs text-muted-foreground" aria-live="polite">Сохранено {formatAge(state.at)}</p>;
  }
  return (
    <p className="text-xs text-destructive" aria-live="polite">
      Не сохранено —{' '}
      <button type="button" className="underline" onClick={state.retry}>повторить</button>
    </p>
  );
};
```

---

### Wave 3 — Frontend Zod schemas (`lib/menu/zod-schemas.ts`)

**Analog:** `apps/admin/lib/actions/create-brand.ts` lines 10-13 (small client Zod schema mirroring api DTOs).

**Pattern — mirror `UpsertItemInputSchema` from `apps/api/.../application/dto.ts`** (apps/api lines 32-54):

```typescript
import { z } from 'zod';

export const ItemEditorFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(4096).nullable().default(null),
  categoryId: z.string().uuid(),
  basePrice: z.coerce.number().min(0), // Drizzle numeric → string; coerce client-side
  currency: z.string().regex(/^[A-Z]{3}$/),
  allergens: z.array(z.string().min(1).max(100)).max(50).default([]),
  proteins: z.coerce.number().min(0).max(999.99).nullable().default(null),
  fats: z.coerce.number().min(0).max(999.99).nullable().default(null),
  carbs: z.coerce.number().min(0).max(999.99).nullable().default(null),
  kcal: z.coerce.number().int().min(0).max(32000).nullable().default(null),
  nutritionEstimated: z.boolean().default(false),
});
export type ItemEditorForm = z.infer<typeof ItemEditorFormSchema>;
```

**Category depth refine pattern** (RESEARCH.md Pattern 5 + D-4b-01):

```typescript
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

---

## Shared Patterns

### Pattern S1: Server actions for catalog mutations — ALWAYS via `apiFetchInternal`

**Source:** `apps/admin/app/dashboard/(workspace)/settings/actions.ts` lines 59-73.
**Apply to:** every `*-action.ts` in Wave 3 that mutates catalog state.

**Rationale (Pitfall #3 from RESEARCH.md):** catalog routes are guarded by `InternalTokenGuard` (`apps/api/.../internal-catalog.controller.ts` line 67), not BA session. `INTERNAL_API_TOKEN` is server-only by `apps/CLAUDE.md` env rule + by `apps/admin/lib/env.ts` `import 'server-only'` lines 1-13.

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';

export async function xxxAction(...): Promise<ActionState> {
  const res = await apiFetchInternal<...>('/internal/v1/catalog/...', { method: 'POST'|'PATCH'|'DELETE', body });
  if (!res.ok) return { error: friendly(res.status, res.data as ProblemDetails | null), ... };
  revalidatePath('/dashboard/menu', 'layout'); // sticky bar diff staleness fix (Pitfall #4)
  return { error: null, ... };
}
```

### Pattern S2: Error mapping (controller-side)

**Source:** `apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts` lines 12-60.
**Apply to:** add new error types (e.g., `MenuCategoryAlreadyArchivedError`) when archive services raise them.

```typescript
case 'MenuCategoryNotFoundError':
  return new NotFoundException({ code: 'catalog.menu_category_not_found', message: err.message });
```

**Define the error class in `apps/api/.../domain/errors.ts`** with `readonly kind = 'NameError' as const`, extending the `CatalogDomainError` union (lines 49-55).

### Pattern S3: `wrapWith(mapCatalogError)` controller-level error wrapper

**Source:** `apps/api/.../internal-catalog.controller.ts` line 39.
**Apply to:** every new endpoint method (the file already has `const wrap = wrapWith(mapCatalogError)` ready).

```typescript
listCategories(@Query('parentId') parentId?: string): Promise<CategoryListResponseDto> {
  return wrap(() => this.listCategoriesService.execute({ parentId: parentId ?? null }));
}
```

### Pattern S4: `RestoZodValidationPipe` per-parameter validation

**Source:** `apps/api/.../internal-catalog.controller.ts` line 93.
**Apply to:** any new POST/PATCH endpoint that takes a body. Project CLAUDE.md note: per-param NOT global (transpiler limitation).

```typescript
@Body(new RestoZodValidationPipe(UpsertCategoryInputDto)) input: UpsertCategoryInputDto
```

### Pattern S5: NestJS module registration

**Source:** `apps/api/src/contexts/catalog/catalog.module.ts` lines 26-47.
**Apply to:** every new application service must be added to the `providers` array; new errors go into the existing `CatalogDomainError` union; new ports get `Symbol` token + interface in `domain/ports.ts`.

### Pattern S6: Tenant + brand resolution in services

**Source:** `apps/api/.../upsert-category.service.ts` lines 11-13.
**Apply to:** every new application service that reads or writes tenant-scoped data.

```typescript
const ctx = requireTenantContext();
const brandId = getBrandId() ?? null;
```

### Pattern S7: OpenAPI regen after backend changes

**Source:** RESEARCH.md + `package.json` script.
**Apply to:** end of Wave 1 and Wave 2 — run `pnpm openapi:check` and commit the regenerated `docs/api/openapi.yaml` + `packages/api-client/src/generated/api.ts`. CI gate `openapi-drift` enforces this.

### Pattern S8: `revalidatePath('/dashboard/menu', 'layout')` after EVERY catalog mutation

**Source:** RESEARCH.md Pitfall #4.
**Apply to:** every catalog server action (create / update / archive / stop-list toggle / publish / auto-save). Sticky-bar diff count is stale otherwise.

### Pattern S9: Russian copy + `EmptyState` for empty/forbidden lists

**Source:** `apps/admin/components/empty-state.tsx` + UI-SPEC §Copywriting Contract.
**Apply to:** every catalog list page (categories / items / modifier-groups / stop-list). Use exact copy from UI-SPEC §Empty states.

### Pattern S10: `revalidatePath` invalidates the layout segment (not just the page)

**Source:** RESEARCH.md Pattern 3.
**Apply to:** the sticky publish bar depends on the layout RSC re-rendering — pass `'layout'` as the second arg so the diff fetch re-runs.

---

## No Analog Found

Files with no close in-repo match. The planner should reference `RESEARCH.md` patterns + `UI-SPEC.md` directly:

| File                                                          | Role             | Data Flow     | Reason                                                                |
| ------------------------------------------------------------- | ---------------- | ------------- | --------------------------------------------------------------------- |
| `apps/admin/components/menu/sticky-publish-bar.tsx`           | client component | event-driven  | No prior sticky bar / fixed-position component in admin               |
| `apps/admin/components/menu/publish-countdown-toast.tsx`      | client component | event-driven  | No prior Sonner-custom-content + interval pattern                     |
| `apps/admin/components/menu/category-select.tsx`              | client component | request-resp. | No prior indented shadcn `Select` pattern (depth-2 dropdown)          |
| `apps/admin/components/menu/bju-row.tsx`                      | client component | n/a           | Form-row presentation; not a shared cross-app pattern                 |
| `apps/admin/app/.../items/[id]/photo-upload-client.tsx`       | client component | file-I/O      | No prior browser-direct-to-S3 PUT pattern in admin                    |
| `apps/admin/lib/menu/use-auto-save.ts`                        | client hook      | event-driven  | No prior RHF + debounce + race-id pattern (proxied via brand-form-client.tsx slug-availability debounce — same idea, different mechanism) |

**Planner action:** for each, use RESEARCH.md Patterns 1-5 + UI-SPEC.md sections referenced in the table.

---

## Metadata

**Analog search scope:** `apps/admin/**`, `apps/api/src/contexts/catalog/**`, `packages/db/{src,migrations}/**`, `apps/admin/components/ui/**`, `.planning/phases/04a-catalog-schema-api/**`.

**Files scanned:** 35 (controllers, services, DTOs, schemas, migrations, sidebar, layouts, form clients, action files, S3 adapter, env, api-server* helpers, empty-state, sonner Toaster mount, RESEARCH/UI-SPEC/CONTEXT for 4b, 04A-07-SUMMARY for endpoint surface).

**Pattern extraction date:** 2026-05-31

**Key architectural callouts for planner:**

1. **Server-action mutation path = `apiFetchInternal` (Pattern S1).** Never call `apiFetch` for catalog mutations — the route guard is `InternalTokenGuard`, not BA session. Mixed-mode is OK: RSC pages use `apiFetchInternal` for catalog reads (no per-user authz today) AND `apiFetch` for `/v1/me` identity probe (settings page lines 25-31 already does this combo).
2. **`apiFetchInternal` hardening is a Wave 0 prerequisite (Pitfall #7).** Mirror `executeWithRetry` from `apps/admin/lib/api-server.ts` lines 8-42 before any 4b code calls it under timeout-sensitive RSC paths.
3. **`revalidatePath('/dashboard/menu', 'layout')` on every catalog action (Pattern S8 + Pitfall #4).** Sticky bar diff count is stale otherwise.
4. **Sonner toast `id` is mandatory (Pitfall #3).** All publish-related calls must thread `id: 'publish-countdown'`.
5. **Category-status migration (0042) MUST run before any frontend code references it.** Wave-order: schema → DTO → service → controller → openapi regen → frontend.
6. **`menu_categories` composite tenant FK is already in place** (migration 0031). The new `status` column does NOT require additional composite-FK gymnastics; it is a single-column DDL.
7. **Photo upload bucket CORS (Pitfall #2) is a [BLOCKING] infra task** — planner injects it into Wave 2 between the `presignPut` adapter method and the photo-upload e2e smoke. Pattern: extend `infra/docker/minio-init.sh` for dev + add Terraform stub line for prod.
8. **Drizzle `numeric` is emitted as string (Pitfall #10).** Frontend Zod uses `z.coerce.number()` for `proteins`/`fats`/`carbs`/`basePrice`; server actions call `.toFixed(2)` before sending. The api Zod already coerces back to string for Drizzle.
9. **LocalizedText boundary helpers (Pitfall #9).** Add `apps/admin/lib/menu/localized.ts` with `toLocalizedText(plain, locale)` + `fromLocalizedText(value, locale)`. Default locale source needs verification — Open Question #1 in RESEARCH.md.
10. **No comments-for-comments-sake.** Project CLAUDE.md + MEMORY rule: WHY-comments only. Reference ADR-0020 sections or RES-XXX tickets for non-obvious choices.
