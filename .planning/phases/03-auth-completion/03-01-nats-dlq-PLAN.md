---
phase: 03-auth-completion
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/events/src/infrastructure/nats-subscriber.ts
  - packages/events/src/infrastructure/nats-publisher.ts
  - packages/events/src/contracts/identity.ts
  - packages/events/src/index.ts
  - packages/db/src/withoutTenant.allowlist.ts
  - packages/events/eslint.config.mjs
  - test/unit/withoutTenant-allowlist.spec.ts
  - apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts
  - apps/api/src/contexts/audit/application/record-audit.service.ts
autonomous: true
requirements:
  - AUTH-10
  - TEN-11
goal: |
  Wire NATS JetStream DLQ on every consumer subscription so poison messages
  stop redelivering after `max_deliver: 5`, route to `dlq.<subject>`, emit an
  alert envelope, and prove this end-to-end before any downstream Phase 3
  wave runs. Ships FIRST per D-18. Also registers the new
  `nats-subscriber.ts` DLQ-branch call site in the TEN-11 withoutTenant
  allowlist (per plan-checker B-3 revision 2026-05-30).
tags:
  - nats
  - dlq
  - poison-message
  - events
  - ten-11
  - phase-03

must_haves:
  truths:
    - 'A NATS subscriber configured with max_deliver: 5 stops redelivering a poison message after the 5th attempt'
    - 'The poison message lands on subject dlq.<original_subject> with the original envelope payload bytes'
    - "An identity.email_dispatch_failed.v1 envelope (reason: 'dlq_routed') is emitted on terminal DLQ routing"
    - 'Subscriber #run() catches iterator-level errors so process does not crash on broker disconnect'
    - 'An e2e poison-message test exists and gates every other Phase 3 wave'
    - 'packages/events/src/infrastructure/nats-subscriber.ts is registered in WITHOUT_TENANT_ALLOWLIST and has a matching per-file ESLint override block; assertWithoutTenantCallsiteRegistered passes during preflight'
  artifacts:
    - path: 'packages/events/src/infrastructure/nats-subscriber.ts'
      provides: 'SubscribeOptions { maxDeliver, ackWaitMs, dlqPublisher } + DLQ branch in #run()'
      contains: 'max_deliver'
    - path: 'packages/events/src/infrastructure/nats-publisher.ts'
      provides: 'publishRaw(subject, bytes) helper used by DLQ branch'
      contains: 'publishRaw'
    - path: 'packages/events/src/contracts/identity.ts'
      provides: 'IdentityEmailDispatchFailedV1 contract with reason discriminant'
      contains: 'identity.email_dispatch_failed.v1'
    - path: 'packages/db/src/withoutTenant.allowlist.ts'
      provides: 'WITHOUT_TENANT_ALLOWLIST extended with nats-subscriber.ts (TEN-11 gate satisfied)'
      contains: 'nats-subscriber.ts'
    - path: 'packages/events/eslint.config.mjs'
      provides: 'Per-file ESLint override block for nats-subscriber.ts mirroring existing run-deduped/dispatcher entries'
      contains: 'nats-subscriber.ts'
    - path: 'apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts'
      provides: 'Gating e2e: max_deliver reached + dlq.<subject> landed + alert envelope emitted'
      min_lines: 80
  key_links:
    - from: 'packages/events/src/infrastructure/nats-subscriber.ts'
      to: 'packages/events/src/infrastructure/nats-publisher.ts'
      via: 'DLQ publishRaw injection on terminal redelivery'
      pattern: "publishRaw\\("
    - from: 'packages/events/src/infrastructure/nats-subscriber.ts'
      to: 'packages/db/src/withoutTenant.allowlist.ts'
      via: 'TEN-11 allowlist entry pairing the db.withoutTenant call site'
      pattern: "nats-subscriber\\.ts"
    - from: 'apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts'
      to: 'dlq.identity.email_dispatch_failed.v1'
      via: 'JetStream subscribe + assert message received'
      pattern: "dlq\\."
    - from: 'apps/api/src/contexts/audit/application/record-audit.service.ts'
      to: 'identity.email_dispatch_failed'
      via: 'ACTION_TARGET_KIND projection map entry'
      pattern: "identity\\.email_dispatch_failed"
---

