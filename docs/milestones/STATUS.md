# Milestone status

Authoritative tier-freeze record per [ADR-0021](../adr/0021-layered-milestone-strategy.md).

When a tier's freeze criteria are all met:

1. Tick its checkbox below.
2. Create git tag `t<N>-frozen-YYYY-MM-DD` on the freezing commit (e.g. `git tag t1-frozen-2026-06-01`).
3. Update the corresponding Linear project status to Completed.

This file is the canonical source of truth for tier-freeze state. Linear is a queryable mirror.

## API foundation tiers

- [ ] **Tier 1 — Multi-tenancy** (in progress) — [Linear epic](https://linear.app/restico/project/tier-1-multi-tenancy-freeze-92ecc8309a36)
- [ ] **Tier 2 — Event bus** (planned) — [Linear epic](https://linear.app/restico/project/tier-2-event-bus-freeze-fc722175b432)
- [ ] **Tier 3 — Identity** (planned) — [Linear epic](https://linear.app/restico/project/tier-3-identity-freeze-81dc0406f3aa)
- [ ] **Tier 4 — Contract** (planned) — [Linear epic](https://linear.app/restico/project/tier-4-contract-freeze-8f11b10c79cc)

## Tier 5 — API bounded contexts (vertical slices)

Per-slice milestones created on-demand. Initial sequence per ADR-0021:

- [ ] Milestone 5a — Public menu (catalog + tenancy plumbing)
- [ ] Milestone 5b — Ordering happy-path (+ ordering, single item, no modifiers)
- [ ] Milestone 5c — Payments (+ Stripe Connect, single currency)
- Subsequent slices, each as a vertical slice with at least one customer-visible touchpoint: reservations, loyalty, inventory, analytics, notifications, audit

## Tier 6 — App propagation

Created on-demand once Tiers 1–4 are frozen. **Permitted parallel work** (positive allowlist) while Tiers 1–4 are not yet frozen:

- Design system in `packages/ui/`
- Static marketing routes in `apps/website` and `apps/landing` that render no tenant data
- Consumption of already-shipped public-read endpoints via the generated client
- **Single-tenant demo spine** — one hand-provisioned tenant, no public signup, behind a feature flag, marked non-production, for design-partner conversations and sales pitch

Anything else (multi-tenant signup, public auth flows in production, public tenant-website at scale) is gated on Tier 1–4 freeze.

## 30-day reconsideration

Per ADR-0021 adoption step 7: at **2026-06-16** evaluate whether tier ceremony has produced more or less throughput than the pre-ADR pattern (baseline: 5 PRs / 3 invariants in one day on 2026-05-17). If less, revert to a 1-paragraph rule in CLAUDE.md and supersede ADR-0021.
