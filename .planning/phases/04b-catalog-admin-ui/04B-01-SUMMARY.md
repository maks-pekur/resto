---
phase: 04b-catalog-admin-ui
plan: 01
subsystem: ui
tags:
  [
    admin,
    shadcn,
    react-hook-form,
    hookform-resolvers,
    abortsignal,
    retry,
    server-only,
    nextjs,
    vitest,
  ]

requires:
  - phase: 03-auth-foundation
    provides: apiFetchInternal (server-only helper), apps/admin scaffold, shadcn baseline (new-york / neutral)
provides:
  - react-hook-form 7.76.1 + @hookform/resolvers 5.4.0 installed under apps/admin
  - shadcn primitives badge / table / tabs / switch / form / select / dialog / progress / textarea scaffolded under apps/admin/components/ui/
  - apiFetchInternal hardened with AbortSignal.timeout (10s GET / 30s mutation) and one retry on idempotent GET 5xx
  - InternalRequestOptions.method now accepts 'PATCH' (Wave 1 archive endpoints unblock)
  - shadcn ESLint relaxation extended to cover stock template rules (clean upgrade path preserved)
affects:
  [
    04b-catalog-admin-ui Wave 1 (catalog form work),
    04b-catalog-admin-ui Wave 2 (publish flows),
    all future apps/admin work using internal channel,
  ]

tech-stack:
  added:
    [
      react-hook-form@^7.76.1,
      '@hookform/resolvers@^5.4.0',
      shadcn primitives x9,
    ]
  patterns:
    - 'executeWithRetry helper mirrored from apps/admin/lib/api-server.ts into apps/admin/lib/api-server-internal.ts'
    - 'AbortError + TimeoutError collapsed to { status: 0, ok: false, data: null } for uniform caller handling'
    - 'shadcn override block in eslint.config.mjs extended to keep `pnpm dlx shadcn add` a clean upgrade path'

key-files:
  created:
    - apps/admin/components/ui/badge.tsx
    - apps/admin/components/ui/dialog.tsx
    - apps/admin/components/ui/form.tsx
    - apps/admin/components/ui/progress.tsx
    - apps/admin/components/ui/select.tsx
    - apps/admin/components/ui/switch.tsx
    - apps/admin/components/ui/table.tsx
    - apps/admin/components/ui/tabs.tsx
    - apps/admin/components/ui/textarea.tsx
    - apps/admin/test/api-server-internal.spec.ts
    - .planning/phases/04b-catalog-admin-ui/deferred-items.md
  modified:
    - apps/admin/package.json
    - pnpm-lock.yaml
    - apps/admin/eslint.config.mjs
    - apps/admin/lib/api-server-internal.ts

key-decisions:
  - 'Spec colocated under apps/admin/test/ (not apps/admin/lib/) to match existing vitest include glob (`test/**/*.spec.ts`) — extending the glob would have been a wider config change'
  - 'PATCH union widening + spec landed in a single commit because TS pre-commit gate refuses to compile a spec that references a method not yet in the union'
  - 'shadcn ESLint override extended in same commit as primitives — `apps/CLAUDE.md` explicitly mandates `pnpm dlx shadcn add` remain a clean upgrade path'

patterns-established:
  - 'Pattern: every server-side fetch in apps/admin (operator + internal channels) routes through an executeWithRetry helper carrying AbortSignal.timeout + idempotent GET retry-once-on-5xx; mutations never retry'
  - 'Pattern: AbortError / TimeoutError → { status: 0, ok: false, data: null } as the uniform "transport failed" sentinel for both apiFetch and apiFetchInternal'
  - 'Pattern: shadcn primitives stay verbatim from upstream; rule conflicts handled by widening the components/ui glob override, never by editing primitive source'

requirements-completed: []

duration: 15min
completed: 2026-05-31
---

# Phase 04b Plan 01: Wave 0 Foundation Summary

