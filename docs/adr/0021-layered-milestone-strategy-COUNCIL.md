---
adr: 21
adr-title: 'Layered milestone strategy with freeze gates'
adr-status: proposed
reviewed: 2026-05-17
council-type: forward
personas:
  cto: proceed-with-changes
  product-strategist: proceed-with-changes
  skeptic: reject
  investor: proceed-with-changes
  growth-marketer: proceed-with-changes
unanimous-blockers: 0
synthesis: proceed-with-changes
failed-personas: []
---

# Council Review — ADR-0021

## Synthesis

Four of five personas land on `proceed-with-changes`; the Skeptic dissents with `reject`. The divergence is real but tractable: the Skeptic argues the load-bearing decision is "stop running per-PR full-codebase reviews" — a one-paragraph rule — and the rest of the ADR is process scaffolding the project may not need at its stage. The other four agree the underlying problem is real and the tier model is structurally sound, but converge from different angles on the same substantive amendment: **the freeze-gate model as currently written delays customer-visible value past the point where a pre-revenue solo founder can afford it.** Four personas (Product, Skeptic, Investor, Growth) raise this as a critical concern about Tier 6's hard gate on Tier 1–4 freeze. Three (Product, Growth, Investor) separately raise that the freeze criteria measure only internal-facing engineering hygiene — none of them require evidence that a real restaurant could use the thing.

The actionable consensus: keep the strategic frame (declare layers, freeze them, scope reviews), but (a) carve out an explicit demo/pilot exception to T6 gating so a customer-visible artifact can ship in parallel, (b) reframe Tier 5 as vertical slices through 2–3 contexts together rather than one-context-per-milestone, (c) add outward-facing criteria (real menu imported, real order placed, growth events emitted) to each tier's freeze gate, and (d) replace `.planning/`-pinned freeze criteria with durable repo-checked or Linear-tracked references. Second-order amendments (soften "no plan rewrites" rule, decouple I-5b ledger from T2 freeze, scope down custom-tooling buildout, demote Linear from gate to mirror) are well-supported across personas. The Skeptic's "delete this ADR" verdict is preserved as the strongest dissent — if those amendments make the ADR too thin, the project should consider shipping the smaller version (a brief review-discipline rule under task pipeline in CLAUDE.md) instead.

## Critical concerns (cross-persona)

| Concern                                                                                                | Severity | Raised by                                                 |
| ------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------- |
| T6 freeze gate delays first customer-visible demo past founder's runway                                | critical | product-strategist, skeptic, investor, growth-marketer    |
| Freeze criteria measure internal hygiene only, no customer-outcome or growth-event observability       | critical | product-strategist, growth-marketer, investor             |
| Engineering rigor calibrated for post-incident Series-B, not pre-revenue solo founder                  | critical | cto, skeptic, investor                                    |
| Tier 5 "one context per milestone" incompatible with how restaurant operators buy (bundle expectation) | critical | product-strategist, skeptic                               |
| T1 freeze gate references `.planning/` (gitignored, ephemeral) for "closed-P0-findings" criterion      | critical | cto                                                       |
| Custom ESLint plugin + audit script + multiple lint rules is a build-vs-buy trap for a solo founder    | critical | cto                                                       |
| "Plans rewritten only between milestones" rule will break on first load-bearing-assumption defect      | critical | cto                                                       |
| Freeze criteria are AND-conjunctions that won't simultaneously stay green; first regression reopens    | critical | skeptic                                                   |
| I-5b ledger as T2 freeze criterion is speculative defense-in-depth before any production handler       | critical | skeptic                                                   |
| ADR is the same procedural ceremony it claims to cure                                                  | critical | skeptic                                                   |
| QR-menu (primary viral surface) blocked under T6 gate                                                  | critical | growth-marketer (echoed as warning by product-strategist) |
| Tenant-public website (only inbound SEO surface) gated under T6                                        | critical | growth-marketer                                           |
| Analytics / funnel / growth-events catalog absent from any freeze criterion                            | critical | growth-marketer                                           |
| ADR's real ROI is cross-tenant leak prevention; framing emphasizes reviewer ergonomics                 | critical | investor                                                  |

## Divergence

- **Reject vs proceed-with-changes axis.** Skeptic alone votes reject and proposes replacing the ADR with a one-paragraph review-discipline amendment ("scope reviews to the active phase; full-codebase reviews fire at named checkpoints"). Four others see the tier model as valuable structure. Skeptic concedes the problem is real but argues a tier model is over-engineered for stage and the disciplined response is to revisit in 30 days with evidence from the intervening month, not Saturday's PR backlog.

