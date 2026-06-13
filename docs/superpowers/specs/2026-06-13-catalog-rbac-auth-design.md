# Design: Close catalog RBAC bypass (AUDIT #1)

**Date:** 2026-06-13
**Source:** `.planning/AUDIT.md` finding #1 (HIGH, security)
**Status:** Approved — ready for implementation plan

## Problem

Every catalog (menu) mutation in RestOS bypasses RBAC. The admin app calls
`internal-catalog.controller.ts`, which is `@Public() @UseGuards(InternalTokenGuard)`
at the controller level. `@Public()` short-circuits the global `AuthGuard` /
`PermissionsGuard` / `BrandScopeGuard`, and `InternalTokenGuard` only checks a
shared server token. Result: any signed-in operator — including `staff`, whose
role grants **no `menu` permission at all** — can create / edit / archive /
publish menu items and toggle the stop-list. This is the only currently
exploitable privilege-escalation path inside a tenant and a direct blocker for
taking a customer's money.

## Key facts (verified against current code)

- The full RBAC model already exists and is correct (`packages/domain/src/rbac/`):
  `PERMISSIONS_STATEMENT.menu = ['read','create','update','delete']`;
  `owner`/`admin` hold all four, `staff` holds none.
- The global `AuthGuard` + `PermissionsGuard` + `BrandScopeGuard` are already
  wired as `APP_GUARD` (`identity-http.module.ts`).
- Authenticated operator endpoints with `@Permissions({...})` already work and
  are the established pattern (`me-brands.controller.ts`, `tenants.controller.ts`).
- The admin app is the **only** caller of `internal/v1/catalog/*` (seed CLI writes
  via DB, not HTTP). Admin uses the internal-token path for both reads and writes.
