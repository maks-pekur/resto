# ADR 0021: Layered milestone strategy with freeze gates

- **Status:** accepted
- **Date:** 2026-05-17
- **Council reviewed:** 2026-05-17 (`docs/adr/0021-layered-milestone-strategy-COUNCIL.md`) — synthesis `proceed-with-changes` (4/5 personas; Skeptic dissented `reject`). Amendments below incorporate cross-persona consensus.
- **Deciders:** Resto core team
- **Relates to:** [ADR 0010](./0010-mvp-1-scope.md) (frames MVP-1 scope; this ADR governs the _order_ in which that scope ships), [ADR 0020](./0020-multi-tenancy-and-event-bus-invariants.md) (defines the seven invariants; this ADR governs when their enforcement is considered complete enough to stop re-reviewing).

## Context

Between ADR-0020 (merged 2026-05-16, `ff1adcd`) and 2026-05-17 the project shipped five focused PRs (#130–#134) closing three of seven invariants (I-3, I-5, I-7). Throughput was high, but the underlying pattern is unsustainable:

1. **Reviews compound on a moving foundation.** A full-codebase review against an architecture that is still incomplete in _other_ layers will keep finding "violations" that are not bugs in the layer being shipped — they are unfinished work elsewhere. Each review rewrites the plan; each plan rewrite invalidates parts of the previous one.

2. **No clear "this layer is done" gate.** ADR-0020 enumerates seven invariants but does not say _when_ they are considered enforced-enough to stop full-codebase review against them. Every PR is therefore in scope for every invariant, regardless of which layer it touches.

3. **Horizontal vs. vertical contention.** Some invariants are layer-cutting (multi-tenancy applies to every repo; the events contract applies to every emitter and consumer; identity applies to every authenticated entry point). Trying to enforce all of them across all apps simultaneously means every PR must satisfy every cross-cutting rule, even when the rule's enforcement tooling does not yet exist in CI.

4. **Apps multiply the surface area.** The same auth / tenancy / events concerns must be solved once in `apps/api`, then re-solved for `apps/admin`, `apps/qr-menu`, `apps/website`, `apps/mobile`. Solving them in all apps in parallel produces "three versions of the same bug" — see the `apps/admin` (CR-01 open redirect) and `apps/qr-menu` (CR-02 `VITE_TENANT_SLUG` bake-in) findings from the 2026-05-16 review.

5. **The project carries little functional surface today.** The cost of restructuring milestones is low now and rises sharply as more features land on top of an unstable foundation.

The project needs an explicit _order of completion_ — a way to declare "this layer is locked, do not re-review it" — so that future work compounds on a stable base instead of relitigating the foundation.

## Decision

Adopt a **layered milestone model** with explicit freeze gates. Work proceeds through six tiers; each tier has a defined scope, an objective "frozen" criterion, and an ownership model for follow-on changes. Reviews are scoped to the active tier; findings against not-yet-frozen tiers are backlog, not blockers.

**Primary ROI: cross-tenant data leak prevention.** The strongest economic justification for this discipline is that a single cross-tenant leak on a B2B SaaS handling restaurant POS / customer PII / payment metadata is a company-ending event (GDPR fine + reputational collapse + loss of every pilot). Reviewer ergonomics is a secondary benefit. Tier priorities reflect each invariant's leak-prevention weight: I-1 (repo-layer `tenant_id` filter) and I-2 (composite FK on tenant-scoped children) are load-bearing; I-7 (no `unknown` in DTOs) is contract hygiene with low direct leak-prevention contribution and is freeze-gated only because it cheap and already mostly done.

### The six tiers

#### Tier 1 — Multi-tenancy (API only)

**Scope.** ADR-0020 invariants I-1 (repo-layer `tenant_id` filter), I-2 (composite FK on tenant-scoped children), I-6 (`runInTenantContext` is HTTP-middleware-only); RLS policies on all tenant-scoped tables; `db.withTenant` / `db.withoutTenant` contract and its precise specification (per ADR-0020 council WR-2); AsyncLocalStorage propagation rules.

**Frozen when.**

- An I-1 enforcement mechanism is in place and green across `apps/api/**` (see "Tooling preference order" in Implementation notes — base-class first, ESLint plugin last).
- An I-2 enforcement mechanism is in place and green for all tenant-scoped tables (schema helper first, audit script as fallback).
- ESLint `no-restricted-imports` rule for `runInTenantContext` (I-6) is green; the BA-hook violation in `identity-event-emitter.adapter.ts` is fixed.
- One e2e test per bounded context proves cross-tenant isolation under RLS (per `resto-e2e-with-rls` skill).
- All Linear issues in the Tier 1 epic with label `gate-blocker` are closed. The migration step at adoption time (see Adoption sequencing) seeds this epic from `.planning/reviews/2026-05-16-full-codebase/INDEX.md` and from `project_adr_0020_followup` auto-memory, then those local sources stop being canonical.

#### Tier 2 — Event bus (API only)

**Scope.** ADR-0020 invariants I-4 (envelope `correlationId` from active OTel span), I-5 (inbox dedup in same tx as side effects, already closed via `runDeduped` in PR #132), I-5b (envelope.id idempotency contract); outbox dispatcher; transactional inbox; envelope schema; growth-events catalog.

**Frozen when.**

- `buildEnvelope` helper is the only path to envelope construction; ESLint `no-restricted-syntax` rule against `correlationId: randomUUID()` is green.
- `runDeduped` wrapper is in use by every NATS subscriber; old `withInboxDedup` / `InboxTracker` deletions are confirmed.
- I-5b ledger contract is implemented in `packages/events` and proven by an integration test against a mock external side effect. **First real-handler usage is a Tier 5 concern, not a Tier 2 gate** (Phase D customer phone+OTP will pull I-5b in naturally when it ships).
- An at-least-once delivery integration test demonstrates zero duplicate side effects under handler crash for the mock-sink case.
- A **growth-events catalog** is defined and emitted via the outbox. Minimum set: `user.signup_completed`, `brand.created`, `menu.first_published`, `qr.scanned`, `order.placed`. Each event carries `tenant_id`, `correlation_id`, `utm_*`, `referrer`. The catalog is a one-page document in `docs/api/events.md`; the per-event emit sites are Tier 5 concerns.

#### Tier 3 — Identity (API only)

**Scope.** Better Auth integration (ADR-0013); operator + customer auth flows; `INTERNAL_API_TOKEN` boundary; role/scope model and enforcement; session cookie security (`secure: true` in production per `apps/CLAUDE.md`); identity event emission via `db.withoutTenant` (closing the I-6 BA-hook tech debt from ADR-0020).

**Frozen when.**

- All operator endpoints require an authenticated operator session; all customer-auth-required endpoints require a customer session.
- `INTERNAL_API_TOKEN` is enforced on every internal endpoint and is asserted present at startup in production (already covered by `assertProdGuardrails`).
- No placeholder identity (e.g. `operator@example.com`) is rendered in any shipping UI; more generally, no development fixture data is reachable in production builds.
- Open-redirect refinement on `next=` / `redirect=` query params is in place (per `apps/CLAUDE.md`).

#### Tier 4 — Contract (API only)

**Scope.** ADR-0020 invariant I-7 (no `unknown` in generated DTOs, closed via PR #134); full OpenAPI coverage of the API surface; `packages/api-client` regeneration discipline; ESLint `no-unsafe-cast` rule for `@resto/api-client/*` consumers (deferred until first regression — see Tooling preference order).

**Frozen when.**

- CI grep on generated `packages/api-client/src/generated/api.ts` is green (no `: unknown` in DTO bodies) — already wired via `apps/api/test/unit/openapi-contract.spec.ts`.
- Every controller surface has `@ApiBody` / `@ApiProperty` coverage and a regen-from-OpenAPI workflow is documented in `docs/api/`.
- The generated client is dogfooded by ≥1 non-trivial caller outside `apps/admin` (e.g. an internal integration test harness or a CLI) to validate it works as a third-party would consume it.

#### Tier 5 — API bounded contexts

**Scope.** Per-context implementation of the domain: tenancy, catalog, ordering, payments, reservations, loyalty, inventory, analytics, notifications, audit (identity returns in MVP-2 per ADR-0012/ADR-0013, already covered in Tier 3).

**Sequence (vertical slices, not one-context-per-milestone).** Each milestone is a 2–3-context slice that produces a customer-visible golden path. Suggested initial sequence:

- **Milestone 5a — Public menu.** Catalog (public-read menu) + tenancy plumbing for slug resolution. End-to-end demo: an operator imports a menu, a customer scans a QR code, the menu renders.
- **Milestone 5b — Ordering.** + Ordering happy-path (single item, no modifiers, cash on pickup). End-to-end demo: customer places an order, operator sees it.
- **Milestone 5c — Payments.** + Payments (Stripe, single currency). End-to-end demo: customer pays, operator's Stripe Connect account receives the funds in test mode.
- **Subsequent slices.** Reservations, loyalty, inventory, analytics, notifications, audit — each as a vertical slice with at least one customer-visible touchpoint.

Per-context "frozen" emerges as a side effect of multiple slices crossing it and stabilizing it. Tier 1–4 invariants apply to every slice (pre-frozen, so violations are real regressions blocking PRs).

**Frozen when (per slice).**

- Public API surface stable; e2e coverage of the golden path + cross-tenant isolation.
- OpenAPI contract published in `docs/api/`.
- Context-specific `CLAUDE.md` exists if conventions deviate from defaults.
- The corresponding growth event from the Tier 2 catalog is emitted at the right point in the flow.
- **An outward-facing success metric is met.** Slice 5a: ≥1 real menu of ≥30 items imported by a real operator (a friend's restaurant qualifies) in under 1 hour without founder hand-holding. Slice 5b: ≥3 successful test orders placed by people who don't work on this project. Slice 5c: ≥1 successful end-to-end payment in test mode by a non-team member. Subsequent slices define their own outward-facing metric at planning time.

#### Tier 6 — Layer propagation to web/mobile apps

**Scope.** Extend Tiers 1–4 contracts to `apps/admin`, `apps/qr-menu`, `apps/website`, `apps/mobile`. Auth flows, tenant context resolution, event consumption where applicable, generated-client adoption, env hygiene (per `apps/CLAUDE.md` "Env vars at the web layer").

**Permitted parallel work (positive allowlist).** While Tiers 1–4 are not yet frozen, the following work is explicitly permitted in web/mobile apps and is **not** gated on freeze:

- Design system development under `packages/ui/`.
- Static marketing routes in `apps/website` and `apps/landing` that render no tenant data.
- Consumption of public-read endpoints already shipped by `apps/api` via the generated client (e.g. public menu read in `apps/qr-menu`).
- A **single-tenant demo spine.** One hand-provisioned tenant, no public signup, gated behind a feature flag, marked explicitly non-production, used for design-partner conversations, sales pitch, and founder-credibility demos. The demo tenant inherits known foundational gaps; this is documented in the demo's runbook and is acceptable because the demo is not multi-tenant GA. The demo spine is the answer to "we need something to show before Tier 4 freezes" — see Consequences.

Anything else (multi-tenant signup, public auth flows in production, customer-facing event consumption in production, public tenant-website at scale) is gated on Tier 1–4 freeze.

### Review discipline

The treadmill ends only if reviews change. These are decisions, not suggestions:

1. **Full-codebase review fires only at a tier freeze gate.** ADR-0020's 2026-05-16 review is considered closed; no new full-codebase review runs until Tier 1 is declared frozen.
2. **Phase-level review (`/gsd-code-review`, `/gsd-secure-phase`, `/gsd-ui-review`) is scoped to the phase's stated scope.** A phase under Tier 2 is not reviewed against Tier 3 invariants. Every phase plan declares, in its front-matter, the active tier and the explicit set of files/contexts under review. Findings outside that set are auto-routed to backlog without debate.
3. **Findings outside the current tier are backlog, not blockers.** A review finding that targets a not-yet-frozen tier is filed as a Linear issue against that tier's epic and does not block the current PR.
4. **Regressions into a frozen tier are blockers.** Once Tier 1 is frozen, any PR that introduces a new I-1/I-2/I-6 violation is rejected at review and re-routed through the Tier 1 epic.
5. **Plans are stable within a phase by default; rewrites are the named exception.** The default disposition for a review finding is a backlog item (Linear). A phase plan is rewritten only when (a) a finding invalidates a load-bearing assumption of the plan itself, or (b) a real pilot / design partner surfaces feedback that requires changing the phase's product scope. Plan-invalidating triggers must be named explicitly in a halt notice; the prior plan is archived in Linear. Code-review findings are noise to suppress within a phase; user-feedback findings are first-class signal.

### Unfreeze protocol

A frozen tier may be unfrozen by a single-line note in its Linear epic citing the trigger (new compliance regime, newly-added invariant, dependency upgrade that changed semantics). Once unfrozen, the tier re-runs its original freeze gates before re-locking. No new ADR is required unless the freeze gates themselves change. New invariants added to a successor ADR default to the _next_ tier cycle, not retroactive unfreeze of completed tiers, unless explicitly marked `retroactive: true` with rationale.

Each frozen tier re-runs its freeze gates on a scheduled cadence (quarterly minimum, or on major dependency bumps — Drizzle, NestJS, Better Auth). If a gate fails, the tier auto-unfreezes via the protocol above.

### Tracking

**Authoritative tier-freeze signal lives in the repo, not Linear.** Each tier's frozen state is marked by:

- A git tag `t<N>-frozen-<YYYY-MM-DD>` on the commit where the last freeze gate goes green.
- A checkbox in `docs/milestones/STATUS.md` (created at adoption time).

**Linear (project `RES`) is a queryable mirror, not the source of truth.** Each tier maps to a Linear epic; backlog items file against the corresponding tier's epic; the epic's "closed" state reflects the tier's frozen tag. In a Linear outage, backlog items go to `docs/backlog/<tier>.md` and are migrated back when Linear returns. This avoids making Linear a single point of failure for a solo-founder operation.

`.planning/` remains the working directory for in-flight GSD phases but is not a durable task tracker. Mapping:

- `.planning/phases/<phase>/` ↔ one Linear issue (the phase ticket).
- `.planning/reviews/<date>-<scope>/INDEX.md` ↔ a Linear epic's seed material before items are filed.
- ADR-0020 follow-up items currently tracked in auto-memory `project_adr_0020_followup.md` migrate into the relevant tier epics at adoption time; the memory then becomes a pointer to the epic.

## Alternatives considered

- **Ship a one-paragraph review-discipline rule instead of this ADR.** Argued by the Skeptic in council: the load-bearing decision is "full-codebase reviews fire at named checkpoints, not per PR; findings outside the current phase scope are backlog." Everything else in this ADR (tier ceremony, freeze criteria, Linear epics) is procedural surface area that may not be needed at the project's stage. **Partially rejected, partially preserved:** 4 of 5 council personas validated the layered framing, so the ADR retains its structure — but the dissent is preserved as a 30-day reconsideration trigger (see Adoption sequencing step 7). If tier ceremony produces less throughput than the pre-ADR pattern over the next month, the project reverts to the 1-paragraph version and supersedes this ADR.
- **Vertical slicing (full-stack per feature, no horizontal freeze).** Rejected. Cross-cutting invariants (tenancy, events, identity) solved five times produce five inconsistent implementations and five waves of review churn. The 2026-05-16 review demonstrated this empirically. Note: Tier 5 _within_ the layered model uses vertical slicing (a different scope than this rejected alternative).
- **No formal layers, just better PR scoping.** Rejected. Without an explicit gate, every review still has license to comment on every invariant on every PR. The discipline change requires a structural change, not a stylistic one.
- **Monorepo-wide simultaneous enforcement.** Rejected. ADR-0020 already chose enforcement-via-tooling; this ADR governs _when_ the tooling is wired up and _when_ enforcement is considered live. Enforcing all seven invariants on every PR with tooling that does not yet exist degrades into hand-grading by reviewer.
- **Calendar-driven milestones (time-boxed, not freeze-driven).** Rejected. A calendar boundary that lands while a tier still leaks violations declares the tier _frozen_ without it being frozen. Freeze gates are objective so the decision is not subjective.
- **Defer this ADR until one layer is complete.** Rejected. The cost of switching to layered milestones rises with every feature shipped under the current pattern.
- **Different ordering of tiers (Identity before Multi-tenancy).** Rejected on architectural grounds: tenant context is resolved from sources _other_ than session (subdomain, header, internal token) in this stack, so multi-tenancy enforcement is testable without an identity layer in place; the reverse is not true. Acknowledged commercial cost: identity gaps will be the more visible blocker to running the first pilot — Tier 3 must not slip behind Tier 1+2 polish work.

## Consequences

### Positive

- Reviews stop relitigating the foundation. A frozen tier is not reopened by routine review.
- Backlog is single-tracked (Linear epic mirror + repo-canonical tags), not split between `.planning/reviews/*/INDEX.md`, GitHub PR comments, ADR follow-ups, and auto-memory.
- Each tier ships with concrete done criteria — no ambiguity over whether multi-tenancy "is finished."
- Web/mobile apps are not asked to solve the same auth/tenancy/events problems before the API has settled them.
- Per-invariant metrics (per ADR-0020 council WR-3/WR-4) become natural to define — they become tier-freeze gates.
- A demo-spine carve-out keeps founder-credibility / design-partner / sales motion alive in parallel with foundation work.

### Negative

- Tier 6 production GA is gated on Tier 1–4 freeze. Demos and design-partner conversations run on the single-tenant demo spine in the meantime; that demo carries known foundational gaps documented in its runbook.
- Some greenfield work is restricted to the positive allowlist. Founder optionality is reduced in exchange for not seeding the "three versions of the same bug" failure mode.
- Strict ordering may feel slow when an engineer sees an obvious fix in a not-yet-active tier. The fix is filed in Linear and waits — accepted cost.
- The ADR is itself process scaffolding. The 30-day reconsideration trigger (Adoption sequencing step 7) provides an exit if the scaffolding is producing less throughput than the pre-ADR pattern.

### Neutral

- The ADR does not change _what_ the project ships, only the order. Total scope is unchanged from ADR-0010.
- The tier model is open to revision via a new ADR if a clear ordering need emerges that the current six tiers do not handle.

## Implementation notes

### Initial state per tier

- **Tier 1 (Multi-tenancy).** Partially complete. ADR-0020 I-1/I-2/I-6 are diagnosed and CLAUDE.md-encoded. The I-1 enforcement mechanism is not yet implemented. `db:audit-fks` does not yet exist. The BA-hook I-6 violation in `identity-event-emitter.adapter.ts` is still open.
- **Tier 2 (Event bus).** Partially complete. I-5 closed via PR #132 (`runDeduped`). I-4 helper status to be verified. I-5b ledger contract open. Growth-events catalog not started.
- **Tier 3 (Identity).** Partially complete. Better Auth mounted per ADR-0013. RBAC and INTERNAL_API_TOKEN startup assertion in place (PR #130/#133). Open-redirect refinement and placeholder-identity-in-UI items pending.
- **Tier 4 (Contract).** Mostly complete. I-7 closed via PR #134. `no-unsafe-cast` ESLint rule deferred until first regression (see Tooling preference order). OpenAPI completeness audit pending.
- **Tier 5 / Tier 6.** Not started in the freeze-gated sense.

### First scheduling decision

After acceptance: close Tier 1 first (BA-hook fix + I-1/I-2 enforcement mechanism + composite-FK audit), then Tier 2 (I-5b mock-sink ledger + growth-events catalog), then Tier 3 (identity completeness audit), then Tier 4. Tier 5 begins only after Tiers 1–4 are frozen.

### Tooling preference order (cost-aware enforcement)

For each enforcement mechanism, prefer the cheapest-to-build option that works. Reserve custom tooling for last resort.

**I-1 (`tenant_id` filter enforcement):**

1. Drizzle repository base class that cannot construct a query without a `tenantId` predicate (constructor-injects tenant from ALS; throws if absent). ~80 LOC, no tooling.
2. `no-restricted-syntax` ESLint rule with regex patterns over Drizzle calls in tenant-scoped repos.
3. Custom AST grep in CI.
4. Custom ESLint plugin under `tools/eslint-plugin-resto/` — last resort.

**I-2 (composite FK on tenant-scoped children):**

1. Drizzle schema helper that generates the composite FK declaration from a single call site.
2. `pnpm db:audit-fks` script — fallback if the helper proves leaky or for legacy table audit.

**I-7 (no `unknown` in generated DTOs):** root-cause fix already shipped (PR #134). `no-unsafe-cast` ESLint rule is **deferred until first regression** — the regression test in `apps/api/test/unit/openapi-contract.spec.ts` is sufficient guard while no production handler has been observed to need the cast.

The freeze criteria reference the _outcome_ (no violations) not the specific tool. If a cheaper option achieves the outcome, the cheaper option is the implementation.

### Migration from existing trackers

- `project_adr_0020_followup.md` in auto-memory → remaining items file as Linear issues under the appropriate tier epic; the memory record stays as a pointer.
- `.planning/reviews/2026-05-16-full-codebase/INDEX.md` items → filed under tier epics by their ADR-0020 invariant tag.

### Deferred council suggestions (file as backlog, not ADR scope)

The following council recommendations are valid but exceed this ADR's scope. File as Linear issues under the relevant tier epic at adoption time; revisit when the tier is the active focus:

- T4-external split: hosted ReDoc/Scalar docs site, API-key issuance, idempotency-key header, `X-API-Version`, webhook signature scheme, 30-day deprecation policy (Growth #4–#5).
- Slug hygiene appendix: slug regex, reserved list, canonical-host policy, server-side `<link rel="canonical">` (Growth #8).
- Onboarding spine as a named workstream with measured time-to-first-published-menu (Product #4).
- OAuth (Google) and magic-link path as T3 freeze additions (Growth #7).
- Referral / share loops folded into T5 loyalty when planned (Growth #9).
- Cost-per-month-while-in-freeze audit (Investor W4).
- 4-week time-box on T1–T4 closure (Investor I3).

### What this ADR does NOT change

- The seven ADR-0020 invariants themselves. They are unchanged in content; this ADR only governs the _order_ in which their enforcement is wired up and the _gate_ after which a tier stops being re-reviewed.
- The trunk-based-PR development workflow.
- The GSD pipeline. `gsd-spec-phase` → `gsd-plan-phase` → `gsd-execute-phase` continues to be the implementation flow within a tier. The change is that the tier's _scope_ now defines what a phase may touch.

## Adoption sequencing

1. ~~This ADR merges with status `proposed`.~~ Done — commit `fc41358`.
2. ~~`/adr-council 0021` runs to validate the strategy across the five-persona lens.~~ Done — `docs/adr/0021-layered-milestone-strategy-COUNCIL.md`, commit `7eb90b8`.
3. ~~ADR transitions to `accepted` with consensus amendments incorporated.~~ Done — this commit.
4. Linear epics for Tiers 1–4 are created (Tier 5 and 6 epics created on demand).
5. The 2026-05-16 review punch list and the `project_adr_0020_followup.md` open items are migrated into the relevant tier epics. `docs/milestones/STATUS.md` is created.
6. Tier 1 closeout begins as the next milestone.
7. **30-day reconsideration trigger.** Council Skeptic dissent argues this ADR should be replaced with a 1-paragraph rule. If at 30 days post-adoption (target: 2026-06-16) tier ceremony has produced less measured throughput than the pre-ADR pattern (5 PRs / 3 invariants in one day), the project reverts to the 1-paragraph version (`docs(claude): full-codebase reviews fire only at named checkpoints; per-PR review is scoped to the PR`) and this ADR is superseded.