- **Where freeze gates anchor.** CTO recommends Linear epic with a `gate-blocker` label as the durable source of truth. Skeptic and Investor argue for repo-checked git tags or markdown to avoid Linear single-point-of-failure. All three reject the current `.planning/`-pinned criterion. The founder must decide between Linear-canonical (queryable, vendor-locked) and repo-canonical (resilient, less ergonomic) sources of truth.

- **Engineering-quality vs commercial-readiness framing.** CTO and Skeptic focus on tooling cost, enforcement realism, and procedural drift. Product Strategist, Growth Marketer, and Investor focus on time-to-pilot, partner DX, and customer-outcome measurement. The two framings are not contradictory but produce different amendment priorities: CTO wants the `.planning/` / custom-tooling / no-rewrite-rule amendments first; the commercial-lens trio wants T6 carve-out + Tier 5 vertical slicing first.

- **Tier ordering.** Investor (W2) argues identity gaps will be more visible to early pilots than tenancy gaps; CTO (W2) argues the rationale for Multi-tenancy-first deserves more than a one-line dismissal. Neither advocates actually reordering — the T1→T4 sequence is broadly accepted on architectural grounds.

- **Scope of the I-5b ledger.** Skeptic says delete it from T2 freeze entirely (no production handlers exist to protect). CTO says decouple it: implement and prove against a mock external sink, defer first-real-handler usage to Tier 5. These are not the same recommendation but they agree on rejecting "ledger lands with Phase D" as a T2 dependency.

## Recommended next actions

Items raised by ≥2 personas. Prioritized by cross-persona weight.

- **Carve out an explicit demo/pilot exception to the T6 gate.** Allow a single-tenant or static-public-read customer-visible surface to ship in parallel with T1–T4 work, under a documented "single-tenant-pilot" waiver with a kill-switch. _(product-strategist, skeptic, investor, growth-marketer — 4 of 5)_

- **Add outward-facing acceptance criteria to each tier's freeze gate.** Tier 5 milestones require a real menu imported by a real operator under ≤1 hour and ≥3 successful test orders by non-team-members; Tier 2 freeze requires a defined growth-events catalog (`user.signup_completed`, `brand.created`, `menu.first_published`, `qr.scanned`, `order.placed`, each with `tenant_id`, `correlation_id`, `utm_*`). _(product-strategist, growth-marketer, investor)_

- **Reframe Tier 5 around vertical slices, not one-context-per-milestone.** Catalog + ordering happy-path together (Milestone 5a), then catalog + ordering + payments (Milestone 5b), so each milestone is end-to-end demoable. Per-context "frozen" emerges as side effect. _(product-strategist, skeptic)_

- **Soften "no plan rewrites mid-phase" to allow rewrites on load-bearing findings or real-pilot signal.** Default disposition remains backlog; rewrites are the named exception when a finding invalidates a phase assumption or comes from a real customer. _(cto, product-strategist, skeptic)_

- **Decouple I-5b ledger from T2 freeze.** Prove the ledger against a mock external sink; defer the first-real-handler validation to Tier 5 (or drop the gate entirely until a production handler exists). _(cto, skeptic)_

- **Replace `.planning/`-pinned freeze criteria with durable references.** Either a Linear epic with `gate-blocker` labels (CTO recommendation) or repo-checked git tags / `docs/milestones/` markdown (Skeptic + Investor). Decide one, write it into the ADR's "Tracking" section. _(cto, skeptic, investor)_

- **Scope down custom-tooling buildout.** For I-1, prefer a repository base class that cannot construct a query without a tenant predicate over a custom ESLint plugin. For I-7, defer `no-unsafe-cast` ESLint rule until first regression. For I-2, prefer a Drizzle schema helper that generates the composite FK over an after-the-fact audit script. _(cto, investor)_

- **Demote Linear from gate to mirror.** Authoritative tier-freeze signal lives in the repo; Linear is a queryable view of it. Add a fallback paragraph: in a Linear outage, backlog items go to `docs/backlog/<tier>.md`. _(skeptic, investor; partially cto)_