<objective>
Close the AUTH-10 production-readiness gap: NATS consumers currently configure
only `ack_policy` and `max_ack_pending` (verified `nats-subscriber.ts:60-66`),
so a malformed envelope NAK-loops forever and silently melts the audit
subscriber. This plan adds `max_deliver: 5`, a terminal DLQ branch that
republishes to `dlq.<subject>`, emits the new
`identity.email_dispatch_failed.v1` envelope (with a `reason: 'dlq_routed'`
discriminant) onto the outbox, and proves it with an e2e poison-message test.

Purpose: AUTH-10 is the GATING requirement for Phase 3 per D-18 + Skeptic
MED-7. Every downstream wave (email adapter, invitation, reset, verification,
cookie sweep, role seed, hook wiring) emits events on `identity.>`. Without
DLQ wiring shipped first, those waves ship into infrastructure that swallows
poison messages with no trace — the exact failure mode auth completion is
supposed to prevent.

Output: A subscriber that bounds redelivery, a DLQ publisher path, a new
event contract `identity.email_dispatch_failed.v1` reusable by D-05 (Resend
adapter terminal-failure path) AND by the DLQ branch with a `reason`
discriminant, audit projection wired, the TEN-11 allowlist entry +
matching ESLint override for the new `db.withoutTenant` call site, and a
gating e2e test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-auth-completion/03-CONTEXT.md
@.planning/phases/03-auth-completion/03-RESEARCH.md
@packages/events/CLAUDE.md
@packages/CLAUDE.md
@packages/events/src/infrastructure/nats-subscriber.ts
@packages/events/src/infrastructure/nats-publisher.ts
@packages/events/src/contracts/identity.ts
@packages/events/src/envelope.ts
@apps/api/src/contexts/audit/application/record-audit.service.ts
@packages/db/src/withoutTenant.allowlist.ts
@packages/events/eslint.config.mjs

<interfaces>
<!-- Contracts the executor needs. Extracted directly from RESEARCH.md Pattern 4 + codebase. -->

From packages/events/src/infrastructure/nats-subscriber.ts (current shape, lines 60-66 — Phase 3 extends):

- subscribe(options: SubscribeOptions): Promise<EventSubscription>
- Currently: { durableName, subject, maxInFlight }
- EXTEND with: { maxDeliver?: number = 5, ackWaitMs?: number = 30_000, dlqPublisher?: EventPublisher }
- JetStream consumer.add() must include max_deliver: maxDeliver, ack_wait: ackWaitMs \* 1_000_000 (nanoseconds)
- #run() for-await loop wrapped in outer try/catch (broker disconnect protection)
- Inner try/catch per-message: on throw, inspect msg.info.redeliveryCount; if >= maxDeliver-1 then publishRaw to dlq.<subject> + emit alert envelope + ack; else nak

From packages/events/src/infrastructure/nats-publisher.ts (current shape):

- publish(envelope: EventEnvelope): Promise<void>
- ADD: publishRaw(subject: string, data: Uint8Array, opts?: { headers?: MsgHdrs }): Promise<void> — raw subject + payload, no envelope validation (so we can republish poison bytes verbatim)

From packages/events/src/contracts/identity.ts (existing shape):

- IdentitySignedInV1, IdentitySignedOutV1, IdentityPasswordResetCompletedV1
- ADD: IdentityEmailDispatchFailedV1 with payload { userId?: UUID, tenantId?: TenantId, reason: 'dlq_routed'|'resend_terminal_failure', originalSubject: string, originalEnvelopeId?: UUID, redeliveryCount?: number, errorMessage?: string }
- tenantId optional (DLQ branch may not know it when envelope is malformed; alert still useful)

From apps/api/src/contexts/audit/application/record-audit.service.ts:7-22 (existing ACTION_TARGET_KIND map):

- const ACTION_TARGET_KIND: Record<string, string> = { 'identity.signed_in': 'user', 'identity.signed_out': 'user', ... }
- ADD: 'identity.email_dispatch_failed': 'platform' (not a user-target; platform-level alert)

TEN-11 allowlist (canonical shape, verified by orchestrator scout 2026-05-30):