**react-hook-form + @hookform/resolvers + 9 shadcn primitives installed under apps/admin, and apiFetchInternal hardened with AbortSignal.timeout / one-retry-on-idempotent-5xx / PATCH method support.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-31T11:50:04Z
- **Completed:** 2026-05-31T12:05:07Z
- **Tasks:** 3 (1 verification gate + 2 auto)
- **Files modified:** 13 (10 created, 3 modified) + lockfile

## Accomplishments

- Net-new admin runtime dependencies (`react-hook-form@^7.76.1`, `@hookform/resolvers@^5.4.0`) installed and persisted in `apps/admin/package.json`
- Nine shadcn primitives (`badge`, `table`, `tabs`, `switch`, `form`, `select`, `dialog`, `progress`, `textarea`) scaffolded under `apps/admin/components/ui/` from the `new-york` / `neutral` preset; existing `button.tsx` and `label.tsx` left untouched
- `apiFetchInternal` now mirrors `apiFetch`'s safety contract: `AbortSignal.timeout(10_000)` on GET, `AbortSignal.timeout(30_000)` on mutations, one retry on idempotent GET 500–504 with 500 ms backoff, `AbortError`/`TimeoutError` collapsed to `{ status: 0, ok: false, data: null }`
- `InternalRequestOptions.method` union widened from `'GET' | 'POST' | 'DELETE'` to `'GET' | 'POST' | 'PATCH' | 'DELETE'` — Wave 1 archive endpoints can now type-safely PATCH
- 7-test vitest spec at `apps/admin/test/api-server-internal.spec.ts` proves the new behaviors; full admin suite remains green (196/196)

## Task Commits

Each task was committed atomically:

1. **Task 1: Package legitimacy verification gate** — `[VERIFIED]` human-approved RHF + resolvers pre-install (no source commit; verification gate per planner-source-audit policy)
2. **Task 2: Install runtime dependencies and shadcn primitives** — `923ee48` (chore)
3. **Task 3: Harden apiFetchInternal with AbortSignal.timeout + retry-on-idempotent-5xx + PATCH** — `4e5c71f` (chore; spec + impl co-committed, see Deviations)

**Plan metadata commit:** pending (this SUMMARY + STATE bump)

_Note: Task 3 is `tdd="true"`. The RED step was executed locally (spec failed against the unhardened helper, 4 of 7 assertions red) but the RED commit could not be persisted as a separate commit because the test references `method: 'PATCH'`, which fails the `nx affected -t typecheck` pre-commit gate without the union widening already in place. Spec + impl therefore landed in a single GREEN commit; RED was verified before staging._

## Files Created/Modified

**Created:**

- `apps/admin/components/ui/badge.tsx` — shadcn badge primitive (new-york / neutral)
- `apps/admin/components/ui/dialog.tsx` — shadcn dialog primitive
- `apps/admin/components/ui/form.tsx` — shadcn form primitive wrapping react-hook-form (FormField / FormControl / FormDescription / FormMessage)
- `apps/admin/components/ui/progress.tsx` — shadcn progress primitive
- `apps/admin/components/ui/select.tsx` — shadcn select primitive
- `apps/admin/components/ui/switch.tsx` — shadcn switch primitive
- `apps/admin/components/ui/table.tsx` — shadcn table primitive
- `apps/admin/components/ui/tabs.tsx` — shadcn tabs primitive
- `apps/admin/components/ui/textarea.tsx` — shadcn textarea primitive
- `apps/admin/test/api-server-internal.spec.ts` — 7 vitest cases covering retry (GET 503 → 2 fetch calls), no-retry-on-mutation (POST 503 → 1 fetch call), AbortError / TimeoutError → `{ status: 0 }`, AbortSignal presence on every call, `x-internal-token` header, PATCH method support
- `.planning/phases/04b-catalog-admin-ui/deferred-items.md` — pre-existing lint debt log (out-of-scope items)

**Modified:**

