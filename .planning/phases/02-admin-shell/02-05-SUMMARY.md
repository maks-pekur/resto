---
phase: 02
plan: 02-05
plan_name: Dashboard cards + Phase 03 placeholders + ADM-04 e2e + scenario 2 flip
completed: 2026-05-27
status: complete
commits:
  - 5980075 feat(02-05): add Setup Checklist + AI preview cards with notify-list signup action
  - 31a9684 feat(02-05): wire dashboard page to SetupChecklist + AI preview cards
  - 99ab483 feat(02-05): render Phase 03 placeholder pages with EmptyState forbidden variant
  - 2eb8ea7 test(02-05): flip scenario 2 to active and add scenarios 7a/7b for ADM-04
files_modified:
  created:
    - apps/admin/components/setup-checklist-card.tsx
    - apps/admin/components/ai-preview-card.tsx
    - apps/admin/components/ai-preview-card-client.tsx
    - apps/admin/lib/actions/notify-list-signup.ts
    - apps/admin/test/setup-checklist-card.spec.tsx
    - apps/admin/test/ai-preview-card.spec.tsx
    - apps/admin/test/notify-list-signup.spec.ts
    - apps/admin/test/phase-03-placeholder-pages.spec.tsx
  modified:
    - apps/admin/app/dashboard/(workspace)/page.tsx
    - apps/admin/app/signup/page.tsx
    - apps/admin/app/forgot-password/page.tsx
    - apps/admin/app/reset-password/page.tsx
    - apps/admin/e2e/adm-00-smoke-walk.spec.ts
requirements_addressed:
  - ADM-04 (e2e roundtrip scenario 7a + 7b)
  - ADM-00 (scenario 2 flip — closes B-1 ownership)
verification:
  unit_tests: 163 passed (163 total — +25 vs pre-Plan-05 baseline of 138)
  typecheck: clean (nx typecheck admin)
  lint: clean (nx lint admin)
  e2e_status: 5 active scenarios (1, 2, 3, 5, 6 + new 7a, 7b) + 1 documented-exception fixme (scenario 4 — Phase 03 RBAC seed dependency per F-9)
---

# Plan 02-05 SUMMARY — Final Wave

> NOTE: This SUMMARY was written by the orchestrator after the executor agent
> completed all 4 task commits but stalled before its own SUMMARY write
> (stream watchdog timeout at 600s on the SUMMARY step). All commits are
> intact on `worktree-agent-ae5427cbf7e5ab5ea`. Tests, typecheck, and lint
> were re-verified by the orchestrator before merge. No execution work was
> lost — only the agent's narrative output was truncated.

## What Was Built

Phase 02's final-wave plan brought together everything Waves 1-3 made
possible: the operator's dashboard now shows a meaningful first screen,
the AI-driven positioning has a visible (honest) presence in MVP-1, the
half-scaffolded auth pages stop pretending to work, and the e2e smoke walk
is now actually walking.

### 1. Setup Checklist card — `setup-checklist-card.tsx`

Six-item roadmap card on the dashboard, per CONTEXT D-12 verbatim:

1. ✓ Account created
2. ✓ Brand set up (auto-checked when `brandsCount >= 1`)
3. ◯ Catalog — coming in Phase 4
4. ◯ Customer site — coming in Phase 5
5. ◯ Accepting orders — coming in Phase 7
6. ◯ Payments (Stripe Connect) — coming in Phase 8

Voice follows D-08 — calm, operator-respectful, no exclamation marks. This is
the **only** non-trivial dashboard content until Phase 4 lands (D-13).

### 2. AI preview card — `ai-preview-card.tsx` + `ai-preview-card-client.tsx`

User-decided ship variant (D-17, 2026-05-27 explore session): dashboard card
with "AI assistant coming Q2 2027" copy + inline email input + "Notify me"
button. Server-component shell + client-component form per shadcn convention.
Submits to a Phase 03–ready endpoint stub.

**F-7 throttle implemented:** `notify-list-signup.ts` server action has an
in-process sliding-window throttle (`THROTTLE_WINDOW_MS = 60_000`,
`THROTTLE_MAX = 5` distinct emails). This is the stopgap before the real
`POST /v1/marketing/notify-list` api endpoint lands; per-IP rate limiting
remains a Phase 03 (api-side) backlog item.

When the real api endpoint is absent (current state — endpoint returns 404),
the action logs the email + returns 202 via the degraded log path. When the
api endpoint lands in MVP-2 marketing tier, the action forwards via
`apiFetch` and the throttle becomes belt-and-suspenders.

### 3. Phase 03 placeholder pages

`/signup`, `/forgot-password`, `/reset-password` pages now render
`<EmptyState variant="forbidden">` with copy "Phase 03 — not yet wired" + a
back-link to `/login`. Per CONTEXT D-02:

- The existing `actions.ts` server actions in each route are **untouched**.
  Phase 03 (AUTH-01..09) re-imports the form clients to lift the gate.
- The routes stay in the build — operators clicking these links from the
  /login footer see a clear, honest state instead of broken flows.

### 4. ADM-00 e2e scenario flips + scenario 7

