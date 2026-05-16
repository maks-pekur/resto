# `/adr-council` skill + minimal GSD bootstrap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/adr-council` advisory-council skill (5 personas) and bootstrap minimal GSD infrastructure (ROADMAP.md, ingested ADR decisions, ADR-governance rule), so future ADRs get structured cross-perspective review before transition to `accepted`.

**Architecture:** Project-local skill in `.claude/skills/adr-council/SKILL.md` orchestrates 5 parallel persona subagents (cto, product-strategist, skeptic, investor, growth-marketer), aggregates findings into `docs/adr/NNNN-*-COUNCIL.md`. ROADMAP.md is derived manually from existing ADRs in GSD-native shape. One-time `gsd-ingest-docs` run populates `.planning/decisions/` cache. Council is **advisory only** — user is the final decision-maker.

**Tech Stack:** Markdown (skill body, ROADMAP, CLAUDE.md, COUNCIL.md), YAML frontmatter, project-local Claude Code skill format, `gsd-ingest-docs` skill (existing), `persona-*` subagents (existing).

**Spec:** `docs/superpowers/specs/2026-05-16-adr-council-and-gsd-bootstrap-design.md` (committed `03b5632` on `council-bootstrap`).

**Branch:** Work proceeds on `council-bootstrap` (already created from main, contains spec commit).

**Pre-commit context:** Repo has `lint-staged` + Nx `typecheck` running on every commit (observed in spec commit `03b5632`). Markdown files go through Prettier. Plan for ~30-90s extra wall-time per commit.

**Conventional Commits prefix required** (`docs:`, `feat:`, `chore:`, etc.) per `~/.claude/CLAUDE.md`. Single-line subject, no body, no `Co-Authored-By` footer.

---

## Files to be touched

| File                                    | Action         | Committed?                       | Owner task        |
| --------------------------------------- | -------------- | -------------------------------- | ----------------- |
| `.claude/skills/adr-council/SKILL.md`   | create         | ✅ yes                           | Task 1            |
| `ROADMAP.md` (root)                     | create         | ✅ yes                           | Task 2            |
| `CLAUDE.md` (root)                      | modify         | ❌ no (gitignored per `e8b69ab`) | Task 3            |
| `.planning/decisions/` (dir + contents) | tool-generated | ❌ no (gitignored)               | Task 4            |
| `docs/adr/0020-*-COUNCIL.md`            | create         | ✅ yes                           | Task 5 (deferred) |

---

## Task 1: Write the `/adr-council` skill

**Files:**

- Create: `.claude/skills/adr-council/SKILL.md`

