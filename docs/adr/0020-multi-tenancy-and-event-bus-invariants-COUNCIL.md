---
adr: 20
adr-title: 'Multi-tenancy and event-bus invariants'
adr-status: accepted
reviewed: 2026-05-16
council-type: retroactive
personas:
  cto: reject
  product-strategist: reject
  skeptic: reject
  investor: reject
  growth-marketer: proceed-with-changes
unanimous-blockers: 0
synthesis: proceed-with-changes
failed-personas: []
---

# Council Review — ADR-0020

## Synthesis

Five personas reviewed the ADR retroactively (status `accepted` — review documents validation post-fact, does NOT gate the decision). The diagnosis is broadly endorsed by all 5: the 34 critical findings from the 2026-05-16 full-codebase review are real, the 7 invariants address real bug classes, and the decision to consolidate into one durable ADR (rather than scatter as CLAUDE.md notes or split into 7 thin ADRs) is correct for a solo-founder operating cadence.

Where the personas push back hard is on the **enforcement design** and the **adoption sequencing**. Four of five (cto, product-strategist, skeptic, investor) raised critical-severity concerns about specific invariants or about the cost of the proposed enforcement infrastructure. By the strict framework mapping (any critical → reject), 4 of 5 verdicts come out as `reject` — but this is misleading: the rejections are about _how_ to enforce, not _whether_ to adopt. Growth-marketer's `proceed-with-changes` (no criticals, 3 warnings about elevating I-7 and I-4 to growth/SDK priority) is the cleanest framework-aligned verdict. Aggregated synthesis: **proceed-with-changes** — the ADR's seven invariants are correct in intent; the enforcement design needs concrete revision before any code lands; the sequencing should be re-ordered to fix the urgent P0s (I-3, I-5) before building the lint infrastructure.

The single most actionable consensus finding across all 5 personas: **I-3 (dev fallbacks) is the most urgent and lowest-cost item — `VITE_TENANT_SLUG` baked into the qr-menu bundle is a brand-credibility/cross-tenant incident waiting to happen, `DEV_SALT_FALLBACK` for audit erasure is a GDPR risk, and committed `minio_dev_password` is a diligence-killer.** Do that audit + startup-assertion fix this week, before any other ADR-0020 work.

## Critical concerns (cross-persona)

| Concern                                                                                                                                                                                                                                                                                                                                                                                                                      | Severity            | Raised by                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| **I-5 fix is dangerous if rushed.** `runDeduped` doesn't specify INSERT-before-side-effect ordering as a structural API constraint; doesn't address NATS ack ordering; I-5b "idempotent by design" punt is the hardest distributed-systems problem treated as one-liner. Risk: double OTP SMS, double KDS print, double card auth → churn incident.                                                                          | critical            | cto (CR-1), product-strategist (CR-1), skeptic (CR-2)             |
| **I-3 dev-fallback exposure is urgent and unaddressed.** Pre-launch but MVP-1 already in prod; `VITE_TENANT_SLUG` cross-tenant risk, `DEV_SALT_FALLBACK` GDPR risk, committed S3 password = diligence killer. ADR-0020 sequences this as one of 7 items; should be #1 with prod audit before any other work.                                                                                                                 | critical            | product-strategist (CR-2), investor (CR-1)                        |
| **Enforcement infra ahead of bug fixes is wrong sequencing for a solo founder.** Custom ESLint plugin (`tools/eslint-plugin-resto/`) is 2-3 weeks of work; the 12 P0 bugs already exist in live code. Lints will either block all PRs (no grandfathering mechanism specified) or be turned off.                                                                                                                              | critical            | cto (CR-2 grandfathering), skeptic (CR-1 invert sequencing)       |
| **I-1 enforcement layer is wrong abstraction.** Custom AST/ESLint rule for "every Drizzle query includes `eq(table.tenantId, …)`" generates false positives on builder chains; will end up disabled. Alternative: type-system facade (`tenantDb`/`systemDb` exports from `@resto/db`) + 5-line grep, OR stronger RLS-as-first-line.                                                                                          | critical            | cto (CR-3), skeptic (CR-3)                                        |
| **I-5b idempotent-by-design is a foot-gun in disguise.** "External-side-effect handlers idempotent by design" delegates correctness to per-handler engineer discipline indefinitely. Works for N=1 founder; first multi-tenant double-charge incident at N=5 originates here. Needs structural backstop (outgoing-side-effect ledger keyed by `(handler_name, event_id)`).                                                   | critical            | cto (CR-1 elaborated), skeptic (CR-2 elaborated), investor (WR-1) |
| **Capital-allocation justification.** 2-3 weeks of founder-time on enforcement infra is 5-10% of annual runway pre-revenue — defensible only because the artifacts (composite FK, RLS audit script, runtime guards) compound forever AND because EU restaurant vertical cannot survive a single tenant-mix incident. Spend stands, but only with a hard 3-week timebox and the most urgent fixes (I-3, I-5) sequenced first. | critical            | investor (CR-3, "critical in a good sense")                       |
| **I-2 composite FKs is highest-ROI structural invariant + moat compounder.** Phantom cross-tenant FK references are the GDPR Art. 33 breach-notification scenario. The schema-level fix is irreversible by future careless code. Investor flags this for emphasis — keep and ship.                                                                                                                                           | critical (positive) | investor (CR-2)                                                   |

## Divergence

The personas split on three axes:

**1. Enforcement infra cost vs. value.**

- **CTO + Skeptic:** over-engineered. Cut the custom ESLint plugin. Use type-system facade (CTO) or RLS-as-first-line + schema audit (Skeptic). Skeptic goes further: invert the sequencing, fix the 12 P0s first, defer infra entirely.
- **Investor:** spend is _justified because the artifacts compound forever_ — composite FKs, runtime guards, and RLS audits do not decay. But hard 3-week timebox.
- **Product Strategist:** split the infra into two waves — Wave 1 (env guards, `runDeduped`, BA-hook fix) before MVP-2 identity hooks ship; Wave 2 (ESLint polish, audit CLI) after admin panel ships.
- **Growth Marketer:** pure DX positive; no objection to infra cost, but elevate I-7 and I-4 in priority.

**2. RLS posture (first line vs. second line).**

- **Skeptic:** "RLS-as-first-line is _cheaper_ than ESLint-as-second-line — Postgres maintains it for you; you don't maintain an AST rule." Pushes back on the ADR's framing.
- **CTO + Product + Investor:** accept the ADR's "RLS as second line" framing; defense-in-depth is correct posture.

**3. Overall valence of the ADR.**

- **Growth Marketer:** mostly upside (DX, partner-readiness, analytics foundation). Wants I-7 elevated to "SDK quality gate" and I-4 elevated to "analytics foundation."
- **Investor:** "Track to lead" — the _discipline of enumerating 7 invariants_ is the moat signal, not the multi-tenant correctness itself. The ADR is fundability-positive.
- **CTO + Product Strategist + Skeptic:** correct diagnosis, contentious enforcement; needs concrete revision before any code lands.

The strongest cross-axis disagreement is between **Skeptic's "invert sequencing; fix bugs first; cut the plugin"** and **Investor's "keep the spend; it compounds; this is diligence-positive."** Both are coherent within their lens. Resolution is a founder call.

## Recommended next actions

Actions raised by ≥2 personas:

