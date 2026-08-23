---
title: Drop the one-service-per-use-case convention; merge services by subject
date: 2026-08-23
priority: normal
blocks: nothing
blocked_by: Phase 10 closing — the refactor rebases code that Phase 10's remaining verification runs against
status: pending
---

# Drop the one-service-per-use-case convention

Founder decision, 2026-08-23, after asking why there are so many files. The measurement that produced it,
so it does not have to be redone:

- **66 service classes** in `apps/api/src/contexts`. Median 47 lines, but the 25th percentile is 27 and the
  smallest are 11–15.
- `archive-category.service.ts` is 15 lines of which **three** do work; the other twelve are imports,
  `@Injectable()`, the class declaration and a constructor that four sibling services declare identically.
- **19 of 66 are under 30 lines**, totalling 403 lines. Fourteen of those nineteen sit in four
  already-grouped catalog folders.

The convention is written in `CLAUDE.md` twice — "Service entry point: always `.execute(input)` — single
public method" and "All services are `@Injectable()` with a single `execute(input)` public method". It buys
uniform DI, isolated tests and one reason to change per class. It stops paying when the ceremony is four
times the logic.

**Decision:** services may expose several methods, grouped by subject. Target roughly 66 → 25.

## Why it waits for Phase 10

Phase 10 is one founder action from closing (a Stripe test connected account; see
`10-13-CHECKPOINT.md`). Its remaining work is a human walkthrough against running code. Rewriting the
service layer first would move the ground under that walkthrough for no benefit.

## Target grouping, already designed

Merge within the subject folders created on 2026-08-23; do not invent new boundaries.

| Context  | Merge into               | From                                                                                   |
| -------- | ------------------------ | -------------------------------------------------------------------------------------- |
| catalog  | `CategoriesService`      | archive, list, reorder, upsert (4)                                                     |
| catalog  | `ItemsService`           | archive, get, get-menu-item, list, upsert, upsert-item-size (6)                        |
| catalog  | `ModifiersService`       | get-group, list-groups, set-item-groups, upsert-group, upsert-option (5)               |
| catalog  | `AvailabilityService`    | menu-availability, stop-list, stop-list-aggregate, stop-list (4)                       |
| catalog  | `PublishingService`      | delayed-publish, draft-diff, published-menu, publish-menu (4)                          |
| identity | `RolesService`           | 8 role services (keep `list-members` separate if it grows)                             |
| identity | `SignupService`          | bootstrap-owner, signup, finalize-tenant-setup, slug-availability, list-my-tenants (5) |
| identity | `LocationScopeService`   | assign-location-role, list-member-location-roles, set-active-location (3)              |
| tenancy  | `TenantLifecycleService` | provision, archive, suspend, offboard (4)                                              |
| tenancy  | `LocationsService`       | provision-location, archive-location, list-locations (3)                               |
| ordering | leave as is              | 6 services, none thin except `get-order`                                               |
| payments | leave as is              | 5 services, all substantial; this is the money path                                    |

`notifications` and `audit` have one service each — nothing to do.

## What the refactor must also do

- Update every `*.module.ts` provider and export list.
- Update controllers: `service.execute(x)` becomes `service.someMethod(x)`. The compiler catches all of it.
- Merge the co-located specs. **Do not lose assertions** — record before/after counts per file, the same
  discipline phase 10.2 used.
- Rewrite the two `CLAUDE.md` lines **as part of the same change, not before**. Changing the convention text
  while the code still follows the old one leaves every agent looking at a mismatch and "fixing" it the
  wrong way.

## Not in scope

`ordering/domain` (9 files) and `identity/interfaces/http` (12 files) stay as they are — measured on
2026-08-23 and judged not worth splitting or merging. See
`.planning/quick/20260823-reorganize-flat-application-and-http-dir/SUMMARY.md`.