**Source of truth:** Spec sections "/adr-council skill design", "Output contract", "Edge cases", "Trigger pattern".

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p .claude/skills/adr-council
```

Expected: directory exists; no output.

- [ ] **Step 2: Write SKILL.md**

Create `.claude/skills/adr-council/SKILL.md` with the following exact content:

````markdown
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
````

- [ ] **Step 3: Verify YAML frontmatter parses**

Run:

```bash
node -e "const fs=require('fs');const c=fs.readFileSync('.claude/skills/adr-council/SKILL.md','utf-8');const m=c.match(/^---\n([\s\S]*?)\n---/);if(!m){console.error('NO FRONTMATTER');process.exit(1)}console.log('frontmatter OK, length:',m[1].length);if(!/name:\s*adr-council/.test(m[1])){console.error('name field missing');process.exit(1)}if(!/description:/.test(m[1])){console.error('description field missing');process.exit(1)}console.log('name+description present')"
```

Expected output:

```
frontmatter OK, length: <some-number>
name+description present
```

- [ ] **Step 4: Stage + commit**

```bash
git add .claude/skills/adr-council/SKILL.md
git commit -m "feat(skills): add /adr-council orchestrator skill"
```

Expected: commit hash printed, pre-commit hook runs Prettier on the new file, Nx typecheck runs (will skip because no `.ts` files staged).

---

## Task 2: Write `ROADMAP.md` (with verified phase status)

**Files:**

- Create: `ROADMAP.md` (repo root)

**Source of truth:** Spec section "ROADMAP.md shape" + verified state from ADRs and recent commits. The spec's skeleton uses ILLUSTRATIVE phase status labels — they MUST be verified against the codebase before writing the real ROADMAP.

- [ ] **Step 1: Verify MVP-1 scope from ADR-0010**

Run:

```bash
sed -n '/## Decision/,/## Alternatives/p' docs/adr/0010-mvp-1-scope.md
```

Expected: list of MVP-1 in-scope features. Note them down for the "MVP-1 — done" section.

- [ ] **Step 2: Verify MVP-2 phase structure from ADR-0013**

Run:

```bash
sed -n '/Phase A/,/^##/p' docs/adr/0013-better-auth-for-mvp2-identity.md | head -40
```

Expected: text describing MVP-2 phases A-F. Read what each phase covers.

- [ ] **Step 3: Verify current phase status from recent commits**

Run:

```bash
git log --oneline -30 origin/main | grep -iE "phase|RES-" | head -20
```

Expected: list of recent commits referencing phases or `RES-` ticket IDs. Use these to derive which phases are done / active / planned.

Cross-check with which identity files exist in `apps/api/src/contexts/identity/` — if guards (`auth.guard.ts`, `brand-scope.guard.ts`) are present, Phase B is at least in progress; if signup flow is present, Phase B is largely done. This is judgement based on observed code state — note actual status, not the spec's example labels.

- [ ] **Step 4: Verify ADR-0019 multi-brand scope**

Run:

```bash
sed -n '/## Decision/,/## Alternatives/p' docs/adr/0019-multi-brand-under-tenant.md
```

Expected: description of multi-brand-per-tenant model. Confirms this is in MVP-2.

- [ ] **Step 5: Write ROADMAP.md**

Create `ROADMAP.md` at repo root. Replace `<...>` placeholders below with the actual values from Steps 1-4. **Do not commit the file with `<...>` placeholders unfilled.**

```markdown
# RestOS Roadmap

## Current state

- **Active milestone:** MVP-2 (Phase <verified-current-phase> — <one-line description of current focus>)
- **Last shipped:** MVP-1 (per [ADR-0010](./docs/adr/0010-mvp-1-scope.md))
- **Open technical debt:** [.planning/reviews/2026-05-16-full-codebase/INDEX.md](./.planning/reviews/2026-05-16-full-codebase/INDEX.md) — 34 P0/P1 from the 2026-05-16 full-codebase review

## MVP-1 — done

Per [ADR-0010](./docs/adr/0010-mvp-1-scope.md). Scope:

- <verified-mvp-1-bullet-1>
- <verified-mvp-1-bullet-2>
- ...

Foundation ADRs: [ADR-0001](./docs/adr/0001-modular-monolith-with-ddd.md) (modular monolith + DDD), [ADR-0002](./docs/adr/0002-nestjs-as-backend-framework.md) (NestJS), [ADR-0003](./docs/adr/0003-drizzle-orm-on-postgres.md) (Drizzle + Postgres), [ADR-0004](./docs/adr/0004-nats-jetstream-event-bus.md) (NATS JetStream), [ADR-0006](./docs/adr/0006-multi-tenancy-row-level-with-rls.md) (RLS multi-tenancy), [ADR-0007](./docs/adr/0007-nx-pnpm-monorepo.md) (Nx + pnpm).

## MVP-2 — active

Identity, admin UI, multi-brand under tenant. Per [ADR-0013](./docs/adr/0013-better-auth-for-mvp2-identity.md) (supersedes ADR-0005 and ADR-0012) and [ADR-0019](./docs/adr/0019-multi-brand-under-tenant.md).

### Phase A — identity foundation: <verified-status>

Per ADR-0013 Phase A. BA schema, two-role provisioning, RBAC catalogue, smoke test.

### Phase B — identity guards + bootstrap: <verified-status>

