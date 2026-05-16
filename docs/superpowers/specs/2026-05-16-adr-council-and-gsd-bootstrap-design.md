# Design: `/adr-council` skill + minimal GSD bootstrap

- **Date:** 2026-05-16
- **Status:** approved (via brainstorming session)
- **Owner:** founder
- **Brainstorming output:** this document
- **Next step:** implementation plan via `superpowers:writing-plans`

## Purpose

Two coupled additions to RestOS governance:

1. **`/adr-council` skill** — orchestrates a 5-persona advisory council (CTO, Product Strategist, Skeptic, Investor, Growth Marketer) on a freshly-authored ADR, aggregates findings into a structured decision matrix, and commits the matrix next to the ADR.
2. **Minimal GSD bootstrap** — populate the `.planning/` infrastructure that the project's `CLAUDE.md` (root) describes but has never actually had: bootstrap planning state from existing ADRs via `gsd-ingest-docs`, derive a `ROADMAP.md` from MVP-1 / MVP-2 ADRs, and add an "ADR governance" rule to root CLAUDE.md that mandates `/adr-council` on every new ADR before `accepted` status.

The two are deliberately bundled because the council skill's documented contract refers to GSD-native artifacts (the council matrix sits next to the ADR; the ADR governance rule lives in CLAUDE.md alongside the GSD task pipeline). Bootstrapping one without the other leaves a half-installed surface.

## Decisions made during brainstorming

| #   | Question                                                              | Decision                                                                                                                                    |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Final decision-maker on council output                                | **User**. Council is purely advisory; no voting machinery.                                                                                  |
| 2   | Where council matrix lives                                            | `docs/adr/NNNN-<slug>-COUNCIL.md` — committed, immutable, alongside the ADR.                                                                |
| 3   | Retroactive scope for existing 20 ADRs                                | **Forward-only**, except a one-time validation run of `/adr-council 0020` as proof-of-concept. The other 19 ADRs receive no retro-council.  |
| 4   | ROADMAP.md format                                                     | **GSD-native shape** (compatible with `gsd-roadmapper` downstream consumers), authored manually rather than via the `gsd-roadmapper` agent. |
| 5   | Integration of existing `.planning/reviews/2026-05-16-full-codebase/` | **Reference from ROADMAP backlog**; the review artifacts stay as-is in their current (gitignored) location.                                 |

## Architecture

```
RestOS/
├── .claude/
│   ├── settings.local.json              (existing)
│   └── skills/
│       ├── resto-ddd-context/           (existing, project skill)
│       ├── resto-e2e-with-rls/          (existing, project skill)
│       ├── resto-multi-tenancy/         (existing, project skill)
│       └── adr-council/                 ★ NEW (project skill)
│           └── SKILL.md
├── CLAUDE.md                            ★ UPDATED (add "ADR governance" section)
├── ROADMAP.md                           ★ NEW (committed; GSD-native shape)
├── .planning/
│   ├── reviews/                         (existing, gitignored)
│   └── intel/                           ★ NEW dir (produced by gsd-ingest-docs)
└── docs/
    ├── superpowers/
    │   └── specs/
    │       └── 2026-05-16-adr-council-and-gsd-bootstrap-design.md  (this file)
    └── adr/
        ├── 0001..0020-*.md              (existing, 20 ADRs)
        └── 0020-*-COUNCIL.md            ★ NEW (committed, validation proof-of-concept)
```

**Committed:** `ROADMAP.md`, `.claude/skills/adr-council/`, `docs/adr/0020-*-COUNCIL.md`, this spec file.

