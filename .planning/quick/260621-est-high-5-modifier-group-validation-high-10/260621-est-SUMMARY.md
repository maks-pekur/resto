---
quick_id: 260621-est
title: 'HIGH-5 modifier group validation + HIGH-10 RLS-forced audit; HIGH-7/8/11 deferred'
status: complete
date: 2026-06-21
source_finding: .planning/notes/api-review-2026-06-15.md (HIGH-5, HIGH-10; HIGH-7/8/11 deferred)
commits:
  - c15014e fix(ordering): modifier group min/max/required + option minAmount (HIGH-5) + RLS-forced table audit (HIGH-10)
---

# Summary — last quick-fixable HIGHs

## HIGH-5 — modifier group selection validated server-side

The order path resolved the published menu (BLOCK-1) but accepted any modifier set:
group `minSelectable`/`maxSelectable`/`isRequired` and option `minAmount` were never
enforced. Extended `OrderingMenuSnapshot` with `modifierGroups` (min/max/required),
the adapter populates it, and `CreateOrderService` now, per item line:

- rejects (422 `ordering.modifier_selection_invalid`) when a required group has no
  selection, when a group's selection count is `< minSelectable` or `> maxSelectable`;
- rejects (422 `ordering.modifier_not_available`) an option whose `amount < minAmount`
  (maxAmount was already enforced in BLOCK-1).
  New domain error `OrderModifierSelectionInvalidError`. Schema semantics verified:
  `maxSelectable` is a real cap (default 1, CHECK `maxSelectable >= minSelectable >= 0`)
  — no "0 = unlimited" edge.

## HIGH-10 — every tenant-scoped table must have RLS ENABLED + FORCED

The boot enforcement only checked the role (`resto_app` NOBYPASSRLS), not per-table
RLS. Added a test in the canonical RLS net (`tenant-isolation.spec.ts`) that
enumerates every table with a `tenant_id` column from `pg_class` and asserts
`relrowsecurity AND relforcerowsecurity`. A future tenant-scoped table that forgets
`ENABLE/FORCE RLS` now fails CI. (All 22 current tables pass — `outbox_events` is
forced too, with a permissive SELECT policy, so no exclusions needed.)

## Verification

- `nx typecheck api` green; `pnpm openapi:check` in sync; ordering suite 71/71
  (+4 HIGH-5 cases: required-missing, too-many, minAmount, valid).
- HIGH-10 test passes against a fresh testcontainer (`tenant-isolation` 34/34).

## Deferred (not blindly fixable — need a decision or a milestone)

- **HIGH-8** (published-status content edits bypass menu-ETag → stale CDN ≤5min) —
  the menu version bumps **only** in `finalizeMenuPublish`; a direct
  `upsertItem status:'published'` changes live content without a bump. Fixing safely
  needs the founder's call on the intended edit model (force-draft vs auto-bump) so
  the just-shipped HTTP/CDN caching feature isn't broken. **Needs a decision.**
- **HIGH-7** (tenant/brand/owner lifecycle on one shared internal token, no
  per-operator RBAC/attribution) — overlaps identity/RBAC, which returns in MVP-2
  (ADR-0012). Deferred to MVP-2.
- **HIGH-11** (in-memory rate-limit, ineffective on multi-replica EKS) — needs a
  shared store; blocked by the "no Redis for MVP" decision. Deferred.

## Review status

All quick-fixable BLOCK + HIGH findings are now closed or explicitly deferred with
rationale. Remaining: HIGH-8 (decision), HIGH-7/HIGH-11 (deferred), BLOCK-3 = Phase 8.