- `apps/admin/package.json` — `react-hook-form ^7.76.1`, `@hookform/resolvers ^5.4.0` added to `dependencies`
- `pnpm-lock.yaml` — transitive dependency resolution
- `apps/admin/eslint.config.mjs` — `components/ui/**` rule override extended with `no-unnecessary-condition`, `no-unnecessary-template-expression`, `no-unnecessary-type-conversion`, `prefer-nullish-coalescing` so stock shadcn templates lint clean (apps/CLAUDE.md "clean upgrade path" mandate)
- `apps/admin/lib/api-server-internal.ts` — full rewrite mirroring `executeWithRetry` from `apps/admin/lib/api-server.ts`; `server-only` import preserved at line 1; `cache: 'no-store'` + `redirect: 'manual'` preserved on request init; `InternalRequestOptions.method` widened to include `'PATCH'`

## Decisions Made

- **Spec location:** placed at `apps/admin/test/api-server-internal.spec.ts` (not `apps/admin/lib/`) because vitest config only includes `test/**/*.{spec,test}.{ts,tsx}`. The plan's "colocated" wording is best read as intent ("a spec exists and asserts the behaviors") rather than a literal path. Extending the include glob would have widened scope.
- **RED + GREEN merged into one commit:** `nx affected -t typecheck` runs in `pre-commit`. A RED-only commit fails because the spec references `method: 'PATCH'` which the un-widened union rejects. To keep TDD discipline (RED-before-GREEN observed locally) without skipping hooks, spec + impl landed together with a `chore:` prefix referencing both — see Deviations entry below.
- **shadcn ESLint override widened (not source patched):** the four template rules that fired on stock `form.tsx` / `progress.tsx` were added to the existing override block in `eslint.config.mjs` rather than editing the primitive source — this is the `apps/CLAUDE.md`-documented intent ("`shadcn add` stays a clean upgrade path").
- **Pre-existing lint failures in `sign-in-and-bind-org.ts`:** left untouched and recorded in `deferred-items.md`. Confirmed via `git log -- apps/admin/lib/actions/sign-in-and-bind-org.ts` that the offending lines pre-date 04b-01 by two phases.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Extended shadcn ESLint override to cover stock template rules**

- **Found during:** Task 2 (post-install lint check)
- **Issue:** Stock shadcn `form.tsx` and `progress.tsx` templates triggered four lint rules not in the existing `components/ui/**` override block: `no-unnecessary-condition`, `no-unnecessary-template-expression`, `no-unnecessary-type-conversion`, `prefer-nullish-coalescing`. Editing the primitive source to silence them would violate `apps/CLAUDE.md`'s "shadcn add stays a clean upgrade path" mandate.
- **Fix:** Added the four rules to the existing override block in `apps/admin/eslint.config.mjs` (same comment context, same override target glob).
- **Files modified:** `apps/admin/eslint.config.mjs`
- **Verification:** `pnpm exec eslint components/ui/{badge,dialog,form,progress,select,switch,table,tabs,textarea}.tsx` → 0 errors after the override expansion.
- **Committed in:** `923ee48` (Task 2 commit; staged together because the primitives + override expansion are a single unit-of-change)

### Deviation from TDD commit shape

**2. [Process] RED + GREEN co-committed for Task 3**

- **Found during:** Task 3 RED-commit attempt
- **Issue:** Pre-commit hook runs `nx affected -t typecheck --uncommitted`. The RED spec references `method: 'PATCH'`, which fails type-check against the still-narrow `InternalRequestOptions.method` union. Splitting into a RED commit would require either `--no-verify` (forbidden by project policy) or omitting the PATCH assertion from RED (defeats the verification purpose).
- **Fix:** Executed RED locally (`pnpm exec vitest run test/api-server-internal.spec.ts` → 4 of 7 cases failed against the un-hardened helper; output captured in execution transcript), then implemented GREEN and committed spec + impl together as `chore(04b): harden apiFetchInternal with timeout + retry`.
- **Files modified:** `apps/admin/lib/api-server-internal.ts`, `apps/admin/test/api-server-internal.spec.ts`
- **Verification:** Final `pnpm exec vitest run test/api-server-internal.spec.ts` → 7/7 passing; full admin suite 196/196 passing.
- **Committed in:** `4e5c71f`

