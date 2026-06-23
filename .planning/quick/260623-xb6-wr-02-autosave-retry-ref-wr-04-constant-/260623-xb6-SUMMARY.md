---
phase: quick-260623-xb6
plan: 01
subsystem: api-shared, admin-menu
tags: [security, timing-safe, autosave, react-hooks]
dependency_graph:
  requires: []
  provides: [constant-time-equal shared module, ref-stable autosave retry]
  affects: [internal-token.guard, tenant-context.middleware, use-auto-save]
tech_stack:
  added: []
  patterns: [shared utility extraction, useRef-stable callback]
key_files:
  created:
    - apps/api/src/shared/api/constant-time-equal.ts
    - apps/api/src/shared/api/constant-time-equal.spec.ts
    - apps/admin/src/lib/menu/use-auto-save.spec.ts
  modified:
    - apps/api/src/shared/api/internal-token.guard.ts
    - apps/api/src/shared/tenant-context.middleware.ts
    - apps/admin/src/lib/menu/use-auto-save.ts
decisions:
  - WR-04: extracted constantTimeStringEqual into shared module; both call sites import it; no behavior change
  - WR-02: runSaveRef stores the current runSave closure; retry dispatches through the ref so it always calls the latest closure
metrics:
  duration: ~15min
  completed: 2026-06-24
  tasks_completed: 2
  files_changed: 6
---

# Quick Task 260623-xb6 Summary

Closed two 07.6-REVIEW warnings: WR-04 (token-length timing oracle in middleware) and WR-02 (autosave retry identity not rebinding to replaced handlers).

## Tasks

### Task 1 — WR-04: Share constant-time token compare (commit c03f6d1)

Extracted `constantTimeStringEqual` + `COMPARE_PAD_LEN` verbatim from `internal-token.guard.ts` into a new shared module `apps/api/src/shared/api/constant-time-equal.ts`. Both `internal-token.guard.ts` and `tenant-context.middleware.ts` now import from there.

Deleted the vulnerable `timingSafeEqualString` from the middleware — it had an `if (a.length !== b.length) return false` early-return that leaked `INTERNAL_API_TOKEN` length via timing. The new shared implementation pads both inputs to 256 bytes before calling `timingSafeEqual`, then re-asserts length equality in code.

New spec (5 tests): equal strings, same-length different bytes, different-length (no short-circuit), oversized input, empty vs empty.

Existing middleware spec (10 tests): all pass unchanged.

### Task 2 — WR-02: Ref-stable autosave retry (commit 340388e)

Added `runSaveRef = useRef<() => void>(() => undefined)` alongside the existing `onPersistRef`/`onStateRef`. Inside the `[form]` effect, `runSaveRef.current = runSave` is assigned after each `runSave` closure is created. The failed-state callback changed from `retry: runSave` (stale identity) to `retry: () => { runSaveRef.current(); }` (dispatches to current closure).

No other behavior change — `runSave` already reads `onPersistRef.current`/`onStateRef.current`, so it was already prop-current in its body; the bug was only that a retry captured at failure time couldn't pick up a new `runSave` created by a `[form]` effect re-run after `form` was replaced.

New spec (3 tests):

1. Change event → debounce → failed save emits `{ kind: 'failed', retry: fn }`.
2. Calling `retry()` triggers a fresh save (saving → failed cycle).
3. Re-rendering with a new `onPersist` (spy B) and then calling the previously-captured `retry` invokes spy B, not spy A — proves ref-stable rebinding.

## Verification Output

```
api:typecheck   PASS
admin:typecheck PASS

api specs (constant-time-equal + middleware):
  ✓ test/unit/shared/tenant-context.middleware.spec.ts (10 tests)
  ✓ src/shared/api/constant-time-equal.spec.ts (5 tests)
  Tests  15 passed

admin spec (use-auto-save):
  ✓ src/lib/menu/use-auto-save.spec.ts (3 tests)
  Tests  3 passed

grep "a.length !== b.length" tenant-context.middleware.ts → NOT FOUND
```

## Deviations from Plan

None — executed exactly as specified.

## Self-Check: PASSED

- `apps/api/src/shared/api/constant-time-equal.ts` — exists
- `apps/api/src/shared/api/constant-time-equal.spec.ts` — exists
- `apps/admin/src/lib/menu/use-auto-save.spec.ts` — exists
- Commit `c03f6d1` — exists (refactor(api): share constant-time token compare)
- Commit `340388e` — exists (fix(admin): make autosave retry rebind to current handlers)
