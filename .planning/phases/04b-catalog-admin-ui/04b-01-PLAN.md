---
phase: 04b-catalog-admin-ui
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - apps/admin/package.json
  - apps/admin/lib/api-server-internal.ts
  - apps/admin/components/ui/badge.tsx
  - apps/admin/components/ui/table.tsx
  - apps/admin/components/ui/tabs.tsx
  - apps/admin/components/ui/switch.tsx
  - apps/admin/components/ui/form.tsx
  - apps/admin/components/ui/select.tsx
  - apps/admin/components/ui/dialog.tsx
  - apps/admin/components/ui/progress.tsx
  - apps/admin/components/ui/textarea.tsx
autonomous: false
requirements: []
enables_requirements: [CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-07, CAT-08]
must_haves:
  truths:
    - 'react-hook-form 7.76.x and @hookform/resolvers 5.4.x are installed under apps/admin'
    - 'shadcn primitives badge, table, tabs, switch, form, select, dialog, progress, textarea exist under apps/admin/components/ui/'
    - 'apiFetchInternal enforces AbortSignal.timeout (10s GET / 30s mutation) and one retry on idempotent GET 5xx'
    - 'apiFetchInternal never reaches a client boundary (server-only import preserved)'
    - 'Russian copy is canonical for all user-facing strings (D-05 single-locale MVP-1)'
  artifacts:
    - path: 'apps/admin/package.json'
      provides: 'react-hook-form + @hookform/resolvers dependencies'
      contains: 'react-hook-form'
    - path: 'apps/admin/lib/api-server-internal.ts'
      provides: 'hardened apiFetchInternal with timeout + retry'
      contains: 'AbortSignal.timeout'
    - path: 'apps/admin/components/ui/form.tsx'
      provides: 'shadcn form primitive wrapping react-hook-form'
      contains: 'FormField'
  key_links:
    - from: 'apps/admin/lib/api-server-internal.ts'
      to: 'apps/admin/lib/env.ts'
      via: 'internalApiToken() import'
      pattern: 'internalApiToken'
    - from: 'apps/admin/components/ui/form.tsx'
      to: 'react-hook-form'
      via: 'useFormContext'
      pattern: 'react-hook-form'
---

<objective>
Wave 0 foundation: install the net-new admin dependencies (`react-hook-form`, `@hookform/resolvers`, shadcn primitives required by UI-SPEC) and harden `apiFetchInternal` so it carries `AbortSignal.timeout` + retry-on-idempotent-5xx the same way `apiFetch` does today. This wave gates every downstream Wave (backend addendum + all frontend plans depend on the hardened helper; all frontend plans depend on the shadcn primitives).

Purpose: D-4b-07 mandates RHF + shadcn `form` for auto-save (D-4b-02). `apps/CLAUDE.md` mandates `AbortSignal.timeout` on every server-side fetch. Both gaps must close before any 4b code runs.

Output: an installed dependency set; a hardened helper; 9 shadcn primitive files under `apps/admin/components/ui/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/04b-catalog-admin-ui/04b-CONTEXT.md
@.planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md
@.planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md
@apps/CLAUDE.md
@CLAUDE.md

<interfaces>
<!-- Hardened pattern to mirror — extracted from apps/admin/lib/api-server.ts (Wave-0 source of truth). -->

From apps/admin/lib/api-server.ts (lines 8-42):

```typescript
const TIMEOUT_GET_MS = 10_000;
const TIMEOUT_MUTATION_MS = 30_000;
const RETRY_BACKOFF_MS = 500;

const isRetryableServerError = (status: number): boolean =>
  status >= 500 && status <= 504;
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const executeWithRetry = async (
  input: string,
  init: Omit<RequestInit, 'signal'>,
  opts: { readonly isGet: boolean; readonly timeoutMs: number },
): Promise<Response> => {
  const maxAttempts = opts.isGet ? 2 : 1;
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (
      !opts.isGet ||
      !isRetryableServerError(res.status) ||
      attempt >= maxAttempts
    ) {
      return res;
    }
    await sleep(RETRY_BACKOFF_MS);
  }
};
```

Existing apps/admin/lib/api-server-internal.ts shape (to extend):

```typescript
export interface InternalApiResponse<T> {
  readonly status: number;
  readonly ok: boolean;
  readonly data: T | null;
}

