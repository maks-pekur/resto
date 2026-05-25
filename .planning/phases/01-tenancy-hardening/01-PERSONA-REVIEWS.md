## Investor Discuss Review — Phase 1: Tenancy Hardening (2026-05-24)

**Reviewer:** persona-investor

---

### Capital efficiency of Phase 1

The core tension here is real: you are a solo founder spending 2–4 weeks of irreplaceable pre-revenue runway on plumbing that zero customers will ever see, benchmark against, or pay a premium for. Let me be direct about both sides.

**The case for doing it now:** The multi-tenant data model is already in production (RLS, composite FK, ScopedTx). Phase 1 is not building multi-tenancy from scratch — it is closing known holes in a system already shipped. If you defer TEN-05/TEN-06 (erasure scheduler) and you sign an EU customer before you have automated GDPR erasure, you have a compliance liability on day one of revenue. That is a worse position than spending two weeks now. Similarly, TEN-16 (OutboxDispatcher deadlock) and TEN-08 (race-condition isolation tests) are bugs in existing code, not features — calling Phase 1 "pre-revenue plumbing" is only half right. Some of it is bug-fixing.

**The case against full scope:** Several of the 18 requirements are genuine engineering hygiene that generates zero business value at the scale of 0–3 paying tenants. TEN-12 (ESLint rule for `withoutTenant`), TEN-14/TEN-15 (buildEnvelope + ESLint for correlationId), and TEN-10 (per-tenant OTel metrics with `tenant_id` label) are quality-of-life improvements for a team that does not yet exist. You are one person. The ESLint rules don't protect you from yourself at the same rate they protect a 5-person team where a distracted engineer can ship a bad PR on a Friday.

