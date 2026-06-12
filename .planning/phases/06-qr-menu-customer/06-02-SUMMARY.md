# Plan 06-02 — Summary

**Plan:** 06-02 — Expose `isStopListed` through the public `/v1/menu` chain (QRM-09)
**Status:** Complete
**Wave:** 2
**Requirements:** QRM-09 (stop-listed items must be shown disabled, not hidden)

## What was built

The blocker QRM-09 found in 06-RESEARCH: stop-listed items were _filtered out_ of `GET /v1/menu` entirely, so the customer site/qr-menu could never render them as "unavailable". Fixed by surfacing a per-item `isStopListed` flag end-to-end instead of dropping the rows.

- **Domain** (`catalog/domain/published-menu.ts`): added `readonly isStopListed: boolean` to `PublishedMenuItem`.
- **Repository** (`catalog/infrastructure/catalog-drizzle.repository.ts`): removed the `itemsRows = allItemsRows.filter(!stopped)` drop; the list builder now maps `allItemsRows` and sets `isStopListed: stoppedItemIds.has(r.id)`. The single-item builder (`findPublishedItem`) keeps returning `null` for stopped items per D-4a-10, so it sets `isStopListed: false`.
- **Controller Zod** (`catalog/interfaces/http/public-menu.controller.ts`): added `isStopListed: z.boolean()` to `PublishedMenuItemSchema`.
- **api-client types** (`packages/api-client/src/menu-types.ts`): added `isStopListed: boolean` to `MenuItemDto`.
- **Website wiring** (`apps/website/components/menu/menu-page-client.tsx`): `MenuItemCard` now receives `unavailable={item.isStopListed}`.
- **Contract artifacts regenerated:** `docs/api/openapi.yaml` (emit) + `packages/api-client/src/generated/api.ts` (codegen).

## Verification

- `nx typecheck api` — pass · `nx test api` — pass
- `nx typecheck api-client` — pass
- `nx typecheck website` — pass · `nx test website` — pass
- `grep isStopListed docs/api/openapi.yaml` — present (regenerated)

## Deviations / notes

- Two test fixtures (`test/unit/catalog/get-menu-item.service.spec.ts`, `apps/website/test/menu-render.spec.tsx`) needed `isStopListed: false` added to satisfy the now-required field. Both items left `false` — no behavior change to the existing assertions.
- `npx tsx src/openapi.ts` exits 1 from a bare shell (no `NATS_DISABLED`/`OTEL_DISABLED` → `app.close()` teardown throws _after_ the file is already written). Under the proper `EMIT_ENV`, `pnpm openapi:check`'s own `nx run api:openapi:emit` exits 0. Not a defect — the artifact is written correctly before teardown.
- `openapi:check` reports "drift" locally only because the regenerated artifacts are uncommitted at check time; clears on commit (this commit).

## Key files

- apps/api/src/contexts/catalog/{domain/published-menu.ts, infrastructure/catalog-drizzle.repository.ts, interfaces/http/public-menu.controller.ts}
- packages/api-client/src/{menu-types.ts, generated/api.ts}
- apps/website/components/menu/menu-page-client.tsx
- docs/api/openapi.yaml