export const apiFetchInternal = async <T>(
  path: string,
  options: InternalRequestOptions = {},
): Promise<InternalApiResponse<T>>;
```

Extend `InternalRequestOptions.method` to include `'PATCH'` (Wave 1 archive endpoints require it).
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 1: Package legitimacy verification gate (slopcheck unavailable)</name>
  <what-built>RESEARCH.md `## Package Legitimacy Audit` lists `react-hook-form@^7.76.1` and `@hookform/resolvers@^5.4.0` as `[ASSUMED]` — slopcheck was unavailable during research. Both packages are widely-adopted (7+ years, official `github.com/react-hook-form` org, included in shadcn's own peer dependency list), but per planner-source-audit policy `[ASSUMED]` packages require a blocking human-verify gate before install.</what-built>
  <how-to-verify>
    1. Visit https://www.npmjs.com/package/react-hook-form and confirm: weekly downloads >5M, repository field points to `github.com/react-hook-form/react-hook-form`, latest version is 7.x.
    2. Visit https://www.npmjs.com/package/@hookform/resolvers and confirm: repository points to `github.com/react-hook-form/resolvers`, latest version is 5.x, published by the same org.
    3. Confirm neither package is in the project skeptic/CONCERNS list at `.planning/PROJECT.md` or `.planning/CONCERNS.md` (grep for `react-hook-form` / `hookform`).
  </how-to-verify>
  <resume-signal>Type "approved" to proceed with `pnpm --filter @resto/admin add react-hook-form@^7.76.1 @hookform/resolvers@^5.4.0`. Reply with package name and reason to reject.</resume-signal>
  <files>(no source files — human verification only)</files>
  <action>Pause execution and present the verification steps below to the user. Wait for explicit approval before proceeding to the next task.</action>
  <verify><human-check>User confirms the verification steps listed below</human-check></verify>
  <done>User has typed approval (or has rejected with reason) per resume-signal</done>
</task>

<task type="auto">
  <name>Task 2: Install runtime dependencies and shadcn primitives</name>
  <files>apps/admin/package.json, apps/admin/components/ui/badge.tsx, apps/admin/components/ui/table.tsx, apps/admin/components/ui/tabs.tsx, apps/admin/components/ui/switch.tsx, apps/admin/components/ui/form.tsx, apps/admin/components/ui/select.tsx, apps/admin/components/ui/dialog.tsx, apps/admin/components/ui/progress.tsx, apps/admin/components/ui/textarea.tsx</files>
  <read_first>
    - apps/admin/package.json (current dependencies, pnpm filter target name)
    - apps/admin/components.json (shadcn preset config — `new-york` + `neutral`)
    - apps/admin/components/ui/sonner.tsx (role-match analog for any new shadcn file)
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Standard Stack and §shadcn primitives to install (Wave 0)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 0 (file classification table — `form.tsx` analog row)
  </read_first>
  <action>
    Run two commands sequentially:
    (1) `pnpm --filter @resto/admin add react-hook-form@^7.76.1 @hookform/resolvers@^5.4.0` — installs runtime deps; verifies they appear in `apps/admin/package.json` `dependencies`.
    (2) `cd apps/admin && pnpm dlx shadcn@latest add badge table tabs switch form select dialog progress textarea` — installs the 9 shadcn primitives listed in UI-SPEC §shadcn primitives. shadcn's `form` recipe pulls `react-hook-form` + `@hookform/resolvers` as peer deps; since they were already installed in step 1, no version mismatch. Accept any prompts with defaults (`new-york` + `neutral` preset is already locked in `components.json`).
    Do NOT install `react-dropzone` (UI-SPEC explicit: native `<input type="file">` only). Do NOT install `react-time-ago` (UI-SPEC explicit: inline string formatter). Do NOT install `framer-motion` (UI-SPEC: CSS-only transitions). Do NOT install `date-fns` (Pitfall: overkill for the 3-bucket formatter).
    After install, run `pnpm --filter @resto/admin exec tsc --noEmit` and ensure the build remains clean.
  </action>
  <verify>
    <automated>cd apps/admin && (grep -q '"react-hook-form"' package.json && grep -q '"@hookform/resolvers"' package.json && test -f components/ui/form.tsx && test -f components/ui/badge.tsx && test -f components/ui/table.tsx && test -f components/ui/tabs.tsx && test -f components/ui/switch.tsx && test -f components/ui/select.tsx && test -f components/ui/dialog.tsx && test -f components/ui/progress.tsx && test -f components/ui/textarea.tsx) && pnpm --filter @resto/admin exec tsc --noEmit</automated>
  </verify>
  <done>
    apps/admin/package.json lists react-hook-form ^7.76.x and @hookform/resolvers ^5.4.x; all 9 shadcn primitive files exist under apps/admin/components/ui/; admin app type-checks cleanly.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Harden apiFetchInternal with AbortSignal.timeout + retry-on-idempotent-5xx + PATCH method support</name>
  <files>apps/admin/lib/api-server-internal.ts</files>
  <behavior>
    - GET request: signal aborts after 10_000ms, returns `{ status: 0, ok: false, data: null }` on AbortError; on 503 response retries exactly once after ~500ms backoff
    - POST/PATCH/DELETE: signal aborts after 30_000ms; never retries on 5xx
    - Method type accepts 'GET' | 'POST' | 'PATCH' | 'DELETE' (PATCH added for Wave 1 archive endpoints)
    - Non-2xx response with JSON body: returns parsed `data` for problem+json + application/json content types
    - `server-only` import preserved at top of file
  </behavior>
  <read_first>
    - apps/admin/lib/api-server.ts (lines 1-220 — copy the `executeWithRetry` helper + `AbortError`/`TimeoutError` → `{ status: 0 }` collapse pattern)
    - apps/admin/lib/api-server-internal.ts (existing 42-line shape — preserve the public interface)
    - apps/CLAUDE.md §Network calls (timeout + retry mandates)
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pitfall 7 (apiFetchInternal lacks timeout)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 0 — apps/admin/lib/api-server-internal.ts (extend with AbortSignal.timeout + retry)
  </read_first>
  <action>
    Rewrite `apps/admin/lib/api-server-internal.ts` mirroring the `executeWithRetry` helper from `apps/admin/lib/api-server.ts` lines 8-42. Add `TIMEOUT_GET_MS = 10_000`, `TIMEOUT_MUTATION_MS = 30_000`, `RETRY_BACKOFF_MS = 500` constants. Extend `InternalRequestOptions.method` from `'GET' | 'POST' | 'DELETE'` to `'GET' | 'POST' | 'PATCH' | 'DELETE'` per Wave 1 PATCH archive needs. Wrap the existing `fetch` call with `executeWithRetry({ isGet: method === 'GET', timeoutMs: method === 'GET' ? TIMEOUT_GET_MS : TIMEOUT_MUTATION_MS })`. Wrap the await in `try/catch (err)` and collapse `AbortError` + `TimeoutError` to `{ status: 0, ok: false, data: null }` (mirror api-server.ts lines 199-220). Preserve `import 'server-only'` on line 1. Preserve `cache: 'no-store'` and `redirect: 'manual'` on the request init. Add a single WHY-comment block above `executeWithRetry` referencing `apps/CLAUDE.md` "Server-side fetch must have AbortSignal.timeout" + RESEARCH.md Pitfall #7.
    Tests: add a colocated spec `apps/admin/lib/api-server-internal.spec.ts` that uses `vi.spyOn(globalThis, 'fetch')` to assert (a) GET 503 retries exactly twice total, (b) POST 503 fires exactly once (no retry), (c) AbortError yields `{ status: 0, ok: false, data: null }`, (d) `method: 'PATCH'` typechecks and reaches the fetch call.
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run lib/api-server-internal.spec.ts --no-coverage</automated>
  </verify>
  <done>
    apiFetchInternal carries AbortSignal.timeout on every call; idempotent GETs retry once on 5xx; mutations never retry; PATCH is an allowed method; AbortError collapses to status: 0; vitest spec passes.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                    | Description                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Admin server actions → api `/internal/v1/*` | INTERNAL_API_TOKEN bearer crosses this boundary; must stay server-only |