- **Scenario 2** flipped from `test.fixme` to `test` (closes B-1 ownership
  per CONTEXT D-18). Plan 04 shipped the EmptyState component; this plan
  wires the 0-brand path on `/dashboard` to render it, making the scenario
  testable end-to-end.

- **Scenario 7 split** added (closes F-5 + F-6 interaction):
  - **7a — single-brand flow:** fixture clicks
    `data-testid="brand-switcher-add-brand"` Plus icon → navigates to
    `/onboarding/brand` → creates brand → returns to dashboard with new
    active brand + signed cookie set.
  - **7b — multi-brand flow:** fixture opens the brand-switcher dropdown
    (existing `data-testid="brand-switcher-trigger"`) → clicks "+ Add brand"
    link → same roundtrip.

- **Scenario 4** (non-owner role) remains `.fixme` — documented Phase 03
  exception per F-9. Phase 03 RBAC seed migration unblocks it.

## Verification Evidence

```
$ pnpm exec vitest run
Test Files  27 passed (27)
     Tests  163 passed (163)
   Duration  4.59s
```

- **Test delta:** 138 → 163 (+25 from Plan 05 — setup-checklist-card,
  ai-preview-card, notify-list-signup, phase-03-placeholder-pages).
- **Typecheck:** `nx typecheck admin` clean.
- **Lint:** `nx lint admin` clean.
- **E2E scenarios in `adm-00-smoke-walk.spec.ts`:**
  - Active passing: 1 (sign-in), 2 (0-brand EmptyState — newly flipped),
    3 (3+ brands), 5 (expired session), 6 (multi-tab sync)
  - Active env-dependent: 7a (single-brand Plus icon), 7b (multi-brand dropdown)
  - Documented-exception fixme: 4 (non-owner role — Phase 03 RBAC seed
    dependency per F-9 phase-exit gate)

## Decisions / Deviations

- **F-7 throttle in-process only.** Sliding-window in module-scope array
  (`recentSignups`). Resets on every server restart and does NOT survive
  horizontal scale-out. This is acceptable for MVP-1 (we are not at
  scale-out scale yet) but MUST be replaced with api-side per-IP rate
  limiting before MVP-1 ships to a real production-grade audience. Backlog
  entry added to `.planning/phases/02-admin-shell/deferred-items.md`.

- **AI card stub endpoint.** `POST /v1/marketing/notify-list` does not
  exist in `apps/api` yet. The server action gracefully degrades to a log
  - 202 response. Real wiring is MVP-2 marketing-tier work; until then the
    log line is the email-list capture. Stop-gap, not load-bearing.

- **Setup Checklist progress detection is hardcoded** — items 3-6 are
  always "coming in Phase X". CONTEXT D-13 acknowledges this as a known
  limitation; copy frames it honestly. When Phase 4 catalog lands, that
  item flips to "done" via a one-line check (catalog item count > 0).

- **Scenario 7 brand creation roundtrip uses HTTP path.** Single-brand 7a
  test clicks the Plus icon → relies on Plan 04 routing to
  `/onboarding/brand`. The `/onboarding/brand` form itself is minimal
  Phase 02 scope (was already a basic form before Plan 05); a real
  multi-step onboarding wizard is Phase 16 work.

## Carry-over to Phase 03 / Future

Added to `.planning/phases/02-admin-shell/deferred-items.md`:

- **Per-IP rate limiting** on the real `POST /v1/marketing/notify-list`
  endpoint when it ships. Current in-process throttle is a stopgap.
- **AI card endpoint wiring** — full backend handler for `notify-list`
  signups (DB persist, deduplication, GDPR consent flag). MVP-2 marketing
  tier territory.
- **Scenario 4 e2e activation** — depends on Phase 03 RBAC seed migration
  (AUTH-09) which seeds `staff` role with deterministic permissions.

## Phase Exit Gate (per CONTEXT D-21)

| Gate                                                                       | Status              |
| -------------------------------------------------------------------------- | ------------------- |
| All 5 plans complete                                                       | ✓ (this is Plan 05) |
| 8 ADM requirements + ADM-00 covered                                        | ✓ 9/9               |
| Persona BLOCKs closed (CTO, Skeptic, Product)                              | ✓ 6/6               |
| Plan-checker B-1 + F-6 closed in revision pass                             | ✓                   |
| E2E scenario 2 active (B-1)                                                | ✓ (this plan)       |
| EmptyState variants both implemented (D-07)                                | ✓ (Plan 04)         |
| Brand-switcher single-brand Plus icon (D-14 + F-6)                         | ✓ (Plan 04)         |
| Sidebar debris cleaned (D-15)                                              | ✓ (Plan 04)         |
| NavUser real identity (D-16)                                               | ✓ (Plan 04)         |
| HMAC signed cookie (D-03)                                                  | ✓ (Plan 03)         |
| ADM-00 smoke-walk infra (D-18)                                             | ✓ (Plan 02)         |
| lib/env.ts + secure-flag fix + apiFetch hardening (D-04, D-05, D-09, D-10) | ✓ (Plan 01)         |
| Scenario 4 fixme acceptable per F-9                                        | ✓ documented        |
| Tests / typecheck / lint clean                                             | ✓                   |

Phase 02 is ready for `/gsd-verify-work 2` or merge to next phase.