- **Promote the Tier 6 "greenfield UI" exception to a positive allowlist / named workstream.** Replace the prose exception with an explicit allowlist of permitted parallel work (design system in `packages/ui/`, static marketing routes that render no tenant data, public-read endpoints already shipped); promote it as a named workstream rather than burying it as a single line. _(cto, product-strategist, growth-marketer)_

- **Re-anchor the ADR's framing on cross-tenant leak prevention.** Score each invariant by its leak-prevention contribution (I-1, I-2 are 9/10; I-7 is 2/10) and gate-freeze only the leak-relevant set; the rest becomes backlog hygiene. _(investor; aligned with skeptic's "delete this ADR" lower bound)_

- **Add an "unfreeze protocol".** Specify how a frozen tier accepts new requirements (new compliance regime, new invariant) without requiring a fresh ADR every time — one-line note in the epic, then re-run the original freeze gates. _(cto W1; not formally seconded but logically necessary if any other amendment is adopted)_

## Persona reviews (full)

### CTO

# CTO Review — ADR-0021 Layered Milestone Strategy with Freeze Gates

## Summary stance

This ADR is doing the right thing — declaring an order of completion and a stop-condition for reviews — but several of its "objective" gates are not actually objective, one tier ordering decision is debatable, and the build-vs-buy footprint of the freeze tooling (custom ESLint plugin + audit script + grep-in-CI + lint rule) is non-trivial for a solo founder. Tighten the gates, soften one rule that won't survive contact with reality, and the ADR is a strong proceed.

---

## CRITICAL

### C1 — Tier 1 freeze gate "P0 findings closed" smuggles subjective judgement

**Rationale.** The Tier 1 gate references "All P0 findings from `.planning/reviews/2026-05-16-full-codebase/INDEX.md` tagged 'multi-tenancy'." Two problems: (a) `.planning/` is gitignored and ephemeral per your own CLAUDE.md, so the freeze criterion will literally disappear from the repo; (b) what counts as a "multi-tenancy" tag is a judgement call. This is exactly the "review keeps rewriting the plan" failure mode the ADR is trying to eliminate, just relocated one level up.

**Recommendation.** At adoption, migrate the P0 multi-tenancy findings into Linear sub-issues under the Tier 1 epic. Restate the gate as: "All Linear issues in `RES-<tier-1-epic>` with label `gate-blocker` are closed." That criterion survives `.planning/` cleanup and is binary.

### C2 — Custom ESLint plugin path is a build-vs-buy trap for a solo founder

**Rationale.** The ADR scaffolds an ESLint plugin (`tools/eslint-plugin-resto/`) plus AST-grep plus `no-restricted-imports` plus `no-restricted-syntax` plus `no-unsafe-cast` plus a bespoke `pnpm db:audit-fks` script plus CI grep on generated DTOs. That is five pieces of homegrown enforcement tooling, each with its own maintenance and CI-flakiness surface. Time spent maintaining tenant-lint rules is time not spent shipping ordering or payments.

**Recommendation.** Reorder the gates by build cost. For I-1, prefer Drizzle's own repository base class that _cannot_ execute a query without a `tenantId` filter (constructor-injects tenant from ALS; throws if absent). That is one ~80-line base class versus a custom ESLint plugin. Reserve the plugin path for I-1 only if the base-class approach proves leaky. Same logic for `db:audit-fks`: a Drizzle schema-level convention is cheaper than an audit script that fires after the fact.

### C3 — "Plans are rewritten only between milestones" will not survive a real defect

**Rationale.** Rule 5 of Review Discipline is correct as a _default_ but wrong as an absolute. If mid-phase a reviewer finds that the chosen approach is structurally wrong, forcing the phase to ship the broken approach and patch later is worse than rewriting the plan. The blanket rule will either be silently violated or strictly followed (shipping known-broken work).

**Recommendation.** Amend Rule 5: "Phase plans are stable for the duration of the phase, except when a finding invalidates a load-bearing assumption of the phase plan itself. In that case, the phase is explicitly halted, a new plan written, and the prior plan archived in Linear. The default disposition for a review finding is a backlog item; plan-invalidating findings are the rare exception and must be named as such in the halt notice."

## WARNING

