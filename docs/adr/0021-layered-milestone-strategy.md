# ADR 0021: Layered milestone strategy with freeze gates

- **Status:** proposed
- **Date:** 2026-05-17
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

### The six tiers

#### Tier 1 — Multi-tenancy (API only)

**Scope.** ADR-0020 invariants I-1 (repo-layer `tenant_id` filter), I-2 (composite FK on tenant-scoped children), I-6 (`runInTenantContext` is HTTP-middleware-only); RLS policies on all tenant-scoped tables; `db.withTenant` / `db.withoutTenant` contract and its precise specification (per ADR-0020 council WR-2); AsyncLocalStorage propagation rules.

**Frozen when.**

- CI lint (I-1 ESLint rule or AST grep under `tools/eslint-plugin-resto/`) is green across `apps/api/**` with an explicit, audited allowlist.
- `pnpm db:audit-fks` script is green for all tenant-scoped tables (I-2).
- ESLint `no-restricted-imports` rule for `runInTenantContext` (I-6) is green; the BA-hook violation in `identity-event-emitter.adapter.ts` is fixed.
- One e2e test per bounded context proves cross-tenant isolation under RLS (per `resto-e2e-with-rls` skill).
- All P0 findings from `.planning/reviews/2026-05-16-full-codebase/INDEX.md` tagged "multi-tenancy" are closed.

#### Tier 2 — Event bus (API only)