- File: packages/db/src/withoutTenant.allowlist.ts
- Shape: `export const WITHOUT_TENANT_ALLOWLIST = [<file-path-string>, ...] as const;`
- Entries are FILE PATHS (relative to repo root) of every module that may call `db.withoutTenant(...)`.
- Existing entries: apps/api/src/contexts/tenancy/infrastructure/{brand-drizzle,tenant-drizzle}.repository.ts; apps/api/src/contexts/audit/application/record-audit.service.ts; apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts; packages/db/src/cli/audit-fks.ts; packages/events/src/inbox/run-deduped.ts; packages/events/src/outbox/dispatcher.ts; packages/db/src/inbox-retention.ts
- Parallel ESLint per-file override blocks live in apps/api/eslint.config.mjs, packages/db/eslint.config.mjs, packages/events/eslint.config.mjs (file header comment in the allowlist source documents this pairing).
- Parity test: test/unit/withoutTenant-allowlist.spec.ts asserts allowlist ↔ ESLint override blocks ↔ actual call-site files stay in sync.
- Preflight assertion: assertWithoutTenantCallsiteRegistered fires during pnpm preflight; the file must exist on disk and have at least one db.withoutTenant call to count as registered.
  </interfaces>
  </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Define IdentityEmailDispatchFailedV1 contract + extend audit projection</name>
  <read_first>
    - packages/events/src/contracts/identity.ts (lines 1-end; existing contract shape — IdentitySignedInV1 et al)
    - packages/events/src/envelope.ts (buildEnvelope + defineEventContract signature)
    - packages/events/src/index.ts (barrel — must re-export new contract)
    - apps/api/src/contexts/audit/application/record-audit.service.ts:7-22 (ACTION_TARGET_KIND existing map)
    - .planning/phases/03-auth-completion/03-RESEARCH.md (Common Pitfalls section, Pitfall 2 — DLQ alert envelope shape)
  </read_first>
  <behavior>
    - Test 1: Importing IdentityEmailDispatchFailedV1 from @resto/events resolves at compile time
    - Test 2: IdentityEmailDispatchFailedV1Payload.parse({ reason: 'dlq_routed', originalSubject: 'identity.signed_in.v1' }) returns the parsed object (tenantId/userId/originalEnvelopeId/redeliveryCount/errorMessage all optional)
    - Test 3: IdentityEmailDispatchFailedV1Payload.parse({ reason: 'invalid_reason' as never, originalSubject: 'x' }) throws (enum constraint enforced)
    - Test 4: deriveTargetType for 'identity.email_dispatch_failed.v1' returns 'platform'
  </behavior>
  <action>
    Add IdentityEmailDispatchFailedV1 to packages/events/src/contracts/identity.ts following the existing defineEventContract pattern at lines 14, 28, 42 of that file. Payload Zod schema includes: reason (z.enum(['dlq_routed', 'resend_terminal_failure'])), originalSubject (z.string().min(1).max(255)), originalEnvelopeId (z.string().uuid().optional()), redeliveryCount (z.number().int().nonnegative().optional()), errorMessage (z.string().max(2048).optional()), userId (z.string().uuid().optional()), tenantId (TenantId.optional()). Export both Payload schema and contract from src/index.ts barrel. Per D-05+AUTH-10 reuse-rationale in RESEARCH.md Pitfall 2: ONE contract serves both flows (Resend terminal failure AND NATS poison-routed) discriminated by `reason`. In apps/api/src/contexts/audit/application/record-audit.service.ts ACTION_TARGET_KIND map, add the entry `'identity.email_dispatch_failed': 'platform'` — NOT 'user', because the alert may carry no userId for poison-envelope branch.
  </action>
  <verify>
    <automated>pnpm --filter @resto/events typecheck &amp;&amp; pnpm --filter @resto/events test contracts/identity</automated>
    <automated>pnpm --filter @resto/api test record-audit.service</automated>
  </verify>
  <done>IdentityEmailDispatchFailedV1 contract exported from @resto/events with discriminated reason enum; ACTION_TARGET_KIND map has 'identity.email_dispatch_failed' → 'platform'; both unit specs pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend NatsJetStreamPublisher with publishRaw + wire DLQ branch in NatsJetStreamSubscriber</name>
  <read_first>
    - packages/events/src/infrastructure/nats-subscriber.ts (entire file — current SubscribeOptions, JetStream consumer.add() call, #run() for-await loop, msg.info usage)
    - packages/events/src/infrastructure/nats-publisher.ts (entire file — current publish() shape, NATS connection access)
    - packages/events/CLAUDE.md (NATS subscriber rules: max_deliver, ack_wait, max_ack_pending > 1, #run() try/catch wrapping)
    - .planning/phases/03-auth-completion/03-RESEARCH.md Pattern 4 (NATS DLQ consumer-side fallback example) — implementation template
    - packages/events/src/envelope.ts (buildEnvelope signature so DLQ branch can construct alert envelope)
    - packages/events/src/outbox/repository.ts (appendToOutbox signature — DLQ alert is written via outbox under db.withoutTenant)
  </read_first>
  <behavior>
    - Test 1: SubscribeOptions accepts maxDeliver (default 5), ackWaitMs (default 30_000), dlqPublisher
    - Test 2: consumer.add() receives max_deliver=5 and ack_wait=30_000_000_000 (nanoseconds) when defaults used
    - Test 3: When handler throws and msg.info.redeliveryCount === maxDeliver-1 (4 on default), DLQ branch publishes raw bytes to `dlq.<subject>` and acks the message
    - Test 4: When handler throws and redeliveryCount < maxDeliver-1, msg.nak() is called (no DLQ publish yet)
    - Test 5: When for-await iterator itself throws (simulated broker disconnect), outer try/catch logs error and exits cleanly (no unhandled rejection)
    - Test 6: publishRaw(subject, bytes) publishes the exact byte slice to JetStream without parsing (poison bytes stay verbatim)
  </behavior>
  <action>
    In packages/events/src/infrastructure/nats-publisher.ts, add a public method publishRaw(subject: string, data: Uint8Array): Promise<void> that calls the underlying JetStream client publish without EventEnvelope.parse. This intentionally bypasses validation so poison bytes can be relayed verbatim to the DLQ for forensic analysis. In packages/events/src/infrastructure/nats-subscriber.ts, extend SubscribeOptions per the interfaces block above. In the JetStream consumer.add() call, pass max_deliver: options.maxDeliver ?? 5, ack_wait: (options.ackWaitMs ?? 30_000) * 1_000_000 (nanoseconds — NATS uses ns), retain ack_policy: AckPolicy.Explicit, retain max_ack_pending: options.maxInFlight ?? 10 (>1 per CLAUDE.md rule). In #run() wrap the entire `for await` loop body in an OUTER try/catch logging at error level on iterator failure (broker disconnect protection per packages/events/CLAUDE.md). Inside the loop add an inner try/catch around envelope parse + handler dispatch. On inner throw: read msg.info.redeliveryCount; if `redeliveryCount >= (options.maxDeliver ?? 5) - 1` then construct DLQ subject as `dlq.${originalSubject}` (where originalSubject is msg.info.subject or options.subject — per RESEARCH.md Open Question 3 RESOLVED: one DLQ subject per source subject, NOT a single bucket) AND if options.dlqPublisher is provided call await options.dlqPublisher.publishRaw(dlqSubject, msg.data) AND emit a platform-level IdentityEmailDispatchFailedV1 envelope via buildEnvelope({ type: 'identity.email_dispatch_failed.v1', payload: { reason: 'dlq_routed', originalSubject, redeliveryCount: msg.info.redeliveryCount, errorMessage: String(err) } }) — append to outbox via the same publisher path; then msg.ack() so the consumer moves on. If redeliveryCount < threshold call msg.nak() (NATS retries). Log every DLQ routing at error level with subject, dlq, err, redeliveryCount. Do NOT emit envelope inside an HTTP middleware ALS frame; use `db.withoutTenant('NATS DLQ alert — poison envelope, no tenant context', async (tx) => { await appendToOutbox(tx, envelope); })` per ADR-0020 I-6 and packages/events/CLAUDE.md tenant-context rule (DLQ branch fires from subscriber code, NOT HTTP middleware). The outbox write inherits the tenant-less tx — appendToOutbox does NOT need a second allowlist registration (Task 2b registers the subscriber file itself, which owns the db.withoutTenant call site).
  </action>
  <verify>
    <automated>pnpm --filter @resto/events typecheck</automated>
    <automated>pnpm --filter @resto/events test nats-subscriber</automated>
    <automated>pnpm --filter @resto/events test nats-publisher</automated>
  </verify>
  <done>
    SubscribeOptions includes maxDeliver/ackWaitMs/dlqPublisher; consumer.add receives max_deliver=5 + ack_wait=30_000_000_000 ns; #run() has outer try/catch + inner DLQ branch at redeliveryCount threshold; publishRaw added to NatsJetStreamPublisher; DLQ alert envelope written under db.withoutTenant('NATS DLQ alert — poison envelope, no tenant context'); all 6 behavior tests pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2b: TEN-11 allowlist registration for nats-subscriber.ts DLQ-branch call site (per plan-checker B-3)</name>
  <read_first>
    - packages/db/src/withoutTenant.allowlist.ts (existing WITHOUT_TENANT_ALLOWLIST array — append, never replace)
    - packages/events/eslint.config.mjs (existing per-file override blocks for run-deduped.ts and dispatcher.ts — mirror that block shape for nats-subscriber.ts)
    - test/unit/withoutTenant-allowlist.spec.ts (parity test — re-runs automatically; check if any explicit count assertion needs the new entry)
    - packages/db/CLAUDE.md ADR-0020 I-6 and TEN-11 rules (allowlist + reason-string + ESLint override are a single triad — registering the file path without the ESLint override or vice versa fails preflight)
  </read_first>
  <behavior>
    - Test 1: grep 'nats-subscriber.ts' packages/db/src/withoutTenant.allowlist.ts returns ≥1 match
    - Test 2: grep 'nats-subscriber.ts' packages/events/eslint.config.mjs returns ≥1 match inside an override block that disables the no-restricted-imports / custom withoutTenant lint rule (whichever rule the existing run-deduped.ts block silences — mirror exactly)
    - Test 3: pnpm exec nx test events --testPathPattern=withoutTenant-allowlist exits 0 (parity test green; new entry pairs correctly)
    - Test 4: pnpm exec nx run-many --target=preflight passes (assertWithoutTenantCallsiteRegistered finds the file on disk AND it contains at least one `db.withoutTenant(` call — Task 2 ensures that call exists)
  </behavior>
  <action>
    Step A: Edit packages/db/src/withoutTenant.allowlist.ts — add the literal string 'packages/events/src/infrastructure/nats-subscriber.ts' to the WITHOUT_TENANT_ALLOWLIST array. Maintain alphabetical / grouping order matching existing entries. Do NOT remove or reorder existing entries.

    Step B: Edit packages/events/eslint.config.mjs — add a new per-file override block targeting 'src/infrastructure/nats-subscriber.ts' that mirrors the existing override block for 'src/inbox/run-deduped.ts' or 'src/outbox/dispatcher.ts'. The block disables the lint rule that flags db.withoutTenant usages (verify which rule by reading the existing block once at implementation time — typically a custom rule name or a no-restricted-syntax selector). Keep the surrounding config structure intact.

    Step C: Run test/unit/withoutTenant-allowlist.spec.ts. The parity test compares the allowlist array against ESLint override file lists and against actual filesystem call sites. If the test contains an explicit length assertion (e.g., `expect(WITHOUT_TENANT_ALLOWLIST).toHaveLength(7)`), bump it to 8. Otherwise no test edits required.

    Step D: Document in 03-01-SUMMARY.md the exact line numbers added in the allowlist file and the ESLint config so future audits can grep them.

    NOTE: This task depends on Task 2 having added the actual `db.withoutTenant('NATS DLQ alert — poison envelope, no tenant context', ...)` call in nats-subscriber.ts. Without that call, assertWithoutTenantCallsiteRegistered will fail with "registered file has no db.withoutTenant call site". Execute Task 2 first; Task 2b cannot pass preflight standalone.

  </action>
  <verify>
    <automated>grep -c "nats-subscriber.ts" packages/db/src/withoutTenant.allowlist.ts</automated>
    <automated>grep -c "nats-subscriber.ts" packages/events/eslint.config.mjs</automated>
    <automated>pnpm exec nx test events --testPathPattern=withoutTenant-allowlist</automated>
    <automated>pnpm exec nx run-many --target=preflight</automated>
  </verify>
  <done>
    'packages/events/src/infrastructure/nats-subscriber.ts' present in WITHOUT_TENANT_ALLOWLIST (grep returns 1); matching per-file override block exists in packages/events/eslint.config.mjs (grep returns ≥1); parity test green; preflight green; assertWithoutTenantCallsiteRegistered finds the file on disk with a real db.withoutTenant call site from Task 2.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: E2E poison-message test — AUTH-10 gating test for downstream Phase 3 waves</name>
  <read_first>
    - apps/api/test/e2e/identity-audit.e2e.spec.ts (test harness shape — JetStream setup, subscription wiring, helpers)
    - apps/api/test/e2e/outbox-dispatcher.e2e.spec.ts (publish-roundtrip pattern)
    - packages/events/src/infrastructure/nats-subscriber.ts (just-modified — verify DLQ branch identifiers)
    - packages/events/src/contracts/identity.ts (IdentityEmailDispatchFailedV1 payload shape)
    - .planning/phases/03-auth-completion/03-RESEARCH.md ("Phase Requirements → Test Map" row AUTH-10 + Wave 0 Gaps list)
    - .planning/phases/03-auth-completion/03-CONTEXT.md D-18 (this test gates every other AUTH-* requirement)
  </read_first>
  <behavior>
    - Test 1: Subscribe to a test subject identity.test_poison.v1 with maxDeliver=5; publish a deliberately broken envelope (e.g. invalid JSON or schema-violating type); after at most 5 deliveries the inner handler stops being invoked
    - Test 2: A subscriber listening on dlq.identity.test_poison.v1 receives the original poison bytes verbatim
    - Test 3: An IdentityEmailDispatchFailedV1 envelope with reason='dlq_routed' and originalSubject='identity.test_poison.v1' lands on the outbox table (verify via direct DB read) within 2 seconds
    - Test 4: After DLQ routing, the original subject's consumer no longer redelivers the poison message (assert by waiting 1s and confirming no more handler invocations)
  </behavior>
  <action>
    Create apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts. Use the same harness pattern as identity-audit.e2e.spec.ts (NestJS testing module bootstrap, real Postgres + NATS testcontainers per outbox-roundtrip.spec.ts precedent). Test flow per D-18 + Skeptic MED-7: (a) wire a NatsJetStreamSubscriber on identity.test_poison.v1 with maxDeliver=5, ackWaitMs=1000 (short ack_wait to speed test redeliveries to <5s total), dlqPublisher set; the handler MUST throw on every invocation (forced poison branch). (b) publish a malformed envelope via raw NATS publish — bytes that fail EventEnvelope.parse (invalid JSON or schema). (c) await invocation counter reaches 5 (max_deliver). (d) await 1 second; assert counter does not exceed 5 (poison NAK loop bounded). (e) subscribe (separately) on dlq.identity.test_poison.v1 and assert one message received with the original poison bytes. (f) query outbox_events table directly via Drizzle; assert one row exists with type='identity.email_dispatch_failed.v1' and payload.reason='dlq_routed' and payload.originalSubject='identity.test_poison.v1'. Test name in spec file MUST reference AUTH-10 in describe block so grep can find it. This test ships in Wave 1 because per CONTEXT D-18 it gates every other AUTH-* requirement — execute-phase will not advance to Wave 2 until this test is green.
  </action>
  <verify>
    <automated>pnpm --filter @resto/api test:e2e nats-dlq-poison</automated>
  </verify>
  <done>nats-dlq-poison.e2e.spec.ts exists with 4 assertions (max_deliver bounded, DLQ subject received, outbox row materialized, no further redelivery); exits 0 on `pnpm --filter @resto/api test:e2e nats-dlq-poison`; describe block contains 'AUTH-10' string so downstream waves can grep.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                               | Description                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Publisher → NATS JetStream             | Any publisher (in-process outbox dispatcher or external) can submit bytes to a subject the audit subscriber listens on  |
| NATS broker → subscriber               | Broker delivers bytes; subscriber must defend against malformed envelopes from any source on the stream                 |
| Subscriber → handler                   | Handler errors must not crash subscriber loop (broker disconnect protection)                                            |
| Subscriber → outbox (db.withoutTenant) | Tenant-less DB write must be explicitly allowlisted under TEN-11 to prevent silent bypass of RLS / scoped-tx guarantees |

## STRIDE Threat Register

| Threat ID | Category               | Component                                                                                                      | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                 |
| --------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-03-01   | Denial of Service      | NATS audit subscriber                                                                                          | mitigate    | max_deliver: 5 + DLQ branch caps poison redelivery; subscriber recovers within 5 attempts × ack_wait                                                                                                                                                                            |
| T-03-02   | Denial of Service      | Subscriber #run() loop                                                                                         | mitigate    | Outer try/catch around `for await` so broker disconnect cannot crash process under --unhandled-rejections=strict                                                                                                                                                                |
| T-03-03   | Denial of Service      | max_ack_pending bottleneck                                                                                     | mitigate    | max_ack_pending raised above 1 (CLAUDE.md rule) so one NAK does not block subject                                                                                                                                                                                               |
| T-03-04   | Information Disclosure | DLQ payload exposure                                                                                           | accept      | DLQ subject `dlq.<original>` is internal-only (no public binding); same access level as original subject; audit team needs the bytes for forensic analysis                                                                                                                      |
| T-03-05   | Tampering              | DLQ alert envelope spoofed                                                                                     | mitigate    | Alert emission uses buildEnvelope (correlationId from OTel span); EventEnvelope.parse at appendToOutbox rejects malformed shapes (TEN-17)                                                                                                                                       |
| T-03-06   | Repudiation            | Poison message disappears silently                                                                             | mitigate    | identity.email_dispatch_failed.v1 envelope on terminal DLQ routing creates an immutable audit row with originalSubject + redeliveryCount + errorMessage                                                                                                                         |
| T-03-07   | Elevation of Privilege | DLQ branch fires under wrong tenant                                                                            | mitigate    | DLQ alert emitted via `db.withoutTenant('NATS DLQ alert — poison envelope, no tenant context')` per ADR-0020 I-6; never relies on ALS being bound (subscriber fires outside HTTP middleware); TEN-11 allowlist registration (Task 2b) prevents this from being a stealth bypass |
| T-03-SC   | Tampering              | NATS subject collision (`dlq.dlq.*` infinite loop if DLQ consumer wired to listen on `dlq.>` then republishes) | accept      | Phase 3 does NOT add a consumer on `dlq.*` subjects; ops monitoring picks up DLQ subjects manually; documented in runbook                                                                                                                                                       |
| T-03-SC2  | Tampering              | New db.withoutTenant call site ships without allowlist registration                                            | mitigate    | Task 2b registers the file in WITHOUT_TENANT_ALLOWLIST + matching ESLint override; preflight assertWithoutTenantCallsiteRegistered fails the build if registration drifts; parity test pins allowlist ↔ ESLint ↔ filesystem                                                     |

</threat_model>

<verification>
- pnpm --filter @resto/events typecheck (no type errors after SubscribeOptions extension)
- pnpm --filter @resto/events test (all unit specs green)
- pnpm --filter @resto/api test:e2e nats-dlq-poison (gating test green)
- pnpm exec nx test events --testPathPattern=withoutTenant-allowlist (parity test green)
- pnpm exec nx run-many --target=preflight (preflight green — assertWithoutTenantCallsiteRegistered passes)
- grep -n "max_deliver" packages/events/src/infrastructure/nats-subscriber.ts returns at least 1 match
- grep -n "publishRaw" packages/events/src/infrastructure/nats-publisher.ts returns at least 1 match
- grep -n "identity.email_dispatch_failed.v1" packages/events/src/contracts/identity.ts returns at least 1 match
- grep -n "identity.email_dispatch_failed" apps/api/src/contexts/audit/application/record-audit.service.ts returns at least 1 match
- grep -c "nats-subscriber.ts" packages/db/src/withoutTenant.allowlist.ts returns ≥1
- grep -c "nats-subscriber.ts" packages/events/eslint.config.mjs returns ≥1
</verification>

<success_criteria>

- AUTH-10 ROADMAP Success Criterion 4 satisfied for the NATS half: consumers have max_deliver: 5 + dlq.<subject> AND the configuration is exercised by an e2e poison-message test asserting (i) max_deliver reached, (ii) message lands in DLQ subject, (iii) alert envelope emitted
- IdentityEmailDispatchFailedV1 contract reused later in Plan 02 (Resend adapter terminal-failure path) — single contract for both flows discriminated by `reason`
- e2e test name contains 'AUTH-10' for downstream wave-2 grep gate
- Audit projection routes 'identity.email_dispatch_failed' → 'platform' (NOT 'user' — DLQ branch may have no userId)
- TEN-11 satisfied for the new DLQ db.withoutTenant call site: allowlist entry, ESLint override block, parity test green, preflight green
  </success_criteria>

<output>
Create `.planning/phases/03-auth-completion/03-01-SUMMARY.md` when done. Include the exact line numbers where 'nats-subscriber.ts' was added to packages/db/src/withoutTenant.allowlist.ts and packages/events/eslint.config.mjs for future audit grepping.
</output>