- **W1 Frozen is monotonic in the ADR but the world is not.** Add an "Unfreeze protocol" subsection — one-line note in the epic citing the new requirement, back through the original freeze gates before re-locking. No new ADR required unless the gates themselves change.
- **W2 Identity-before-Multi-tenancy argument is dismissed too quickly.** Expand the rejection to two sentences: tenant context is resolved from sources _other_ than session (subdomain, header, internal token), so multi-tenancy enforcement is testable without an identity layer; the reverse is not true.
- **W3 Tier 6 "greenfield UI exception" is the loophole most likely to be abused.** Replace with a positive allowlist: design system in `packages/ui/`, static marketing routes that render no tenant data, public-read endpoints already shipped. Allowlists fail closed; exceptions fail open.
- **W4 Tier 2 freeze gate references an unbuilt feature (Phase D OTP) as a dependency.** Decouple: implement I-5b ledger contract against a synthetic external side effect without waiting for customer OTP.
- **W5 "Phase-level review is scoped to the phase's stated scope" needs a written scope, not a vibe.** Every phase plan must declare in its front-matter the active tier and the explicit set of files/contexts under review.

## INFO

- **I1** Linear hard dependency deserves an explicit fallback (`docs/backlog/<tier>.md` mirror).
- **I2** Council review feedback loop is unbounded — cap at one council pass + one revision.
- **I3** New invariants in successor ADRs default to next tier cycle, not retroactive unfreeze.
- **I4** Each frozen tier re-runs its freeze gates on a scheduled cadence (quarterly minimum, or on major dependency bumps).
- **I5** Generalize "no placeholder identity" gate to "no development fixture data is reachable in production builds."

`Verdict: proceed-with-changes`

### Product Strategist

# Head of Product Review — ADR-0021

## Framing

I am sympathetic to the engineering problem this ADR is solving (the "review treadmill") and the discipline it imposes is broadly correct **for a codebase**. But this is also a **product roadmap document in disguise** — and read as one, it makes choices that materially delay the first moment a restaurant operator can see, touch, or pay for RestOS. The biggest existential risk to this project is not an unfrozen invariant — it's spending six months perfecting tiers 1–4 of an API that no design partner has ever exercised against their menu. ADR-0021 makes that risk worse, not better.

## CRITICAL

**1. Tier 6 freeze-gate pushes the first customer-visible artifact past the horizon.** The hardest rule means there is no path to a working admin → catalog → QR-menu → "scan and read menu" demo until four full invariant tiers are locked. For a vertical SaaS pitched as "scan this, see your menu, customers order" — that demo _is_ the product. Without it there is no design partner conversation, no pilot, no marketing screenshot that isn't fiction.

**Recommendation.** Carve out a "Tier 0 / demo spine" allowed to ship end-to-end in parallel — single tenant, public-read QR menu rendered against a minimum catalog context. Mark explicitly as not-production, gated behind a feature flag, excluded from freeze criteria. Without this, the ADR converts a 2–3 month "I have something to show" gap into 6+ months.

**2. Tier 5 "one bounded context per milestone" is incompatible with restaurant SMB buying behavior.** A restaurant does not buy "catalog." It buys "my menu is online, customers can order, money lands in my account." Catalog without ordering is a Notion page; ordering without payments is a clipboard.

**Recommendation.** Reframe Tier 5 as vertical thin slices: 5a = catalog (read-only public menu); 5b = catalog + ordering happy-path; 5c = catalog + ordering + payments. Each slice end-to-end demoable. Per-context freezing happens as a side effect of slices crossing it enough times to stabilize.

## WARNING

- **3. "No plan rewrites mid-phase" will quietly lose customer-feedback signal.** Split rule 3 into: (a) findings about not-yet-frozen technical tiers → backlog; (b) findings from real users / design partners / pilots → first-class input, may rewrite the milestone's plan.
- **4. ADR silent on onboarding, the single highest-leverage product surface.** Time-to-first-published-menu is the conversion KPI in every comparable SaaS. Add an "Onboarding spine" workstream with measured time-to-value: "cold email link → QR code on table in under 30 minutes."
- **5. No customer-outcome observability in any freeze criterion.** Add to each Tier 5 milestone: "catalog frozen" requires ≥1 real menu of ≥30 items imported in under 1 hour without hand-holding. "Ordering frozen" requires ≥3 successful test orders by people who don't work on this project.
- **6. A/B-able surface and feature-flag posture under-specified.** Add to Tier 5 exit criteria: any customer-facing UX decision with two plausible variants ships with a feature flag, remains flagged ≥30 days post-pilot.
- **7. Tier 6 black-box exception is wider than acknowledged.** Promote to a named workstream: "Tier 6-lite — customer-facing surface without backend dependencies." Encourage parallel work from day one.