**Gitignored** (per the project's existing `e8b69ab chore: keep CLAUDE.md and .claude private` policy): root `CLAUDE.md` changes live locally only. `.planning/intel/` is also gitignored (ephemeral cache, same as the rest of `.planning/`).

### Data flow at `/adr-council 0020`

```
User invokes /adr-council 0020
  ↓
Skill reads docs/adr/0020-*.md (glob match)
  ↓
Skill spawns 5 personas in parallel (single message, 5 Agent calls)
  - persona-cto, persona-product-strategist, persona-skeptic,
    persona-investor, persona-growth-marketer
  ↓
Each persona reads ADR text inline + RestOS context + persona-specific lens
  ↓
Each persona returns review inline (do NOT Write — harness blocks it
  for these subagent types as observed during the 2026-05-16 full-codebase review)
  ↓
Skill orchestrator aggregates → decision matrix
  ↓
Skill writes docs/adr/0020-*-COUNCIL.md (committed)
  ↓
Skill returns short inline summary to user
```

## `/adr-council` skill design

### Input contract

```
/adr-council <NNNN> [--personas=cto,skeptic,...] [--depth=quick|standard|deep] [--force]
```

- **`<NNNN>` required** — ADR number, zero-padded or not (`20`, `0020` both work). Skill globs `docs/adr/NNNN-*.md` to locate the file. Error if zero or multiple matches.
- **`--personas`** optional — comma-separated subset of `cto,product-strategist,skeptic,investor,growth-marketer`. Default: all 5.
- **`--depth`** optional — passed to each persona agent. Default: `standard`. Other valid values: `quick`, `deep`.
- **`--force`** optional — overwrite existing `<NNNN>-*-COUNCIL.md`. Default behavior: refuse and suggest manual `git rm` + retry.

### Personas dispatch

The 5 personas already exist as subagent types (`persona-cto`, `persona-product-strategist`, `persona-skeptic`, `persona-investor`, `persona-growth-marketer`). Each one's description ends with "Produces a structured persona review document with severity-classified findings."

The skill orchestrator dispatches all selected personas **in a single message with parallel Agent tool calls**, each receiving:

- Full ADR text inline (not a path — the personas may not have Read access).
- Brief RestOS context block (vertical restaurant SaaS, MVP-2 active, NestJS+Drizzle+RLS+NATS+Better Auth, tenant-isolated).
- Persona-specific lens reminder pulled from the subagent's description.
- Explicit instruction: "Do NOT attempt the Write tool — return findings inline. The orchestrator will aggregate and persist." (Lesson learned from the 2026-05-16 full-codebase review: 5 of 10 reviewer agents hit harness-level Write denial; the same applies to persona agents.)

### Output contract — `<NNNN>-*-COUNCIL.md`

YAML frontmatter:

```yaml
---
adr: 20
adr-title: 'Multi-tenancy and event-bus invariants'
adr-status: accepted
reviewed: 2026-05-16
council-type: retroactive # or "forward" when ADR is proposed/draft
personas:
  cto: proceed-with-changes
  product-strategist: proceed
  skeptic: proceed-with-changes
  investor: proceed
  growth-marketer: proceed
unanimous-blockers: 0
synthesis: proceed-with-changes
failed-personas: []
---
```

Body sections (in order):

1. **Synthesis** — orchestrator's aggregated take, 1-2 paragraphs.
2. **Critical concerns** — cross-persona table; each row a concern, severity, raised-by list.
3. **Divergence** — where personas disagree explicitly (highest-value section for user decision).
4. **Recommended next actions** — consensus action list, if any.
5. **Persona reviews (full)** — each persona's complete review verbatim, under its own subheading.

### Edge cases

| Case                                   | Behavior                                                                                                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR file not found                     | Error, exit non-zero, list `docs/adr/*.md` matches tried.                                                                                                                                                                        |
| COUNCIL.md already exists              | Refuse, instruct user to `--force` or `git rm` and retry.                                                                                                                                                                        |
| ADR `status: superseded`               | Warn, confirm with user before proceeding (council on superseded ADR is rarely useful).                                                                                                                                          |
| ADR `status: accepted`                 | Set `council-type: retroactive`. Document validation, do NOT gate the decision.                                                                                                                                                  |
| ADR `status: proposed` or `draft`      | Set `council-type: forward`. Gating recommendation before transition to `accepted`.                                                                                                                                              |
| One or more persona agents fail/stall  | Still emit COUNCIL.md with `failed-personas: [name, ...]` flag in frontmatter. Synthesis section notes degraded confidence. Do not block on partial failure.                                                                     |
| ADR file has special chars in filename | Quote glob expansion appropriately. Reject any `<NNNN>` argument that is not pure digits (`^\d{1,4}$`); reject filename matches containing `..`, leading `/`, or NUL bytes; require the resolved path to live under `docs/adr/`. |

### Trigger pattern

**NOT auto-triggered via shell hooks** — hooks fire on tool boundaries (PreToolUse / PostToolUse) and run shell commands, not agents. Auto-spawning a subagent council from a hook is unreliable. Discipline lives in the CLAUDE.md rule instead.

**Manual invocation** by the user after authoring a new ADR. The reminder is the "ADR governance" section in root CLAUDE.md (see below).

## `gsd-ingest-docs` bootstrap

Run **once** as part of the bootstrap. The skill encapsulates its own contract:

- **Input:** `docs/adr/*.md` (the 20 existing ADRs).
- **Output:** `.planning/intel/` directory (gitignored, ephemeral). Structure is determined by the skill — this spec does not predict it.
- **Behavior:** classifies each ADR (type, scope summary, cross-references), synthesizes consolidated context for downstream GSD agents, detects unresolved conflicts.
- **Idempotent** — safe to re-run after new ADRs are added.

This is the single agent invocation in the bootstrap. Everything else is manual.

## `ROADMAP.md` shape

Skeleton (committed at repo root). The skeleton below shows the structure and section headings; **phase status values shown ("done", "active", "planned") are illustrative only — the implementation step MUST verify actual phase status against the codebase, the most recent ADRs, and recent commits before writing the real ROADMAP.md.** Do not copy the phase-status labels from this spec verbatim.

```markdown
# RestOS Roadmap

## Current state

- **Active milestone:** MVP-2 (Phase B in progress)
- **Last shipped:** MVP-1 (per ADR-0010)
- **Open technical debt:** see `.planning/reviews/2026-05-16-full-codebase/INDEX.md`

## MVP-1 — done

- Scope per ADR-0010
- Phases: (list, all status: done)
- Cross-refs: ADR-0001..0011

## MVP-2 — active

### Phase A: identity foundation (done, per ADR-0013)

- BA schema, two-role provisioning, RBAC catalogue, smoke test

### Phase B: identity guards + bootstrap (active)

- AuthGuard, brand-scope, signup flow

### Phase C-F: planned

- Customer phone-OTP (per ADR-0013 Phase D)
- BA hooks (Phase E), audit pipeline, security tests (Phase F)

## Backlog

### ADR-0020 enforcement (high priority)

- See `.planning/reviews/2026-05-16-full-codebase/INDEX.md`
- 12 P0 + ~30 P1 items
- Convert to GSD milestone via `gsd-new-milestone` when ready (separate decision)

### Other

- Mobile (Expo) — not started, per ADR-0013 Phase D
- Website tenant marketing — scaffold only
- Loyalty / inventory / analytics — post-MVP-2

## Cross-refs

- Architecture decisions: `docs/adr/`
- Tactical reviews: `.planning/reviews/` (ephemeral)
- This roadmap: maintained manually, derived from ADRs
```

**Source ADRs for the derivation:** 0010 (MVP-1 scope), 0013 (MVP-2 Phase A-F structure), 0019 (multi-brand), 0020 (invariants → backlog).

**Explicitly NOT in ROADMAP:** stretch goals without an ADR, unresolved pivots, marketing/business strategy. Those belong in `PROJECT.md` if ever needed — out of scope here.

## Root `CLAUDE.md` — new "ADR governance" section

Added under the existing "Rules" section (locally only — `CLAUDE.md` is project-gitignored per `e8b69ab`):

```markdown
## ADR governance

- **New ADR** → write to `docs/adr/NNNN-<topic>.md` with status `proposed` or `draft`.
- **Council review mandatory** before transition to `accepted`: run `/adr-council NNNN`
  → produces `docs/adr/NNNN-<topic>-COUNCIL.md` next to the ADR.
- **Council is advisory** — you are the final decision-maker. The matrix surfaces
  concerns, divergence, and unanimous blockers; you decide. Override is allowed
  but should be reasoned (write the reason into the ADR's "Consequences" section).
- **Retroactive council** allowed for already-accepted ADRs — documents validation
  post-fact, does NOT gate the decision.
- **Personas:** default 5 (cto, product-strategist, skeptic, investor, growth-marketer).
  Override via `/adr-council NNNN --personas=cto,skeptic` for a specific lens.
- **Council output is committed** alongside the ADR — `docs/adr/NNNN-*-COUNCIL.md`.
```

## Validation step

After all of the above is in place, run **`/adr-council 0020`** as the end-to-end proof-of-concept.

- Tests the skill from input parsing through 5 parallel persona dispatch, aggregation, and committed COUNCIL.md.
- Produces the first real `docs/adr/0020-multi-tenancy-and-event-bus-invariants-COUNCIL.md` with `council-type: retroactive`.
- If anything breaks — debug now, before the next ADR depends on the system.

**Cost:** 5 parallel persona agents at standard depth, ~5-10 min wall time, then orchestrator aggregation.

## Out of scope

| Excluded                                                | Reason                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `PROJECT.md`                                            | Vision/scope summary; GSD downstream works without it.                    |
| `gsd-map-codebase`                                      | Expensive parallel-mapper run; add when first `gsd-plan-phase` needs it.  |
| `gsd-graphify`                                          | Same logic as above.                                                      |
| Retro-council for the other 19 ADRs                     | Forward-only per decision (3). User may run any retroactively on demand.  |
| GSD milestone for ADR-0020 enforcement                  | Separate `gsd-new-milestone` run; currently a backlog item in ROADMAP.    |
| Auto-trigger of `/adr-council` via shell hooks          | Hooks can't reliably spawn agents; discipline via CLAUDE.md rule instead. |
| Custom personas (restaurant operator, security auditor) | User: "стандартных 5 хватит"; add when a pattern demands it.              |
| Modifying any of the 19 existing ADRs                   | ADRs are immutable per `docs/CLAUDE.md`.                                  |
| Modifying upstream GSD skills                           | Plug-and-play, used as-is.                                                |
| Code fixes from ADR-0020 punch list (12 P0, 30 P1)      | Separate milestone after bootstrap.                                       |

## Success criteria

Bootstrap is successful if **all five** hold:

1. `/adr-council 0020` runs end-to-end without errors and produces a valid `docs/adr/0020-*-COUNCIL.md` with the frontmatter shape specified above (`adr`, `personas`, `synthesis`, `unanimous-blockers`).
2. `ROADMAP.md` is committed and all cross-references to `docs/adr/` resolve.
3. Root `CLAUDE.md` contains the "ADR governance" section (locally — not committed).
4. `.planning/intel/` is populated by `gsd-ingest-docs` with no unresolved conflicts in its output.
5. The skill file `.claude/skills/adr-council/SKILL.md` is self-contained — a future reader can understand how to invoke and what to expect without reading this spec.

## Open questions deferred

None. All design questions were resolved during brainstorming (see "Decisions made" table at the top).

## Implementation order

1. Write `.claude/skills/adr-council/SKILL.md` (the skill body itself).
2. Write `ROADMAP.md` (root, committed).
3. Update root `CLAUDE.md` with "ADR governance" section (local only).
4. Run `gsd-ingest-docs` (one agent invocation).
5. Run `/adr-council 0020` (validation; spawns 5 persona agents).
6. Commit: skill + ROADMAP + COUNCIL.md (single commit, branch decided at commit time).

Step 6's branch policy is the only outstanding question for the implementation phase — current working branch is `adr-0020-invariants`; a fresh `bootstrap/adr-council` branch is the safer default per the project's "Default: new branch" rule.
