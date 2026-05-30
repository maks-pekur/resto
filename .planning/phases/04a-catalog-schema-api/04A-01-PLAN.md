---
phase: 04a-catalog-schema-api
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-lock.yaml
  - apps/api/package.json
autonomous: false
requirements:
  - CAT-09
tags: [catalog, dependencies, transliteration]
goal: Install `transliteration` npm package legitimately and verify dev Docker stack is up so subsequent schema migrations can run.
user_setup: []

must_haves:
  truths:
    - '`transliteration` package is installed at version 2.6.1 in `apps/api` workspace'
    - 'Developer has verified package legitimacy via npmjs.com (D-4a-04 dependency)'
    - 'Dev Postgres + Redis stack is running (pnpm dev:up) so `pnpm db:migrate` works in later plans'
  artifacts:
    - path: 'apps/api/package.json'
      provides: 'transliteration dependency declared'
      contains: '"transliteration"'
    - path: 'pnpm-lock.yaml'
      provides: 'Lockfile updated with transliteration 2.6.1'
      contains: 'transliteration'
  key_links:
    - from: 'apps/api/package.json'
      to: 'node_modules/transliteration'
      via: 'pnpm install resolution'
      pattern: "transliteration.*2\\.6"
---

<objective>
Install the `transliteration` npm package (Cyrillic → ASCII slug normalization per D-4a-04) after a blocking human-verify checkpoint per the Package Legitimacy Gate. The package is tagged `[ASSUMED]` in `04A-RESEARCH.md §Package Legitimacy Audit` because slopcheck was unavailable at research time — a developer must visually confirm the package on npmjs.com before install. Additionally bring up the dev Docker stack (Postgres + Redis + MinIO) so subsequent waves can run `pnpm db:migrate` and integration tests.

Purpose: All slug auto-derive logic in plans 05/06 imports `slugify` from `transliteration` (RESEARCH.md §Pattern 4). The dev stack is required by `pnpm db:migrate` in plans 02/03/04. Skipping either blocks every downstream plan.
Output: Verified `transliteration` 2.6.1 in workspace + green `pnpm dev:up` so `pnpm db:migrate` can execute.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04a-catalog-schema-api/04a-CONTEXT.md
@.planning/phases/04a-catalog-schema-api/04A-RESEARCH.md

<interfaces>
RESEARCH.md identifies one new dependency:

- `transliteration@2.6.1` — Cyrillic → ASCII slug auto-suggestion (D-4a-04).
- Used as: `import { slugify } from 'transliteration';`
- Slopcheck unavailable at research time → tagged `[ASSUMED]` → MUST go through human-verify checkpoint before `pnpm add`.
- Source repo to verify: https://github.com/dzcpy/transliteration
- npmjs.com URL: https://www.npmjs.com/package/transliteration

All other dependencies (drizzle-orm, drizzle-kit, zod, nestjs-zod, @nestjs/swagger, ioredis, @resto/db, @resto/events, @resto/domain) are already in package.json — no install needed.

Dev stack (`infra/docker/docker-compose.dev.yml`) provides:

