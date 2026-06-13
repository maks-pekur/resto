---
quick_id: 260613-qmn
slug: audit-hygiene
date: 2026-06-13
status: complete
source: .planning/AUDIT.md findings #22, #23, #24 (LOW)
---

# Quick Task 260613-qmn — Summary

Three independent audit hygiene fixes. No code comments (per project rule).

| #   | Finding | Change                                                                                                                                                                                                                                                    | File                                                                                            | Commit    |
| --- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| 1   | #22     | 5xx ProblemDetails now coerces `title` to `'Internal Server Error'`, so an HttpException's `.message` (e.g. a wrapped Better Auth cause in a 502) can no longer leak in `title`. Also closes the `slugify(title)` type-URI fallback. + regression test.   | `apps/api/src/shared/exception.filter.ts`, `apps/api/test/unit/shared/exception.filter.spec.ts` | 3e2a386   |
| 2   | #23     | Added the `redact` config the CLAUDE.md docs already promised (`password/token/email/phone/params` + one-level wildcards, `censor: '[redacted]'`) — defensive against a future re-enable of Drizzle query logging.                                        | `packages/db/src/logger.ts`                                                                     | 81a32c7   |
| 3   | #24     | Removed the false "identity context currently violates this" note from root `CLAUDE.md` (audit verified all emit sites use `buildEnvelope`). **Local-only:** `CLAUDE.md` is gitignored (`**/CLAUDE.md`), so the edit is applied on disk but not a commit. | `CLAUDE.md` (untracked)                                                                         | — (local) |

## Verification

- `vitest run exception.filter.spec.ts` → 14/14 pass (incl. new 5xx-title-redaction test).
- Pre-commit eslint + `nx typecheck` (db, events, api) green on both commits.

## Notes

- No inline comments added to any changed code (user instruction + apps/ HARD rule).
- #24 corrects local Claude context only; nothing to push.
- Out of scope: #1 (RBAC bypass) — routed to a discussion phase next.
