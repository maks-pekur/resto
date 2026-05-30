---
phase: 03-auth-completion
plan: 01
subsystem: events
tags: [nats, dlq, poison-message, auth-10, ten-11, phase-03]

# Dependency graph
requires:
  - phase: 01-tenancy-hardening
    provides: TEN-11 withoutTenant allowlist + parity ESLint overrides + preflight assertion
  - phase: 02-admin-shell
    provides: pristine Phase 02 close-out (no carry-over deps for Plan 01)
provides:
  - NATS subscriber max_deliver=5 + dlq.<subject> + ack_wait + outer try/catch (AUTH-10)
  - NatsJetStreamPublisher.publishRaw for raw byte forwarding (DLQ branch)
  - IdentityEmailDispatchFailedV1 contract (discriminated reason — reused later by D-05 Resend adapter)
  - audit projection: identity.email_dispatch_failed → 'platform' targetType
  - TEN-11 allowlist + ESLint override for nats-subscriber.ts (new db.withoutTenant call site)
  - dlq.> added to STREAM_SUBJECTS so DLQ republish does not 503
  - e2e gating test asserting max_deliver + DLQ subject + outbox alert envelope (D-18)
affects:
  [
    03-02-resend-adapter,
    03-03-invitation-send,
    03-04-invitation-accept,
    03-05-password-reset,
    all downstream AUTH-* waves,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'NATS DLQ wiring pattern: consumer-side fallback (computeDlqAction + buildDlqSubject + publishRaw + alert envelope under db.withoutTenant)'
    - 'Outer try/catch around `for await` iterator for broker-disconnect protection (packages/events/CLAUDE.md rule)'
    - 'Pure helper functions (buildConsumerConfig, buildDlqSubject, computeDlqAction) for unit-testing infrastructure config without a NATS container'
    - 'ConsumerConfig.ack_wait in nanoseconds (Nanos) — 30s default = 30_000 * 1_000_000'
    - 'Discriminated event contract: ONE contract serves multiple flows via `reason` enum (avoids contract sprawl per D-05)'

key-files:
  created:
    - packages/events/test/unit/identity-email-dispatch-failed.spec.ts
    - packages/events/test/unit/nats-subscriber-dlq.spec.ts
    - packages/events/test/unit/nats-publisher-raw.spec.ts
    - apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts
  modified:
    - packages/events/src/contracts/identity.ts
    - packages/events/src/index.ts
    - packages/events/src/ports.ts
    - packages/events/src/infrastructure/nats-publisher.ts
    - packages/events/src/infrastructure/nats-subscriber.ts
    - packages/events/eslint.config.mjs
    - packages/db/src/withoutTenant.allowlist.ts
    - packages/db/test/unit/withoutTenant-allowlist.spec.ts
    - apps/api/src/contexts/audit/application/record-audit.service.ts
    - apps/api/src/infrastructure/nats.module.ts

key-decisions:
  - 'DlqPublisher port (publishRaw only) lives in @resto/events/ports — avoids coupling the subscriber to the full EventPublisher surface'
  - "TenantAwareDb injected at NatsSubscriberOptions (connect-time), not per-subscribe — every subscription on the same subscriber instance shares the same db handle; optional for test setups that don't care about alert tail"
  - 'DLQ branch ACKs the poison message after routing (even if dlqPublisher is omitted) to prevent infinite NAK loop — degraded mode is logged at ERROR; never crashes the consumer'
  - 'dlq.> added to STREAM_SUBJECTS as part of Plan 01 (Rule 2 — missing critical): without it, every DLQ republish in production hits NatsError 503 and ops loses the forensic payload'
  - 'Helper functions exported from nats-subscriber.ts (computeDlqAction, buildDlqSubject, buildConsumerConfig) so the DLQ/ack-wait/max-deliver semantics are unit-testable without a NATS testcontainer'

patterns-established:
  - 'Pattern: Per-source-subject DLQ — dlq.<original_subject> (NOT a single dlq.* bucket). Resolved RESEARCH Open Q3 2026-05-30. Codified in buildDlqSubject.'
  - "Pattern: Subscriber alert tail — DLQ branch emits identity.email_dispatch_failed.v1 onto the outbox under db.withoutTenant('NATS DLQ alert — poison envelope, no tenant context'). Audit subscriber projects it as targetType=platform."
  - "Pattern: TEN-11 allowlist registration triad — every new db.withoutTenant call site requires (1) entry in packages/db/src/withoutTenant.allowlist.ts (2) matching @withoutTenant-allowlist ESLint override block in the package's eslint.config.mjs (3) parity test length bump in packages/db/test/unit/withoutTenant-allowlist.spec.ts."

requirements-completed: [AUTH-10, TEN-11]

# Metrics
duration: 20 min
completed: 2026-05-30
---

# Phase 3 Plan 01: NATS DLQ Wiring (AUTH-10) Summary

**NATS JetStream consumers now bound poison redelivery at max_deliver=5, route exhausted messages to dlq.<original_subject>, emit a platform-level identity.email_dispatch_failed.v1 alert envelope onto the outbox, and ship with an e2e gating test (D-18) that proves the full chain end-to-end.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-30T08:20:01Z
- **Completed:** 2026-05-30T08:40:11Z
- **Tasks:** 4 (Task 1 + Task 2 + Task 2b + Task 3)
- **Files created:** 4
- **Files modified:** 10
- **Tests added:** 16 (7 contract unit + 7 subscriber unit + 1 publisher unit + 1 e2e gating)
- **Tests passing:** 32 (30 events unit + 2 db parity)

## Accomplishments

- **AUTH-10 closed.** NATS subscriber configures max_deliver: 5 + ack_wait: 30_000_000_000 ns + max_ack_pending: 10 by default; e2e poison-message test gates every other Phase 3 wave (D-18).
- **One reusable contract for two flows.** `IdentityEmailDispatchFailedV1` covers both the AUTH-10 DLQ-routing case and the future D-05 Resend terminal-failure case, discriminated by `reason: 'dlq_routed' | 'resend_terminal_failure'`.
- **TEN-11 satisfied for the new call site.** `packages/events/src/infrastructure/nats-subscriber.ts` is registered in `WITHOUT_TENANT_ALLOWLIST` (line 56) AND in the matching `@withoutTenant-allowlist` ESLint override block in `packages/events/eslint.config.mjs` (line 56). Parity test length bumped from 8 → 9.
- **Broker-disconnect protection wired.** Outer try/catch around `for await` in `#run()` catches iterator-level failures and logs at ERROR, preventing the unhandled rejection that would otherwise crash the process under `--unhandled-rejections=strict`.
- **Pure helpers extracted.** `computeDlqAction`, `buildDlqSubject`, `buildConsumerConfig` are unit-testable without spinning up a NATS container — keeps the regression net cheap.

## Task Commits

Each task was committed atomically (TDD red+green folded into one commit per task because type-aware ESLint rules block test-only commits when the imported symbol doesn't yet exist):

1. **Task 1: Define IdentityEmailDispatchFailedV1 + extend audit projection** — `b836e9f` (feat)
2. **Task 2: Extend NatsJetStreamPublisher with publishRaw + wire DLQ branch in NatsJetStreamSubscriber** — `cd334c2` (feat)
3. **Task 2b: TEN-11 allowlist registration for nats-subscriber.ts DLQ-branch call site** — `cc13070` (chore)
4. **Task 3: E2E poison-message gating test (AUTH-10)** — `bbd4a52` (test)

**Plan metadata commit:** (this SUMMARY) — pending atomic commit at end of plan.

## Files Created/Modified

### Created

- `packages/events/test/unit/identity-email-dispatch-failed.spec.ts` — 7 contract unit tests (enum constraint, optional fields, envelope narrowing)
- `packages/events/test/unit/nats-subscriber-dlq.spec.ts` — 7 unit tests (buildConsumerConfig defaults + overrides, buildDlqSubject, computeDlqAction)
- `packages/events/test/unit/nats-publisher-raw.spec.ts` — 1 unit test (publishRaw forwards bytes verbatim, no EventEnvelope.parse)
- `apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts` — 1 e2e gating test (AUTH-10 / D-18); name contains 'AUTH-10' for downstream grep gate

### Modified

- `packages/events/src/contracts/identity.ts` — added `IdentityEmailDispatchFailedV1Payload` + `IdentityEmailDispatchFailedV1`
- `packages/events/src/index.ts` — barrel exports for new contract + `DlqPublisher` type
- `packages/events/src/ports.ts` — `SubscribeOptions` extended with `maxDeliver`, `ackWaitMs`, `dlqPublisher`; new `DlqPublisher` interface
- `packages/events/src/infrastructure/nats-publisher.ts` — added `publishRaw(subject, data)`; class now implements `EventPublisher & DlqPublisher`
- `packages/events/src/infrastructure/nats-subscriber.ts` — full rewrite of `RunningSubscription`; helpers `buildConsumerConfig`, `buildDlqSubject`, `computeDlqAction`; outer try/catch around `for await`; DLQ branch emits alert envelope via `db.withoutTenant`
- `packages/events/eslint.config.mjs` — `nats-subscriber.ts` added to `@withoutTenant-allowlist` override block (line 56)
- `packages/db/src/withoutTenant.allowlist.ts` — `packages/events/src/infrastructure/nats-subscriber.ts` appended to `WITHOUT_TENANT_ALLOWLIST` (line 56)
- `packages/db/test/unit/withoutTenant-allowlist.spec.ts` — length assertion bumped from 8 → 9
- `apps/api/src/contexts/audit/application/record-audit.service.ts` — `ACTION_TARGET_KIND['identity.email_dispatch_failed'] = 'platform'`
- `apps/api/src/infrastructure/nats.module.ts` — `dlq.>` added to `STREAM_SUBJECTS` (Rule 2 deviation — see below)

## Decisions Made

- **Used `info.deliveryCount` (not `redeliveryCount`)** — NATS 2.29 deprecated `redeliveryCount` in favour of `deliveryCount`; both are present on `DeliveryInfo` but `deliveryCount` is the canonical field going forward. The plan referenced `redeliveryCount` (legacy name) but the implementation uses the current field.
- **`TenantAwareDb` injected at `NatsSubscriberOptions` (connect-time), not per-subscribe** — keeps `SubscribeOptions` framework-agnostic and lets every subscription on the same subscriber share the same db handle. Optional so test setups that don't care about the alert tail can pass `undefined`.
- **DLQ branch always ACKs the poison message after routing** — even if `dlqPublisher` is omitted or the publish fails. Without this the poison message would NAK-loop again. Degraded modes are logged at ERROR so ops sees them; the alternative (crash the consumer) was unacceptable.
- **Helpers exported from the subscriber file** — `computeDlqAction`, `buildDlqSubject`, `buildConsumerConfig` are part of the module surface so they can be unit-tested without a real NATS container. Trade-off: slightly wider public API. Worth it — the regression net is the whole point of AUTH-10.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] Added `dlq.>` to `STREAM_SUBJECTS` in apps/api/src/infrastructure/nats.module.ts**

- **Found during:** Task 3 (initial e2e run)
- **Issue:** The first e2e run failed with `NatsError: 503` when the DLQ branch tried to `publishRaw('dlq.identity.test_poison_*.v1', ...)`. JetStream rejects publishes to subjects not in the stream's `subjects` config. The plan added the DLQ-routing code path without adding the matching stream subject — DLQ in production would silently 503 and ops would lose the forensic payload.
- **Fix:** Appended `'dlq.>'` to `STREAM_SUBJECTS` with a comment referencing AUTH-10 and D-19. New streams (per `ensureStream` in `nats-publisher.ts`) accept `dlq.*` subjects from this commit forward. Existing streams in pre-Phase-3 environments would need a one-shot `nats stream edit` to add the subject; documented as a deploy-runbook note (TODO outside Plan 01 scope).
- **Files modified:** `apps/api/src/infrastructure/nats.module.ts`
- **Verification:** Re-ran AUTH-10 e2e; all 4 assertions green (max_deliver reached, DLQ subject received, outbox alert row materialized, no further redelivery).
- **Committed in:** `bbd4a52` (Task 3 commit)

**2. [Rule 3 — Blocking] Installed worktree-local node_modules + updated test eslint fixups**

- **Found during:** Task 3 (e2e test first run)
- **Issue:** Worktree initially used symlinked node_modules pointing at the main repo's pnpm store. The @resto/events package resolved to the MAIN repo's source (which did not yet have `publishRaw`), so the e2e test failed with `publisher.publishRaw is not a function` even though the worktree's source was correct. Additionally, lint-staged flagged `@typescript-eslint/no-explicit-any` on the test file's `(publisher as any).js` stub and `@typescript-eslint/require-await` on a vi.fn signature.
- **Fix:** Ran `pnpm install --frozen-lockfile --prefer-offline` in the worktree to create a worktree-local node_modules where `@resto/events` resolves to the worktree's packages/events. Rewrote the unsafe-any cast to `as unknown as { js: ... }` and dropped the unused `async` from the vi.fn arrow.
- **Files modified:** `packages/events/test/unit/nats-publisher-raw.spec.ts`, `packages/events/test/unit/nats-subscriber-dlq.spec.ts` (lint-only); no source changes for the install step.
- **Verification:** AUTH-10 e2e + all 30 events unit tests + 2 db parity tests pass.
- **Committed in:** lint fixes bundled into `cc13070` (Task 2b commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical for AUTH-10 production correctness, 1 blocking for worktree-local resolution + lint hygiene).
**Impact on plan:** Both deviations strictly improve correctness — without dlq.> in the stream subjects, AUTH-10 would ship as a silent no-op in production. No scope creep.

## Authentication Gates

None — no external service auth required for Plan 01.

## Issues Encountered

- **Worktree absolute-path drift (#3099).** Initial Edit/Write calls used `/Users/mp_dev/projects/RestOS/...` (main-repo path) instead of the worktree path. Detected via the per-commit cwd-drift assertion + diff against the worktree files. Recovered by `git restore`ing the main repo, re-applying all edits against `/Users/mp_dev/projects/RestOS/.claude/worktrees/agent-afcb854ab531b5a28/...`. No content lost — the recovery happened before any commit. Acknowledged in worktree-path-safety.md as a known failure mode.

## User Setup Required

None — no external services configured.

## Next Phase Readiness

- **AUTH-10 gate is GREEN.** Downstream Phase 3 waves (02 Resend adapter, 03 invitation send, 04 invitation accept, 05 password reset, 06 email verification, 07 cookie sweep, 08 2FA, 09 role seeding + AUTH-11) can now proceed knowing poison messages will not silently melt subscribers.
- **D-05 Resend adapter (Plan 02) gets a head start.** The `IdentityEmailDispatchFailedV1` contract already exists with `reason: 'resend_terminal_failure'` ready to wire — no contract work needed in Plan 02 for the terminal-failure tail.
- **Operational runbook note (out of Plan 01 scope):** Pre-Phase-3 NATS streams that were created without `dlq.>` in their subjects list need a one-shot `nats stream edit RESTO_EVENTS --subjects 'tenancy.>,identity.>,catalog.>,ordering.>,billing.>,dlq.>'` before this code ships to staging/prod. New streams created by `ensureStream` automatically include `dlq.>` from this commit forward.
- **Stream subject change required for Plan 03 dispatcher reuse** — none beyond what's already shipped here.

## Self-Check: PASSED

- [x] All 4 task commits exist in git log: `b836e9f`, `cd334c2`, `cc13070`, `bbd4a52`
- [x] All 4 created files exist on disk (verified via `[ -f path ]` implicit during writes)
- [x] All plan `<verification>` grep checks pass: `max_deliver` (1+), `publishRaw` (1), `identity.email_dispatch_failed.v1` (1), `identity.email_dispatch_failed` projection (1), allowlist (1), eslint override (1)
- [x] All plan `<success_criteria>` met: AUTH-10 e2e green; contract reusable by D-05; e2e test name contains 'AUTH-10'; audit projection routes to 'platform'; TEN-11 triad satisfied (allowlist + ESLint override + parity test green + grep counts)
- [x] No regressions: 30 events unit tests + 4 outbox-dispatcher.e2e tests + 2 db parity tests pass.

---

_Phase: 03-auth-completion_
_Plan: 01-nats-dlq_
_Completed: 2026-05-30_