**Scope.** ADR-0020 invariants I-4 (envelope `correlationId` from active OTel span), I-5 (inbox dedup in same tx as side effects, already closed via `runDeduped` in PR #132), I-5b (envelope.id idempotency contract + outgoing-side-effect ledger); outbox dispatcher; transactional inbox; envelope schema.

**Frozen when.**

- `buildEnvelope` helper is the only path to envelope construction; ESLint `no-restricted-syntax` rule against `correlationId: randomUUID()` is green.
- `runDeduped` wrapper is in use by every NATS subscriber; old `withInboxDedup` / `InboxTracker` deletions are confirmed.
- I-5b ledger is implemented and used by at least one external-side-effect handler (lands with Phase D — customer phone+OTP).
- An at-least-once delivery integration test demonstrates zero duplicate side effects under handler crash.

#### Tier 3 — Identity (API only)

**Scope.** Better Auth integration (ADR-0013); operator + customer auth flows; `INTERNAL_API_TOKEN` boundary; role/scope model and enforcement; session cookie security (`secure: true` in production per `apps/CLAUDE.md`); identity event emission via `db.withoutTenant` (closing the I-6 BA-hook tech debt from ADR-0020).

**Frozen when.**

- All operator endpoints require an authenticated operator session; all customer-auth-required endpoints require a customer session.
- `INTERNAL_API_TOKEN` is enforced on every internal endpoint and is asserted present at startup in production (already covered by `assertProdGuardrails`).
- No placeholder identity (e.g. `operator@example.com`) is rendered in any shipping UI.
- Open-redirect refinement on `next=` / `redirect=` query params is in place (per `apps/CLAUDE.md`).

#### Tier 4 — Contract (API only)

**Scope.** ADR-0020 invariant I-7 (no `unknown` in generated DTOs, closed via PR #134); full OpenAPI coverage of the API surface; `packages/api-client` regeneration discipline; ESLint `no-unsafe-cast` rule for `@resto/api-client/*` consumers.

**Frozen when.**

- CI grep on generated `packages/api-client/src/generated/api.ts` is green (no `: unknown` in DTO bodies) — already wired via `apps/api/test/unit/openapi-contract.spec.ts`.
- `no-unsafe-cast` ESLint rule is in place and green for `@resto/api-client/*` consumers.
- Every controller surface has `@ApiBody` / `@ApiProperty` coverage and a regen-from-OpenAPI workflow is documented.

#### Tier 5 — API bounded contexts

**Scope.** Per-context implementation of the domain: tenancy, catalog, ordering, payments, reservations, loyalty, inventory, analytics, notifications, audit (identity returns in MVP-2 per ADR-0012/ADR-0013, already covered in Tier 3).

**Sequence.** One context per milestone. Each milestone is planned, executed, verified, and shipped before the next begins. Tier 1–4 invariants apply to every context implementation (they are pre-frozen at this point, so violations within Tier 5 work are real regressions and block PRs).

**Frozen when (per context).** Public API surface stable; e2e coverage of golden path + cross-tenant isolation; OpenAPI contract published in `docs/api/`; context-specific `CLAUDE.md` exists if conventions deviate from defaults.

#### Tier 6 — Layer propagation to web/mobile apps

**Scope.** Extend Tiers 1–4 contracts to `apps/admin`, `apps/qr-menu`, `apps/website`, `apps/mobile`. Auth flows, tenant context resolution, event consumption where applicable, generated-client adoption, env hygiene (per `apps/CLAUDE.md` "Env vars at the web layer").

**Constraint.** Tier 6 work on a given app may NOT begin in earnest until Tiers 1–4 are frozen. Until then, web apps consume the API as black-box clients and do not participate in invariant enforcement.

**Exception.** Greenfield UI work that does NOT touch auth / tenancy / events surfaces is permitted in parallel (design system, marketing copy, layouts, public reads of already-stable endpoints). This keeps frontend craft moving without seeding the "three versions of the same bug" failure mode.

### Review discipline

The treadmill ends only if reviews change. These are decisions, not suggestions:

1. **Full-codebase review fires only at a tier freeze gate.** ADR-0020's 2026-05-16 review is considered closed; no new full-codebase review runs until Tier 1 is declared frozen.
2. **Phase-level review (`/gsd-code-review`, `/gsd-secure-phase`, `/gsd-ui-review`) is scoped to the phase's stated scope.** A phase under Tier 2 is not reviewed against Tier 3 invariants.
3. **Findings outside the current tier are backlog, not blockers.** A review finding that targets a not-yet-frozen tier is filed as a Linear issue against that tier's epic and does not block the current PR.
4. **Regressions into a frozen tier are blockers.** Once Tier 1 is frozen, any PR that introduces a new I-1/I-2/I-6 violation is rejected at review and re-routed through the Tier 1 epic.
5. **Plans are rewritten only between milestones.** Reviews produce backlog items (Linear), not plan rewrites. Phase plans are stable for the duration of the phase.

### Tracking (Linear)

The canonical task tracker is **Linear** (project `RES`). Each tier maps to a Linear epic:

- One epic per Tier 1–4 (four epics total).
- One epic per Tier 5 context (created as each context milestone is planned).
- One epic per Tier 6 app extension (created when the corresponding API tiers are frozen).

Backlog items — from reviews, observation logs, ad-hoc findings — are filed against the corresponding tier's epic. The epic's "closed" state corresponds to the tier's "frozen" criterion above.

`.planning/` remains the working directory for in-flight GSD phases but is not the durable task tracker. Mapping:

- `.planning/phases/<phase>/` ↔ one Linear issue (the phase ticket).
- `.planning/reviews/<date>-<scope>/INDEX.md` ↔ a Linear epic's seed material before items are filed.
- ADR-0020 follow-up items currently tracked in auto-memory `project_adr_0020_followup.md` migrate into the relevant tier epics at adoption time; the memory then becomes a pointer to the epic rather than a parallel tracker.

## Alternatives considered

- **Vertical slicing (full-stack per feature, no horizontal freeze).** Rejected. The cross-cutting invariants (tenancy, events, identity) are shared infrastructure — solving them five times in five vertical slices produces five inconsistent implementations and five waves of review churn. The 2026-05-16 review demonstrated this empirically.
- **No formal layers, just better PR scoping.** Rejected. Without an explicit "this tier is frozen" gate, every review still has license to comment on every invariant on every PR. The discipline change requires a structural change, not a stylistic one.
- **Monorepo-wide simultaneous enforcement.** Rejected. ADR-0020 already chose enforcement-via-tooling; this ADR governs _when_ the tooling is wired up per invariant and _when_ enforcement is considered live. Enforcing all seven invariants on every PR with tooling that does not yet exist degrades into hand-grading by reviewer — exactly the state ADR-0020 was meant to end.
- **Calendar-driven milestones (time-boxed, not freeze-driven).** Rejected. A calendar boundary that lands while a tier is still leaking violations creates a worse problem than the current one: the tier is _declared_ frozen without being frozen. Freeze gates are objective (CI signals, audit script results) precisely so the decision is not subjective.
- **Defer this ADR until one layer is complete.** Rejected. The cost of switching to layered milestones rises with every feature shipped under the current pattern. Lock the strategy now, while functional surface is small.
- **Different ordering of tiers (e.g., Identity before Multi-tenancy).** Rejected. Multi-tenancy is the single bug class with the highest customer-facing blast radius (a leak ends the company). Identity sits on top of a tenant-context contract; ordering Identity first would force Tier 3 to re-litigate Tier 1 assumptions.

## Consequences

### Positive

- Reviews stop relitigating the foundation. A frozen tier is not reopened by routine review.
- Backlog is single-tracked in Linear, not split between `.planning/reviews/*/INDEX.md`, GitHub PR comments, ADR follow-ups, and auto-memory.
- Each tier ships with concrete done criteria — no ambiguity over whether multi-tenancy "is finished."
- Web/mobile apps are not asked to solve the same auth/tenancy/events problems before the API has settled them. The 2026-05-16 admin (CR-01) and qr-menu (CR-02) findings illustrate the cost of skipping this ordering.
- Per-invariant metrics (per ADR-0020 council WR-3/WR-4) become natural to define — they become tier-freeze gates.

### Negative

- Tier 6 (apps beyond API) is gated on Tier 1–4 freeze. If an end-to-end demo is needed before Tier 1–4 are frozen, the demo uses a partial stack and inherits known gaps. Acceptable for internal demos; not acceptable for paid pilots.
- Greenfield UI work on auth/tenancy/events surfaces is blocked even when an engineer is available and the corresponding API tier is incomplete. Trade-off accepted: the alternative is the "three versions of the same bug" failure mode demonstrated by the 2026-05-16 review.
- Linear becomes a hard dependency for project tracking. If Linear is unavailable, work continues in `.planning/` and is filed retroactively.
- The model imposes a strict ordering that may feel slow when an engineer sees an obvious fix in a not-yet-active tier. The fix is filed in Linear and waits — accepted cost.

### Neutral

- The ADR does not change _what_ the project ships, only the order. Total scope is unchanged from ADR-0010.
- The tier model is open to revision via a new ADR if a clear ordering need emerges that the current six tiers do not handle.

## Implementation notes

### Initial state per tier

- **Tier 1 (Multi-tenancy).** Partially complete. ADR-0020 I-1/I-2/I-6 are diagnosed and CLAUDE.md-encoded. The I-1 CI lint (ESLint plugin under `tools/eslint-plugin-resto/`) is not yet implemented. `db:audit-fks` script does not yet exist. The BA-hook I-6 violation in `identity-event-emitter.adapter.ts` is still open.
- **Tier 2 (Event bus).** Partially complete. I-5 closed via PR #132 (`runDeduped`). I-4 (`buildEnvelope` helper + ESLint rule against `randomUUID()` correlationId) status to be verified. I-5b ledger open — lands with Phase D.
- **Tier 3 (Identity).** Partially complete. Better Auth is mounted per ADR-0013. RBAC and INTERNAL_API_TOKEN startup assertion are in place (PR #130/#133). Open-redirect refinement and placeholder-identity-in-UI items pending verification.
- **Tier 4 (Contract).** Mostly complete. I-7 closed via PR #134. `no-unsafe-cast` ESLint rule pending. OpenAPI completeness audit pending.
- **Tier 5 (Bounded contexts).** Not started in the freeze-gated sense. Catalog and ordering scaffolding exist but no context is declared frozen.
- **Tier 6 (App propagation).** Not started.

### First scheduling decision

After this ADR is accepted: close Tier 1 first (CI lint + composite-FK audit + BA-hook fix), then Tier 2 (I-5b ledger with Phase D), then Tier 3 (identity completeness audit), then Tier 4 (`no-unsafe-cast` lint). Tier 5 begins only after Tiers 1–4 are frozen.

### Linear epic shape

Each tier epic carries:

- Title: `Tier N — <name> freeze`
- Description: link to this ADR and the tier's freeze criteria copied verbatim.
- Children: one issue per freeze criterion + one issue per known violation migrated from existing review materials.
- Closed when: all freeze criteria for the tier are met (CI green, audit scripts green, listed tech-debt closed).

### Migration from existing trackers

- `project_adr_0020_followup.md` in auto-memory → its remaining items file as Linear issues under the appropriate tier epic; the memory record stays as a pointer ("see Linear epic RES-…").
- `.planning/reviews/2026-05-16-full-codebase/INDEX.md` items → filed under tier epics by their ADR-0020 invariant tag.

### What this ADR does NOT change

- The seven ADR-0020 invariants themselves. They are unchanged in content; this ADR only governs the _order_ in which their enforcement is wired up and the _gate_ after which a tier stops being re-reviewed.
- The trunk-based-PR development workflow.
- The GSD pipeline. `gsd-spec-phase` → `gsd-plan-phase` → `gsd-execute-phase` continues to be the implementation flow within a tier. The change is that the tier's _scope_ now defines what a phase may touch.

## Adoption sequencing

1. This ADR merges with status `proposed`.
2. `/adr-council 0021` runs to validate the strategy across the five-persona lens (mandatory per project ADR governance).
3. ADR transitions to `accepted` after council review, with any agreed amendments written into "Consequences" or "Alternatives considered."
4. Linear epics for Tiers 1–4 are created (Tier 5 and 6 epics created on demand).
5. The 2026-05-16 review punch list and the `project_adr_0020_followup.md` open items are migrated into the relevant tier epics.
6. Tier 1 closeout begins as the next milestone.
