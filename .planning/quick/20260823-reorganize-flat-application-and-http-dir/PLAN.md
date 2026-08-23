---
slug: reorganize-flat-application-and-http-dir
created: 2026-08-23
type: quick
---

# Reorganize flat application/http directories

Founder asked to tidy the file architecture, starting from "locations should be a separate
entity". Measurement redirected the work twice, and both redirections are the point:

- **Locations are not the crowded place.** 6 of tenancy's 29 files. Ten more location files live in
  `identity` but they are _authorization_ — which locations a member may act in — not the entity. Moving
  those would put RBAC outside identity.
- **RBAC cannot be extracted either.** Almost every role service imports
  `infrastructure/better-auth/{auth-db,auth.config,role-api.bridge}` directly. Roles in this system _are_
  Better Auth roles — `tenant_role`, `dynamicAccessControl`, `auth.api.updateMemberRole`. A separate
  `permissions` service would need either its own access to Better Auth's tables or a cross-context call
  into identity's infrastructure. Both are worse than today. Nothing outside identity consumes RBAC
  directly, so there is no external pull either.
- **The real crowding is flat directories, not wrong boundaries.** `catalog/application` holds 27 files,
  `identity/application` 22, `identity/interfaces/http` 12.

So: no context boundaries move. Group within them, and make two moves that are genuinely justified.

## Tasks

### 1. Retire the one-line re-export

`identity/application/preset-roles.ts` is `export { PRESET_ROLES, type PresetRoleDefinition } from '@resto/domain';`
Delete it; point its importers at `@resto/domain`.

### 2. Move `effective-permissions.ts` to `packages/domain/src/rbac/`

53 lines, imports only `SYSTEM_ROLES` from `@resto/domain`. It is RBAC policy, and the rest of the policy
(`permissions`, `system-roles`, `preset-roles`, `non-delegatable`) already lives there.

### 3. `catalog/application` → five subfolders

`categories/` (4), `items/` (6), `modifiers/` (5), `availability/` (4), `publishing/` (4); the rest stay at
the root (`dto`, `slug-util`, `default-location-resolver`, `get-photo-upload-url`).

### 4. `identity/application` → three subfolders

`roles/` (13), `signup/` (5), `location-scope/` (4); the rest stay at the root.

### 5. `identity/interfaces/http` → group by audience

`roles/`, `me/`, `internal/`; guards stay where they are.

## Out of scope

`ordering/domain` has 9 files and stays flat — it is one aggregate and reads better whole. Grouping a
domain layer by theme usually hurts.

## Verification

`nx run-many -t typecheck --skip-nx-cache` must stay at 11/11 after every commit, and the affected test
suites must keep their counts. This refactor is import-path-only: no behaviour changes, no deletions other
than task 1.