## INFO

- **8.** API-as-product / partner-readiness invisible. Add to T4: "generated client dogfooded by ≥1 non-trivial caller outside `apps/admin`."
- **9.** "Solo-founder operated" reality vs. ADR's review apparatus — add a lightweight-mode clause: founder may declare a tier frozen by recording closing evidence, without external review, until headcount > 1.
- **10.** Payments is listed mid-Tier-5 alongside loyalty — move immediately after catalog+ordering happy-path slice.

`Verdict: proceed-with-changes`

### Skeptic

# Skeptic Review — ADR-0021

## TL;DR

- ADR diagnoses a real pain (review treadmill) and over-corrects with a six-tier waterfall dressed in agile clothing. The right ADR here is ~200 words, not this.
- "Frozen" criteria are wishlist conjunctions ("AND AND AND") that statistically will never all stay simultaneously green for a solo founder. First regression in T1 lint reopens the gate and you're back where you started.
- T6 (the apps — the only thing a paying restaurant ever sees) is gated behind T1–T4 freeze. For a vertical SaaS with zero paying customers, that's exactly backwards.

## critical

**C1. The ADR is the disease it claims to cure.** The remedy proposed (six tiers, freeze gates, Linear epics, backlog discipline, plan-rewrite rules, council-mandated ADR) is _more_ procedural surface area, not less. The intervention that matches the diagnosis is "stop running full-codebase reviews per PR," which is one sentence.

**Recommendation.** Replace this ADR with a 1-paragraph amendment to review discipline: "Full-codebase reviews fire at named checkpoints, not per PR. Findings outside the current phase scope become backlog. That's it." If after 2 weeks the treadmill returns, _then_ write ADR-0021.

**C2. T6 gating is exactly the wrong default for a pre-revenue vertical SaaS.** RestOS is a restaurant product. Restaurants pay for a QR menu that takes an order, not for `tools/eslint-plugin-resto/`. The exception is almost the empty set — every real restaurant feature touches at least tenancy.

**Recommendation.** Invert. Default permission is "ship vertical slices through apps." T1–T4 invariants are enforced via CI lint when implemented, not via app-feature embargo.

**C3. "Frozen when" criteria are conjunctions that won't simultaneously stay green.** T1 freeze requires _six_ things green at once. T2 needs _four_ including "≥1 external-side-effect handler using I-5b ledger" — a product feature is now an architectural-tier freeze precondition. Probability all six T1 items stay green while you work T2 is low.

**Recommendation.** Either drop "frozen" to a soft state ("stable enough that drift is a blocker"), or shrink criteria to the 1–2 items that genuinely matter per tier.

**C4. I-5b ledger as a T2 freeze criterion is speculative DiD.** Zero handlers with external side effects in production. Zero paying customers. Zero documented duplicate-side-effect incidents.

**Recommendation.** Drop I-5b from T2 freeze. Keep as an invariant for handlers that opt in when shipping their first external side effect.

## warning

- **W1.** "No plan rewrites mid-phase" smuggles in dogma — allow rewrites when trigger is an invariant violation or founder-classified high-severity finding.
- **W2.** Confusing "stop full-codebase reviews per PR" with "invent six tiers" — separate the two; ship review-scoping rule today, re-evaluate tier model in 30 days.
- **W3.** Tier 5 sequencing of 10 bounded contexts is a roadmap pretending to be a process. Pick the 2–3 actually needed for MVP-1.
- **W4.** "Apps are black-box clients" assumes founder will actually wait — no enforcement mechanism for temporal gate, honor system the author won't honor.
- **W5.** Linear hard dependency is single point of failure; `docs/tiers.md` checkboxes would do the same job.
- **W6.** "Apps multiply surface area" is a code-sharing problem mis-modeled as a sequencing problem; response is "extract shared primitives" not "ban apps from existing until API freezes."

## info

- **I1.** "Five PRs in a day" pace itself unexamined — might just be fine.
- **I2.** "Freeze" is too strong a word; prefer "stable," "locked-down," "lint-enforced."
- **I3.** Alternatives section too thin — "no formal layers just better PR scoping" deserves a real engagement.
- **I4.** "Migrate ADR-0020 follow-up into tier epics" is admin work in an ADR — belongs in the Linear epic.
- **I5.** The skeptic-fit answer might just be "delete this ADR."

## Where "delete this ADR" is the right answer

