---
name: adr-council
description: Use after authoring a new ADR (status proposed/draft) and before transition to accepted — orchestrates a 5-persona advisory council (CTO, Product Strategist, Skeptic, Investor, Growth Marketer) on the ADR, aggregates findings into a structured decision matrix, and commits it next to the ADR. Also valid for retroactive validation of already-accepted ADRs. Council is advisory — the user remains the final decision-maker.
---

# /adr-council — ADR advisory council

Orchestrate a parallel review of a single ADR by 5 persona subagents, aggregate their findings, write a decision matrix next to the ADR.

## When to invoke

- After authoring a new ADR with `status: proposed` or `status: draft`, **before** transitioning it to `accepted`. The council output documents the cross-perspective review that justified the transition.
- Retroactively for an `accepted` ADR — documents validation post-fact. Does NOT gate the existing decision; the ADR stays accepted.

Council is **advisory**. The user is the final decision-maker. The matrix surfaces concerns, divergence, and unanimous blockers. Override is allowed (and expected for `accepted`-retroactive councils that surface concerns).

## Invocation

```
/adr-council <NNNN> [--personas=cto,skeptic,...] [--depth=quick|standard|deep] [--force]
```

- **`<NNNN>` required** — ADR number. Accepts `20` or `0020`. Skill globs `docs/adr/NNNN-*.md`. Errors on zero or multiple matches.
- **`--personas`** optional — comma-separated subset of `cto,product-strategist,skeptic,investor,growth-marketer`. Default: all 5.
- **`--depth`** optional — `quick` | `standard` | `deep`. Passed to each persona agent. Default: `standard`.
- **`--force`** optional — overwrite existing `<NNNN>-*-COUNCIL.md`. Default: refuse, suggest manual `git rm <path>` + retry.

## Validation (before dispatch)

1. Parse `<NNNN>`: must match `^\d{1,4}$`. Reject anything else (path-traversal guard).
2. Glob `docs/adr/NNNN-*.md`:
   - Zero matches → error, exit with "ADR <NNNN> not found in docs/adr/".
   - Multiple matches → error, list all matches, abort.
3. Read the ADR file. Resolve absolute path; assert it lives under `docs/adr/` (path-traversal guard).
4. Parse the ADR's status from the `**Status:**` line in the header:
   - `proposed` or `draft` → council-type `forward` (gating recommendation).
   - `accepted` → council-type `retroactive` (documents validation, does NOT gate).
   - `superseded` → warn user, ask explicit confirmation via `AskUserQuestion` before proceeding. If user declines, exit cleanly.
5. Check whether `docs/adr/NNNN-<slug>-COUNCIL.md` already exists.
   - If yes AND `--force` not passed → refuse with the message "Council already exists at <path>. Run with --force to overwrite or delete the file manually and retry."
   - If yes AND `--force` passed → continue; the existing file will be overwritten at the end.

## Dispatch (5 parallel subagents)

Dispatch all selected personas **in a single message, with one `Agent` tool call per persona**. Available subagent types:

| Persona            | Subagent type                |
| ------------------ | ---------------------------- |
| CTO                | `persona-cto`                |
| Product Strategist | `persona-product-strategist` |
| Skeptic            | `persona-skeptic`            |
| Investor           | `persona-investor`           |
| Growth Marketer    | `persona-growth-marketer`    |

Each agent prompt MUST include:

1. **The full ADR text inline** (not a path — personas may not have Read access to the project).
2. **A brief RestOS context block** (one paragraph): vertical restaurant SaaS, multi-tenant, MVP-2 active, NestJS + Drizzle + Postgres RLS + NATS JetStream + Better Auth + Next.js + React Native (Expo). Solo-founder operated.
3. **Persona-specific lens reminder** (one sentence, from the subagent's description).
4. **Explicit "DO NOT Write" instruction:** "Do NOT attempt to use the Write tool — the harness will deny it and you will stall. Return your full review findings as your final assistant message text. The orchestrator will aggregate and persist."
5. **Severity-classified output:** ask the persona to use `critical` / `warning` / `info` severity buckets in its review, matching the structure their description already promises.
6. **The depth parameter** (default `standard`) passed verbatim.

Wall-time expectation: ~5-10 minutes for `standard` depth across 5 parallel personas.

## Aggregation (after all 5 return)

For each persona, parse their inline-returned review and extract:

- **Verdict** — one of `proceed`, `proceed-with-changes`, `reject`. Derived from severity-classified findings:
  - Any `critical` from this persona → `reject`.
  - Any `warning` (no `critical`) → `proceed-with-changes`.
  - Only `info` (or none) → `proceed`.
- **Top concerns** — up to 5 highest-severity items, with exact file paths / line numbers if cited.
- **Recommendations** — any explicit "fix" / "do X" suggestion.

Then build:

1. **Synthesis** — orchestrator's aggregated take, 1-2 paragraphs. Highlight unanimous blockers, divergence axis, and the most actionable concern.
2. **Cross-persona critical concerns table** — every `critical` finding from any persona, one row per concern, columns: concern / severity / raised-by.
3. **Divergence section** — explicit listing of points where personas reached opposite conclusions (e.g. CTO says proceed, Investor says reject on cost). This is the highest-value section for the user.
4. **Recommended next actions** — consensus list. Only items raised by ≥2 personas.

## Failure handling

| Failure mode                                                    | Behavior                                                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One or more persona agents fail (timeout, stall, runtime error) | Still produce COUNCIL.md. Add the failed persona name to the `failed-personas` array in frontmatter. Synthesis section MUST note "Confidence degraded — N of 5 personas failed." |
| All 5 personas fail                                             | Do NOT write COUNCIL.md. Report failure to user, suggest re-run. Exit non-zero.                                                                                                  |
| Parse failure on a returned review                              | Treat as a failed persona; include in `failed-personas`.                                                                                                                         |

## Output: COUNCIL.md format

Write to `docs/adr/<NNNN>-<slug>-COUNCIL.md` (same slug as the ADR file).

YAML frontmatter:

```yaml
---
adr: <NNNN-as-integer>
adr-title: '<ADR title verbatim>'
adr-status: <proposed | draft | accepted | superseded>
reviewed: <YYYY-MM-DD>
council-type: <forward | retroactive>
personas:
  cto: <proceed | proceed-with-changes | reject>
  product-strategist: <...>
  skeptic: <...>
  investor: <...>
  growth-marketer: <...>
unanimous-blockers: <count of concerns flagged critical by ALL 5 personas>
synthesis: <proceed | proceed-with-changes | reject>
failed-personas: []
---
```

Body (in this order):

```markdown
# Council Review — ADR-<NNNN>

## Synthesis

<1-2 paragraphs from the orchestrator>

## Critical concerns (cross-persona)

| Concern | Severity | Raised by    |
| ------- | -------- | ------------ |
| <...>   | critical | cto, skeptic |
| ...     |          |              |

## Divergence

<Explicit listing of axes where personas disagree>

## Recommended next actions

- <consensus action 1>
- <consensus action 2>

## Persona reviews (full)

### CTO

<full verbatim review text>

### Product Strategist

<full verbatim review text>

### Skeptic

<full verbatim review text>

### Investor

<full verbatim review text>

### Growth Marketer

<full verbatim review text>
```

If a persona failed, omit its subsection and add a `> Persona failed — see frontmatter failed-personas` note inline.

## Commit policy

After writing COUNCIL.md, do NOT auto-commit. Return a short summary to the user with:

- The path of the written COUNCIL.md.
- A 2-3 sentence overview of the synthesis (proceed / proceed-with-changes / reject; unanimous blockers count; key divergence).
- A suggested commit command:
  ```bash
  git add docs/adr/<NNNN>-<slug>-COUNCIL.md
  git commit -m "docs(adr): council review for ADR-<NNNN>"
  ```

The user decides whether to commit, amend the ADR, or override the council.

## Skip conditions (don't invoke this skill)

- ADR file does not exist at the given number.
- User explicitly says "skip council" (rare, but legitimate for trivial ADRs — record reason in the ADR's "Consequences" section).
- The work in question is a code fix, refactor, dependency bump, or anything that did NOT produce a new ADR. Council is for ADR-level decisions only.
