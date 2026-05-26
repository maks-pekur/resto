---
phase: 01-tenancy-hardening
plan: 01
subsystem: events
tags: [outbox, idempotency, zod, envelope, validation, better-auth-pin]

requires:
  - phase: pre-01
    provides: existing OutboxDispatcher + appendToOutbox + EventEnvelope schema (packages/events)
provides:
  - Idempotent OutboxDispatcher.stop() via cached #stopPromise — concurrent callers converge on a single promise reference
  - appendToOutbox rejects malformed EventEnvelope payloads at the application boundary via EventEnvelope.parse() (Zod)
  - Verification that better-auth and @better-auth/cli are pinned to =1.4.22 exact in apps/api/package.json (shipped previously in 19a9da2)
affects: [01-03, 01-04, 01-05, 01-06]

tech-stack:
  added: []
  patterns:
    - 'Cached stop-promise idiom (#stopPromise ??= new Promise) for idempotent async lifecycle teardown'
    - 'Zod parse at infrastructure boundary — schema validation runs at adapter entry, not at broker'

key-files:
  created:
    - packages/events/test/integration/dispatcher-stop-idempotent.spec.ts
  modified:
    - packages/events/src/outbox/dispatcher.ts
    - packages/events/src/outbox/repository.ts
    - packages/events/test/integration/outbox-roundtrip.spec.ts

key-decisions:
  - "Test the cached-promise convergence via promise-reference identity (p1 === p2 === p3) rather than instrumenting the private #stopResolver — true ECMAScript private fields cannot be accessed via (x as any)['#field'], so the original plan's spy approach was unimplementable. Identity assertion is a stronger guarantee of the underlying invariant."
  - 'TEN-18 is verify-only — better-auth pin was already enforced in commit 19a9da2 (per D-03).'

patterns-established:
  - 'Cached stop-promise: store `#stopPromise = new Promise(...)` on first call, return it on every subsequent call until the loop tail nullifies the slot after resolution'
  - 'Envelope-at-boundary: every adapter that serializes a domain event into infrastructure MUST call EventEnvelope.parse() before any I/O'

requirements-completed:
  - TEN-16
  - TEN-17
  - TEN-18

duration: 6min
completed: 2026-05-26
---

# Plan 01-01: Outbox Hardening (PR 1) — Summary

Two foundational outbox bugs fixed: `OutboxDispatcher.stop()` is now idempotent (concurrent callers no longer race on `#stopResolver` nullification), and `appendToOutbox` validates `EventEnvelope` at insert-time so malformed payloads never reach the DB. TEN-18 verified — `better-auth =1.4.22` pin survived planning.

## Verification

| Command                                                                                           | Result              |
| ------------------------------------------------------------------------------------------------- | ------------------- |
| `pnpm --filter @resto/events exec vitest run test/integration/dispatcher-stop-idempotent.spec.ts` | PASS — 3/3 in 4.4s  |
| `pnpm --filter @resto/events exec vitest run test/integration/outbox-roundtrip.spec.ts`           | PASS — 2/2 in 6.9s  |
| `pnpm --filter @resto/events exec vitest run`                                                     | PASS — 22/22 in 13s |
| `pnpm --filter @resto/events exec tsc -p tsconfig.json --noEmit`                                  | PASS                |
| `pnpm --filter @resto/events exec eslint .`                                                       | PASS                |
| `pnpm exec vitest run test/e2e/outbox-dispatcher.e2e.spec.ts` (apps/api regression)               | PASS — 2/2 in 6.5s  |

## Commits

- `8bb671f` `fix(events): make OutboxDispatcher.stop() idempotent`
- `ce5a072` `fix(events): validate EventEnvelope in appendToOutbox before insert`

## Deviations

- **Task 1, test case 3** — replaced the plan's "instrument the private resolver" approach with a stronger promise-reference identity assertion (`p1 === p2 === p3`). The plan's spy approach was unimplementable: `#stopResolver` is a true ECMAScript private name and is unreachable via `(dispatcher as any)['#stopResolver']`. Identity equality is a strictly stronger proof of the cached-promise invariant. All three plan acceptance criteria (`#stopPromise` field present + `??=` usage + 3 passing tests under default Vitest timeout) are satisfied.
