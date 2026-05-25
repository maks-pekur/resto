# Phase 1: Tenancy Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 01-tenancy-hardening
**Areas discussed:** Scope split, TEN-10 OTel strategy, TEN-12+15 ESLint approach, TEN-08 test infrastructure
**Persona reviewers consulted:** persona-cto, persona-skeptic, persona-investor (per RestOS convention, project-level memory `feedback-persona-agents-in-discuss`)

---

## Scope split (Phase 1 monolithic vs Investor 60/40)

| Option                                                                  | Description                                                                                                                                         | Selected |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Monolithic Phase 1 (all 18 reqs)                                        | Ship all 18 TEN-\* reqs as one phase. ~9-12 working days solo. CTO's preferred shape: the 18 reqs are architecturally coupled.                      | ✓        |
| Split: Phase 1 essentials + Phase 1.1 hygiene (Investor recommendation) | Phase 1 = ~11 essentials (TEN-01..08, 11, 14, 16-17), Phase 1.1 = ~7 hygiene (TEN-09, 10, 12, 13, 15) after first LOI. Saves ~3-5 pre-revenue days. |          |

**User's choice:** Monolithic Phase 1 (all 18 reqs).
**Notes:** Aligns with founder's documented "broad product / never compress MVP scope" rule. Investor's split-the-bill argument is rational pre-revenue, but the founder's strategy is depth-first foundation completion, not minimum-viable-foundation. Plan must size the phase honestly to avoid rushing TEN-08 quality.

---

## TEN-10 — per-tenant OTel metrics strategy

| Option                                     | Description                                                                                                                                                                       | Selected |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| CTO middle ground                          | Emit `tenant_id` label on outbox lag, request rate, error rate (architectural commitment, ~2h). Defer dashboards / alerts / cardinality-ceiling work to Phase 1.1 or 20+ tenants. | ✓        |
| Skeptic + Investor: defer entirely         | Move TEN-10 to Phase 1.1. Zero metrics value at zero tenants. Risk: label-shape decision baked later may diverge from already-emitted metrics.                                    |          |
| Full: emit + minimal Grafana dashboard now | Emit labels plus a minimal Grafana board (outbox lag + error rate per tenant). +0.5d. "Dev observability" for solo founder.                                                       |          |

**User's choice:** CTO middle ground.
**Notes:** The label-shape decision is the part that gets locked permanently; the dashboards can come later without rework. Two-hour code delta to preserve architectural optionality is the cheapest insurance available.

---

## TEN-12 + TEN-15 — ESLint rule implementation approach

| Option                           | Description                                                                                                               | Selected |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| `no-restricted-syntax` overrides | Both rules implemented as built-in `no-restricted-syntax` overrides in `packages/config-eslint/base.mjs`. ~2 hours total. | ✓        |
| Custom `eslint-plugin-resto`     | Full plugin package with `RuleTester` etc. ~2 days. Unlocks future RestOS-specific lints without rewriting.               |          |
| Investor: move both to Phase 1.1 | Runtime assertion + WARN log are sufficient enforcement. CI gates are team-scale tools; solo doesn't need them yet.       |          |

**User's choice:** `no-restricted-syntax` overrides.
**Notes:** CTO and Skeptic both flagged the custom plugin as overkill for two rules. The plugin can be created later if 3+ RestOS-specific lints emerge. Solo throughput protected.

---

## TEN-08 — cross-tenant isolation test infrastructure tier

| Option                              | Description                                                                                                                   | Selected |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Full Docker stack (Postgres + NATS) | `docker-compose.test.yml` modeled on existing dev compose. Real broker + real RLS. ~3-4 days for 4 fixture categories.        | ✓        |
| Hybrid (Postgres real, NATS mock)   | Postgres in Docker, NATS subscriber via in-memory queue. ~2 days. Risk: NATS-specific tenant-context-mix scenarios uncovered. |          |
| Mock-heavy (pure unit)              | Mocked Postgres + in-memory queues. ~1 day. Cannot prove ALS or RLS properties. CTO + Skeptic against.                        |          |

**User's choice:** Full Docker stack.
**Notes:** TEN-08 is the last line of defense against cross-tenant data leaks. Mock-heavy testing cannot prove ALS leak prevention or NATS subscriber context isolation — those failures only surface with real async boundaries and real broker. CTO sized the 4 fixture categories (ALS, NATS mix, concurrent write, cross-tenant read leak) at 3-4 days minimum.

---

## Claude's Discretion

- Specific NestJS `@Cron` syntax + module wiring for `BackgroundJobsModule` (TEN-05/06/13) — planner chooses based on existing conventions
- Exact OTel metric names + units for tenant_id-labeled series (planner follows existing `outbox.delivered_counter` / `outbox.lag_histogram` patterns)
- CI job structure for Docker-backed integration tests (one job vs. matrix) — planner chooses based on Nx affected-graph constraints
- `audit-gap.md` format (markdown table vs. checklist) — researcher recommends format based on prior GSD audit artifacts

## Auto-locked decisions (not surfaced as discussion questions)

These were locked by persona consensus without requiring a discussion turn:

- **TEN-18 standalone commit** — all 3 personas + user agreed; committed as `19a9da2` on 2026-05-25 before plan-phase
- **TEN-16 + TEN-17 first** — quick bug fixes, unblock test stability for everything else (PR 1)
- **TEN-05/06 failure strategy** — continue-on-error per tenant (CTO locked; head-of-line blocking is a GDPR SLA breaker)
- **TEN-11 enforcement model** — startup assertion (consistent with `assertNoRlsBypass` family) per CTO
- **TEN-07 BA-creds assertion scope** — minimum 12-check `has_table_privilege` matrix (4 BA tables × 3 privileges)
- **TEN-09 gap-analysis scope** — `tenancy` + `identity` only; `catalog` deferred to Phase 4
- **TEN-14 buildEnvelope fallback** — `randomUUID()` + WARN when no active OTel span (CTO Option B)

## Deferred Ideas

(See `01-CONTEXT.md` `<deferred>` section for the full list.)

Captured during this discussion:

- Outbox `claim_token` race → Phase 7 (ORD-11)
- `catalog` audit gap → Phase 4
- `feature-flags` package scaffolding → use env var in Phase 16 instead
- CAC / sales cycle validation → founder business work, no GSD phase