Yes — primarily. The load-bearing decision is "scope reviews to the active phase; findings outside that phase are backlog, not blockers." That's a CLAUDE.md edit, not an ADR. Reserve ADRs for irreversible architectural decisions. Process workflows that you'll iterate on in 2 weeks aren't that.

`Verdict: reject`

### Investor

# ADR-0021 Investor / Business Review

## Context I'm bringing

Solo founder, pre-revenue, 12 months personal runway burn (assumed), restaurant SaaS vertical. Single most expensive thing a solo founder owns is **calendar time to first paying pilot**. Every other resource is cheap by comparison.

## critical

**C1. T6 freeze gate plausibly adds 2-4 months to first deployable demo with zero customer-validated upside.** T1–T4 all `(API only)`. Rule is: don't touch any client app until API plumbing is bolted down. Every week without a deployable demo is a week you cannot show a restaurateur the product, cannot get a letter of intent, cannot generate evidence an angel/pre-seed check needs.

**Recommendation.** Carve out a "demo-track" exception broader than greenfield-UI clause. Allow `apps/qr-menu` and a thin admin slice to ship against current foundation under written "single-tenant-pilot" risk waiver, hand-provisioned, no public signup, until T1–T4 freeze. Freeze gate should block _multi-tenant GA_, not _demo-ability_.

**C2. Engineering rigor calibrated for Series-B post-incident hygiene, not pre-revenue solo founder.** Seven invariants, six tiers, CI lints per invariant, db:audit-fks tooling, no-unsafe-cast lints, per-context OpenAPI, per-context CLAUDE.md, e2e cross-tenant per context. Operating discipline of a 30-engineer org that just shipped a security incident. Dominant risk here is **product-market fit failure**, not architectural debt.

**Recommendation.** Keep the _invariants_ (ADR-0020 is correct), drop the _enforcement ceremony_ until first paid pilot. Replace tier-freeze CI lints with a single end-to-end cross-tenant leak test in CI plus a written checklist the founder eyeballs at PR time.

**C3. The actual ROI is "avoid a company-ending data leak", and that's not stated.** The strongest _real_ argument is risk reduction. ADR sells itself on "reviews stop relitigating" — a process pain — when real economic justification is leak prevention. Mis-framing means over-investing in things that don't reduce leak risk (no-unsafe-cast lint, OpenAPI completeness) and under-investing in things that do (RLS test coverage, audit logs of cross-tenant queries).

**Recommendation.** Re-anchor the ADR around a single metric: probability of a cross-tenant data leak shipping to production. Score each invariant by leak-prevention contribution. I-1, I-2 are 9/10. I-7 is 2/10. Freeze-gate only the leak-relevant invariants.

## warning

- **W1.** Linear as hard dependency is real but recoverable — demote from "gate" to "convenient view"; authoritative signal is a tag in repo or checked-in markdown.
- **W2.** "Identity-first ordering rejected" is right call for security, wrong call for revenue — acknowledge identity gaps will be most visible pilot blocker.
- **W3.** Freeze-gate model assumes no learning from customers between now and T4 close — add clause: paid-pilot must-have feature set overrules not-yet-frozen tier for that pilot's data only.
- **W4.** No mention of cost-per-month while in freeze — burn rate buys nothing fundable during 2-6 month T1-T4 freeze with zero revenue.
- **W5.** "Apps don't pre-solve foundation" hides cost — triage admin open-redirect + qr-menu VITE_TENANT_SLUG as T6 exceptions and fix now.

## info

- **I1.** Moat assessment — ADR builds engineering moat, not commercial moat. Pair every architecture ADR with a one-line "commercial primitive enabled."
- **I2.** Sequencing is internally coherent; objections are about _stage-appropriateness_, not correctness.
- **I3.** Time-box T1-T4 closure at 4 weeks total. If not closed by then, ship demo on unfrozen foundation with C1 waiver and revisit invariants post-pilot.
- **I4.** Where I'd redirect freeze-gate effort: (1) one hand-deployed demo tenant at a real restaurant + signed LOI; (2) landing page + waitlist with 100+ restaurant signups; (3) 20 customer-discovery interviews; (4) one POS integration spike.

## Fundability scorecard

| Dimension                                        | Score / 10 |
| ------------------------------------------------ | ---------- |
| Capital efficiency to first revenue              | 3          |
| Stage-appropriate engineering rigor              | 4          |
| Moat being built                                 | 3          |
| Dependency risk managed                          | 6          |
| Compliance posture for paid pilots               | 7          |
| 18-month path to $1M ARR plausible from this ADR | 2          |
| Architectural story for Series A                 | 8          |

