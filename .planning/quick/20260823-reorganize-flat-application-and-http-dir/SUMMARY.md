---
slug: reorganize-flat-application-and-http-dir
completed: 2026-08-23
status: complete
---

# Reorganize flat application directories

Started from "locations should be a separate entity". Measurement redirected the work twice, and the
redirections are the substance of this task.

## What the measurement said

**Locations are not the crowded place.** 6 of tenancy's 29 files. Ten more location-named files live in
`identity`, but they are authorization — which locations a member may act in — not the entity. Moving those
would put RBAC outside identity.

**RBAC cannot be extracted into a `permissions` service.** Almost every role service imports
`infrastructure/better-auth/{auth-db,auth.config,role-api.bridge}` directly. Roles in this system _are_
Better Auth roles: `tenant_role`, `dynamicAccessControl`, `auth.api.updateMemberRole`. RBAC has no
independent persistence — it is a facade over the organization plugin. A separate service would need
either its own access to Better Auth's tables or a cross-context call into identity's infrastructure. Both
are worse than the status quo: a context whose infrastructure lives in another context is not a boundary.
Nothing outside identity consumes RBAC directly, so there is no external pull either.

**The crowding was flat directories, not wrong boundaries.** `catalog/application` 27 files,
`identity/application` 22, `identity/interfaces/http` 12.

## What was done

| Change                                                                                          | Before      | After                               |
| ----------------------------------------------------------------------------------------------- | ----------- | ----------------------------------- |
| `identity/application/preset-roles.ts` deleted — it was a one-line re-export of `@resto/domain` | 1 file      | 0                                   |
| `effective-permissions.ts` moved to `packages/domain/src/rbac/`                                 | in identity | with the rest of the RBAC policy    |
| `catalog/application` grouped by subject                                                        | 27 flat     | 5 folders + 4 root files            |
| `identity/application` grouped by capability                                                    | 20 flat     | 3 folders + 2 root files + `ports/` |

`catalog/application`: `categories/` (4), `items/` (6), `modifiers/` (5), `availability/` (4),
`publishing/` (4). Left at the root: `dto`, `slug-util`, `default-location-resolver`,
`get-photo-upload-url`.

`identity/application`: `roles/` (9), `signup/` (5), `location-scope/` (4). Left at the root: `dto`,
`revoke-user-sessions`.

The `effective-permissions` move is the only one that changes an architectural fact: RBAC _policy_ now
lives entirely in `packages/domain/src/rbac/` alongside `permissions`, `system-roles`, `preset-roles` and
`non-delegatable`. What stays in identity is the Better Auth glue, which is where it belongs.

## What was deliberately not done

**`identity/interfaces/http` (12 files) left flat.** Three are infrastructure (`index`, `error-mapping`,
`better-auth.handler`), leaving nine controllers. Nine is not a heap, and every group boundary invites
disagreement. The value curve that clearly justified splitting 27 does not justify splitting 12.

**`ordering/domain` (9 files) left flat.** It is one aggregate and reads better whole; grouping a domain
layer by theme usually hurts.

**No bounded context was created or moved.** The two candidates — a `locations` context and a `permissions`
service — were both rejected on evidence, above.

## Verification

Import-path-only refactor: no behaviour changes, one deletion (the re-export). After every commit:

- `nx run-many -t typecheck --skip-nx-cache` — **11/11 projects**
- `eslint` on the touched trees — **0 errors**
- `packages/domain` **131/131**, `packages/db` unit **49/49**, `apps/api` unit **519/519**

The compiler is the real safety net here: every move was verified by driving the typecheck to zero before
committing, and the specs were repointed as part of the same change rather than left for later.

## Commits

- `a3001d7d` retire the preset-roles re-export
- `500bf593` move effective-permissions into the rbac policy module
- `ff24327f` group catalog application services by subject
- `445fd78a` group identity application services by capability

## Follow-up queued, not done here

The founder's next question — "why so many files?" — has a different answer from "they are in the wrong
folders": there are 66 service classes because `CLAUDE.md` mandates one `execute(input)` per service.
Measured: 19 of them are under 30 lines, and `archive-category.service.ts` is 15 lines of which three do
work.

Decision taken 2026-08-23: drop that convention and merge services by subject, roughly 66 → 25. Deferred
until **Phase 10 closes**, because Phase 10's remaining work is a human walkthrough against running code and
rewriting the service layer first would move the ground under it.

The target grouping is already designed and recorded in
`.planning/todos/pending/service-granularity-refactor.md` so the analysis does not get redone.