---

**Total deviations:** 2 (1 auto-fix Rule 3, 1 process deviation documented above)
**Impact on plan:** Both deviations preserve the plan's stated invariants (clean shadcn upgrade path; TDD intent of "failing-first-then-passing"). No scope creep; no source primitives edited.

## Issues Encountered

- `pnpm dlx shadcn@latest add ...` prompts interactively to overwrite existing `button.tsx`. The `--yes` flag covers the global install confirmation but not per-file overwrite prompts. Resolved by re-running just the remaining `form` add with `yes N | pnpm dlx shadcn@latest add form`, which declined the `button.tsx` and `label.tsx` overwrite prompts and produced the missing `components/ui/form.tsx`.
- Pre-existing lint failures in `apps/admin/lib/actions/sign-in-and-bind-org.ts` (3 errors, all `no-unsafe-assignment` / `no-unsafe-member-access`) surfaced during the acceptance-gate `nx run admin:lint` step. Confirmed pre-existing via `git show HEAD~2:...` — file untouched by 04b-01. Logged to `.planning/phases/04b-catalog-admin-ui/deferred-items.md` and left untouched per scope rule (auto-fix only directly-caused regressions).

## Auth Gates

None — Task 1 was a planned `checkpoint:human-verify` for package-legitimacy approval, resolved before this executor agent was spawned.

## User Setup Required

None — no external service configuration required for Wave 0.

## Known Stubs

None — no UI surface shipped by Wave 0; primitives are scaffolding only.

## Next Phase Readiness

- **Ready:** all downstream Wave 0 dependents (Wave 1 backend addendum, Wave 1+ frontend plans) can import `react-hook-form`, `@hookform/resolvers`, and the 9 shadcn primitives. `apiFetchInternal` is now safe to call from `/internal/v1/*` mutation paths including PATCH archive endpoints.
- **Watch-list:** the executor co-commits the lint override widening with the primitives. Future `pnpm dlx shadcn add` runs may introduce yet more rule conflicts; if so, extend the same `components/ui/**` override block rather than editing primitive source.
- **Deferred:** 3 pre-existing lint errors in `apps/admin/lib/actions/sign-in-and-bind-org.ts` (see `deferred-items.md`).

## Verification Output

```text
$ pnpm exec nx run admin:typecheck
> nx run admin:typecheck  [existing outputs match the cache, left as is]
> tsc -p tsconfig.json --noEmit
 NX   Successfully ran target typecheck for project admin and 1 task it depends on

$ pnpm exec vitest run --no-coverage   # full admin suite, post-Wave-0
 Test Files  30 passed (30)
      Tests  196 passed (196)

$ pnpm exec vitest run test/api-server-internal.spec.ts --no-coverage
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

## Self-Check: PASSED

- `apps/admin/package.json` → contains `"react-hook-form": "^7.76.1"` and `"@hookform/resolvers": "^5.4.0"` (verified by `grep`)
- 9 shadcn primitive files present under `apps/admin/components/ui/` (verified by directory listing — 8 net-new + 1 from second `form` add)
- `apps/admin/lib/api-server-internal.ts` contains `import 'server-only'`, `AbortSignal.timeout`, and `'PATCH'` (verified by `grep`)
- Commit `923ee48` present in `git log --all` (verified)
- Commit `4e5c71f` present in `git log --all` (verified)
- No `'use client'` file under `apps/admin/app` or `apps/admin/components` imports `api-server-internal` (verified by `grep`)
- `apps/admin/test/api-server-internal.spec.ts` runs 7 cases, all pass

---

_Phase: 04b-catalog-admin-ui_
_Plan: 01_
_Completed: 2026-05-31_