**Overall: 33 / 70.** The codebase is being built like one I'd want to _acquire_, not one I'd want to _seed_.

## The investor question I'd ask in IC

_"You've described a six-tier freeze model that gates client apps on closure of seven invariants. Walk me through how this gets you to your first paying restaurant in the next 90 days — and if it doesn't, why is this the right use of the runway versus shipping a deliberately-imperfect single-tenant pilot now?"_

`Verdict: proceed-with-changes`

### Growth Marketer

# Growth Marketer Review — ADR-0021

## Context Frame

Evaluating as a Growth Lead: does the freeze-gate model preserve the surfaces that _generate pipeline_ — public website SEO, QR-menu virality, partner API, funnel telemetry — or does it optimize for engineering hygiene at the cost of GTM readiness?

## CRITICAL

**1. T6 freeze gate strands the tenant-public website — the only inbound SEO surface for the SaaS itself.** Every published tenant site is a backlink, a long-tail keyword surface, a live demo of the product. Deferring it means months with zero indexed surface area while Toast, Square, Yelp menu pages eat the SERP.

**Recommendation.** Promote "public-read tenant website + QR-menu" to a first-class exception. Define a narrow contract: `GET /public/tenants/:slug/menu`, `GET /public/tenants/:slug` — freeze _these_ endpoints in T4 ahead of the rest, let `apps/website` + `apps/qr-menu` build against them in parallel with T1–T3.

**2. QR-menu — the primary viral customer touchpoint — is treated as a black-box client.** Every scan is a brand impression, every share is organic acquisition. Yet under T6 it can't propagate auth/tenancy/events until Tier 4 freezes. The fix to the VITE_TENANT_SLUG bug is a stable tenant-resolution contract, not a freeze.

**Recommendation.** Carve QR-menu out as Tier 4-adjacent. Define and freeze the four endpoints it needs (tenant resolution, menu read, order create, order status). Add hard requirement to T4: every public endpoint emits an outbox event with `{tenant_id, session_id, source: 'qr-menu', utm_*}`.

**3. Analytics & funnel instrumentation is invisible in the freeze criteria.** No freeze gate requires _any_ growth event to be emitted (signup_started, signup_completed, brand_created, menu_published, qr_scanned, order_placed). Classic "we built Kafka and forgot to log signups" failure.

**Recommendation.** Add an explicit "Growth events catalogue" subsection to T2's freeze criteria — minimum set with `tenant_id`, `correlation_id`, `utm_*`, `referrer`. T5 contexts cannot freeze without their corresponding growth event emitted.

## WARNING

- **4.** T4 OpenAPI completeness framed as internal contract, not partner-facing DX. Split T4 into T4-internal and T4-external (hosted ReDoc/Scalar docs, API key flow, idempotency-key header, `X-API-Version`, webhook signature scheme, 30-day deprecation policy).
- **5.** No webhook strategy = no partner integration loop. Name "external webhook surface" as a Tier 4-external deliverable.
- **6.** Activation tracking absent — cannot measure aha-moment. Define metric: "First published menu within 7 days of signup." Make `menu.first_published` event a T5-catalog freeze requirement.
- **7.** Sequential T1→T4 pushes self-serve signup polish to the end. Add to T3 freeze: OAuth (Google minimum), magic-link path tested end-to-end, post-signup redirect whitelist, signup error copy reviewed, `utm_*` and `referrer` captured at signup.

## INFO

- **8.** Slug hygiene and canonical URLs unspecified — add "Public URL conventions" appendix to T4 (slug regex, reserved list, canonical-host policy).
- **9.** Referral / share loops not on any roadmap — fold into Tier 5 loyalty when planned.
- **10.** "Apps as black-box clients" risks losing app-side learnings that inform contract — require sign-off from at least one consuming app team (or solo-founder smoke test) for each tier freeze.

## Verdict Rationale

ADR is structurally sound for managing engineering load. As written, optimizes for _correctness_ over _time-to-pipeline_. Three growth-critical surfaces (tenant website, QR-menu, partner API external DX) are either trapped behind T6 or unspecified inside T4, and the event catalogue that powers all funnel analytics is invisible in the freeze criteria.

`Verdict: proceed-with-changes`
