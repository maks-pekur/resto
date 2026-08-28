---
title: Upgrade better-auth past ten advisories — the dependency audit is red on every branch
date: 2026-08-26
priority: high
status: pending
---

# The audit gate went red on its own

`better-auth` is pinned at `~1.4.22`. On 23 August 2026 ten advisories landed against it, and CI's
`Dependency audit` job has failed on every branch since — `main` was green at 14:16 that day and red
by 19:57 without a commit in between. Nothing we wrote caused it and nothing we write will clear it.

The fixed versions span three lines — `<1.6.11`, `<1.6.13`, `>=1.1.3 <1.6.22` — so `>= 1.6.22` is
the floor. One is rated high: **unauthorized invitation** (GHSA-fmh4-wcc4-5jm3), which is exactly the
surface `/team` uses to add staff.

Advisories: GHSA-pw9m-5jxm-xr6h, GHSA-9h47-pqcx-hjr4, GHSA-86j7-9j95-vpqj, GHSA-7w99-5wm4-3g79,
GHSA-392p-2q2v-4372, GHSA-g38m-r43w-p2q7, GHSA-fmh4-wcc4-5jm3, GHSA-qq9h-g4jm-xgf3, and two more in
the same run.

## Why this is not a one-line bump

Better Auth runs in-process inside `apps/api` and we sit on more of its surface than most: the
organization plugin, `dynamicAccessControl` (deliberately disabled — AUDIT), a custom access-control
statement in `packages/domain/rbac`, `member_location_scope` on top of its member model, bearer
tokens, TOTP, and a set of database hooks. 1.4 → 1.6 is two minor lines of a library that has changed
its member and invitation model before; AUTH-09 in Phase 03 already turned on a hook that did not
exist in 1.4.22.

So: read the changelogs between 1.4.22 and the current 1.6.x, run the identity e2e suite, and walk
signup → invite → accept → role-at-location live before merging. It is a phase-shaped task, not a
`pnpm up`.

## Until then

Every PR carries a red `Dependency audit`. Do not let that become the normal colour of CI — either
schedule the upgrade or make the exception explicit and dated, so a _new_ advisory is still visible
against the noise.