| Wave-0 deps → admin runtime                 | Net-new npm packages enter the dependency graph                        |

## STRIDE Threat Register

| Threat ID   | Category               | Component                                                          | Disposition | Mitigation Plan                                                                                                                                                        |
| ----------- | ---------------------- | ------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04b-01-01 | Tampering              | npm install of react-hook-form, @hookform/resolvers                | mitigate    | Task 1 blocking-human checkpoint verifies npm registry provenance; both packages are `[ASSUMED]` per slopcheck-unavailable protocol; install only after approval       |
| T-04b-01-02 | DoS                    | apiFetchInternal hanging on slow upstream                          | mitigate    | Task 3 adds AbortSignal.timeout (10s GET / 30s mutation) per apps/CLAUDE.md mandate                                                                                    |
| T-04b-01-03 | Information Disclosure | INTERNAL_API_TOKEN leaking to client bundle                        | mitigate    | `import 'server-only'` preserved at top of apps/admin/lib/api-server-internal.ts; never imported from a client component (verified by Next.js build error if violated) |
| T-04b-01-SC | Tampering              | npm installs (this wave installs 2 runtime deps + 9 shadcn copies) | mitigate    | slopcheck + blocking human checkpoint for [ASSUMED] packages (Task 1)                                                                                                  |

</threat_model>

<verification>
- `pnpm --filter @resto/admin exec tsc --noEmit` passes after Task 2
- Vitest spec for hardened apiFetchInternal passes after Task 3
- `grep -r "react-hook-form" apps/admin/package.json` returns the dependency
- `ls apps/admin/components/ui/ | grep -E '^(badge|table|tabs|switch|form|select|dialog|progress|textarea)\.tsx$' | wc -l` returns 9
</verification>

<success_criteria>

1. Two new runtime deps installed; admin app type-checks
2. Nine shadcn primitives present under `apps/admin/components/ui/`
3. `apiFetchInternal` enforces AbortSignal.timeout on every call (test asserts)
4. `apiFetchInternal` retries idempotent GET 5xx exactly once (test asserts)
5. `apiFetchInternal` mutations (POST/PATCH/DELETE) never retry on 5xx (test asserts)
6. `apiFetchInternal` method type includes `'PATCH'`
   </success_criteria>

<output>
Create `.planning/phases/04b-catalog-admin-ui/04b-01-SUMMARY.md` when done.
</output>
