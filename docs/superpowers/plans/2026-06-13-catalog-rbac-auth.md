# Catalog RBAC Bypass Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all catalog (menu) mutation endpoints off the `@Public` internal-token controller onto a new authenticated `/v1/catalog` controller guarded by `@Permissions({ menu: [...] })`, so `staff` (no `menu` permission) can no longer create/edit/archive/publish menu items.

**Architecture:** A new `CatalogController` at `/v1/catalog` hosts the relocated mutation handlers (same application services, no service-layer change). The global `AuthGuard` + `PermissionsGuard` (already wired as `APP_GUARD`) enforce role permissions. The mutation routes are deleted from `internal-catalog.controller.ts` (reads stay). Admin's ~13 writing server actions switch from `apiFetchInternal` (internal token) to `apiFetch` (BA session). Brand-scope and reads are explicitly out of scope.

**Tech Stack:** NestJS 10 + Fastify, Better Auth org/RBAC, `@resto/domain` RBAC catalogue, Vitest e2e against testcontainer Postgres, Next.js admin server actions.

**Spec:** `docs/superpowers/specs/2026-06-13-catalog-rbac-auth-design.md`

**Project rule:** NO code comments (only a critical-WHY comment passes the bar; default to none).

---

## File Structure

| File                                                                                 | Responsibility                                       | Change                                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/api/test/e2e/helpers/operator-fixture.ts`                                      | E2E session helpers                                  | Add `addMemberWithRole` (sign up + invite + accept → role'd session cookie) |
| `apps/api/test/e2e/catalog-rbac.e2e.spec.ts`                                         | Proof: staff 403, owner 2xx, unauth 401 on mutations | Create                                                                      |
| `apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts`                | Authenticated mutation endpoints `/v1/catalog/*`     | Create                                                                      |
| `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts`       | Internal reads only                                  | Remove 13 mutation handlers                                                 |
| `apps/api/src/contexts/catalog/catalog.module.ts`                                    | DI wiring                                            | Register `CatalogController`                                                |
| `apps/api/test/e2e/catalog.e2e.spec.ts`                                              | Existing catalog e2e                                 | Re-point mutation setup to authed `/v1/catalog` + owner session             |
| `apps/admin/app/dashboard/(workspace)/menu/**` + `lib/menu/cancel-publish-action.ts` | ~13 writing server actions                           | `apiFetchInternal`→`apiFetch`, path `/internal/v1/catalog`→`/v1/catalog`    |
| `docs/api/openapi.yaml`, `packages/api-client/src/generated/**`                      | OpenAPI artefacts                                    | Regenerate                                                                  |

---

## Task 1: E2E helper to create a member with a given role

**Files:**

- Modify: `apps/api/test/e2e/helpers/operator-fixture.ts` (append)

The existing helpers only create an owner (`runBootstrap`). The RBAC test needs a `staff` session.

> **AS-BUILT note (reconciled 2026-06-13):** the original plan used Better Auth's `invite-member` → `accept-invitation` HTTP flow. That flow is **broken on this branch** — BA requires the inviter to be email-verified, but `runBootstrap` owners are `emailVerified: false`, so `invite-member` returns 403 (a pre-existing breakage; `identity-invitation.e2e.spec.ts` fails the same way — out of scope for AUDIT #1). The helper therefore uses the proven **member-row-insert** pattern already used by `identity-role-changed.e2e.spec.ts`: provision a throwaway tenant, `runBootstrap` the user there, insert a `schema.member` row binding them to the target tenant with the given role (via `AUTH_DRIZZLE_TOKEN`), then `signInAsOperator`. No comment block on the helper (project rule).

- [ ] **Step 1: Append the helper** (member-insert pattern)

```typescript
export const addMemberWithRole = async (
  app: NestFastifyApplication,
  input: {
    tenantId: string;
    internalToken: string;
    email: string;
    password: string;
    name: string;
    role: 'admin' | 'staff';
  },
): Promise<string> => {
  const throwawaySlug = `member-tenant-${randomUUID().slice(0, 8)}`;
  await provisionTenant(app, throwawaySlug, input.internalToken);
  const user = await runBootstrap({
    tenantSlug: throwawaySlug,
    email: input.email,
    password: input.password,
    name: input.name,
  });
  const authDb = app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
  await authDb.db.insert(schema.member).values({
    id: randomUUID(),
    organizationId: input.tenantId,
    userId: user.userId,
    role: input.role,
    createdAt: new Date(),
  });
  return signInAsOperator(app, input.email, input.password, input.tenantId);
};
```

Imports needed in `operator-fixture.ts`: `randomUUID` from `node:crypto`, `schema` from `@resto/db`, `AUTH_DRIZZLE_TOKEN` from `../../src/contexts/identity/identity.tokens`, type `AuthDrizzle` from `../../src/contexts/identity/infrastructure/better-auth/auth-db`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec nx typecheck api`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/e2e/helpers/operator-fixture.ts
git commit -m "test(api): e2e helper to create a member with a given role"
```

---

## Task 2: Failing RBAC e2e test for the new authenticated routes

**Files:**

- Create: `apps/api/test/e2e/catalog-rbac.e2e.spec.ts`

This is the proof the bypass is closed. It targets routes that do not exist yet → must fail.

- [ ] **Step 1: Write the test**

```typescript
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealStack } from './with-real-stack.setup';
import {
  startRealStack,
  stopRealStack,
  isDockerAvailable,
} from './with-real-stack.setup';
import {
  provisionTenant,
  runBootstrap,
  signInAsOperator,
  addMemberWithRole,
} from './helpers/operator-fixture';

const INTERNAL_TOKEN = 'test-internal-token';
const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) {
  console.warn('[catalog-rbac.e2e] Docker not available — skipping.');
}

suite(
  'Catalog RBAC — menu mutations require menu permission (AUDIT #1)',
  () => {
    let stack: RealStack;
    let ownerCookie: string;
    let staffCookie: string;
    let tenantId: string;

    beforeAll(async () => {
      stack = await startRealStack({ internalToken: INTERNAL_TOKEN });
      const slug = `cafe-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
      const staffEmail = `staff-${randomUUID().slice(0, 8)}@example.com`;
      const password = 'Sup3r-Secret-Pw!';

      const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
      tenantId = tenant.id;
      await runBootstrap({
        tenantSlug: slug,
        email: ownerEmail,
        password,
        name: 'Owner',
      });
      ownerCookie = await signInAsOperator(
        stack.app,
        ownerEmail,
        password,
        tenant.id,
      );
      staffCookie = await addMemberWithRole(stack.app, {
        ownerCookie,
        tenantId: tenant.id,
        email: staffEmail,
        password,
        name: 'Staff',
        role: 'staff',
      });
    }, 120_000);

    afterAll(async () => {
      if (stack) await stopRealStack(stack);
    });

    const itemPayload = {
      name: { en: 'Cola' },
      categoryId: null,
      price: { amount: '2.50', currency: 'USD' },
    };

    it('rejects an unauthenticated mutation with 401', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/items',
        headers: { 'x-tenant-id': tenantId },
        payload: itemPayload,
      });
      expect(res.statusCode).toBe(401);
    });

    it('forbids a staff operator from creating a menu item (403)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/items',
        headers: { cookie: staffCookie, 'x-tenant-id': tenantId },
        payload: itemPayload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('forbids a staff operator from publishing the menu (403)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/publish',
        headers: { cookie: staffCookie, 'x-tenant-id': tenantId },
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows an owner to create a menu item (2xx)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/items',
        headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
        payload: itemPayload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ id: string }>().id).toBeTruthy();
    });
  },
);
```

- [ ] **Step 2: Run it — verify it fails on the missing route**

Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog-rbac.e2e.spec.ts`
Expected: FAIL — owner/staff/unauth hit `404` (route `/v1/catalog/items` does not exist yet), so the 401/403/200 assertions fail.

> If `itemPayload` does not match `UpsertItemInputDto`, read `apps/api/src/contexts/catalog/application/dto.ts` for the exact shape and align the payload. The owner-2xx assertion is what pins the correct shape.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/api/test/e2e/catalog-rbac.e2e.spec.ts
git commit -m "test(api): RBAC e2e for authed catalog mutations (red)"
```

---

## Task 3: Create the authenticated `CatalogController` and register it

**Files:**

- Create: `apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts`
- Modify: `apps/api/src/contexts/catalog/catalog.module.ts:39`

The handlers are relocated verbatim from `internal-catalog.controller.ts`, minus `@Public`/`InternalTokenGuard`, plus `@RequiresTenantContext()` and per-route `@Permissions`.

- [ ] **Step 1: Create the controller**

```typescript
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { Permissions, RequiresTenantContext } from '../../../../shared/auth';
import {
  PhotoUploadUrlInputDto,
  PhotoUploadUrlResponseDto,
  ReorderCategoriesInputDto,
  ReorderCategoriesResponseDto,
  StopItemInputDto,
  UpsertCategoryInputDto,
  UpsertItemInputDto,
  UpsertItemSizeInputDto,
  UpsertModifierGroupInputDto,
  UpsertModifierOptionInputDto,
} from '../../application/dto';
import { ArchiveCategoryService } from '../../application/archive-category.service';
import { ArchiveItemService } from '../../application/archive-item.service';
import { DelayedPublishService } from '../../application/delayed-publish.service';
import { GetPhotoUploadUrlService } from '../../application/get-photo-upload-url.service';
import { ReorderCategoriesService } from '../../application/reorder-categories.service';
import { StopListService } from '../../application/stop-list.service';
import { UpsertCategoryService } from '../../application/upsert-category.service';
import { UpsertItemService } from '../../application/upsert-item.service';
import { UpsertItemSizeService } from '../../application/upsert-item-size.service';
import { UpsertModifierGroupService } from '../../application/upsert-modifier-group.service';
import { UpsertModifierOptionService } from '../../application/upsert-modifier-option.service';
import { wrapWith } from '../../../../shared/api/wrap';
import { mapCatalogError } from './error-mapping';

const wrap = wrapWith(mapCatalogError);

const IdResponseSchema = z.object({ id: z.string().uuid() });
class IdResponseDto extends createZodDto(IdResponseSchema) {}

const PublishScheduledResponseSchema = z.object({
  scheduled: z.boolean(),
  cancelAfterMs: z.number().int().nonnegative(),
});
class PublishScheduledResponseDto extends createZodDto(
  PublishScheduledResponseSchema,
) {}

const PublishCancelResponseSchema = z.object({ cancelled: z.boolean() });
class PublishCancelResponseDto extends createZodDto(
  PublishCancelResponseSchema,
) {}

@ApiTags('catalog')
@Controller('v1/catalog')
@RequiresTenantContext()
export class CatalogController {
  private static readonly PUBLISH_CANCEL_AFTER_MS = 5_000;

  constructor(
    @Inject(UpsertCategoryService)
    private readonly upsertCategory: UpsertCategoryService,
    @Inject(UpsertItemService) private readonly upsertItem: UpsertItemService,
    @Inject(UpsertModifierGroupService)
    private readonly upsertModifierGroup: UpsertModifierGroupService,
    @Inject(UpsertModifierOptionService)
    private readonly upsertModifierOption: UpsertModifierOptionService,
    @Inject(UpsertItemSizeService)
    private readonly upsertItemSize: UpsertItemSizeService,
    @Inject(StopListService) private readonly stopList: StopListService,
    @Inject(DelayedPublishService)
    private readonly delayed: DelayedPublishService,
    @Inject(ArchiveCategoryService)
    private readonly archiveCategoryService: ArchiveCategoryService,
    @Inject(ArchiveItemService)
    private readonly archiveItemService: ArchiveItemService,
    @Inject(GetPhotoUploadUrlService)
    private readonly getPhotoUploadUrlService: GetPhotoUploadUrlService,
    @Inject(ReorderCategoriesService)
    private readonly reorderCategoriesService: ReorderCategoriesService,
  ) {}

  @Post('categories')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiBody({ type: UpsertCategoryInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  category(
    @Body(new RestoZodValidationPipe(UpsertCategoryInputDto))
    input: UpsertCategoryInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertCategory.execute(input));
  }

  @Post('categories/reorder')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiBody({ type: ReorderCategoriesInputDto })
  @ApiOkResponse({ type: ReorderCategoriesResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  reorderCategories(
    @Body(new RestoZodValidationPipe(ReorderCategoriesInputDto))
    input: ReorderCategoriesInputDto,
  ): Promise<ReorderCategoriesResponseDto> {
    return wrap(() => this.reorderCategoriesService.execute(input));
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiBody({ type: UpsertItemInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  item(
    @Body(new RestoZodValidationPipe(UpsertItemInputDto))
    input: UpsertItemInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertItem.execute(input));
  }

  @Post('modifier-groups')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiBody({ type: UpsertModifierGroupInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  modifierGroup(
    @Body(new RestoZodValidationPipe(UpsertModifierGroupInputDto))
    input: UpsertModifierGroupInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertModifierGroup.execute(input));
  }

  @Post('modifier-options')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiBody({ type: UpsertModifierOptionInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  modifierOption(
    @Body(new RestoZodValidationPipe(UpsertModifierOptionInputDto))
    input: UpsertModifierOptionInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertModifierOption.execute(input));
  }

  @Post('item-sizes')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiBody({ type: UpsertItemSizeInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  itemSize(
    @Body(new RestoZodValidationPipe(UpsertItemSizeInputDto))
    input: UpsertItemSizeInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertItemSize.execute(input));
  }

  @Post('stop-list')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiBody({ type: StopItemInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  stopListAdd(
    @Body(new RestoZodValidationPipe(StopItemInputDto)) input: StopItemInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.stopList.stop(input));
  }

  @Delete('stop-list/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ menu: ['update'] })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  stopListRemove(@Param('itemId') itemId: string): Promise<void> {
    return wrap(() => this.stopList.unstop(itemId));
  }

  @Post('photo-upload-url')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiBody({ type: PhotoUploadUrlInputDto })
  @ApiOkResponse({ type: PhotoUploadUrlResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  photoUploadUrl(
    @Body(new RestoZodValidationPipe(PhotoUploadUrlInputDto))
    input: PhotoUploadUrlInputDto,
  ): Promise<PhotoUploadUrlResponseDto> {
    return wrap(() => this.getPhotoUploadUrlService.execute(input));
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiOkResponse({ type: PublishScheduledResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  publishMenu(): Promise<PublishScheduledResponseDto> {
    return wrap(() => {
      const ctx = requireTenantContext();
      const tenantId = TenantId.parse(ctx.tenantId);
      this.delayed.schedule(tenantId);
      return Promise.resolve({
        scheduled: true,
        cancelAfterMs: CatalogController.PUBLISH_CANCEL_AFTER_MS,
      });
    });
  }

  @Delete('publish')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiOkResponse({ type: PublishCancelResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  cancelPublishMenu(): Promise<PublishCancelResponseDto> {
    return wrap(() => {
      const ctx = requireTenantContext();
      const tenantId = TenantId.parse(ctx.tenantId);
      const cancelled = this.delayed.cancelPending(tenantId);
      return Promise.resolve({ cancelled });
    });
  }

  @Patch('categories/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ menu: ['delete'] })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  archiveCategory(@Param('id') id: string): Promise<void> {
    return wrap(() => this.archiveCategoryService.execute(id));
  }

  @Patch('items/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ menu: ['delete'] })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  archiveItem(@Param('id') id: string): Promise<void> {
    return wrap(() => this.archiveItemService.execute(id));
  }
}
```

- [ ] **Step 2: Register the controller** in `catalog.module.ts`

Modify the `controllers` array (currently `[PublicMenuController, InternalCatalogController]`) and add the import:

```typescript
import { CatalogController } from './interfaces/http/catalog.controller';
```

```typescript
  controllers: [PublicMenuController, InternalCatalogController, CatalogController],
```

- [ ] **Step 3: Run the RBAC e2e — owner now passes, staff/unauth enforced**

Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog-rbac.e2e.spec.ts`
Expected: PASS (401 unauth, 403 staff ×2, 200 owner).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts apps/api/src/contexts/catalog/catalog.module.ts
git commit -m "feat(api): authenticated /v1/catalog mutation controller with menu RBAC"
```

---

## Task 4: Remove the mutation handlers from the internal controller

**Files:**

- Modify: `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts`

Delete the 13 mutation handlers (the `@Post`/`@Delete`/`@Patch` methods: `category`, `reorderCategories`, `item`, `modifierGroup`, `modifierOption`, `itemSize`, `stopListAdd`, `stopListRemove`, `photoUploadUrl`, `publishMenu`, `cancelPublishMenu`, `archiveCategory`, `archiveItem`). Keep all `@Get` reads (`listCategories`, `listItems`, `getItem`, `listModifierGroups`, `getModifierGroup`, `listStopList`, `getDraftDiff`).

- [ ] **Step 1: Remove the 13 mutation methods** listed above from the class body.

- [ ] **Step 2: Prune now-unused imports/injections**

After removal, delete constructor injections and imports used only by mutations: `UpsertCategoryService`, `UpsertItemService`, `UpsertModifierGroupService`, `UpsertModifierOptionService`, `UpsertItemSizeService`, `StopListService`, `DelayedPublishService`, `ArchiveCategoryService`, `ArchiveItemService`, `GetPhotoUploadUrlService`, `ReorderCategoriesService`, the `requireTenantContext`/`TenantId` imports, `Body`/`Delete`/`Patch`/`Post`/`HttpCode` (keep `Get`, `Query`, `Param`, `Controller`, `Inject`, `UseGuards`, `HttpStatus`), `RestoZodValidationPipe`, the mutation DTO imports, and the `PUBLISH_*` static + DTO classes used only by mutations. Keep read services + read DTOs.

- [ ] **Step 3: Typecheck (catches any missed unused import)**

Run: `pnpm exec nx typecheck api`
Expected: PASS, zero unused-symbol errors. (`@typescript-eslint` will also flag leftovers in Step 5's lint.)

- [ ] **Step 4: Run the RBAC e2e again — still green** (the internal controller change must not affect the new routes)

Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog-rbac.e2e.spec.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `pnpm exec nx lint api`
Expected: PASS.

```bash
git add apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
git commit -m "refactor(api): drop mutation routes from internal catalog controller"
```

---

## Task 5: Re-point the existing catalog e2e to the authed path

**Files:**

- Modify: `apps/api/test/e2e/catalog.e2e.spec.ts`

This spec currently seeds data via `{ 'x-internal-token', 'x-tenant-slug': 'cafe-a' }` against `/internal/v1/catalog/*` mutation routes that no longer exist. Switch its mutation calls to an authenticated owner session on `/v1/catalog/*`. Reads it performs (e.g. `GET /v1/menu`, internal GET reads) stay unchanged.

- [ ] **Step 1: Add owner-session setup** in the spec's `beforeAll` (after the stack starts). Provision the tenant it uses (it currently relies on a pre-seeded `cafe-a`; replace with an explicit provision + bootstrap so the session is real):

```typescript
import {
  provisionTenant,
  runBootstrap,
  signInAsOperator,
} from './helpers/operator-fixture';
// ...in beforeAll, after stack start:
const slug = 'cafe-a';
const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
const password = 'Sup3r-Secret-Pw!';
const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
await runBootstrap({
  tenantSlug: slug,
  email,
  password,
  name: 'Catalog Owner',
});
const ownerCookie = await signInAsOperator(
  stack.app,
  email,
  password,
  tenant.id,
);
const authed = { cookie: ownerCookie, 'x-tenant-id': tenant.id };
```

- [ ] **Step 2: Replace each mutation call.** For every `app.inject` that targets a mutation route, change:
  - `url: '/internal/v1/catalog/<x>'` → `url: '/v1/catalog/<x>'`
  - `headers: { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' }` → `headers: authed`
    Leave GET reads and `/v1/menu` calls untouched. (The cross-tenant "cafe-b" sniff read stays as-is — it reads, not mutates.)

- [ ] **Step 3: Run the spec**

Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog.e2e.spec.ts`
Expected: PASS. If a mutation now needs `menu` perms the owner already has them, so 2xx holds.

> If the spec depended on a pre-seeded `cafe-a` tenant from a global seed, provisioning it explicitly here may collide (409). If so, use a unique `slug` per run (`cafe-${randomUUID().slice(0,8)}`) and update any hard-coded `cafe-a` host reads in the same spec to the new slug.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/e2e/catalog.e2e.spec.ts
git commit -m "test(api): re-point catalog e2e mutations to authed /v1/catalog"
```

---

## Task 6: Switch admin writing server actions to the authed path

**Files (writing actions — change these):**

- `apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-action.ts`
- `apps/admin/app/dashboard/(workspace)/menu/items/archive-item-action.ts`
- `apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-size-action.ts`
- `apps/admin/app/dashboard/(workspace)/menu/items/[id]/upsert-item-modifier-groups-action.ts` (write leg only — the `POST /items` call; leave its `GET /items/:id` read on `apiFetchInternal`)
- `apps/admin/app/dashboard/(workspace)/menu/items/[id]/photo-upload-url-action.ts`
- `apps/admin/app/dashboard/(workspace)/menu/items/toggle-stop-list-action.ts` (both POST and DELETE legs)
- `apps/admin/app/dashboard/(workspace)/menu/stop-list/reset-stop-list-action.ts` (the DELETE legs only; leave the `GET stop-list` read on internal)
- `apps/admin/app/dashboard/(workspace)/menu/categories/upsert-category-action.ts`
- `apps/admin/app/dashboard/(workspace)/menu/categories/archive-category-action.ts`
- `apps/admin/app/dashboard/(workspace)/menu/categories/reorder-category-action.ts`
- `apps/admin/app/dashboard/(workspace)/menu/modifier-groups/upsert-modifier-group-action.ts`
- `apps/admin/app/dashboard/(workspace)/menu/modifier-groups/[id]/upsert-modifier-option-action.ts`
- `apps/admin/lib/menu/cancel-publish-action.ts` (the `DELETE /publish` call)
- The publish action (search: `grep -rn "/internal/v1/catalog/publish'" apps/admin --include='*.ts'` — the `POST /publish` caller)

**Transform (mechanical, identical per call):**

1. Import: `import { apiFetchInternal } from '@/lib/api-server-internal';` → `import { apiFetch } from '@/lib/api-server';`
2. Call: `apiFetchInternal<T>('/internal/v1/catalog/<x>', { ... })` → `apiFetch<T>('/v1/catalog/<x>', { ... })`
3. Leave any READ call in the same file (`GET /internal/v1/catalog/...`) on `apiFetchInternal` unchanged.

**Canonical example — `upsert-item-action.ts`:**

Before:

```typescript
import { apiFetchInternal } from '@/lib/api-server-internal';
// ...
const res = await apiFetchInternal<UpsertItemResponse>(
  '/internal/v1/catalog/items',
  {
    method: 'POST',
    body: JSON.stringify(payload),
  },
);
```

After:

```typescript
import { apiFetch } from '@/lib/api-server';
// ...
const res = await apiFetch<UpsertItemResponse>('/v1/catalog/items', {
  method: 'POST',
  body: JSON.stringify(payload),
});
```

- [ ] **Step 1: Confirm `apiFetch` signature matches `apiFetchInternal`**

Run: `grep -n "export.*apiFetch\b" apps/admin/lib/api-server.ts`
Read the signature; both take `(path, init?)` and return `Promise<T>`. If `apiFetch`'s option object differs (e.g. an extra arg), adapt the call sites accordingly. (Reads in admin already use `apiFetch` — see `getActiveTenantId` — so the shape is established.)

- [ ] **Step 2: Apply the transform** to each writing call listed above.

- [ ] **Step 3: Update admin unit tests.** Any test asserting a mutation action called `apiFetchInternal` with `/internal/v1/catalog/...` must now assert `apiFetch` with `/v1/catalog/...`.

Run: `grep -rln "internal/v1/catalog" apps/admin/test`
For each hit that targets a **mutation**, update the mock/assertion to `apiFetch` + `/v1/catalog/...`.

- [ ] **Step 4: Typecheck + test admin**

Run: `pnpm exec nx typecheck admin && pnpm exec nx test admin`
Expected: PASS.

- [ ] **Step 5: Verify no writing call still uses the internal path**

Run: `grep -rn "apiFetchInternal" apps/admin/app/dashboard/\(workspace\)/menu apps/admin/lib/menu`
Expected: only READ calls remain (GET list/detail/draft-diff/stop-list-read). No `method: 'POST'|'PATCH'|'DELETE'` under `apiFetchInternal`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): call authed /v1/catalog for menu mutations"
```

---

## Task 7: Regenerate OpenAPI artefacts

**Files:**

- Modify (generated): `docs/api/openapi.yaml`, `packages/api-client/src/generated/**`

New `/v1/catalog/*` routes added and internal mutation routes removed → the committed OpenAPI artefact drifts; CI's `openapi-drift` job fails otherwise.

- [ ] **Step 1: Regenerate**

Run: `pnpm openapi:generate`
(If the script name differs, `grep -n "openapi" package.json` — the drift gate runs `pnpm openapi:check`; the generate counterpart writes the artefacts.)

- [ ] **Step 2: Confirm no drift remains**

Run: `pnpm openapi:check`
Expected: PASS (no diff).

- [ ] **Step 3: Commit**

```bash
git add docs/api/openapi.yaml packages/api-client/src/generated
git commit -m "chore(api): regenerate OpenAPI for /v1/catalog routes"
```

---

## Task 8: Full verification

- [ ] **Step 1: Typecheck + lint the affected projects**

Run: `pnpm exec nx run-many -t typecheck lint -p api admin db domain events`
Expected: PASS.

- [ ] **Step 2: Run the catalog e2e suites**

Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog-rbac.e2e.spec.ts test/e2e/catalog.e2e.spec.ts`
Expected: PASS — staff 403 ×2, unauth 401, owner 2xx; existing catalog flows green.

- [ ] **Step 3: Confirm the bypass is gone**

Run: `grep -rn "@Post\|@Patch\|@Delete" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts`
Expected: no matches (only `@Get` reads remain).

- [ ] **Step 4: OpenAPI drift gate**

Run: `pnpm openapi:check`
Expected: PASS.

---

## Out of scope (do NOT touch)

- Brand-scope enforcement, `member_brand_scope` population, `@RequireBrand` (#15/#2/#3).
- Catalog read endpoints (stay on the internal-token path).
- Any other AUDIT finding.

## Definition of done

- A signed-in `staff` operator receives **403** on `POST /v1/catalog/items` and `POST /v1/catalog/publish`; an `owner` receives 2xx; an unauthenticated request receives 401 — all proven by `catalog-rbac.e2e.spec.ts`.
- `internal-catalog.controller.ts` exposes **only** `@Get` reads.
- Admin menu mutations go through `apiFetch` (BA session) on `/v1/catalog/*`.
- `typecheck`, `lint`, catalog e2e, and `openapi:check` all green.
- No new code comments.