AuthGuard, brand-scope guard, signup flow, internal bootstrap controller.

### Phase C — admin UI integration: <verified-status>

Per [ADR-0016](./docs/adr/0016-admin-app-stack.md) (Next.js 15 + shadcn).

### Phase D — customer phone+OTP (mobile): planned

Per ADR-0013 Phase D. Expo + Better Auth `phoneNumber` plugin.

### Phase E — BA hooks + audit pipeline: <verified-status>

Per ADR-0013 Phase E.

### Phase F — security tests + hardening: <verified-status>

Per ADR-0013 Phase F.

### Cross-cutting

- [ADR-0019](./docs/adr/0019-multi-brand-under-tenant.md) — multi-brand under tenant
- [ADR-0017](./docs/adr/0017-defer-otel-collector-to-mvp-2.md) — OTel collector deferred until MVP-2
- [ADR-0018](./docs/adr/0018-gdpr-tenant-offboarding.md) — GDPR tenant offboarding

## Backlog

### ADR-0020 enforcement (high priority)

[ADR-0020](./docs/adr/0020-multi-tenancy-and-event-bus-invariants.md) defines 7 multi-tenancy + event-bus invariants. Enforcement is technical debt:

- 12 P0 + ~30 P1 violations catalogued in [.planning/reviews/2026-05-16-full-codebase/INDEX.md](./.planning/reviews/2026-05-16-full-codebase/INDEX.md).
- Convert to a GSD milestone via `gsd-new-milestone` when ready (separate decision; see "Out of scope" in the bootstrap spec).
- The CI lints described in ADR-0020 (per-invariant) are prerequisite infrastructure — they land first, then per-invariant fixes.

### Other (post-MVP-2 or unstarted)

- Mobile customer app (Expo) — scaffold only, not started; tracked under ADR-0013 Phase D.
- Tenant marketing website (Next.js multi-tenant) — scaffold only.
- Loyalty, inventory, analytics — post-MVP-2 contexts, no ADR yet.

## Cross-refs

- Architecture decisions: [`docs/adr/`](./docs/adr/) — authoritative.
- Tactical reviews: [`.planning/reviews/`](./.planning/reviews/) — ephemeral (gitignored).
- This roadmap: maintained manually, derived from ADRs. Refresh after every new ADR or after a phase ships.
```

- [ ] **Step 6: Verify all cross-refs resolve**

Run:

```bash
grep -oE "docs/adr/[0-9]+[a-z0-9-]+\.md" ROADMAP.md | sort -u | while read p; do test -f "$p" && echo "OK $p" || echo "MISSING $p"; done
grep -oE "\.planning/[a-z0-9/-]+\.md" ROADMAP.md | sort -u | while read p; do test -f "$p" && echo "OK $p" || echo "MISSING $p"; done
```

Expected: every line starts with `OK`. If any `MISSING` — fix the path in `ROADMAP.md`.

- [ ] **Step 7: Verify no unfilled placeholders remain**

Run:

```bash
grep -nE "<verified-|<\.\.\.|TBD|TODO" ROADMAP.md && echo "PLACEHOLDERS REMAIN" || echo "no placeholders"
```

Expected: `no placeholders`. If any placeholder lines printed, fill them in before continuing.

- [ ] **Step 8: Stage + commit**

```bash
git add ROADMAP.md
git commit -m "docs: add ROADMAP.md derived from existing ADRs"
```

Expected: commit succeeds, pre-commit hook runs Prettier.

---

## Task 3: Add "ADR governance" section to root `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md` (repo root). **Note:** `CLAUDE.md` and `**/CLAUDE.md` are in `.gitignore` per commit `e8b69ab chore: keep CLAUDE.md and .claude private`. This edit lives only on the local working tree — there is NO commit step for this task.

**Source of truth:** Spec section "Root CLAUDE.md — new 'ADR governance' section".

- [ ] **Step 1: Read current CLAUDE.md**

Use the Read tool on the absolute path `/Users/mp_dev/projects/RestOS/CLAUDE.md`. Locate the existing `## Rules` section — the new "## ADR governance" section appears immediately AFTER `## Rules`.