- Postgres 16 on localhost:5432
- Redis 7 on localhost:6379
- MinIO on localhost:9000
- MailHog on localhost:8025
- Jaeger on localhost:16686
  </interfaces>
  </context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 1: [BLOCKING] Verify `transliteration` package legitimacy</name>
  <read_first>
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Package Legitimacy Audit — transliteration row tagged [ASSUMED])
    .planning/phases/04a-catalog-schema-api/04a-CONTEXT.md (D-4a-04: slug Cyrillic-to-ASCII transliteration)
  </read_first>
  <what-built>
    The package legitimacy gate was raised in `04A-RESEARCH.md` — `transliteration@2.6.1` is tagged `[ASSUMED]` because slopcheck was unavailable. Per planner protocol, `[ASSUMED]` packages require a blocking human-verify checkpoint before install.
  </what-built>
  <how-to-verify>
    1. Open https://www.npmjs.com/package/transliteration in a browser.
    2. Confirm:
       - Latest version is at or above `2.6.1`.
       - Weekly downloads > 100k (real package, not a typosquat).
       - Repository link points to `github.com/dzcpy/transliteration`.
       - Last publish within last 24 months OR clear stable signal (>10 versions, no security advisories).
    3. (Optional) Visit https://github.com/dzcpy/transliteration and verify:
       - The repo exists and has > 500 stars.
       - The package main entry exports `slugify` (search the README).
    4. Confirm there is no `T-04a-SC` advisory blocking install.

    Expected outcome: `transliteration` is the legitimate Cyrillic/CJK transliteration library, version 2.6.1 or newer.

  </how-to-verify>
  <resume-signal>Type "approved" to proceed with install, or "rejected: &lt;reason&gt;" to swap to the fallback (`slugify` npm package per RESEARCH.md alternative).</resume-signal>
  <files>(none — checkpoint is human-verification only; install action runs in Task 2 after approval)</files>
  <action>Pause execution and present the verification checklist (see <how-to-verify>) to the developer. Do NOT run `pnpm add` yet. Wait for the resume signal before proceeding to Task 2. Record the verification artifact (npmjs.com page snapshot + weekly downloads at verify time + repo URL confirmation) in the plan SUMMARY.</action>
  <verify>
    <automated>echo "checkpoint reached — awaiting developer resume signal; no automated check beyond the structured pause itself."</automated>
  </verify>
  <done>
    - Developer recorded "approved" (or "rejected: <reason>") with reference to verification artifact.
    - The execution context advances to Task 2 (install) only after "approved".
  </done>
  <acceptance_criteria>
    - Developer responded "approved" with reference to npmjs.com page (or "rejected" with fallback decision recorded in plan SUMMARY).
    - No `[SLOP]` or `[SUS]` indicator surfaced during verification.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Install `transliteration` 2.6.1 in apps/api workspace</name>
  <files>apps/api/package.json, pnpm-lock.yaml</files>
  <read_first>
    apps/api/package.json (existing dependencies block — must preserve order)
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Standard Stack New Dependency — install command)
  </read_first>
  <action>
    Install `transliteration` 2.6.1 into `apps/api` workspace via pnpm (the package is consumed by `upsert-item.service.ts` / `upsert-category.service.ts` in plan 06; `apps/api` is the only consumer).

    Run from repo root: `pnpm --filter @resto/api add transliteration@2.6.1`.

    After install, verify:
    - `apps/api/package.json` `dependencies` block contains `"transliteration": "2.6.1"` (exact, no caret) per project convention of pinning external libs in 4a (consistency with Better Auth `=1.4.22` precedent — see PROJECT.md decision 2026-05-29). If a tilde/caret is added by default, edit it down to exact.
    - `pnpm-lock.yaml` has been updated and the workspace resolves successfully.

    Use the exact slug-normalization pattern from RESEARCH.md §Pattern 4 as the contract this plan unlocks (consumers wire it in plan 06).

  </action>
  <verify>
    <automated>pnpm --filter @resto/api ls transliteration | grep -q "transliteration 2.6.1" &amp;&amp; pnpm --filter @resto/api exec node -e "console.log(require('transliteration').slugify('Пицца Маргарита'))" | grep -q "pitstsa-margarita\|pizza-margarita\|pi"</automated>
  </verify>
  <done>
    - `transliteration` resolves at version 2.6.1 in `apps/api` workspace.
    - `slugify('Пицца Маргарита')` returns a kebab-case ASCII string (smoke test).
    - `pnpm install` exits 0 with no peer-dependency warnings introduced.
  </done>
  <acceptance_criteria>
    - `grep -c "\"transliteration\"" apps/api/package.json` returns 1.
    - `pnpm --filter @resto/api ls transliteration` lists version 2.6.1.
    - Smoke test executes the package's `slugify` export without throwing.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Bring up dev Docker stack for downstream migrations</name>
  <files>(no file writes — environment task)</files>
  <read_first>
    infra/docker/docker-compose.dev.yml (the compose file `pnpm dev:up` runs)
    packages/db/CLAUDE.md (§Rules — db:migrate requires DATABASE_ADMIN_URL; dev fallback OK only in NODE_ENV=development)
  </read_first>
  <action>
    Ensure the dev Docker stack is running so `pnpm db:migrate` in plans 02/03/04 can apply migrations against a real Postgres. Per planning-context schema_push_requirement, "if not running, start it" is a Wave-1 prerequisite.

    Steps:
    1. Check whether Postgres on `localhost:5432` accepts connections: `docker compose -f infra/docker/docker-compose.dev.yml ps postgres` (or equivalent `docker ps | grep resto`).
    2. If not running: `pnpm dev:up` (which delegates to `docker compose -f infra/docker/docker-compose.dev.yml up -d`).
    3. Wait for healthcheck: `pnpm --filter @resto/db exec node -e "process.exit(0)"` no-ops fast; the real signal is `pg_isready` via the compose health hooks. If `pnpm dev:up` exits before postgres is ready, repeat the check until Postgres returns ready.
    4. Confirm Redis is reachable on `localhost:6379` so later plans can exercise the cache fallback path.

    DO NOT run `pnpm db:migrate` here — schema is still empty of the new 4a tables. Migration runs in plans 02/03/04 after schema edits.

  </action>
  <verify>
    <automated>docker compose -f infra/docker/docker-compose.dev.yml ps postgres redis | grep -q "running\|healthy\|Up"</automated>
  </verify>
  <done>
    - Postgres container reports running/healthy.
    - Redis container reports running.
    - No port conflict on 5432/6379.
  </done>
  <acceptance_criteria>
    - `docker compose -f infra/docker/docker-compose.dev.yml ps` shows postgres and redis services in `running` (or `healthy`) state.
    - `nc -z localhost 5432 &amp;&amp; nc -z localhost 6379` exits 0.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                             | Description                                             |