- `apiFetch` (admin, `lib/api-server.ts`) already forwards the BA session cookie
  and `x-tenant-id` (from the session's `activeOrganizationId`).

So the fix is "apply decorators that already work elsewhere," not new infrastructure.

## Scope (locked via discussion)

- **IN:** Role-based RBAC on catalog **mutations** only. Close the bypass so
  `staff` (and any role lacking `menu` perms) is denied; `owner`/`admin` allowed.
- **OUT (explicitly deferred):**
  - Brand-scope enforcement (`@RequireBrand` / `BrandScopeGuard`). `member_brand_scope`
    is never populated yet (AUDIT #15), so the guard has nothing to check. Deferred
    to a later multi-brand block (#15 + #2 + #3). `x-brand-slug` stays cookie-sourced;
    mutations write with the same brand as today — **not made worse**, just role-gated.
  - Catalog **read** endpoints — lower risk (already tenant-scoped); stay on the
    internal-token path for now. Dual-path is accepted as temporary.

## Architecture

```
BEFORE
  admin (reads + writes) --apiFetchInternal(x-internal-token)--> [@Public] internal/v1/catalog/*  --> services

AFTER
  admin reads   --apiFetchInternal--> internal/v1/catalog/*   (GET only — unchanged)
  admin writes  --apiFetch(session)--> /v1/catalog/*  [AuthGuard + @Permissions({menu:[...]})] --> same services
```

## Components

### 1. New `catalog.controller.ts` — `/v1/catalog`, authenticated

- Path prefix `v1/catalog`, **not** `@Public`, so the global `AuthGuard` +
  `PermissionsGuard` run.
- Hosts the relocated mutation handlers (below). Injects the **same** application
  services as the internal controller — no service-layer change.

### 2. `internal-catalog.controller.ts` — remove mutation routes

- Delete the ~13 mutation handlers from this controller (keep only the GET reads).
  This fully closes the API-level bypass for mutations (no dead-but-reachable route).

### 3. Mutation routes to relocate, with permission mapping

| Route                    | Method        | `@Permissions`         |
| ------------------------ | ------------- | ---------------------- |
| `items`                  | POST (upsert) | `{ menu: ['update'] }` |
| `items/:id/archive`      | PATCH         | `{ menu: ['delete'] }` |
| `categories`             | POST (upsert) | `{ menu: ['update'] }` |
| `categories/reorder`     | POST          | `{ menu: ['update'] }` |
| `categories/:id/archive` | PATCH         | `{ menu: ['delete'] }` |
| `modifier-groups`        | POST          | `{ menu: ['update'] }` |
| `modifier-options`       | POST          | `{ menu: ['update'] }` |
| `item-sizes`             | POST          | `{ menu: ['update'] }` |
| `stop-list`              | POST          | `{ menu: ['update'] }` |
| `stop-list/:itemId`      | DELETE        | `{ menu: ['update'] }` |
| `photo-upload-url`       | POST          | `{ menu: ['update'] }` |
| `publish`                | POST          | `{ menu: ['update'] }` |
| `publish`                | DELETE        | `{ menu: ['update'] }` |

Rationale: `owner`/`admin` hold every `menu` action, `staff` holds none, so any
non-read action cleanly denies `staff`. `update` for modify/publish, `delete`
for archive — semantically aligned and free.

### 4. Admin client — switch ~13 mutation server actions

- In each writing server action, change `apiFetchInternal` → `apiFetch` and the
  path `/internal/v1/catalog/*` → `/v1/catalog/*`.
- Reads (page.tsx loaders, list endpoints, and read-then-write actions that GET
  an item first) stay on `apiFetchInternal`. Mixed read-internal / write-authed
  within one action is fine.
- Files (writing actions): `upsert-item-action.ts`, `archive-item-action.ts`,
  `upsert-item-size-action.ts`, `upsert-item-modifier-groups-action.ts` (write leg
  only), `photo-upload-url-action.ts`, `toggle-stop-list-action.ts`,
  `reset-stop-list-action.ts` (write legs), `upsert-category-action.ts`,
  `archive-category-action.ts`, `reorder-category-action.ts`,
  `upsert-modifier-group-action.ts`, `upsert-modifier-option-action.ts`,
  `lib/menu/cancel-publish-action.ts`, and the publish action.

## Data flow (authenticated mutation)

1. Admin server action calls `apiFetch('/v1/catalog/items', { method: 'POST', ... })`.
2. `apiFetch` forwards the BA session cookie + `x-tenant-id` + `x-brand-slug`.
3. `TenantContextMiddleware` binds tenant (+ brand from `x-brand-slug`, tenant-verified per RES-173).
4. `AuthGuard` builds the operator `Principal` (incl. `baseRole`) from the session.
5. `PermissionsGuard` checks `@Permissions({ menu: [...] })` against the role → `staff` ⇒ 403.
6. Handler runs the unchanged application service inside `ScopedTx`.

## Error handling

- Unauthenticated / customer / anonymous principal on `/v1/catalog/*` → 401/403 via `AuthGuard`.
- `staff` (or any role without the required `menu` action) → 403 via `PermissionsGuard`,
  surfaced as RFC 7807 problem+json by `ProblemDetailsFilter`.
- Existing domain-error → HTTP mapping (`catalog/interfaces/http/error-mapping.ts`) is reused unchanged.

## Testing

- **e2e (the proof the hole is closed):** `staff` operator → **403** on
  `POST /v1/catalog/items` and `POST /v1/catalog/publish`; `owner` and `admin` → 2xx.
  This is the regression net AUDIT #15 noted is missing.
- Update existing `apps/api/test/e2e/catalog.e2e.spec.ts` mutation calls to the new
  `/v1/catalog/*` path (+ now require an authenticated session, not the internal token).
- Admin unit tests for the migrated server actions: assert they call `apiFetch`
  (session path) with the new path.

## Loose ends

- **OpenAPI drift gate** (CI): new `/v1/catalog/*` routes + removed internal mutation
  routes → regenerate `docs/api/openapi.yaml` + `packages/api-client` via `pnpm openapi:generate`.
- No DB migration. No domain/permission change (the `menu` perms already exist).

## As-built decisions

- **Upsert endpoints gate on `menu:['update']`, not `menu:['create']`.** The `menu`
  permission catalogue defines a distinct `create` action, but every upsert route
  (create-or-update by nature) requires `update`. For the three system roles this is
  exactly correct (owner/admin hold all `menu` actions, staff holds none → DoD met),
  and tenant-defined custom roles are effectively unreachable today (AUDIT #18:
  `createRole` needs an `ac:['create']` grant no role has). The `create`/`update`
  split for upserts is deferred to if/when custom roles ship (would require splitting
  create vs update at the service boundary). Conscious decision, not an oversight.

## Out of scope (do not touch)

- Brand-scope enforcement, `member_brand_scope` population, `@RequireBrand` (#15/#2/#3).
- Catalog read endpoints, slug uniqueness (#3), brand-ownership on writes (#2).
- All other AUDIT findings.