- [ ] **Step 2: Append "ADR governance" section**

Use the Edit tool. Find the LAST bullet of the `## Rules` section (the one ending with `... UIs and integrations import from @resto/domain.`) and append the new section right after it.

The exact `new_string` is the old last bullet plus the following block appended after it (after one blank line):

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

- [ ] **Step 3: Verify edit applied**

Run:

```bash
grep -A 1 "^## ADR governance" CLAUDE.md | head -5
```

Expected: prints the section header followed by the first bullet about "New ADR".

- [ ] **Step 4: No commit**

Verify the change is invisible to Git:

```bash
git status --short CLAUDE.md
```

Expected: NO output (file is gitignored, modifications don't appear in status). If output appears, something is wrong with the `.gitignore` — STOP and report.

---

## Task 4: One-time `gsd-ingest-docs` bootstrap

**Files:**

- Tool-generated: `.planning/decisions/` directory and contents (gitignored — no commit).

**Source of truth:** Spec section "`gsd-ingest-docs` bootstrap". Skill encapsulates its own contract; we invoke and accept the output without trying to predict its shape.

- [ ] **Step 1: Confirm `.planning/decisions/` does not yet exist**

Run:

```bash
test -d .planning/decisions && echo "EXISTS — gsd-ingest-docs has run before" || echo "ok, fresh"
```

Expected: `ok, fresh`. If `EXISTS` — read the existing contents first (`ls .planning/decisions/`); rerunning gsd-ingest-docs is idempotent but may overwrite. Confirm with user before continuing.

- [ ] **Step 2: Invoke `gsd-ingest-docs` skill**

Use the `Skill` tool with `skill: "gsd-ingest-docs"`. No arguments needed — skill discovers `docs/adr/*.md` automatically. Wait for skill completion. The skill may spawn parallel classifier agents internally; this is expected.

- [ ] **Step 3: Verify output**

Run:

```bash
ls -la .planning/decisions/
```

Expected: directory exists, contains synthesized files from the skill. Exact filenames depend on the skill — do not assume a specific layout.

Check for conflict report (skill convention; may not exist if no conflicts):

```bash
test -f .planning/decisions/INGEST-CONFLICTS.md && cat .planning/decisions/INGEST-CONFLICTS.md || echo "no conflicts file"
```

If conflicts exist: read them, document the unresolved blockers (if any) in the conversation summary. They do NOT block this task — they inform future ADR work.

- [ ] **Step 4: No commit**

`.planning/` is gitignored. Verify:

```bash
git status --short .planning/
```

Expected: NO output. If output appears, `.gitignore` is misconfigured — STOP and report.

---

## Task 5 (DEFERRED): Validation — run `/adr-council 0020`

**Files:**

- Create: `docs/adr/0020-multi-tenancy-and-event-bus-invariants-COUNCIL.md`

**Pre-conditions** (this task BLOCKS until at least one is true):

1. `docs/adr/0020-multi-tenancy-and-event-bus-invariants.md` exists on the current working tree. This requires one of:
   - Branch `adr-0020-invariants` is merged into `main` and `council-bootstrap` is rebased onto the new `main`.
   - OR the file is cherry-picked into `council-bootstrap` from `adr-0020-invariants`.
   - OR Task 5 is executed on a different branch where the ADR exists.

Until then, this task remains pending. Do NOT attempt to run `/adr-council 0020` without the ADR file in place — the skill will fail with "ADR not found".

- [ ] **Step 1: Pre-flight — verify ADR-0020 exists**

Run:

```bash
ls docs/adr/0020-*.md 2>&1
```

Expected: exactly one match, ending in `.md`. If "No such file or directory" — abort this task; the pre-condition is not met.

- [ ] **Step 2: Pre-flight — verify the `/adr-council` skill is loaded**

In a Claude Code session on `council-bootstrap`, confirm the skill is discoverable:

```bash
ls .claude/skills/adr-council/SKILL.md
```

Expected: file exists (created in Task 1).

- [ ] **Step 3: Invoke `/adr-council 0020`**

In the Claude Code session: invoke the skill via the slash-command shortcut:

```
/adr-council 0020
```

Expected wall-time: ~5-10 minutes. The skill will spawn 5 parallel persona subagents.

- [ ] **Step 4: Verify output COUNCIL.md exists and parses**

Run:

```bash
ls docs/adr/0020-*-COUNCIL.md
```

Expected: one file `docs/adr/0020-multi-tenancy-and-event-bus-invariants-COUNCIL.md`.

Verify frontmatter:

```bash
node -e "
const fs = require('fs');
const path = require('child_process').execSync('ls docs/adr/0020-*-COUNCIL.md').toString().trim();
const c = fs.readFileSync(path, 'utf-8');
const m = c.match(/^---\n([\s\S]*?)\n---/);
if (!m) { console.error('NO FRONTMATTER'); process.exit(1); }
const yaml = m[1];
const required = ['adr:', 'adr-title:', 'adr-status:', 'reviewed:', 'council-type:', 'personas:', 'unanimous-blockers:', 'synthesis:', 'failed-personas:'];
const missing = required.filter(k => !yaml.includes(k));
if (missing.length) { console.error('missing fields:', missing); process.exit(1); }
console.log('frontmatter OK, all required fields present');
console.log('council-type:', /council-type:\s*(\w+)/.exec(yaml)?.[1]);
console.log('synthesis:', /synthesis:\s*([\w-]+)/.exec(yaml)?.[1]);
"
```

Expected: `frontmatter OK, all required fields present` plus the `council-type` (should be `retroactive` for ADR-0020 since it is `accepted`) and synthesis value.

- [ ] **Step 5: Stage + commit**

```bash
git add docs/adr/0020-multi-tenancy-and-event-bus-invariants-COUNCIL.md
git commit -m "docs(adr): council review for ADR-0020"
```

Expected: commit succeeds, pre-commit hook runs Prettier on the COUNCIL.md.

---

## Branch / PR strategy

All commits from Tasks 1, 2, 5 land on branch `council-bootstrap` (already created from `main`).

Task 3 produces no commit (gitignored).

Task 4 produces no commit (gitignored).

**Push policy:** Do NOT `git push` without explicit user approval per project workflow.

**PR readiness:** After Tasks 1-4 complete, `council-bootstrap` contains:

- spec commit `03b5632`
- Task 1 commit (skill)
- Task 2 commit (ROADMAP)

Task 5 commit lands separately once ADR-0020 is accessible. The PR for `council-bootstrap` MAY proceed without Task 5 — Task 5 is a follow-up validation, not gating for the skill itself.

---

## Success criteria (per spec)

Verified end-to-end:

1. `/adr-council 0020` runs end-to-end without errors and produces a valid `docs/adr/0020-*-COUNCIL.md` with all required frontmatter fields. (Task 5 Step 4.)
2. `ROADMAP.md` is committed and all cross-references resolve. (Task 2 Step 6.)
3. Root `CLAUDE.md` contains the "ADR governance" section locally (not committed). (Task 3 Step 3.)
4. `.planning/decisions/` is populated, no unresolved conflicts. (Task 4 Step 3.)
5. `.claude/skills/adr-council/SKILL.md` is self-contained and a future reader can invoke without reading the spec. (Task 1 — verified by skill body content.)

---

## Out of scope reminders (do NOT do)

Per spec "Out of scope":

- No `PROJECT.md`.
- No `gsd-map-codebase` or `gsd-graphify` runs.
- No retro-council for the other 19 ADRs.
- No GSD milestone for ADR-0020 enforcement.
- No auto-trigger via shell hooks.
- No custom personas.
- No modifications to the existing 19 ADRs (they are immutable per `docs/CLAUDE.md`).
- No code fixes from the ADR-0020 punch list.