| ------------------------------------ | ------------------------------------------------------- |
| developer workstation → npm registry | Untrusted package code crosses here (supply-chain risk) |
| dev Docker stack                     | Local-only services; no cross-tenant exposure           |

## STRIDE Threat Register

| Threat ID | Category  | Component                      | Disposition | Mitigation Plan                                                                                                                                    |
| --------- | --------- | ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04a-01  | Tampering | npm install of transliteration | mitigate    | `checkpoint:human-verify gate="blocking-human"` (Task 1) — developer manually confirms package on npmjs.com per `[ASSUMED]` legitimacy gate        |
| T-04a-02  | Tampering | pnpm-lock.yaml drift           | mitigate    | Pin version to exact `2.6.1` (no caret); lockfile committed alongside package.json change                                                          |
| T-04a-SC  | Tampering | npm install supply chain       | mitigate    | Blocking human checkpoint never auto-advanced (`workflow.auto_advance` ignored on slopcheck gate); developer reviews repo + downloads + advisories |

</threat_model>

<verification>
- `grep -c "\"transliteration\": \"2.6.1\"" apps/api/package.json` returns 1.
- `pnpm --filter @resto/api ls transliteration` shows 2.6.1.
- `nc -z localhost 5432` and `nc -z localhost 6379` both exit 0.
- The blocking-human checkpoint in Task 1 produced an "approved" resume signal logged in plan SUMMARY (no auto-bypass).
</verification>

<success_criteria>

- `transliteration` 2.6.1 installed in `apps/api` workspace via human-verified install.
- Dev Docker stack running; Postgres + Redis reachable on default ports.
- Plan 02 can run `pnpm db:migrate` against the dev DB without "connection refused" errors.
  </success_criteria>

<output>
Create `.planning/phases/04a-catalog-schema-api/04A-01-SUMMARY.md` when done summarizing:
- The npmjs.com verification artifact (URL + version + weekly downloads at verify time).
- The exact `pnpm add` command run and its output snippet.
- The dev stack `docker compose ps` snapshot.
</output>