**Net read:** Phase 1 as scoped is approximately 60% essential (close real bugs + GDPR exposure before customers arrive) and 40% forward-looking hygiene (guard rails for a team you don't have yet). A capital-efficient founder would split this — ship the essential 60% now, defer the 40% to a Phase 1.1 that executes after first signed LOI. The sequence would not block Phase 2 through 5.

---

### Moat implications

Multi-tenancy architecture executed at this depth (RLS double-enforcement, composite FK, audit trail, erasure pipeline) does not create moat against Toast or Olo. They have this. Choice and Tablein have simpler versions. What the architecture does create is a specific form of switching cost moat once tenants have data in it: a restaurant with 12 months of order history, customer records, and a published menu inside RestOS faces real friction to move. That is switching-cost moat, not architectural moat.

The Phase 1 requirements that are most moat-relevant are not the ones that look complex. TEN-09 (audit completeness for tenancy + identity events) and TEN-05/TEN-06 (GDPR erasure automation) are the two that a European restaurant operator could ask you about during a sales conversation. Being able to say "we are GDPR-native, here is the audit trail, here is the automated erasure SLA" is a differentiator against Choice and Tablein, who are generally lighter on this. Toast and Olo are not a real competitive threat in the EU independent restaurant segment at MVP-1 ACV levels; they optimize for US enterprise.

TEN-10 (per-tenant OTel metrics) is not a moat. It is an operational cost saver for you when you have 50+ tenants and need to diagnose a noisy-neighbor problem. At 3 tenants, you will spot problems by reading logs.

---

### Pre-revenue priorities you'd want addressed

**Cannot defer without unrecoverable damage:**

- **TEN-01, TEN-02, TEN-03, TEN-04** (suspend/resume lifecycle): If your first customer is a bad actor or fails to pay, you have no lever to lock them out without a full offboarding. You need this before you accept money.
- **TEN-05, TEN-06** (erasure scheduler): Signing an EU customer without automated erasure is a regulatory liability. Manual CLI erasure is not an audit-defensible GDPR SLA. This must be closed before you onboard any EU restaurant.
- **TEN-07** (resto_app privilege separation): Already implemented at DB level per the validated requirements, but the SQL preflight boot assertion is not wired. This is a security gap that sits quietly until it isn't. At a penetration test during Series A diligence, this surfaces as a finding. Wire it now.
- **TEN-16** (OutboxDispatcher deadlock): This is a production bug in shipping code. Stripe webhooks failing silently during a graceful restart is a payments incident. Fix it before payments go live — which means fix it before Phase 8 depends on it. Phase 1 is the right time.
- **TEN-17** (appendToOutbox envelope validation): Same reasoning. Malformed events reaching NATS and dying in the consumer with no insert-time signal is a debugging nightmare during a live incident.
- **TEN-08** (cross-tenant isolation test net for race conditions): This is the regression net that gives you confidence to build everything else on top. If you skip it and ship a cross-tenant data leak to a restaurant customer, you lose that customer and potentially violate GDPR. Non-negotiable.

**Can defer to Phase 1.1 (after first 3 paying tenants) without meaningful risk:**

- **TEN-10** (per-tenant OTel metrics with `tenant_id` label): At 0–3 tenants you can attribute every anomaly by reading logs. This becomes operationally necessary at 20–50 tenants. Defer it.
- **TEN-12** (ESLint rule for `withoutTenant`): The runtime assertion in TEN-11 already catches violations at execution. The ESLint rule is CI-time enforcement for a larger team. As a solo founder, the runtime throw is sufficient guard.
- **TEN-15** (ESLint rule for `correlationId: randomUUID()`): Same logic as TEN-12. The `buildEnvelope` refactor (TEN-14) is worth doing for trace quality; the ESLint rule catching future violations is a team-scale guard, not a solo-founder guard.
- **TEN-18** (Better Auth exact pin): Pinning to `=1.4.22` is good hygiene but the risk horizon is "next time you run npm install." Pin it when you next touch auth dependencies. It is a one-line package.json change, not a phase deliverable.

---

### GDPR / regulatory exposure assessment

TEN-05 and TEN-06 are not compliance theater. They are table-stakes for EU market entry with any customer who has a DPO or has read their GDPR obligations. Here is the specific risk: an independent restaurant may not ask you about GDPR during onboarding, but the moment they have a guest request for data deletion, they will forward it to you. If you cannot execute it automatically within the statutory 30-day window, you are in violation, and so is your customer. That creates a contractual liability that is disproportionate to your revenue at MVP-1 ACV.

The automated scheduler (TEN-05/TEN-06) is also cheap. This is a NestJS `@Cron` calling an already-implemented `executeErasure()`. The service exists; the scheduler does not. Estimated effort: a few hours. The regulatory exposure of deferring this vastly exceeds the cost of building it.

TEN-13 (`inbox_processed` retention sweep) is a different kind of compliance: it is data minimization, not subject-rights management. The GDPR risk here is lower because `inbox_processed` rows are deduplication records, not PII. The performance risk (unbounded table growth slowing DB) is the more immediate concern. Still, this is easy to build and has compounding cost if deferred — defer only if timeline is truly critical.

CRM-04/CRM-05 (guest PII erasure, deferred to Phase 12) is a larger GDPR gap that Phase 1 does not address. Before you onboard paying EU customers, you need a clear contractual answer for "what happens when a guest requests erasure of their personal data?" The erasure pipeline for tenants exists; the erasure pathway for guest records does not. That is a Phase 12 problem that should move earlier in the roadmap if EU is the primary launch market.

---

### Single-customer test

If I signed up tomorrow as the first paying restaurant and had 30 days to evaluate:

**Would notice within 30 days:**

- Suspend/resume missing (TEN-01–04): The moment I need to test billing failure scenarios or have a rogue staff member, this is visible.
- `operator@example.com` placeholder in the admin sidebar (CONCERNS.md): This is the first thing I see after login. It signals "unfinished product."
- Email adapter not wired for reset-password and invitation (CONCERNS.md): On day 3 when I try to invite my partner as an admin, the invitation never arrives. Blocking.
- Source maps shipped to production in qr-menu (CONCERNS.md): I would not notice this unless I opened dev tools, but a security-conscious restaurant owner or their IT person would.

**Would never notice:**

- TEN-10 (per-tenant OTel metrics): I never look at your infrastructure dashboards.
- TEN-12/TEN-15 (ESLint rules): I have no visibility into your CI pipeline.
- TEN-13 (`inbox_processed` retention): Invisible until the DB starts showing performance issues at scale.
- TEN-14 (buildEnvelope/correlationId): I only notice this when your support team cannot trace a bug back to a root cause. At 1 tenant, you find it anyway.
- TEN-16/TEN-17 (dispatcher idempotency, outbox validation): I would notice only if these cause a payment failure or event loss in production. The risk is real but the trigger requires specific conditions.
- TEN-18 (BA pin): Invisible.

---

### Recommended cuts or deferrals

**Defer to Phase 1.1 (execute after Phase 2 completes, or after first signed LOI):**

1. **TEN-10** — Per-tenant OTel metrics. Move to Phase 1.1. Unlock it when you hit 10+ tenants or when you experience your first noisy-neighbor incident, whichever comes first.

2. **TEN-12** — ESLint rule for `withoutTenant`. The runtime assertion (TEN-11) is the real guard. The lint rule is CI enforcement for a team. Defer to Phase 1.1 or fold into a "developer tooling" phase when you hire the first engineer.

3. **TEN-15** — ESLint rule for `correlationId: randomUUID()`. Same reasoning as TEN-12. The refactor to `buildEnvelope` (TEN-14) is worth doing; the lint gate is not necessary before first revenue.

4. **TEN-18** — Better Auth exact pin. This is a one-line change that takes 10 minutes. Pull it out of Phase 1 scope and do it as an immediate standalone commit today. It should not be consuming phase-planning bandwidth.

**Keep in Phase 1 (cannot defer without risk):**

TEN-01, TEN-02, TEN-03, TEN-04, TEN-05, TEN-06, TEN-07, TEN-08, TEN-09, TEN-11, TEN-13, TEN-14, TEN-16, TEN-17.

**The business question I would ask before writing a check on this phase:** You are spending 2–4 weeks on foundation hardening before you have a single conversation with a potential paying restaurant. Have you validated that your target customer — an independent EU restaurant owner with 1–3 locations — will pay for this SaaS? What is your evidence? The architecture can support 1,000 tenants cleanly, but if CAC in the independent restaurant segment is 18 months of sales effort and ACV is €200/location/month, you need to know that before Phase 1 is the gating issue. The tenancy hardening is the right call architecturally; the question is whether the market timing is right before any demand signal exists.

---

_Review submitted: 2026-05-24_

---

## CTO Discuss Review — Phase 1: Tenancy Hardening (2026-05-24)

**Reviewer:** persona-cto

---

### Gray areas for discussion

**1. TEN-10 (per-tenant OTel metrics): right architecture, contested timing**

The skeptic flagged TEN-10 as premature. I partially disagree and want to separate two things that are being conflated.

The _architecture decision_ — whether to emit `tenant_id`-labeled metrics at all — is a Phase 1 gate because the label shape you bake into `OutboxDispatcherService` now is the shape you carry forever. Retrofitting a label onto an established metric series later requires either a metric naming break or a parallel series, both of which cause alert rule churn at exactly the wrong moment (when you have paying tenants and live dashboards). The architectural commitment belongs here.

What is NOT a Phase 1 deliverable: the _cardinality operational readiness_ — configuring Grafana alert rules per tenant, validating per-tenant dashboards, worrying about label explosion at 1,000 tenants. That is a 50-tenant problem.

Options the founder needs to choose between:

- **Option A (recommended):** Emit the `tenant_id` label from the metric emission code in Phase 1. No dashboard work, no alert configuration. Document "cardinality ceiling: revisit at 50+ active tenants." Delta is adding a single label attribute to two or three `OutboxDispatcherService` metric calls. TEN-08's concurrent isolation test and TEN-05's erasure scheduler immediately produce observable signal you can grep.
- **Option B (investor/skeptic-aligned):** Defer the `tenant_id` label entirely. Emit only aggregate metrics now. Add the label via a one-line config change when you have more than 5 paying tenants and an actual noisy-neighbor diagnosis to make.
- **Option C (wrong):** Skip metric emission code now, retrofit later. This creates infrastructure churn inside Phase 8 or Phase 9 when financial event flows are the focus. Never the right moment.

I lean Option A. The code delta is negligible. Option B is defensible at this scale.

---

**2. TEN-08 (cross-tenant test net): what "concurrent load" actually means at solo-developer pace**

TEN-08 is the most critical req in Phase 1 and the one most likely to be scoped down under time pressure. The requirement names four distinct failure modes: race conditions, ALS leaks across async boundaries, NATS subscriber tenant context mix, concurrent-write scenarios. Each needs a different test fixture. The gray area is test tier.

- ALS leak tests require real async boundaries — you cannot mock `AsyncLocalStorage` and trust the result. A mocked ALS test that passes proves nothing about the production NestJS request lifecycle.
- NATS subscriber tenant context mix requires a real NATS JetStream subscriber loop. Stubbing the subscriber hides the exact failure mode the test is meant to surface.
- Concurrent-write scenarios require a real Postgres transaction plus RLS enforcement. A mock `ScopedTx` proves nothing about cross-tenant DB isolation under parallel writes.
- Race condition coverage requires a test harness that actually runs concurrent requests. Sequential tests with `await` do not trigger the race.

Options:

- **Option A (recommended):** All four failure modes as integration tests in `apps/api/test/` against a Docker Compose test stack (Postgres + NATS). Slow CI (~3–5 minutes for this suite) but trustworthy.
- **Option B:** ALS leak and NATS mix as unit tests with carefully crafted async fixtures; concurrent-write and race conditions as real integration tests. Faster CI, weaker ALS/NATS confidence.
- **Option C:** HTTP-level concurrent request tests against a running API instance. Highest confidence, most expensive to write and maintain.

The commit `bdeb831` ("canonical cross-tenant isolation regression net") already landed a test scaffold. The planning question is whether that scaffold covers all four dimensions at real concurrency or only sequential isolation. **Founder needs to confirm scope of the existing net before TEN-08 planning — it may already be partially complete.**

My bar for Phase 1 sign-off: Option A minimum. The concurrent-write test must run against real Postgres + RLS. Anything less is confidence theater.

---

**3. TEN-11/TEN-12 (withoutTenant allowlist): runtime throw at call time vs. startup validation**

TEN-11 says unregistered `withoutTenant` call sites throw at runtime. There is a design decision buried in "at runtime": when exactly?

- **Option A — throw at call time:** Allowlist checked when `withoutTenant(reason, fn)` executes. Simple. But: if the unregistered call site is in a cold path (erasure scheduler, a rare admin action), you discover it the first time that code runs in production — not at boot.
- **Option B — validate at startup (recommended):** Allowlist is a static registry; all registered call sites are asserted at module init, similar to `assertNoRlsBypass` in `apps/api/src/main.ts`. Unregistered sites throw before the first request is served. Consistent with the existing preflight pattern in the codebase.
- **Option C — ESLint-only (TEN-12):** Lint rule is the fence. This is weaker — ESLint only sees TypeScript source; a dynamically constructed call site or a future package importing `withoutTenant` from outside the linted tree is invisible.

The existing pattern favors startup assertions. Option B + C is the right combination: startup assertion as primary enforcement, ESLint rule as CI-time defense-in-depth. The cost is one boot-time loop over the allowlist — negligible.

---

**4. TEN-14 (buildEnvelope): ALS correlation ID when there is no active OTel span**

`buildEnvelope` reads `correlationId` from the active OTel span via `packages/events/src/correlation.ts`. This is correct for HTTP-originated events. It is wrong by default for:

- The erasure scheduler (TEN-05): a `@Cron` job with no HTTP context and no active OTel span
- The inbox retention sweep (TEN-13): same
- Any future background job

The question is what `buildEnvelope` does when there is no active span. Options:

- **Option A — silent fallback to `randomUUID()`:** This is the current broken behavior that TEN-14 is fixing, just moved inside `buildEnvelope`. It hides the problem rather than solving it.
- **Option B — fallback to `randomUUID()` + WARN log (recommended for Phase 1):** Makes the gap visible in logs. You can grep `"no active OTel span"` to find every background job that is not propagating trace context. Pragmatic.
- **Option C — require explicit `correlationId` parameter for background jobs:** Background jobs generate a job-level correlation ID at the top of their run and pass it as an override to `buildEnvelope`. Most correct for distributed tracing. More implementation surface.
- **Option D — synthetic OTel span per background job run:** Start a span for each scheduler tick. `buildEnvelope` picks it up naturally. Cleanest long-term. Adds OTel SDK usage to the scheduler.

My recommendation: Option B for Phase 1 (pragmatic, immediate visibility). Document Option C as the upgrade path so the erasure scheduler and retention sweep can be retrofitted when the trace quality actually matters. The fallback policy must be decided before implementing TEN-14, because it directly changes how TEN-05 and TEN-13 call `buildEnvelope`.

---

**5. TEN-07 (BA credential separation): how tight does the boot assertion need to be**

TEN-07 says `resto_app` cannot read/write BA credential tables, verified by SQL preflight at boot. The revoke migration already landed (`aba69e5`). The question is what the boot assertion actually checks.

Asserting that `resto_app` has no `SELECT` privilege on `account`, `session`, `two_factor`, `verification` is necessary but may not be sufficient. The assertion should also cover:

- No privilege through role inheritance chains (a role `resto_shared` granted to both `resto_app` and `resto_auth` could silently leak privileges through the chain)
- Column-level grants (Postgres supports `GRANT SELECT (email) ON account TO role` — the table-level check misses this)
- The assertion runs against the actual connected `resto_app` role at the database URL used by the application, not a superuser connection

The minimum viable assertion uses `has_table_privilege('resto_app', 'account', 'SELECT')` returning false for each of the four BA tables and each of `SELECT`, `INSERT`, `UPDATE`. That is 12 checks, approximately 10 lines of SQL. The more robust version also checks `information_schema.role_table_grants` for inheritance-chain grants.

**Founder needs to decide the scope of the assertion.** I recommend the 12-check version. One missed `GRANT` on `session` is a credential exposure — the preflight is cheap insurance.

---

**6. TEN-09 (audit gap analysis): defining "closed"**

TEN-09 requires writing a gap analysis to `.planning/audit-gap.md` and closing it. "Closed" is undefined. Options:

- **Option A — audit rows emitted for every gap found (code-complete closure):** All critical actions in `tenancy` + `identity` produce audit rows in Phase 1. Any gap in `catalog` is documented as future scope.
- **Option B — documentation only:** Every gap has a ticket/req created. No code changes in Phase 1. This is too weak — it means Phase 2 (Admin Shell) adds more audit surfaces before prior gaps are closed.
- **Option C — partial code closure:** Close all gaps in `tenancy` + `identity` contexts in Phase 1. Document `catalog` gaps as Phase 4 scope. This is Option A scoped correctly to Phase 1.

**Recommended definition:** Option C. Scope = `tenancy` + `identity` contexts only. The gap analysis document identifies `catalog` gaps as future scope with Phase 4 as the target. This keeps Phase 1 bounded while making the debt visible. Replacing the direct `correlationId: randomUUID()` calls in `apps/api/src/contexts/identity/identity-core.module.ts` falls under TEN-09 scope (they are the audit correlation gap), so TEN-09 and TEN-14 overlap in their implementation targets — plan for this.

---

**7. TEN-05/TEN-06 (erasure scheduler): failure handling strategy needs to be locked**

TEN-06 says failures emit OTel error spans + WARN logs "without destructive retry." The design decision buried here: what does the scheduler do after a partial failure?

Scenario: scheduler picks up 3 tenants past erasure cool-off. Tenant 1 erases successfully. Tenant 2 throws (DB constraint during `tenancy_erase`). Does the scheduler:

- **Option A (recommended) — continue:** Skip tenant 2, process tenant 3, log the error for tenant 2. Next day's run picks up tenant 2 again because it is still in `listScheduledForErasure`.
- **Option B — halt on first failure:** Do not process tenant 3 until tenant 2 is manually resolved. Creates a queue-head-blocking scenario where one bad tenant prevents all GDPR erasures.
- **Option C — process all independently, no automatic retry for any:** Identical per-run behavior to Option A but stated as policy.

Option A is correct. Option B violates the intent of "without destructive retry" by creating a different kind of indefinite block. "Without destructive retry" means: do not immediately retry in a tight loop; do not delete data speculatively to make the retry succeed; let the next scheduled run attempt it naturally.

**This failure-handling policy must be locked in PLAN.md, not left to the implementer.** An arbitrary choice about loop-continue-on-error vs. halt has direct GDPR compliance implications if a broken erasure job silently stops processing all tenants.

---

### Implementation decisions you'd lock now

**Lock 1: `withoutTenant` allowlist validates at boot (startup assertion), not at call-time.** Consistent with the existing `assertNoRlsBypass` family. Catches misconfigured background jobs before the first request is served.

**Lock 2: `buildEnvelope` fallback when no active OTel span = `randomUUID()` + WARN log.** Pragmatic Phase 1 choice. Background jobs (TEN-05, TEN-13) explicitly generate a top-level job correlation ID and pass it as an override to `buildEnvelope`. WARN log makes missing spans grep-able. Document Option C (explicit ID threading) as the upgrade path.

**Lock 3: Erasure scheduler failure handling = continue-on-error (Option A above).** Each tenant erasure is an independent atomic unit. Failure for one tenant does not block others. Failed tenants are naturally retried next day by `listScheduledForErasure`. OTel error span surfaces the issue for investigation.

**Lock 4: TEN-07 boot assertion checks `SELECT`, `INSERT`, `UPDATE` privilege for `resto_app` on all four BA tables via `has_table_privilege`.** Not just a `pg_catalog` role listing — an explicit capability probe. 12 SQL calls, catches column-level and role-inheritance gaps.

**Lock 5: TEN-09 "closed" = audit rows emitted for all critical actions in `tenancy` + `identity` contexts only.** The gap analysis document records `catalog` gaps as Phase 4 scope. Phase 1 does not touch the `catalog` context.

**Lock 6: TEN-10 emits `tenant_id`-labeled metrics from Day 1 (Option A).** Cardinality ceiling documented as "revisit at 50+ active tenants." No Grafana dashboard work in Phase 1 — just the label attribute added to existing metric emissions.

**Lock 7: TEN-08 concurrent isolation tests run against a real Docker Compose test stack (Postgres + NATS).** No mocking of `AsyncLocalStorage` or `ScopedTx`. Non-negotiable for "last line of defense" sign-off. Confirm scope of existing `bdeb831` test net before writing new tests.

---

### Risks for downstream planning

**Risk 1: TEN-16 must land before TEN-08 test authoring begins.**
The concurrent ALS leak test in TEN-08 will invoke `stop()` on the `OutboxDispatcher` during test teardown. The known deadlock (`packages/events/src/outbox/dispatcher.ts:118-124`) makes concurrent `stop()` calls hang indefinitely. Flaky CI teardown will mask real isolation failures. Sequence constraint: TEN-16 first, then TEN-08.

**Risk 2: TEN-05 and TEN-13 are two cron jobs with overlapping NestJS module wiring.**
Both require `ScheduleModule` from `@nestjs/schedule`, which must be imported exactly once. The planner should decide upfront: one `BackgroundJobsModule` housing both services, or two separate modules. Two services in one module is cleaner for testing and error isolation. This is a wiring decision that blocks both implementations if made late.

**Risk 3: TEN-12 and TEN-15 are both custom ESLint rule authors — batch them.**
Both require authoring a new rule inside `packages/config-eslint/`, wiring it into the root ESLint config, and writing rule unit tests. The tooling setup cost (rule plugin scaffolding, TypeScript-aware rule parsing, test harness) is paid once. If scoped separately, the setup cost is paid twice. Planner should create a single "custom ESLint rules" work item covering both TEN-12 and TEN-15.

**Risk 4: TEN-09 and TEN-14 share implementation targets in `identity-core.module.ts`.**
TEN-14 replaces direct `correlationId: randomUUID()` calls with `buildEnvelope`. The files affected are `apps/api/src/contexts/identity/identity-core.module.ts:110,127,151` and `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:300,316,327,342,356` — both documented in CONCERNS.md. TEN-09's audit gap closure touches the same identity event emission points (the gap IS the broken correlation). These two reqs must be implemented together in one PR to avoid merge conflicts and double-touch of the same code.

**Risk 5: TEN-09 gap analysis may expand scope unexpectedly.**
The gap analysis is written before it is closed. If the analysis reveals that "sign-in" does not emit an audit row for the TOTP second-factor step, or that "session expiry" has no audit trail, fixing those gaps may pull in BA internals work adjacent to what TEN-18 touches. Planner should scope TEN-09 code closure to "happy-path critical actions only" for Phase 1, with a clear list of what counts as critical (provision, archive, offboard, suspend, erase, sign-in, sign-out, role-change) — exactly the list in the TEN-09 requirement text.

**Risk 6: TEN-18 (BA exact pin) is a 10-minute change that should not be a phase-blocking deliverable.**
Changing `~1.4.22` to `=1.4.22` in `package.json` followed by `pnpm install` is three steps: edit, install, CI green. It does not depend on any other Phase 1 work. The investor review recommends doing this as a standalone commit today rather than treating it as a phase deliverable. I agree — pull it out of the phase gate and do it now. The phase success criterion should read "BA is already pinned at `=1.4.22`" not "pin BA during Phase 1."

---

### Order of operations (within Phase 1)

**Group 0 — Do first, everything else unblocks (estimated: half a day):**

- TEN-18: Pin BA to `=1.4.22` exact. One-line change. Eliminates risk of a BA patch bumping mid-phase and breaking identity tests while writing them. Do this as a standalone commit before starting anything else.
- TEN-16: `OutboxDispatcher.stop()` idempotency. Five-line fix (`packages/events/src/outbox/dispatcher.ts:118-124`). Unlocks reliable test teardown for TEN-08.
- TEN-17: `appendToOutbox` envelope validation (`packages/events/src/outbox/repository.ts:23`). Ten-line fix. Foundational for all event integration testing that follows.

**Group 1 — Infrastructure fixtures (parallelize within group):**

- TEN-07: BA credential separation boot assertion. Standalone — reads only `pg_catalog`, no application logic dependency.
- TEN-14: `buildEnvelope` helper in `packages/events/src/`. Package-level change only. Defines fallback policy (locked above). Produces the artifact that TEN-04, TEN-09, TEN-15 all depend on.

**Group 2 — Feature work (depends on Group 1 TEN-14; can parallelize within group):**

- TEN-01: `SuspendTenantService` domain + application layer.
- TEN-02: Suspend check middleware/guard returning 403/410. Depends on TEN-01 (suspended state must be reachable before you can test blocking it).
- TEN-03: `ResumeTenantService`. Depends on TEN-01.
- TEN-04: Suspend/resume events via `buildEnvelope`. Depends on TEN-01 + TEN-14.
- TEN-05 + TEN-06: `TenantErasureSchedulerService` with `@Cron`. The service logic exists; the cron trigger and error handling do not. Wire together.
- TEN-13: `InboxRetentionService` with `@Cron`. Independent of suspend work — parallelizable with TEN-01 through TEN-04.
- TEN-11: `withoutTenant` runtime allowlist + startup assertion. Independent of suspend work.

**Group 3 — Enforcement + observability (depends on Group 2 being code-complete):**

- TEN-09 + TEN-14 call-site migration: Audit gap analysis, close gaps in `tenancy` + `identity`, replace `correlationId: randomUUID()` in `identity-core.module.ts` and `tenant-drizzle.repository.ts` with `buildEnvelope`. These two reqs touch the same files — implement in one PR.
- TEN-10: Per-tenant OTel label. Add `tenant_id` attribute to existing metric emissions in `OutboxDispatcherService`. Small delta, independent of suspend work.
- TEN-12 + TEN-15: Custom ESLint rules (batch into one work item). `buildEnvelope` (TEN-14) and the `withoutTenant` allowlist (TEN-11) must exist before the rules enforcing their use can be written and tested.

**Group 4 — Test net (last, validates everything above):**

- TEN-08: Cross-tenant isolation test suite. Authored after Groups 0–3 are complete. ALS leak, NATS subscriber mix, concurrent-write, and race-condition tests against a real Postgres + NATS test stack. This is the phase gate — Phase 1 is not done until TEN-08 passes under concurrent load.

**Parallelization summary:**

- Groups 0 and 1 are pre-work — complete before starting anything in Group 2.
- Within Group 2: TEN-01/02/03/04 (suspend lifecycle), TEN-05/06 (erasure cron), TEN-13 (retention cron), and TEN-11 (allowlist) can all run in parallel as separate PRs.
- Group 3 is a natural "close out" batch after Group 2 is merged.
- Group 4 (TEN-08) is the final gate. Expect it to find regressions in Group 2 work — build in buffer.

**Rough day estimate (solo developer at focus pace):**

- Day 1: Group 0 (TEN-16, TEN-17, TEN-18) + TEN-07 boot assertion
- Day 2: TEN-14 (`buildEnvelope` helper and fallback policy)
- Day 3–4: TEN-01/02/03/04 (suspend lifecycle — domain, service, guard, events)
- Day 5: TEN-05/06 (erasure scheduler + error handling) and TEN-13 (inbox retention cron)
- Day 6: TEN-11 (withoutTenant allowlist + startup assertion)
- Day 7: TEN-09 (audit gap analysis, close gaps, call-site migration to `buildEnvelope`)
- Day 8: TEN-10 (OTel `tenant_id` labels) + TEN-12/TEN-15 (ESLint rules, batched)
- Day 9–11: TEN-08 (cross-tenant test net — expect regressions to surface and require fixing)

Phase 1 is realistically 9–12 working days solo. The investor review's suggestion to defer TEN-10, TEN-12, TEN-15 to a "Phase 1.1" is a valid capital-efficiency argument. My view: the code delta for TEN-10 is negligible and the architectural decision must be made now. TEN-12 and TEN-15 (ESLint rules) are the most defensible deferrals — the runtime assertions (TEN-11, TEN-14) are the real guards, and the lint rules add value primarily at team scale. If timeline is tight, defer TEN-12 and TEN-15 only, keep everything else in Phase 1.

---

_Review submitted: 2026-05-24_

---

## Skeptic Discuss Review — Phase 1: Tenancy Hardening (2026-05-24)

**Reviewer:** persona-skeptic

---

### Hidden assumptions in Phase 1 reqs

**1. TEN-07 assumes "verified by SQL preflight at boot" is already wired — it is not.**

TEN-07 requires `resto_app` to have zero privileges on the BA credential tables AND a "SQL preflight at boot" to assert this. Migration `0027_revoke_resto_app_ba_credential_tables.sql` exists and the integration test at `packages/db/test/integration/auth-role-grants.spec.ts:156` confirms the revoke is applied. But `apps/api/src/main.ts` runs `assertNoRlsBypass`, `assertTenantLockInstalled`, and `assertSetConfigRevoked` — and has no equivalent `assertNoBaCredentialAccess` call. The DB-level guarantee exists; the boot-time assertion that TEN-07 explicitly requires does not. The requirement will be declared done based on the migration alone, which is half the stated criteria.

**2. TEN-11 assumes withoutTenant() currently enforces the allowlist at runtime — it does not.**

The allowlist TS constant (`packages/db/src/withoutTenant.allowlist.ts`) and the ESLint `no-restricted-syntax` rules exist. But `TenantAwareDb.withoutTenant()` at `packages/db/src/client.ts:279-290` only validates that `reason` is non-empty and logs a WARN. It does not check the call site against `WITHOUT_TENANT_ALLOWLIST`. The parity test at `packages/db/test/unit/withoutTenant-allowlist.spec.ts` checks ESLint config parity, not runtime enforcement. TEN-11 says "runtime assertion validates the call site against an allowlist; unregistered sites throw." This is a new behavior that does not exist today. The requirement is correct, but the assumption that it is close to done because the allowlist file exists is wrong — it is not implemented at all yet.

**3. TEN-14 assumes `buildEnvelope` exists and just needs wiring — it does not exist.**

Eight call sites in `apps/api` still use `correlationId: randomUUID()` (confirmed: `apps/api/src/contexts/identity/identity-core.module.ts:110,127,151` and `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:300,316,327,342,356`). The `packages/events/src/index.ts` exports no `buildEnvelope`. The `packages/events/CLAUDE.md` describes the helper as if it exists ("Use the shared `buildEnvelope` helper...") but grep confirms it is absent from `packages/events/src/`. TEN-14 is a new feature, not a wiring task.

**4. TEN-16 assumes OutboxDispatcher.stop() fix is trivial — the bug is still there.**

`packages/events/src/outbox/dispatcher.ts:118-124` still creates a new `Promise` and overwrites `#stopResolver` on each `stop()` call. No `#stopPromise` caching. The fix is a 5-line change, but the assumption that it is "already mostly done" is false — it is an open bug.

**5. TEN-17 assumes appendToOutbox validates envelopes — it does not.**

`packages/events/src/outbox/repository.ts:23-33` calls `tx.insert(schema.outboxEvents)` without any `EventEnvelope.parse()` before the insert. The `EventEnvelope.parse()` call at line 53 is in `reconstructEnvelope` — the READ path, not the WRITE path. TEN-17 is new work, not a gap-close.

**6. TEN-18 assumes pinning BA is a phase deliverable — it is a one-line commit.**

`apps/api/package.json:32` currently has `"better-auth": "~1.4.22"`. Changing `~` to `=` is `sed -i 's/"better-auth": "~1.4.22"/"better-auth": "=1.4.22"/'`. It belongs in a standalone commit this week, not as a tracked phase requirement consuming planning bandwidth. Making it a phase deliverable inflates Phase 1's apparent scope and delays something with zero implementation complexity.

---

### Gray areas (where the simpler alternative might be better)

**TEN-10: Per-tenant OTel metrics vs. structured logs.**

Maximalist: OTel gauge metrics for outbox lag, HTTP request rate, and error rate with `tenant_id` label — requires a metrics backend capable of handling per-tenant cardinality. At 10 tenants, this costs Datadog/Prometheus series slots per tenant per metric. At 1,000 tenants, every label value is a separate series.

Simpler: Add `tenant_id` to the Pino structured log fields that already exist (Pino is already wired with PII redaction). Outbox lag is observable from logs without a metrics cardinality cost. When a specific tenant's error rate spikes, the logs are queryable.

What breaks if you pick simpler: You cannot build dashboards or alerting rules that aggregate by tenant in a metrics backend. At 0 tenants that matters not at all. The simpler option defers the cost to when the signal is observable (20+ active tenants with differentiated behavior).

**TEN-12 + TEN-15: Custom ESLint rules vs. runtime enforcement only.**

Maximalist: ESLint rules that block CI for `withoutTenant` call sites not in the allowlist (TEN-12) and for direct `correlationId: randomUUID()` construction (TEN-15). Writing a custom ESLint rule that correctly handles `CallExpression` selectors, testing it, and documenting it is 1–2 days of work for tooling that protects a team of one.

Simpler: The runtime throw from TEN-11 already catches unregistered `withoutTenant` at execution. For TEN-15, the `no-restricted-syntax` rule at `apps/api/eslint.config.mjs:84-87` ALREADY bans `CallExpression[callee.property.name='withoutTenant']` — but this is the wrong selector; it bans every call, not just unregistered ones. The existing ESLint rule for `correlationId: randomUUID()` is noted in CLAUDE.md as "until it lands, reviewers enforce manually."

What breaks if you pick simpler: A future developer (or a distracted current developer) ships a new `withoutTenant` call site or a new `correlationId: randomUUID()` that makes it to production without a lint gate. At solo-founder scale with code review of your own PRs, this is a discipline failure, not an architecture failure. The ESLint rules earn their cost at 3+ developers.

**TEN-08: Concurrent race condition tests vs. sequential isolation tests.**

The existing isolation suite (`packages/db/test/integration/tenant-isolation.spec.ts`) covers cross-tenant SELECT and INSERT. TEN-08 expands this to race conditions, ALS leaks across async boundaries, NATS subscriber tenant context mix, and concurrent-write scenarios. The concurrent-write test requires careful test design to produce a reliable failure — badly written concurrency tests are flaky, and flaky CI tests are worse than no CI test.

Simpler: Extend the existing isolation spec with the ALS leak case and one concurrent-write scenario using `Promise.all` with two transactions. Skip the NATS subscriber tenant context mix test until NATS is actually carrying tenant-scoped events in Phase 7.

What breaks if you pick simpler: The NATS subscriber tenant context mix scenario goes untested until Phase 7. That is the right time to add it — after the subscriber pattern actually exists in the ordering context.

---

### Things to cut or simplify in Phase 1

Applying the SPEC section 8.3 lens: "Что если убрать эту фичу — продукт ещё имеет смысл?" and "Зачем нам X, если без него тоже работает?"

1. **TEN-10 — cut from Phase 1.** Per-tenant OTel metrics with `tenant_id` label. At 0 tenants the signal is a void. The Investor review agrees. No argument for keeping it in Phase 1 survives "what does this give me before I have paying customers?" The infra overhead (metrics backend cardinality management, label definition, histogram vs gauge decision) is non-trivial. Move to a threshold trigger: implement when the first tenant-isolation incident occurs or at 20+ tenants.

2. **TEN-12 — simplify to the existing no-restricted-syntax rule.** The existing `apps/api/eslint.config.mjs:84-87` already has a `CallExpression` selector for `withoutTenant`. The problem with TEN-12 is that a truly correct ESLint rule needs to know the file path of the call site to compare against the allowlist — that is not expressible in `no-restricted-syntax` selectors, it requires a custom plugin rule. This is either 2 days of custom plugin authoring or a weaker version that just bans all `withoutTenant` calls and exempts allowlisted files via override blocks (which already exists). If the latter is sufficient, TEN-12 is already done. If the former is required, the cost is disproportionate for a solo founder. Clarify which, then budget accordingly.

3. **TEN-15 — simplify to no-restricted-syntax, not a custom rule.** Same logic as TEN-12. The `no-restricted-syntax` rule targeting `CallExpression` with `correlationId: randomUUID()` in object properties is expressible without a custom plugin. Use it. Document in the eslint config. Done.

4. **TEN-18 — do it today as a standalone commit, not a phase deliverable.** One-line change. The planning overhead of treating this as a phase requirement exceeds the implementation time. Remove from Phase 1 scope, make the commit.

5. **The NATS subscriber tenant context mix test in TEN-08 — defer to Phase 7.** There are no NATS subscribers in the tenancy or identity contexts carrying tenant-scoped events yet (the audit subscriber is platform-scoped). Testing NATS tenant context mix before the ordering context (Phase 7) introduces the first tenant-scoped event consumer is testing a scenario that does not exist. Write the test in Phase 7 when the ordering subscriber is live.

---

### Definition-of-done risk

For each of TEN-01..18, what is the realistic risk of a premature "done" call?

**Top 3 most likely to be half-done:**

**1. TEN-07 (BA credential separation — SQL preflight at boot): HIGH risk of half-done.**

The DB-level revoke is shipped (migration 0027). The integration test passes. The founder declares "done" because the security property is enforced. But TEN-07's explicit criterion is "verified by SQL preflight at boot" — meaning a runtime assertion in `main.ts` that fails fast if the revoke was skipped. That assertion does not exist in `apps/api/src/main.ts` today. If the criterion is read literally, TEN-07 is half the stated requirement. If the criterion is read as "the property is enforced," it is done. This ambiguity is the exact failure mode for premature done calls.

**2. TEN-08 (cross-tenant isolation test net): HIGH risk of half-done.**

"Covers race conditions, ALS leaks across async boundaries, NATS subscriber tenant context mix, and concurrent-write scenarios." These are four distinct test categories. The existing suite covers SELECT/INSERT isolation. Race condition tests require careful concurrency setup. ALS leak tests require async boundary simulation. NATS subscriber context mix tests require a live NATS container with subscriber wiring that does not yet exist for tenant-scoped events. A founder under time pressure will write the easy ALS leak test, confirm the existing isolation tests pass, and call TEN-08 done. The concurrent-write scenario and NATS mix will be deferred indefinitely because there is no forcing function.

Specific risk: the success criterion in ROADMAP.md phase 1 says "cross-tenant isolation tests pass under concurrent load with no ALS leak detected" — this is narrower than TEN-08's full scope. The founder will satisfy the success criterion (concurrent load, ALS leak) and consider the NATS subscriber mix test implicit. It is not.

**3. TEN-09 (audit completeness — coverage gap analysis written and closed): HIGH risk of half-done.**

The requirement has two parts: (a) write `.planning/audit-gap.md` as a gap analysis, and (b) close those gaps. The gap analysis is the easy part — it is documentation. Closing the gaps means adding audit rows to every unaudited critical action in tenancy and identity. The suspend/resume actions (TEN-04) will get audit rows as part of TEN-01..04. But TEN-09 also covers role-change events. "Role-change" audit depends on whether Better Auth's organization plugin fires a hook the identity context can intercept — that is an open implementation question, not a documentation question. The founder writes the gap analysis, adds the suspend audit rows, and declares TEN-09 done without discovering that role-change events have no hookable BA surface.

---

### Order of operations from your lens

**Value-per-effort ranking (do first to last):**

1. **TEN-16** (OutboxDispatcher stop idempotency) — 5-line fix, removes a known production deadlock risk in graceful shutdown. Every minute spent on Phase 1 while this bug is open is a minute on top of a flaky shutdown path. Do it first, in the first PR.

2. **TEN-17** (appendToOutbox envelope validation) — 1-line fix (`EventEnvelope.parse()` before insert). Pairs with TEN-16 in the same PR. These two together close the two known bugs in `@resto/events` and should take under an hour.

3. **TEN-01, TEN-02, TEN-03, TEN-04** (suspend/resume lifecycle) — these are the business-critical missing feature. No other Phase 1 requirement delivers customer-visible value. A suspended tenant returning 403/410 is the lever operators need to handle billing failure and abuse before the first paying customer. This is the only Phase 1 requirement that passes "что если убрать — продукт имеет смысл?" test with a NO.

4. **TEN-05, TEN-06** (erasure scheduler cron) — the service and query exist; only the `@Cron` wrapper is missing. Estimated effort: 2–3 hours including the OTel error span on failure. The GDPR exposure risk (confirmed by the Investor review) makes this non-deferrable for EU market entry.

5. **TEN-13** (`inbox_processed` retention) — parallel to TEN-05/06 in effort profile. A scheduled delete of 30-day-old rows. Pair with the erasure scheduler in the same PR.

6. **TEN-08** (cross-tenant isolation test net) — write the easy-to-write tests (ALS leak, concurrent write) now. Explicitly mark the NATS subscriber mix test as a Phase 7 deliverable in the test file with a `it.todo`. This prevents premature done declarations while being honest about scope.

7. **TEN-09** (audit completeness) — write the gap analysis first, then close the gaps. Explicitly document the role-change BA hook question as a known uncertainty in the gap analysis. Do not let the documentation feel like the deliverable.

8. **TEN-07** (BA credential boot assertion) — write `assertNoBaCredentialAccess` in `packages/db/src/preflight.ts` and wire it in `apps/api/src/main.ts` alongside the existing preflight calls. The DB-level revoke is done; this is the 30-minute completion of a half-finished requirement.

9. **TEN-14** (buildEnvelope helper) — new implementation. Read `packages/events/src/correlation.ts` to understand the ALS structure, implement `buildEnvelope` in `packages/events/src/`, then refactor all 8 `randomUUID()` call sites. This is the highest-effort correctness item — budget a half-day.

10. **TEN-11** (withoutTenant runtime allowlist assertion) — add a call-site check to `TenantAwareDb.withoutTenant()` that inspects the stack trace for the caller's file path and validates against `WITHOUT_TENANT_ALLOWLIST`. This is more implementation work than it sounds: reliable stack-trace parsing in V8 requires `Error.prepareStackTrace` or `new Error().stack` pattern. Budget a full day including tests.

11. **TEN-12, TEN-15** (ESLint rules) — if implemented as `no-restricted-syntax` overrides (not custom plugins), these are low-effort. If implemented as custom plugin rules that check call-site file paths, they are high-effort for solo-founder returns. Decide the implementation approach before budgeting. My recommendation: use `no-restricted-syntax` + override blocks (which already partially exist), not custom plugins.

12. **TEN-10** (per-tenant OTel metrics) — defer entirely, as argued above.

13. **TEN-18** (BA exact pin) — do today as a standalone commit, out of phase scope.

**Time bombs if delayed:**

- **TEN-16 + TEN-17** — these are bugs in shipping code. Every deploy is a graceful-shutdown event. If the outbox deadlocks during a rolling deploy in Phase 3 or 4, it produces flaky CI that looks like test infrastructure noise. The real cause will be debugged under pressure when it matters.
- **TEN-05 + TEN-06** — GDPR erasure automation. The moment the first EU restaurant is signed, this is legally required. It cannot be added retroactively after signing without a compliance disclosure.
- **TEN-14** (buildEnvelope) — deferred until the ordering context (Phase 7) introduces high-volume event emission. At that point, tracing across order creation, payment, and fulfillment without `correlationId` tied to OTel spans means debugging production payment issues by correlating UUIDs manually. That debugging session costs more time than the Phase 1 implementation.

---

_Review submitted: 2026-05-24_