1. **Run prod audit for dev fallbacks (I-3) this week.** Confirm no live MVP-1 deployment is running with `VITE_TENANT_SLUG`, `DEV_SALT_FALLBACK`, or `minio_dev_password` defaults active. Document the result in an ADR addendum. Then add eager startup assertion in `main.ts` that fails the process on boot if `NODE_ENV=production` and any fallback constant is loaded. — investor + product-strategist + skeptic + growth-marketer (all flagged urgent); cto added eager-validation point.
2. **Strengthen I-5 with concrete API shape + NATS ack ordering.** Specify INSERT-before-side-effect ordering as a structural API constraint (not a convention). Document ack-after-commit for NATS subscribers. Ship a worked example for DB-only and external-API handler patterns in `packages/events/CLAUDE.md`. — cto + skeptic + product-strategist.
3. **Add idempotency ledger for I-5b external side effects.** A persisted `(handler_name, event_id)` ledger that every external adapter consults via a `withIdempotency` helper. Cheap to add now; expensive to retrofit at 50 handlers. — cto + skeptic + investor.
4. **Add tech-debt grandfathering mechanism.** `tools/eslint-plugin-resto/baseline.json` snapshot of known violations; new violations fail CI, baseline ones warn but don't block. Burn-down counter in CI output. Standard pattern (Pylint/Stylelint/Detekt). — cto + skeptic.
5. **Reconsider custom ESLint plugin for I-1.** Replace with type-system facade (`tenantDb`/`systemDb` exports from `@resto/db`) + 5-line grep for raw `db` imports outside the allowlist. Converts AST lint problem to type-system problem (free) + trivial grep. — cto + skeptic.
6. **Define `db.withTenant`/`db.withoutTenant` contract precisely** in this ADR or sibling. Specify: session-var behavior, ALS interaction, nesting semantics, audit logging of `withoutTenant` reasons. I-6's prohibition reads as enforceable only when the affirmative API is spelled out. — cto (WR-2); skeptic implicit through I-6 critique.
7. **Mandate Zod-first DTOs for I-7** (rather than `@ApiProperty` decorators). Schema is single source of truth for runtime validation + OpenAPI + TS types. `unknown` becomes structurally impossible. Grandfather existing class-validator DTOs. — cto + skeptic (Skeptic's variant: OpenAPI schema-completeness validation in CI).
8. **Fold I-2 into multi-brand (ADR-0019) schema work**, don't pay it down as a standalone sweep. Brand sits between tenant and most catalog entities, so composite FKs to tenant alone will be rewritten when brand lands. Audit script needs brand as valid parent scope. — product-strategist (others didn't flag, but consistent with Skeptic's "defer infra").
9. **Add OpenAPI public/internal tag enforcement** as a sibling invariant or I-7 extension. Every controller method tagged `public` | `internal` | `admin` | `customer`; CI fails on untagged. Protects future partner-integration velocity at zero cost today. Same fix unblocks SDK partition into `@resto/api-client` (public) vs `@resto/api-client-internal`. — product-strategist + growth-marketer.
10. **Add review cadence + verifiability metrics.** Per-invariant `Verification` line that emits a metric or CI badge. Quarterly ADR-0020 revisit with: baseline violation count per invariant, `withoutTenant` allowlist size, count of PRs that touched allowlisted calls, production incidents traced to violations. Without measurement the ADR ossifies or drifts. — cto + investor.
11. **Re-rank tech-debt punch list by customer-impact axis.** ~42 items today are flat-prioritized. Order them: I-5 handler dedup (top — OTP/payments/printers), I-3 prod-fallback audit (top — brand/GDPR), I-6 BA-hook fix (high — about to multiply when identity hooks land), I-4 OTel correlation (medium — debugging quality), I-1 RLS-as-second-line cleanup (medium — defense in depth), I-2 composite FKs (coordinate with multi-brand), I-7 unknown DTOs (low — annoying, not customer-visible). — product-strategist.
12. **Document envelope.id as public idempotency key for future webhooks.** One paragraph next to the envelope shape. Pre-emptive — current surface has no webhooks, but when they land in MVP-3+, partners need this contract. Avoids re-inventing a second dedup mechanism. — growth-marketer.

The top three consensus items — **#1 (I-3 prod audit)**, **#2 (I-5 strengthen)**, **#3 (idempotency ledger)** — are flagged by ≥3 personas each and should be the order of operations regardless of which side of the enforcement-infra divergence the founder lands on.

## Persona reviews (full)

### CTO

# CTO Review — ADR-0020 (Multi-tenancy & Event-Bus Invariants)

**Reviewer lens:** technical strategy, execution leverage, solo-founder reality.
**Status:** retroactive validation; ADR already `accepted` and not blocked by this review.

---

## Overall framing

ADR-0020 is the right ADR at the right time. The decision to consolidate seven invariants into one document — rather than scatter them across CLAUDE.md notes or split into 7 thin ADRs — is the correct call for a solo-founder operating cadence. It converts ambient anxiety into a finite, named backlog. The substance of the invariants is also broadly correct: I-1, I-2, I-5/I-5b, and I-6 are non-negotiable for a vertical SaaS that will hand-on-heart sell tenant isolation to restaurant chains.

That said, the ADR has real load-bearing weaknesses that will bite a solo operator specifically. The themes:

1. **Enforcement cost is under-estimated** — particularly the custom ESLint plugin and the "CI lint before any new repo merges" gating language. A solo founder cannot afford a quarter spent on lint infrastructure.
2. **I-5 (transactional inbox) is technically the most dangerous invariant** and its design hand-waves a real distributed-systems problem (handler `tx` vs. NATS ack).
3. **Tech debt grandfathering is mentioned but not designed.** The ADR enumerates 12 P0 + 30 P1 violations without a sequencing discipline that protects against the lint blocking unrelated work.
4. **No criteria for graduation/retirement of any invariant.** Invariants ossify.

Below, severity-classified.

---

## Findings

### CRITICAL — I-5 conflates two distinct delivery guarantees and the "shared tx" design has a real subtle bug

**Headline.** The `runDeduped(envelope, async (tx) => {…})` design as written does NOT actually guarantee at-most-once handler invocation across replicas. It also doesn't address the NATS ack ordering, which is the other half of the inbox pattern.

**Body.** The ADR says (I-5):

> `withInboxDedup` MUST perform `INSERT INTO inbox_processed ... ON CONFLICT DO NOTHING RETURNING 1` inside the same database transaction as the handler's database side effects.

This is correct as far as it goes — but the _order_ matters, and the ADR doesn't specify it. The two valid orderings have different failure modes:

- **INSERT first, then handler in same tx, then commit.** If two replicas race, both get to `INSERT` but only one wins the `ON CONFLICT`. The loser's tx aborts before the handler runs. Good.
- **Handler first, then INSERT in same tx, then commit.** If two replicas race, both run the handler, both attempt the INSERT, one aborts on conflict. The handler's _database_ side effects roll back with the tx — but if the handler emits an outbox row (which it almost certainly will, this being an event-driven system), that outbox row also rolls back. Good for DB, but the handler may have already enqueued work to in-memory queues, populated caches, etc.

The ADR says "If the inbox INSERT returns zero rows, the handler MUST short-circuit before running." That implies ordering #1. Fine — but then the API shape `runDeduped(envelope, async (tx) => {…})` needs to make this _impossible to invert_. As specified, a developer could easily put non-DB work before the INSERT inside the callback. Recommend the helper take _two_ callbacks: `runDeduped(envelope, { preCommit: async (tx) => {…}, externalSideEffect: async () => {…} })` or similar, with the INSERT happening before `preCommit` is ever invoked.

**Second, larger gap:** NATS JetStream ack timing is unaddressed. If the handler commits its tx successfully but the process dies before the JetStream ack, JetStream redelivers. With I-5 in place, the redelivery's INSERT will conflict, the handler short-circuits, and re-ack succeeds. **Good** — this is exactly the inbox pattern working. But the ADR never explicitly says "always ack _after_ the tx commits, never before." Without that, a developer could put the ack in a `finally` block and lose messages.

**Recommendation.** Expand I-5 to specify:

1. INSERT-before-side-effect ordering explicitly, enforced by API shape.
2. Ack-after-commit ordering for NATS subscribers, enforced by the subscriber framework code, not handler code.
3. A worked example in `packages/events/CLAUDE.md` showing both the DB-only and external-API handler patterns. The current ADR text leans on I-5b for the external case but doesn't give the canonical helper.

This is `critical` because at-least-once delivery + non-idempotent handlers = double-charged customers in a payments-adjacent system (restaurants take payments).

---

### CRITICAL — Tech-debt grandfathering is unspecified; the lint will either block merges or be turned off

**Headline.** The ADR mandates CI lints that will fail on existing code (I-1, I-7) but provides no concrete mechanism for grandfathering the 12 P0 + 30 P1 known violations during the fix-down period.

**Body.** ADR §Implementation notes says "the CI lints land in `tools/eslint-plugin-resto/`" and §Consequences acknowledges "tech debt must be paid down." But the adoption sequencing (step 3) lands enforcement _before_ tech-debt fixes (step 4). Read literally, this means the CI lint goes live with 42 known violations and blocks every PR until they're fixed.

In a solo-founder shop in active MVP-2 development, this will play out one of two ways:

- The founder disables the lint, intending to re-enable it after the fixes. It never gets re-enabled. The ADR's enforcement teeth are now a rubber gum.
- The founder slogs through 42 fixes serially before shipping any MVP-2 features. The founder burns out, or MVP-2 slips by 4-6 weeks.

Neither is acceptable.

**Recommendation.** Add an explicit grandfathering mechanism:

- A `tools/eslint-plugin-resto/baseline.json` snapshot file listing the known violations at the time the lint goes live. New violations fail CI; baseline ones produce a warning (still visible) but don't block.
- The baseline is _append-only forbidden_ — new entries are added only by an explicit `pnpm lint:baseline:accept` invocation which logs to git history (i.e., the dev consciously accepts adding a violation, with PR reviewer scrutiny).
- A burn-down counter in CI output ("31 baseline violations remaining; target by 2026-Q3").

This pattern is standard (Pylint, Stylelint, Detekt all support it). The ADR should specify it, not leave it to implementation discretion, because without it the invariants are aspirational again — _exactly the failure mode that birthed this ADR_.

---

### CRITICAL — I-1 enforcement assumes a custom ESLint/AST tool the team hasn't built and may not be able to maintain

**Headline.** "A custom ESLint or `dependency-cruiser` rule, OR an AST grep that runs in CI" is described as a P1 deliverable but the engineering cost is significant and the false-positive rate on a custom rule is what kills adoption.

**Body.** I have shipped this lint twice in prior companies. The naive version ("any `.select()` against a tenant-scoped table must have a `tenantId` predicate") is 2-3 days of work. The robust version (handles aliased imports, dynamic table refs, JOINs, subqueries, builder patterns, the `.where(and(...))` composition Drizzle encourages) is 2-3 _weeks_. The middle path produces false positives that the team starts to ignore, which produces false negatives, which produces the exact bug class the lint exists to prevent.

A solo founder writing a custom ESLint rule for a TypeScript ORM that uses fluent builder chains is signing up for a multi-week diversion from MVP-2.

**Recommendation.** Don't write a custom AST lint. Instead, enforce I-1 at the _type system_:

1. Wrap Drizzle's `db.select().from(table)` etc. behind a `tenantDb` (or `withTenant(tx)`) facade that _only_ exposes builders for tenant-scoped tables when a `TenantContext` is in scope, via a branded type. Cross-tenant access goes through `db.withoutTenant(reason)` which returns the raw Drizzle handle and is logged.
2. Make `db` (the raw Drizzle export) `@deprecated` or simply un-exported from `@resto/db`. Only `tenantDb` and `systemDb` are exported.
3. CI check becomes a one-line grep: `grep -r "from '@resto/db'.*\bdb\b"` in non-allowlisted files.

This converts a complex AST lint problem into a type-system problem (which TypeScript already solves for free) plus a 5-line grep. Both maintainable by one person.

The composite FK rule in I-2 doesn't have this issue — it lands as a SQL audit script, which is trivial.

---

### WARNING — I-3 doesn't account for _where_ env validation runs in the bootstrap

**Headline.** The "env-schema `superRefine` block" enforcement assumes env validation runs eagerly at process start and blocks startup. If validation is lazy (per-config-key) the production guard never fires until the runtime path is hit.

**Body.** I-3 is correct in intent. The gap: NestJS's `ConfigModule` allows both eager and lazy validation. If `S3_SECRET_KEY` is only consumed by the S3 adapter and the adapter is lazy-instantiated, a missing prod env var won't crash the process — the API will boot, healthchecks will pass, and the first S3 write attempt 30 minutes later will throw. By then traffic is already being served and the failure cascades through queues and outbox dispatchers.

**Recommendation.** Add to I-3: "env validation is eager — the schema is parsed and asserted in `main.ts` before the Nest app factory is created. Missing required vars halt process startup before any port is opened." This is a one-line addition with outsized importance.

Also bookmark: `DEV_SALT_FALLBACK` in `OffboardTenantService` is specifically scary — a fallback salt in an _erasure_ primitive means tenant offboarding may produce non-erased hashes if the env var is missing in prod. That's a GDPR violation. Worth flagging this one specifically in the ADR's tech-debt list with a higher visual emphasis than peer items.

---

### WARNING — I-6's prohibition list is correct but the affirmative API (`db.withTenant` / `db.withoutTenant`) isn't described

**Headline.** I-6 forbids `runInTenantContext` outside HTTP middleware and prescribes `db.withTenant(tenantId, async (tx) => …)` as the alternative — but `db.withTenant` doesn't appear in any existing ADR and its semantics aren't defined here.

**Body.** A reader of this ADR who doesn't have the codebase open doesn't know:

- Does `withTenant` set the Postgres session var `app.current_tenant`? (For RLS.)
- Does it also populate the ALS frame, or is the explicit `tx` arg the only mechanism?
- What happens if `withTenant` is called inside an existing `withTenant` for a different tenant? Throw? Override? Nest?
- Does `withoutTenant`'s `reason` string get persisted to an audit trail, or is it documentation?

These are not pedantic questions — they determine whether the invariant is enforceable. A solo founder six months from now reading this ADR needs the contract spelled out.

**Recommendation.** Add a short subsection under I-6 (or a sibling ADR) specifying the `withTenant` / `withoutTenant` contract: session-var behavior, ALS interaction, nesting semantics, audit logging of `withoutTenant` reasons. If they live in `packages/db`'s CLAUDE.md, link from the ADR.

Separately: the prohibition list ("not in BA hooks, NATS handlers, outbox, CLI, background jobs") is good but reads as exhaustive when it isn't. A worker queue added in MVP-3 won't be on this list and will inherit the rule by analogy. Reword as: "called only from `TenantContextMiddleware`. All other contexts use `withTenant` / `withoutTenant`. The list below enumerates the current non-HTTP contexts as a sanity check, not as a closed enumeration."

---

### WARNING — I-7 fix vector ("add `@ApiProperty`") doesn't scale; should mandate Zod-first DTOs

**Headline.** I-7 correctly identifies `unknown` in generated DTOs as a contract bug. The prescribed fix — "add `@ApiProperty({ type: String, … })`" — is the standard NestJS answer but it's a manual, easily-forgotten chore. For a solo founder, the durable answer is single-source DTOs via Zod (`nestjs-zod` or `@anatine/zod-nestjs`).

**Body.** The mention "or derive the type from a Zod schema" is parenthetical in the ADR. It should be the primary recommendation. With Zod-first DTOs:

- The schema is the single source of truth for runtime validation, OpenAPI, and TS types.
- `unknown` becomes structurally impossible — Zod schemas have known leaf types.
- The maintenance cost is amortized across all three uses.

`@ApiProperty` decorators are the "manual" path and reproduce exactly the drift problem the ADR is trying to solve (someone forgets one, `unknown` appears in the client, consumer casts).

**Recommendation.** Restate I-7 to mandate Zod-derived DTOs for new controllers, and grandfather the class-validator/`@ApiProperty` DTOs already shipped. The CI grep for `: unknown` in `api.ts` still works — but the prevention mechanism is structural rather than disciplinary.

This is a `warning` not `critical` because the grep does catch the regressions; we're just talking about reducing the rate of new violations.

---

### WARNING — No measurement, no graduation criteria

**Headline.** The ADR describes seven invariants and their enforcement. It does not describe how the team knows the invariants are working, or under what conditions they could be retired/relaxed.

**Body.** Invariants without measurement become folklore. After 12 months, will anyone know:

- How many times the I-1 lint caught a real bug versus how many times it was bypassed via the allowlist?
- How many `withoutTenant` allowlist entries exist, and is the count growing?
- How many baseline violations remain (per the grandfathering recommendation above)?

Without these numbers the ADR can't be honestly revisited. The team will either keep the rules indefinitely (ossification) or quietly stop enforcing them (drift). Neither is the goal.

**Recommendation.** Add a §Review cadence: "ADR-0020 is revisited every 6 months. At each review, the following metrics are gathered and recorded in a dated comment on this ADR: (1) baseline violation count per invariant, (2) `withoutTenant` allowlist size, (3) count of PRs that touched an allowlisted call, (4) any production incident traced to a violation of any invariant." A 30-minute quarterly task. Cheap relative to the value.

---

### INFO — The "owner: platform / db package owner" language doesn't fit a solo founder

**Headline.** Multiple invariants list owners ("owner: platform", "owner: db package owner"). With one engineer, all owners are the same person, and the language reads aspirationally.

**Body.** Not a defect — the ADR is written for a multi-person future. But concretely, today, this is performative org structure. It's fine to leave it (it correctly anticipates growth) as long as the founder isn't fooled into thinking different invariants will get different attention. They won't; they're all owned by the same head.

**Recommendation (optional).** Add a line: "Until team size > 3, all owners default to the project maintainer. Owner labels indicate _which hat to wear_ when working on the invariant, not different people." Or remove the owner labels until they correspond to actual people. The first reading is more truthful to the operating reality.

---

### INFO — Missing invariant: "every cross-context call goes through an application service"

**Headline.** The codebase's CLAUDE.md gotchas section lists "Cross-context calls go through application services, not direct domain imports." This rule is not in ADR-0020 even though it's the _structural_ invariant that makes future bounded-context extraction cheap — and it's exactly the kind of rule that quietly rots without enforcement.

**Body.** The seven invariants here are tactical (RLS, FK, dedup, ALS scope, env, DTOs, correlation IDs). The bounded-context-boundary invariant is strategic — it's the thing that determines whether RestOS can split `identity` out into its own service in 18 months without a 3-month port. Equally vulnerable to drift; equally amenable to a `dependency-cruiser` rule (which Nx actually makes trivial via `enforce-module-boundaries`).

**Recommendation.** Either expand ADR-0020 with an I-8, or land a sibling ADR-0021 covering bounded-context enforcement. Given the ADR is already 7 invariants, I'd write a sibling — keeps each ADR focused, lets the bounded-context rule have proper context about future extraction strategy. Lower priority than the I-5 critical above, but should land in the next 90 days.

---

### INFO — I-4 (correlation ID) is correct but tiny; consider folding the broader OTel propagation contract in

**Headline.** I-4 fixes the symptom (`randomUUID()` instead of trace-derived correlation ID) but doesn't state the broader contract: trace context propagates _through_ the outbox and inbox so the consumer's spans link back to the producer's spans.

**Body.** Just the correlation-ID field isn't enough for end-to-end tracing — you need `traceparent` and `tracestate` to ride in the envelope so the consumer's auto-instrumentation can `createSpanFromContext` correctly. If only `correlationId` is propagated, you get log correlation (good) but not span linking (the actual trace tree breaks at every async hop).

**Recommendation.** Restate I-4 as "envelopes carry W3C trace context (`traceparent`, `tracestate`) populated from the active span at write time; consumers extract the context and use it as parent for handler spans. `correlationId` is derived from the same context for log search." `buildEnvelope` handles all of this internally. Same enforcement mechanisms; broader contract; same dev ergonomics.

---

## Verdict

**ADR-0020 is the correct intervention but its enforcement design is over-engineered in two places (custom AST lint, owner roles) and under-specified in three (tech-debt grandfathering, I-5 ordering + ack semantics, I-6's affirmative API) — fix those four things before any code lands and this becomes the highest-leverage ADR in the repo.**

### Product Strategist

# Product Strategist Review — ADR-0020 (Multi-tenancy and event-bus invariants)

**Reviewer:** Head of Product (restaurant-tech vertical lens)
**ADR status:** accepted (retroactive review, non-blocking)
**Date:** 2026-05-16

---

## Framing

ADR-0020 is engineering-hygiene work: 7 invariants codifying multi-tenancy and event-bus rules, with CI/lint enforcement and a tech-debt backlog (~12 P0, ~30 P1). The ADR itself states "no public API or wire shape changes."

From a Head of Product seat, the questions are not "is this correct?" (it is), but:

1. Does this slow MVP-2 down at a moment when admin panel, identity, multi-brand, and GDPR offboarding are the things customers will actually pay for?
2. Are any of these invariants _actually_ customer-visible (trust, data isolation, support burden) vs. internal hygiene?
3. Does the tech-debt punch list crowd out the product roadmap?
4. Does the public-vs-internal API surface get clearer for future partner integrations (POS, delivery aggregators, payments)?

Below are findings in severity order.

---

## Findings

### CRITICAL-1 — I-5 (inbox dedup + handler side effects) is the only invariant that is genuinely customer-affecting, and the ADR understates it

**Severity:** critical

**Body:** The current `withInboxDedup` dedupes persistence but not handler side effects. In a restaurant context, "handler side effects" will, in MVP-2 and beyond, include: sending an OTP SMS to a guest, charging a card, firing a KDS ticket to a kitchen printer, posting an order to a delivery aggregator, emailing a receipt. A duplicated NATS redelivery without true dedup means: **the guest gets two OTP SMS, the kitchen prints two tickets for the same order, the card gets double-authed**. That is not engineering hygiene — that is the kind of incident that gets a small chain to churn and to tell three peers on a WhatsApp group.

The ADR treats I-5 as one bullet among seven. It should be flagged as **the single most product-critical invariant of the set**, with the highest enforcement priority, the earliest tech-debt payoff, and explicit mention in the on-call / incident playbook (which is presumably you, solo).

**ADR section:** I-5 and I-5b
**Recommendation:** Re-rank the tech-debt punch list so that any handler that currently or imminently performs an external side effect (SMS via OTP provider, future Stripe charges, future delivery aggregator pushes, future printer pushes) is paid down P0 _before_ MVP-2 ships the customer phone+OTP flow. The OTP flow itself is the first place this bites in production. Add a one-line entry to the customer-facing trust page / status page once dedup is enforced — restaurant operators in 2026 do read "exactly-once delivery" as a trust signal.

---

### CRITICAL-2 — I-3 (dev fallbacks) leaves an MVP-1 production exposure window that the ADR does not characterize

**Severity:** critical

**Body:** `S3_SECRET_KEY` default, `DEV_SALT_FALLBACK`, and `VITE_TENANT_SLUG` committed without NODE_ENV gating are not just hygiene — `VITE_TENANT_SLUG` in particular means a misconfigured qr-menu deployment can resolve to **the wrong tenant**, i.e. one restaurant's QR menu serving another restaurant's menu and prices. In a vertical where the product _is_ the menu, that is a brand-credibility incident, not a config bug.

MVP-1 is already in production (catalog + qr-menu + landing). The ADR sequences enforcement infra ahead of tech-debt fixes, which is correct, but it does not state **how long the current exposure remains live** nor whether any audit has been done to confirm no production tenant is currently running with these fallbacks active. From a product seat, that audit is one-day work and should precede every other invariant.

**ADR section:** I-3
**Recommendation:** Before any other invariant work, run a one-time prod audit: assert that no live MVP-1 deployment is running with any of the three documented fallbacks. Document the result in an addendum to this ADR. Then proceed with the schema test + runtime guard. If the audit finds a live fallback, that is an incident, not a tech-debt item.

---

### WARNING-1 — Enforcement infra phase risks delaying MVP-2 milestones (admin panel, identity, multi-brand) by 2-4 weeks of solo-founder time

**Severity:** warning

**Body:** The ADR sequences: (1) merge ADR, (2) CLAUDE.md, (3) enforcement infra, (4) tech-debt fixes. For a solo founder, "enforcement infra lands as discrete phase before tech-debt fixes" is the load-bearing sentence. Building a custom ESLint plugin (`tools/eslint-plugin-resto/`), a schema audit script (`packages/db/src/cli/audit-fks.ts`), `buildEnvelope` + `runDeduped` helpers, and a `withoutTenant.allowlist.ts` registry — before paying down 42 findings — is real calendar time. Concretely: ~1-2 weeks for the plugin and helpers done well, plus the discipline cost of writing tests for each lint rule.

That window is happening at the exact moment MVP-2 needs to ship Better Auth (operator email+password, customer phone+OTP), admin panel scaffolding, multi-brand-per-tenant, and GDPR offboarding. Every week ADR-0020 enforcement infra holds the floor is a week the _customer-visible_ roadmap doesn't move. There is no first paying customer for engineering invariants; there is for the admin panel.

**ADR section:** "Adoption sequencing"
**Recommendation:** Split the enforcement infra into two waves. Wave 1 (must precede MVP-2 identity): the runtime guards for I-3 (env schema superRefine), the `runDeduped` helper for I-5, and the `runInTenantContext`-from-BA-hook fix for I-6 — because identity hooks are about to be written, and getting I-6 right at the moment those hooks are first authored costs zero, vs. retrofitting later. Wave 2 (after MVP-2 admin panel ships): ESLint plugin polish, audit-fks CLI, allowlist file. This is not a weakening of the ADR — it is product-time sequencing.

---

### WARNING-2 — I-2 (composite FKs) will collide with multi-brand-per-tenant schema work and should be coordinated with it, not paid down separately

**Severity:** warning

**Body:** Multi-brand-per-tenant is an MVP-2 priority, which means the relational shape of tenant-scoped children is about to change anyway — brands sit between tenant and most catalog entities (menu, location, hours, modifiers). Doing I-2 as a standalone tech-debt sweep on the current schema, then re-doing it when multi-brand lands, is wasted work.

The ADR doesn't acknowledge this dependency. From a product seat, I-2 should be **folded into the multi-brand schema migration**, not run before it. That also means the `audit-fks.ts` script needs to understand brand as a valid parent scope, not just tenant. If brand is not modeled before I-2's enforcement turns on, you'll write composite FKs to tenant that you immediately rewrite to (tenant, brand).

**ADR section:** I-2 + ADR-0019 (multi-brand)
**Recommendation:** Add an explicit dependency note: "I-2 enforcement is gated on ADR-0019 (multi-brand) schema landing. Until then, I-2 applies only to entities that are unambiguously tenant-scoped (no brand parent), with the rest deferred." This avoids double migrations and keeps multi-brand on schedule.

---

### WARNING-3 — Public vs. internal API surface is not addressed; I-7 misses an opportunity

**Severity:** warning

**Body:** I-7 fixes `unknown` in generated DTOs via `@ApiProperty`. Good. But from a product/API-as-product lens, the bigger issue is that the ADR treats the OpenAPI contract as an internal artifact, when in fact the qr-menu (public read), the customer mobile app (MVP-2+), and any future POS/delivery-aggregator partner will all consume it. The line between "internal endpoints behind `INTERNAL_API_TOKEN`" (ADR-0012) and "public customer reads" is exactly the line that should be tagged at the OpenAPI level — public vs. internal — so that the generated client splits cleanly, and so partners later get a public-only SDK.

I-7's CI grep for `unknown` is a fine bug-class fix, but it skips the bigger product question: is there an OpenAPI tag convention (`@ApiTags('public')` vs. `@ApiTags('internal')`) being enforced? If not, partner integration in MVP-3 will require an unscheduled documentation pass.

**ADR section:** I-7
**Recommendation:** Add a sibling invariant (or extend I-7) requiring every controller method to be tagged `public` | `internal` | `admin` | `customer` in OpenAPI, with CI failing if a controller is untagged. Cheap to enforce now; impossible to retrofit cleanly once 200 endpoints exist. This is the single change that protects future partner-integration velocity at zero cost today.

---

### WARNING-4 — GDPR offboarding (MVP-2) is not represented in the invariant set, despite being a tenant-data-isolation concern

**Severity:** warning

**Body:** GDPR offboarding is on the MVP-2 list. The invariants in ADR-0020 cover _reads/writes during normal operation_ (I-1, I-2) and _event bus behavior_ (I-4, I-5), but say nothing about **deletion completeness**. When a tenant offboards, the same composite-FK structure from I-2 is what makes a clean cascading delete tractable — and the same "no withoutTenant" rule from I-1 is what ensures no orphaned cross-tenant rows survive.

The ADR could have explicitly stated: "I-1 and I-2 together are preconditions for ADR-0018 (GDPR offboarding) completeness — without them, a tenant-delete cannot be proven complete." That's not just hygiene, it's a regulatory posture. Stating it in the ADR makes the GDPR work cheaper later because the test surface is already enforced.

**ADR section:** I-1, I-2, and missing cross-reference to ADR-0018
**Recommendation:** Add a "Forward dependencies" subsection: list which downstream ADRs/features are preconditioned by these invariants (GDPR offboarding, multi-brand, partner integration). Costs nothing; clarifies why these aren't just engineering hygiene.

---

### WARNING-5 — Tech-debt punch list size (~42 items) is not prioritized by customer-impact

**Severity:** warning

**Body:** The ADR enumerates ~12 P0 + ~30 P1 but does not state the prioritization axis. P0/P1 by what? Severity? Likelihood? Engineering effort? From a product seat, the only prioritization that matters is: **does this debt item put a real or imminent customer-visible incident on the table**. By that lens:

- I-5 handler dedup on OTP / future payments / future printers → top
- I-3 prod fallback audit → top
- I-6 BA-hook violation → high (about to multiply when identity hooks are authored)
- I-4 OTel correlation → medium (debugging quality, not customer trust)
- I-1 RLS-as-second-line cleanup → medium (RLS is still defending; this is depth-in-defense work)
- I-2 composite FKs → coordinate with multi-brand
- I-7 unknown DTOs → low (annoying for codegen, not customer-visible)

The ADR's flat enumeration means a solo founder can spend three weeks on I-1 lint rule polish and only then get to I-5. That ordering would be a product mistake.

**ADR section:** "Consequences" + "Adoption sequencing"
**Recommendation:** Re-publish the P0/P1 list with an explicit "customer-impact axis" column. The 42-item list is fine; the ordering inside it is what determines whether MVP-2 ships on time.

---

### INFO-1 — Naming: `runDeduped` is fine; document the failure mode for handler authors

**Severity:** info

**Body:** `runDeduped` will be authored by every event-consumer in the codebase going forward (customer notifications, order events, payment events, KDS events). The name is good. The hidden footgun is: handler authors will assume "dedup means I can do anything inside; framework handles it." That is not true for I-5b (external side effects must _also_ be idempotent by envelope.id). Two layers of dedup, two responsibilities.

**Recommendation:** Ship `runDeduped` with a doc-comment that explicitly states: "DB side effects in this transaction are deduped for you. External side effects (HTTP, SMS, prints) MUST additionally be made idempotent using envelope.id as the idempotency key — see I-5b." A jsdoc + a TypeScript overload that requires an `idempotencyKey` argument when the handler is typed `external` would make this self-enforcing.

---

### INFO-2 — Time-to-value for new tenants is not measurably affected by this ADR (good)

**Severity:** info

**Body:** Worth stating explicitly: none of the 7 invariants change the signup → first published menu → first QR scan path. The ADR is correctly scoped as backend hygiene. From a TTV lens, this is neutral. The only TTV risk is the _opportunity cost_ called out in WARNING-1 — engineering time spent on enforcement infra is engineering time not spent on the admin panel scaffolding that _does_ shorten TTV. Manage the calendar, and the ADR is TTV-neutral.

---

### INFO-3 — The ADR is well-scoped, ownership is unstated

**Severity:** info

**Body:** Each invariant lists "owner" in the decision section, but for a solo-founder context, "owner" is always the same human. That's fine, but it means the value of the owner field is not accountability — it is **future-handoff legibility**. When the first engineering hire arrives (MVP-2 traction or MVP-3 funding), the owner field becomes meaningful. Until then, treat the field as documentation of which invariant maps to which subsystem, not as a delegation.

**Recommendation:** Rename the field in this ADR to "subsystem" or "primary surface area" until there's more than one human; otherwise it reads as ceremony.

---

## Overall verdict

ADR-0020 is correct, well-scoped, and largely product-neutral — but its flat severity treatment buries I-5 (handler dedup) and I-3 (prod fallback exposure), both of which are genuinely customer-affecting and should drive the sequencing of MVP-2's identity and payments work, while the rest of the invariants should be folded into adjacent product work (multi-brand, GDPR, partner-ready API tagging) rather than paid down as a standalone engineering sprint.

### Skeptic

# Skeptic Council Review — ADR-0020

**Reviewer:** Designated Skeptic (post-fact validation; non-blocking)
**Subject:** ADR-0020 Multi-tenancy and event-bus invariants
**Status of ADR:** Accepted
**Context:** Pre-launch, zero paying customers, solo founder, MVP-2 active (identity, admin UI, multi-brand, GDPR).

---

## Critical findings

### CRITICAL-1 — The ADR is a meta-fix masquerading as a fix

**Section ref:** "Decision" + "Adoption sequencing" step 3.

The sequencing says: **"Enforcement infra lands as discrete phase BEFORE tech-debt fixes."** That is the wrong order for a solo founder pre-launch. You found 34 critical bugs on 2026-05-16. The path to safety is: **fix the 12 P0 bugs this week.** Not: build a custom ESLint plugin, a schema audit CLI, a `buildEnvelope` helper, a `runDeduped` wrapper, and an `withoutTenant.allowlist.ts` registry — _then_ fix the bugs.

The enforcement infra is a second project bolted onto the first. It has its own tests, its own maintenance surface, its own false-positive triage queue. And it produces zero customer value until the bugs behind it are also fixed. Worse, you have now declared the bug-fixes blocked on shipping the infra.

Real risk: in 6 weeks you have a polished `tools/eslint-plugin-resto/` and the 12 P0 bugs are still in `main`, because the lint rules kept finding edge cases and you kept polishing the AST matcher. Enforcement infra is the kind of work a solo founder _enjoys_ (clean abstractions, satisfying tests), which is exactly why it crowds out the unglamorous tenant-fix-and-migrate grind.

**Recommendation:** Invert the sequence. Fix the 12 P0s first with code review + a regression test per fix. Add a **single** schema audit script (I-2) because that one _can't_ be enforced by review alone — Postgres won't tell you a composite FK is missing. Defer the ESLint plugin, the helper-only APIs, and the allowlist registry until you have evidence the human-review channel actually failed twice.

---

### CRITICAL-2 — I-5 is correctly diagnosed but the fix description is dangerous if rushed

**Section ref:** I-5 + I-5b.

The diagnosis ("`hasSeen`/`handler`/`markProcessed` in three separate tx → two replicas can both fire side effects") is correct and important. But the proposed fix — "INSERT … ON CONFLICT DO NOTHING RETURNING 1, short-circuit when zero" — only solves the case where _side effects are purely DB writes in the same transaction_. It explicitly punts external side effects to I-5b ("idempotent by design with envelope.id as idempotency key").

That punt is the real problem and the ADR treats it as a one-liner. "Idempotent by design" for email/payment/HTTP is **the** hard distributed-systems problem. It requires:

- Every external provider call carries `envelope.id` as Idempotency-Key (some providers don't honour it; some have TTLs; some scope per-resource).
- A persisted "external-call ledger" so retries after crash-before-commit don't re-bill.
- A clear policy for handlers that mix DB writes _and_ external calls (which is most of them).

The ADR codifies the rule in one sentence and the enforcement is "doc P1, integration test P2." That's not enforcement — that's a wish. The realistic MVP-2 answer for a solo founder pre-launch is probably: **one queue consumer, no replicas, accept at-least-once with a documented "duplicate email is possible on crash" caveat**, and revisit when traffic justifies horizontal scale-out.

**Recommendation:** Split I-5 into two ADRs. The DB-side fix is a 2-day job, do it. The "external side effects are idempotent" claim is an architectural commitment that deserves its own ADR with concrete per-integration plans (Stripe, SES/Resend, Twilio, etc.) or an explicit decision to run a single dispatcher replica for MVP-2 and defer.

---

### CRITICAL-3 — "ESLint rule for tenant scoping" is the wrong abstraction

**Section ref:** I-1 + Implementation notes (`tools/eslint-plugin-resto/`).

A custom ESLint rule that detects "every Drizzle read/write to a tenant-scoped table includes `eq(table.tenantId, ctx.tenantId)`" sounds reasonable, but the AST grep is the wrong layer. It will:

- Miss dynamic query construction (`db.select().from(table).where(buildWhere(...))`).
- Miss raw Drizzle composition through helper functions.
- Generate false positives that you'll silence by adding to `withoutTenant.allowlist.ts` until the allowlist is unreviewed and meaningless.
- Not catch the actual high-risk case: a JOIN that filters by `tenantId` on the parent but not the child.

The correct enforcement layer for "every query is tenant-scoped" already exists in your stack: **RLS on every tenant-scoped table with a strict policy, plus a connection that _never_ runs as superuser in app code**. The ADR's I-1 ("RLS as second line of defense") and the ESLint rule are _both_ second lines — you're skipping the actual first line, which is "force the database to refuse." If your app code forgot a `tenant_id` filter and RLS is on, the worst case is "returns 0 rows," not "leaks cross-tenant data."

**Recommendation:** Make RLS _mandatory and audited via a SQL test_ ("every table with a `tenant_id` column has a policy that references `current_setting('app.tenant_id')`"). That's 50 lines of `pg_catalog` SQL. Drop the ESLint AST rule entirely. Keep the "repo unit test: no ALS → throws" because that one is genuinely cheap and useful.

The current CLAUDE.md already says "RLS is the second line of defense, not the first" — fine. The ADR doubles down on that posture. I'm pushing back: for a solo founder, RLS-as-first-line is _cheaper_ than ESLint-as-second-line, because Postgres maintains it for you and you don't have to maintain an AST rule.

---

## Warning findings

### WARNING-1 — 7 invariants for one ADR is scope creep

**Section ref:** "Decision."

Seven invariants spanning DB schema, OTel correlation, env validation, dev fallbacks, ALS lifetime, contract DTOs, and inbox semantics is not one decision — it's a punch list dressed as an architecture decision. ADRs work when they capture **one trade-off with one rejected alternative**. This one has seven of each, implicit.

Concrete consequence: when something in I-4 (OTel correlationId) needs to change in 4 months, you'll either (a) revise all of ADR-0020 (which means re-litigating I-1 through I-7), or (b) write ADR-0028 that supersedes "part of" ADR-0020, which is exactly the pattern that makes ADR chains unreadable.

**Recommendation:** Split into 3 ADRs: (1) "Tenant scoping invariants" (I-1, I-2, I-6), (2) "Outbox/inbox semantics" (I-4, I-5), (3) "Env hygiene + contract hygiene" (I-3, I-7). Or accept that this is really a _review punch list_, demote ADR-0020 to a "Tenancy hardening checklist" doc, and don't pretend it's a single decision.

---

### WARNING-2 — The `withoutTenant.allowlist.ts` pattern is a future tech-debt magnet

**Section ref:** I-1, Implementation notes.

Allowlist files (a static registry of "blessed exceptions to the rule") have a 100% adoption pattern: they start small, they grow when sprint pressure hits, nobody removes entries, the review of additions gets perfunctory, and within 18 months the allowlist _is_ the rule. ESLint-disable comments have the same failure mode but at least they're co-located with the offending line; a separate `.ts` registry is worse because the reason for each entry decays from the diff.

**Recommendation:** If you keep I-1's ESLint rule, allowlist entries must require (a) a comment explaining why, (b) a Linear ticket reference for removal, (c) a CI check that the ticket is still open. If you can't justify that overhead, the allowlist will rot — and a rotted allowlist is worse than no rule.

---

### WARNING-3 — I-4 ties correlation to OTel span context, which couples your event bus to a tracing vendor

**Section ref:** I-4.

"`correlationId` from active OTel span; `randomUUID` forbidden." This conflates two distinct concerns: distributed tracing (`traceparent`) and business-event correlation (`correlationId` for "saga X / user request Y"). They are not the same thing. OTel `traceId` is per-request-trace and ends when the trace ends. Business `correlationId` often outlives a trace (a checkout flow that emits an event, gets retried hours later, and that retry should still correlate to the original).

Forcing `correlationId = activeSpanTraceId` will:

- Break correlation for events emitted by background jobs that don't have an upstream HTTP trace.
- Couple event-envelope shape to whether OTel is healthy in that process.
- Make replay tooling weird ("what's the correlationId of an event emitted by the outbox dispatcher itself?").

**Recommendation:** Use _both_. The envelope should carry `traceparent` (for OTel propagation) **and** a business `correlationId` (which defaults to traceId when one exists, but is a first-class field). Forbid `randomUUID()` only for events that are continuations of an inbound request — not for events that originate from cron, replay, or admin actions.

---

### WARNING-4 — I-7's "no `: unknown` in generated DTOs" is treating the symptom

**Section ref:** I-7.

`unknown` appears in `generated/api.ts` because controllers lack `@ApiProperty`. The fix is "add `@ApiProperty`." The enforcement is "CI grep for `: unknown` P1, custom `no-unsafe-cast` ESLint rule P2."

The grep will false-positive on every legitimate `unknown` in your codebase (error handlers, deserialization boundaries, type guards). The "custom `no-unsafe-cast` rule" P2 is more scope creep into the eslint-plugin-resto package that doesn't yet exist.

The real fix is upstream: **require an OpenAPI schema validation step in CI** that fails if any DTO field has no declared schema. That's a one-liner with `@nestjs/swagger`'s SwaggerModule emission + a schema validator, and it catches the root cause (missing `@ApiProperty`) not the downstream artifact (`: unknown` in generated code).

**Recommendation:** Drop the grep and the custom ESLint rule. Add OpenAPI schema-completeness validation to CI. Done.

---

### WARNING-5 — Solo-founder load: this ADR adds 4 new packages/files to maintain

**Section ref:** Implementation notes.

New artifacts the ADR commits you to building and maintaining:

1. `tools/eslint-plugin-resto/` — new pnpm package, AST tests, ESLint version pinning, contributor docs.
2. `packages/db/src/cli/audit-fks.ts` — schema introspection, expected vs actual diff.
3. `packages/events/src/buildEnvelope.ts` — helper plus the "direct EventEnvelope literal construction forbidden" rule (another ESLint rule).
4. `packages/events/src/runDeduped.ts` — replaces `withInboxDedup`, requires migration of every existing call site.
5. `packages/db/src/withoutTenant.allowlist.ts` — registry + review process.

That's five net-new maintenance surfaces, several of which require ongoing curation, for a pre-launch product where the founder is also building Better Auth integration, admin UI, multi-brand support, and GDPR offboarding. The opportunity cost is real: every hour on `tools/eslint-plugin-resto/` is an hour not on the things that determine whether MVP-2 ships.

**Recommendation:** Keep `audit-fks.ts` (high-value, run-once-in-CI, no maintenance). Drop the eslint-plugin-resto package — replace with `no-restricted-syntax` config in the root `eslint.config.js` for the cheap cases (`randomUUID()` literal in `packages/events/`). Defer `buildEnvelope` and `runDeduped` until the third time you write the same dedup pattern by hand.

---

### WARNING-6 — "Revises ADR-0006, ADR-0004, ADR-0013" with no migration plan

**Section ref:** Header.

Revising three prior ADRs in one stroke without spelling out _what_ is revised and _which sections_ are now superseded is documentation theater. A reader coming to ADR-0004 in 8 months sees "still accepted, but also see ADR-0020" and has to reverse-engineer the diff.

**Recommendation:** Add a "What ADR-0020 changes" subsection that, per revised ADR, lists "section X now reads Y." Or amend the original ADRs with a `Revised by: ADR-0020 (date)` banner pointing to the exact superseded paragraphs.

---

## Info findings

### INFO-1 — I-3 (dev fallback hardening) is the highest leverage, lowest cost item — do it first

This one is genuinely cheap, genuinely dangerous to defer (committed `'minio_dev_password'` defaults will absolutely ship to prod once if you don't gate them), and the fix is mechanical: env schema `superRefine` + a NODE_ENV check. It deserves to be the **first** thing extracted from this ADR and shipped, not bundled with six other invariants. The audit found 4 examples; fix them this week.

### INFO-2 — I-6 (runInTenantContext middleware-only) is sound but small

Limiting `runInTenantContext` to one file is a good rule. `no-restricted-imports` is the right enforcement and it's one ESLint config entry, not a custom plugin. Fix the `IdentityEventEmitterAdapter` violation in the same commit. Total work: under 2 hours. No ADR needed; a CLAUDE.md gotcha would suffice.

### INFO-3 — The "Consequences" section is too rosy

"Positive: single source of truth, self-defending via lints, enumerated tech debt." None of those are actually delivered by accepting the ADR. They're delivered by _implementing_ the ADR — which is ~42 tickets. The Consequences section should also list: "Negative: 4 new internal libs to maintain; ~2-3 weeks of founder time before any of MVP-2's customer-visible features benefit; opportunity cost vs identity/admin/multi-brand."

### INFO-4 — Where is the rejected alternative?

ADRs are stronger when they capture what was considered and rejected. ADR-0020 lists 7 rules and 7 enforcement mechanisms but doesn't say what the _alternatives_ were (e.g., "considered: rely entirely on RLS + code review, rejected because…"). Without that, future-you cannot tell whether the lint-heavy approach was chosen on merit or chosen by reflex.

---

## Overall verdict

**ADR-0020 correctly identifies real bugs but prescribes a heavyweight enforcement regime that a pre-launch solo founder cannot afford to build before fixing the bugs themselves — invert the sequencing, cut the custom ESLint plugin, lean on Postgres RLS and a schema audit script as the load-bearing controls, and ship the 12 P0 fixes this week.**

### Investor

# Investor Council Review — ADR-0020 (Multi-tenancy & Event-Bus Invariants)

**Reviewer:** Partner, Vertical B2B SaaS practice
**Posture:** Retroactive, non-blocking. ADR is accepted; this memo informs IC tracking notes for the next check.

---

## Context I'm working from

Solo-founder, bootstrapped, pre-revenue vertical SaaS. EU founder, EU first customers (GDPR-live jurisdiction). MVP-1 (catalog + qr-menu + landing) shipped. MVP-2 in flight (Better Auth, admin, multi-brand, GDPR offboarding). Stack is uniformly self-hosted by deliberate ADR sequence (0006/0011/0012/0013/0018/0019). This ADR is a **defense-of-invariants** ADR, not a feature ADR — it's the founder noticing that the rules he wrote down (RLS as second line, no dev fallbacks in prod, OTel-traced events) were already being violated by his own code, and codifying enforcement.

That framing matters: I am evaluating whether **a solo founder spending founder-weeks on an ESLint plugin and a schema audit CLI** is capital-allocated correctly.

---

## Findings

### CRITICAL-1 — Dev fallbacks in production code paths are a deal-breaking diligence finding, not a "tech debt punch list" item

**Severity:** critical
**ADR ref:** Context item 5 / Invariant I-3
**Body:**

Buried in the context list is one sentence that should have been a separate ADR with red flashing lights:

> "VITE_TENANT_SLUG in qr-menu bundle (production deploy with this set silently cross-tenants every customer)"

Plus `DEV_SALT_FALLBACK` for **audit erasure salt** (GDPR-relevant cryptographic material) and `minio_dev_password` as an S3 secret default.

From an IC perspective: this is the kind of finding that, if surfaced in a Series-A tech DD by a third-party firm (Cobalt, Bishop Fox, etc.), would either kill the round or trigger a 90-day remediation gate at close. The fact that the founder found these himself and is fixing them is **good**. The fact that they shipped at all says the pre-commit / CI guardrails are not yet investor-grade. The fact that I-3's enforcement is "Code review + schema test" — when there is one reviewer (the founder) — is the weakest enforcement in the whole ADR.

**Recommendation (investor lens):** I-3 should be promoted from "schema test" to a **runtime startup assertion** that fails the process on boot if `NODE_ENV=production` and any fallback constant is loaded. Code review is not a control when N=1 reviewer. Treat this as a P0 within the P0s. Worth a founder-day; not worth a founder-week. The diligence narrative becomes "we found it, we built a startup guard, here's the test" — that's _defensible_ in a DD call.

---

### CRITICAL-2 — Composite FKs (I-2) is the single highest-ROI invariant in the document; it is also the one that materially compounds into moat

**Severity:** critical (in a good sense — flag for emphasis, not concern)
**ADR ref:** Invariant I-2
**Body:**

Phantom cross-tenant FK references under `withoutTenant` or forged `app.current_tenant` is exactly the failure mode that produces a TechCrunch headline for a vertical SaaS. Restaurants are not a high-prestige target, but **payment data flowing through Stripe Connect with a tenant-mixing bug** is regulator bait (DPA breach notification within 72 hours under GDPR Art. 33).

Composite FKs at the schema level are doing the kind of work that _cannot_ be undone by a future engineer's careless query. It's a structural invariant, not a procedural one — and structural invariants are the only kind that survive team growth from 1 to 15. This is the line item I would point to in an IC memo as evidence the founder thinks in terms of **invariants vs. behaviors**, which is a leading indicator of engineers who can hire and scale a team.

**Recommendation:** keep I-2 enforcement (migration review + audit script) but add a one-line metric to the audit script output that gets exported to Prometheus: `restos_tenant_scoped_tables_without_composite_fk{count}`. That number going to zero and staying there is a slide in the Series A deck.

---

### CRITICAL-3 — Pre-revenue founder-time allocation: enforcement infra is justified, but only because of compounding

**Severity:** critical (capital efficiency question)
**ADR ref:** "Implementation infra" section
**Body:**

Let's name the cost honestly. The infra to be built:

- `tools/eslint-plugin-resto/` — custom ESLint plugin
- `packages/db/src/cli/audit-fks.ts` — schema audit CLI
- `packages/events/src/buildEnvelope.ts` + `runDeduped.ts` — helper APIs
- `packages/db/src/withoutTenant.allowlist.ts` — allowlist mechanism

Realistic founder-time estimate: **2–3 weeks of full-time work** to build and another 1–2 to pay down the ~42 violations. For a solo bootstrapped founder pre-revenue, that is 5–10% of an annual runway, spent on **plumbing that does not move ARR**.

The standard investor instinct here is "ship the customer-facing feature, fix this when you have a revenue base." That instinct is **wrong in this specific case**, for two reasons:

1. **The violations already exist.** This isn't speculative hardening — there are 34 critical findings in live code. Every additional week of building on a foundation with these bugs makes them more expensive to fix (more call sites, more migrations, more contracts).
2. **The customer profile is EU restaurants.** A single tenant-mix incident in the QR-menu (the most public surface) ends the company. Pre-revenue founders survive on reputation; they cannot absorb a public security incident the way a Series-B with PR budget can.

The capital efficiency math therefore comes out positive **only if** the enforcement infra is built once and pays down forever. Which it does — ESLint rules don't decay, composite FKs don't decay, runtime guards don't decay. That is the kind of one-time spend that I underwrite. A reactive "let's add review checklists" approach would be the wrong capital allocation; this is the right one.

**Recommendation:** keep the spend. But put a hard timebox on it: **3 weeks for infra, 2 weeks for punch-list, then back to MVP-2 features.** Track it as a single line in a founder weekly note (which is exactly the kind of artifact a Series-A lead will ask to see during diligence — "show me your weekly cadence over the last 6 months").

---

### WARNING-1 — I-5 (inbox dedup in same tx) is correct; I-5b (idempotent by design) is a foot-gun in disguise

**Severity:** warning
**ADR ref:** Invariant I-5 / I-5b
**Body:**

`runDeduped` wrapping dedup + side effects in one tx is the right primitive. The problem is I-5b: "external-side-effect handlers idempotent by design." This is delegating correctness to **the discipline of the engineer writing each handler**, indefinitely. Stripe charge handlers, email send handlers, PDF generation, webhook fan-out — every one of these is a fresh opportunity to forget to dedupe an external call.

For a 1-person team this is workable because the engineer is the architect. For a 5-person team (the headcount that comes with a seed round), I-5b is the place where the first multi-tenant double-charge incident will originate.

**Recommendation:** I-5b needs a structural backstop, not just a design rule. Two options:

- (cheap) An outgoing-side-effect ledger keyed by `(handler_name, event_id)` that _every_ external adapter is forced to consult via a helper API — same pattern as `buildEnvelope`.
- (expensive) Per-handler idempotency keys passed to Stripe / email provider / etc., with a smoke test that asserts each external adapter accepts an idempotency key parameter.

The cheap option is a 1–2 day spend. Worth it now; very expensive to retrofit at 50 handlers.

---

### WARNING-2 — ADR-0020 doubles down on the self-hosted stack; that increases switching cost (which is fine) AND vendor risk concentration (which is not)

**Severity:** warning
**ADR ref:** Whole-document posture
**Body:**

I-4 wires `buildEnvelope` to OTel spans. I-2 wires composite FKs to Postgres schema. I-6 wires `runInTenantContext` to HTTP middleware. Each of these is a **deeper coupling to the chosen stack** — NATS JetStream + Postgres + AsyncLocalStorage. Net effect: if any one of those forces a rewrite (NATS pricing/maintenance trajectory, Postgres RLS performance ceiling at scale, Better Auth in-process becoming insufficient and forcing Keycloak/Ory/Zitadel), the migration surface area is now larger than it was yesterday.

From an investor lens, this isn't a "stop" — coupling to your moat is _correct_, and vertical SaaS is supposed to own its stack. But it does mean ADR-0020 implicitly raises the cost of revisiting ADRs 0006 / 0013 later. The founder should be aware that he is _spending optionality_ in exchange for invariant enforcement.

**Recommendation:** add a one-line "abstraction-cost note" to the ADR: explicitly list which infra choices are now harder to swap (NATS JetStream replay semantics tied to `runDeduped`; AsyncLocalStorage tied to `runInTenantContext`). Not as a blocker, but as a reminder that the next ADR proposing to replace any of these should reference 0020 in its consequences section.

---

### WARNING-3 — The ADR is light on quantified post-fix verification

**Severity:** warning
**ADR ref:** Consequences section / Adoption sequencing
**Body:**

"~12 P0 + ~30 P1 existing violations to pay down" — the count is good, but there's no exit criterion. When is I-1 _done_? When the ESLint rule errors with zero findings? When 100% of repos have a unit test? When the next codebase review finds zero new violations?

Investors love invariant ADRs **only when they come with a measurable assertion that the invariant holds**. Otherwise it reads as "we wrote the rule" rather than "we proved the rule." The former is engineering theater; the latter is engineering culture.

**Recommendation:** for each invariant, add a "Verification" line that emits a metric or a CI badge:

- I-1: `pnpm lint:tenant-scope --json | jq '.violations'` returns 0
- I-2: `pnpm audit-fks` returns 0
- I-3: startup assertion in `main.ts` (cited from earlier)
- I-4: trace-search query in Tempo returns 0 events with `correlationId` not matching trace ID format
- I-6: ESLint `no-restricted-imports` error count from CI

This converts the ADR from a memo into a **dashboard** — and a dashboard is what a Series A buyer will ask to screenshot.

---

### WARNING-4 — `@ApiProperty` gap (I-7) is the contract-hygiene canary; small fix, large signal

**Severity:** warning
**ADR ref:** Invariant I-7 / Context item 7
**Body:**

`unknown` in generated DTOs is a sign that **the OpenAPI contract is not the source of truth** for the API surface — controllers are. The founder has correctly diagnosed this as upstream. But the _frequency_ of `unknown` in `generated/api.ts` is itself a useful number: it tells you how much of the API is being consumed without type safety by the admin and qr-menu apps. That's the kind of metric a future technical co-founder or first hire will use to decide whether the codebase is greenfield-quality or already bug-ridden.

**Recommendation:** add a CI assertion that `generated/api.ts` contains zero `: unknown` after generation. Failing build > review checklist.

---

### INFO-1 — Moat assessment: multi-tenant invariants are table stakes, but the _enumeration discipline_ is the moat signal

**Severity:** info
**ADR ref:** Whole document
**Body:**

Let me be blunt about the moat question. **Multi-tenant correctness is not a moat.** Every B2B SaaS competitor in the restaurant space (Lightspeed, Toast, Square for Restaurants, plus the 50 EU regional players) either has these invariants or is one breach away from caring about them. RestOS being correct on tenant isolation is **the price of being allowed to pitch enterprise customers**, not a differentiator that earns a premium multiple.

What _is_ a moat signal in this ADR is the **discipline of enumerating 7 invariants, mapping each to a rule + enforcement + owner, and committing to pay down the violations on a schedule.** That posture is rare in solo-founder code and very rare in pre-revenue code. It tells me the founder thinks like an engineering manager, not like a coder. That changes the underwriting on "can this founder hire and lead a team post-seed."

So the moat read is: ADR-0020 doesn't _create_ a moat. It _protects the ability to build a moat_ (vertical data model, multi-brand, GDPR-as-product-feature, hospitality-specific integrations) on a foundation that won't have to be ripped up at 50 tenants.

---

### INFO-2 — GDPR exposure: ADR-0020 materially reduces regulatory tail risk for EU restaurants

**Severity:** info
**ADR ref:** Implicit — I-2 + I-3 (audit salt fallback) + I-6
**Body:**

For an EU-based vertical SaaS targeting EU restaurants, GDPR is not a checkbox; it is the **most likely cause of an existential incident** in years 1–3. ADR-0018 establishes the offboarding/erasure model; ADR-0020 protects the integrity of that model by:

- Preventing cross-tenant data references (I-2) → erasure of Tenant A cannot leave dangling FKs that re-leak data into Tenant B
- Killing the `DEV_SALT_FALLBACK` for audit erasure → erasure crypto cannot silently use a known-public dev salt in production
- Confining `runInTenantContext` to HTTP middleware (I-6) → tenant context cannot be forged from an event envelope, which was the path to writing the wrong tenant's audit record

From an IC perspective, this is the **single most fundability-positive aspect** of ADR-0020. EU privacy-aware investors (the kind of people in the EIC, German Bundesverband, French BPI ecosystem) will read this section and recognize it as adult engineering. US investors won't read it but will be told by their European LPs that it matters.

---

### INFO-3 — Adoption sequencing is correct; bias to ship infra before fixes is the right call

**Severity:** info
**ADR ref:** Adoption sequencing section
**Body:**

"Enforcement infra lands BEFORE tech-debt fixes" — this is the experienced-engineer move. The naive sequencing would be "fix the bugs first, then add lints to prevent regressions." The correct sequencing is the inverse: lints first, because (a) you only fix once you can detect, and (b) every fix not gated by a lint is an opportunity to regress within the same sprint. Worth calling out as a positive signal in IC notes — the founder is making the same call I would expect from a staff engineer with 10 years of platform experience.

---

### INFO-4 — Single-reviewer enforcement risk applies to half of these invariants

**Severity:** info
**ADR ref:** Enforcement columns (I-2, I-3, I-7 in particular)
**Body:**

Several invariants list "code review" or "migration review" as part of enforcement. With a team of one, code review is _self-review_, which is statistically the weakest form of review. This is not a critique of the founder — it is a structural reality. The mitigation is to convert as much of the "review" surface as possible into **mechanical CI gates** (ESLint, audit scripts, startup assertions, schema diff checks). The more the ADR depends on a human reading a PR, the more its actual enforcement degrades as the founder gets tired, sick, or pulled into a customer call.

**Recommendation:** add a follow-up note: "Within 6 months, every invariant in this ADR should have at least one fully mechanical enforcement; human review may augment but not be the sole gate." That principle is worth its own ADR clause.

---

## Overall verdict

**Track to lead** — ADR-0020 is exactly the kind of artifact I want to see from a pre-revenue solo founder I'm considering for a seed check: it surfaces 34 real bugs the founder found in his own code, names invariants, assigns enforcement mechanisms, and commits to a paydown schedule — which signals founder-as-engineering-manager, not founder-as-coder, and is worth more to my underwriting than another shipped feature would be at this stage.

### Growth Marketer

# Growth Marketer Council Review — ADR-0020

## Framing

This ADR is overwhelmingly an _internal-hygiene_ document: RLS posture, FK shape, OTel correlation IDs, inbox/outbox semantics, dev-env fallback guards. None of it touches the public wire format, none of it changes the qr-menu surface, none of it changes signup/onboarding/sharing flows. So a chunk of the standard growth review (SEO, virality, public-route discoverability) genuinely has **nothing to bite on** — and I will say that explicitly rather than fabricate concerns.

That said, two of the seven invariants do have real growth-motion implications, and one of them (I-7) is squarely a growth/DX/partner-readiness fix dressed up as a contract-quality fix. Findings below.

---

## Findings

### CRITICAL — none.

There is no critical growth risk in this ADR. The decision is net-positive for partner readiness and DX; the absence of a critical flag is itself the finding.

---

### WARNING-1 — I-7 is the single highest-leverage growth invariant in the ADR; treat it that way.

**Body.** I-7 is filed alongside six internal-correctness invariants, and the ADR's "Consequences" line says "no public API or wire shape changes." That framing under-sells what I-7 actually does for the growth motion.

`generated/api.ts` is the _contract surface_ every future consumer touches: the qr-menu Vite bundle, the admin Next.js app, the Expo mobile app, and — crucially — every future POS / payments / loyalty integrator who is handed `@resto/api-client` and told "here's the SDK." When request DTO fields like `slug`, `currency`, `basePrice`, `defaultCurrency` arrive in the generated client as `unknown`, the integrator's TypeScript editor offers zero autocomplete, zero inline docs, and forces an unsafe cast on the first line of integration code. That is the moment a partner engineer either says "this SDK feels alpha" or "this is solid." There is no second chance to make that impression.

Recommendation, growth lens:

- **Promote I-7 from "contract bug fix" to "SDK quality gate."** Add a separate CI check that the public surface of `@resto/api-client` contains zero `unknown` types in any request or response DTO — not just grep for `as string` workarounds, but assert on the generated output shape itself.
- **Ship a smoke-test partner repo** (~30 LOC, gitignored from main monorepo or in `tools/`) that imports `@resto/api-client`, instantiates a client against a local stack, and exercises 3-5 endpoints (list menus, create menu, fetch tenant). If that file ever needs an `as <T>` cast, CI fails. That is how Stripe, Linear, and Vercel keep their SDKs honest.
- **While you're enforcing `@ApiProperty` coverage**, also enforce `description` on every property. The same partner engineer who got zero autocomplete also gets zero hover docs today. Lint should reject `@ApiProperty()` with no `description`.

ADR section ref: I-7, last paragraph of Decision; Consequences line "no public API or wire shape changes" (technically true for runtime bytes, materially false for DX surface).

---

### WARNING-2 — I-4 (correlationId from active OTel span) is the foundation for funnel analytics; the ADR should name that.

**Body.** I-4 reads as a tracing fix: "outbox correlationId = randomUUID() severs end-to-end OTel tracing, fix via buildEnvelope helper that reads the active span." Correct, but understated.

A correlationId that survives HTTP → outbox → NATS → handler → side-effect is exactly the join key a future analytics warehouse needs to stitch a funnel: `tenant.signed_up` → `brand.created` → `menu.published` → `qr.scanned` → `order.placed`. Today, if those events emit independent random UUIDs, the warehouse has no way to attribute the QR scan back to the signup cohort except via fragile tenant_id + timestamp windowing. After I-4, every event in a causal chain carries the same correlationId, and the funnel becomes a `GROUP BY correlation_id` away.

Recommendation:

- **Add a "funnel analytics" line to I-4's rationale** so future-you doesn't quietly drop the OTel-span source in favor of "just generate one per request" when someone complains the span propagation is annoying. The reason the span source matters isn't OTel purity — it's that growth analytics depends on it.
- **Standardize one envelope property name for the funnel join key.** If the warehouse pipeline sees `correlationId` in some envelopes and `correlation_id` in others (because two services serialize differently), the join silently breaks. `buildEnvelope` helper should be the only path that writes this field.
- **Decide now**: is `correlationId` also the property a CDP (Segment / RudderStack / PostHog) would surface as `$insert_id` or `event_id`? Pick the mapping before the first analytics pipeline lands; retrofitting it across hundreds of emitted events is painful.

ADR section ref: I-4.

---

### WARNING-3 — I-5 / I-5b idempotency contract is good for partner trust but needs to be visible in the public docs.

**Body.** I-5b says "external-side-effect handlers idempotent by design with envelope.id." That is genuinely valuable from a partner-integration standpoint — a POS or loyalty partner who subscribes to RestOS webhooks (whenever webhooks ship in MVP-3+) wants to know: "if I receive event X twice, what's the contract?"

The ADR locks this in internally, but there's no mention of _surfacing_ the envelope.id and the idempotency contract to external consumers when the webhook surface eventually lands. The risk is that a year from now, when webhooks are added, the team re-invents an idempotency key separate from `envelope.id`, and partners get two confusing dedup mechanisms.

Recommendation:

- **Document envelope.id as the public idempotency key now**, even though no external surface consumes it yet. One paragraph in `docs/adr/` or wherever the envelope shape lives.
- **When webhooks ship, the HTTP delivery should put envelope.id in a header** (e.g., `X-Resto-Event-Id`) with explicit docs: "treat this as your idempotency key; replays will repeat it verbatim." This is how Stripe (`Stripe-Signature` + event id), GitHub (`X-GitHub-Delivery`), and Shopify do it.

ADR section ref: I-5b.

---

### INFO-1 — I-3 (dev fallback hardening) has zero direct growth impact but indirectly protects the brand.

**Body.** Committed dev fallbacks (`minio_dev_password`, `DEV_SALT_FALLBACK`, `VITE_TENANT_SLUG` baked into the qr-menu bundle, `NEXT_PUBLIC_API_ORIGIN` localhost in admin) don't move funnel metrics directly. But the moment one of them leaks into a prod build, the resulting incident is a brand event — "RestOS leaks hardcoded credential" is a Hacker News post, not a bug. Solo founder, pre-launch, narrative momentum matters more than for an established player.

Worth noting that `VITE_TENANT_SLUG baked into qr-menu bundle` specifically is a multi-tenancy correctness issue with a growth side-effect: the qr-menu bundle ought to be tenant-agnostic and resolve tenant from URL/QR payload so that a single CDN-cached bundle serves every tenant. If it's currently baked at build time, that means either (a) one bundle per tenant (bad cost, bad cache hit rate, bad performance → bad conversion) or (b) only one tenant works at all. Either way I-3 is fixing it; just call out that the fix is also a precondition for scaling tenant count without per-tenant deploys.

Recommendation:

- **In I-3's resolution PR**, add a one-line note: "qr-menu is now single-bundle, tenant resolved at runtime from URL." That's a marketing-able property of the platform ("instant new-tenant provisioning, no rebuild") even if no marketing page mentions it today.

ADR section ref: I-3.

---

### INFO-2 — I-1, I-2, I-6 are pure correctness; growth-neutral, but DX-positive.

**Body.** RLS-first-line in repos (I-1), composite FKs on tenant-scoped children (I-2), and "runInTenantContext is HTTP-middleware-only" (I-6) are all internal invariants. They don't change the funnel, the SDK, or the public surface.

DX angle: each of these reduces the surface area on which a future contractor or first hire can introduce a tenant-leak bug. That is a real growth-motion benefit — every hour spent debugging a cross-tenant leak in week 1 of a new hire is an hour not spent shipping the next activation-moving feature. The ADR's "enforcement infra BEFORE tech-debt fixes" sequencing is the right call here; a new contributor who hits the lint error and reads the rule learns the invariant for free.

One small DX nit: I-6's ESLint rule (`no-restricted-imports` on `runInTenantContext`) needs a clear error message pointing at _why_ this is restricted and what the right path is. If the message is just "import restricted," the next contributor's response will be "stupid lint" + an eslint-disable. The message should read more like: "runInTenantContext is HTTP-middleware-only — for background jobs / event handlers, use [the correct helper]." Same advice applies to the I-1 lint and the I-7 no-unsafe-cast lint.

Recommendation:

- **Every custom rule in `tools/eslint-plugin-resto/` must ship with a `docs/` URL** in its `meta.docs.url`. Even a one-paragraph rationale in the repo is enough. This is how Airbnb / Vercel / Shopify eslint plugins establish trust; a rule without a docs link gets disabled.

ADR section ref: I-1, I-6, I-7 (lint UX).

---

### INFO-3 — Nothing in this ADR touches signup, brand-creation, QR-share, or any virality mechanic. Confirmed by inspection.

**Body.** Per the role brief, I checked whether ADR-0020 affects:

- Self-serve signup flow → no, identity is MVP-2 / Better Auth, separate track.
- Public SEO surface (tenant websites, qr-menu, landing) → no, no route or rendering changes.
- Multi-brand-per-tenant provisioning → no, only the composite-FK shape is touched and that is invisible above the repo layer.
- QR sharing mechanics → no, qr-menu bundle is affected only by I-3's `VITE_TENANT_SLUG` removal (see INFO-1).

That is the correct scope for this ADR. The risk to flag is the _opposite_ — that the team treats "we shipped ADR-0020" as growth-relevant work and delays the actually-growth-moving MVP-2 items (admin panel polish, GDPR offboarding self-serve, multi-brand UX). This is internal-hygiene investment; budget it as such and don't let it crowd out the funnel work.

Recommendation:

- **When sequencing the ~12 P0 + ~30 P1 fixes**, explicitly check each one against "does this unblock a growth-relevant item?" Prioritize the few that do (I-7 SDK quality, I-3 qr-menu single-bundle, I-4 correlation for analytics) and let the rest run on a slower track interleaved with feature work.

---

### INFO-4 — Public / internal API split is unaffected; partners will still see only `/v1/*`.

**Body.** The `/v1/*` (public) vs `/internal/v1/*` (internal-token-protected) split is untouched by this ADR. The `@resto/api-client` post-I-7 fix will generate types from the OpenAPI spec — provided the spec correctly tags internal-only endpoints and the SDK generation filters or partitions them, a partner pointed at the SDK won't accidentally see internal surface.

I did not verify how `@resto/api-client` is currently generated, so flagging as a thing-to-confirm rather than a finding:

- Does the OpenAPI generator produce a single client with both surfaces, or two clients (`@resto/api-client` and `@resto/api-client-internal`)? If single, the internal endpoints should be tag-gated and the partner-facing docs/SDK should filter them out.
- After I-7 lands, every endpoint will have proper `@ApiProperty` decorators — perfect moment to also enforce tag hygiene (`@ApiTags('public')` vs `@ApiTags('internal')`) so the split is machine-enforceable, not convention-only.

Recommendation:

- **One-time audit** as part of the I-7 rollout: every `/internal/v1/*` controller has `@ApiTags('internal')`; SDK generation either produces two packages or one package with internal types marked.

ADR section ref: not in ADR — adjacent concern surfaced by I-7's enforcement work.

---

## Overall verdict

ADR-0020 is internal-hygiene work with two quiet but real growth wins (I-7 makes the SDK partner-ready, I-4 makes funnel analytics possible) buried inside five correctness fixes — accept it, but elevate I-7 and I-4 from "contract/tracing bugs" to "SDK quality gate and analytics foundation" in the punch list so they get the prioritization they deserve.
