---
quick_id: 260826-better-auth-upgrade
slug: better-auth-security-upgrade
completed: 2026-08-26
status: complete
branch: better-auth-security-upgrade
---

# better-auth 1.4.22 → 1.6.30

> The todo that scoped this (`better-auth-security-upgrade.md`) lives on the unmerged
> `location-slug-and-address` branch, so it is not closed here. Close it when PR #261 merges.

Ten advisories landed against `better-auth` on 2026-08-23 and turned CI's `Dependency audit` red on
every branch. `pnpm audit --prod` now reports **no known vulnerabilities**.

Target is the top of the 1.6 line, not 1.7. Every advisory is fixed at or below 1.6.22, and a
security upgrade is the wrong moment to also cross a minor boundary.

## Breaking changes that actually reached us

Two of the many in the 1.5 and 1.6 notes.

**`internalAdapter.deleteSessions` split in two, and the meaning moved.** In 1.4.22 it took
`userIdOrSessionTokens` — a string meant "every session this user holds". In 1.6 it takes session
**tokens** only, and the old behaviour is `deleteUserSessions`. Our password-reset cascade passed a
userId.

TypeScript caught this one _by luck_: the parameter went `string` → `string[]`. Had it stayed
`string | string[]`, `deleteSessions(userId)` would have compiled, matched no session token, revoked
nothing, and reported success — a password reset that leaves every old session live. I checked by
putting the type-valid `deleteSessions([userId])` in place: the e2e that covers this goes red on
`expect(sanityAfter.statusCode).toBe(401)`. It is now `deleteUserSessions(stash.userId)`, with a
comment saying why.

**The `twoFactor` model grew three columns** — `verified`, `failedVerificationCount`, `lockedUntil`
(the last two are BA's own brute-force lockout on code entry, which we get by carrying them). Without
them the adapter refuses every 2FA endpoint with "The field \"verified\" does not exist", so enable /
verify / disable all returned 500. Added to the Drizzle schema plus a hand-written migration.

The migration backfills `verified = user.two_factor_enabled` rather than taking BA's
`defaultValue: true`. Under 1.4.22 a `two_factor` row appeared at `enable` and the flag only flipped
once a code verified, so an abandoned enrolment is a row with the flag still false — defaulting those
to `true` would promote a secret the operator never confirmed.

## Breaking changes that turned out not to touch us

Checked rather than assumed:

- **`freshAge` now measures from `session.createdAt`, not `updatedAt`.** In 1.6 the only endpoint
  behind `freshSessionMiddleware` is `/unlink-account`, plus `deleteUser` when called without a
  password. We use neither — no social providers, no BA-driven user deletion. Deliberately did **not**
  set `freshAge: 0` to "fix" it: that would disable a freshness check we simply do not exercise.
- **better-auth 1.6 depends on zod 4; the whole monorepo is on zod 3.** Our `organizationSwitch`
  plugin hands better-call a zod-3 body schema. better-call 1.4.0 validates through Standard Schema
  (`options.body["~standard"].validate`) and never touches zod internals; zod 3.25.76 implements it.
  Verified directly — the schema accepts a valid uuid and rejects `'nope'` — and again through
  `organization-switch.e2e.spec.ts`, which passes.
- **Organization `permission` → `permissions` (plural)** in the 1.5 removed-deprecations table refers
  to a plugin option. The `organizationRole` model still declares `permission`, so our
  `tenant_role.permission` mapping (dynamicAccessControl is enabled) is untouched.
- Every other `internalAdapter` method we call — `createSession`, `updateSession`, `findSession`,
  `listSessions`, `deleteSession`, `findVerificationValue` — has an identical signature in both
  versions. `listSessions` gained an optional second parameter.

## Verification

Against a real Postgres + NATS stack, not mocks.

|                                                                                                            |                                                                 |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm audit --prod`                                                                                        | no known vulnerabilities (was 10, one high)                     |
| api unit                                                                                                   | 71 files, 534 tests — identical count before and after the bump |
| `identity-audit.e2e`                                                                                       | 4/4, including the session-revocation cascade                   |
| `identity-two-factor.e2e`                                                                                  | 5/5 after the migration (5/5 failing before it)                 |
| `identity-smoke.e2e`                                                                                       | 5/5 after repairing the spec                                    |
| `organization-switch.e2e`                                                                                  | passes — the zod-3/zod-4 boundary in practice                   |
| `identity-invitation.e2e`, `identity-password-reset.e2e`, `identity-bootstrap.e2e`, `auth-brute-force.e2e` | pass                                                            |
| api + db typecheck, lint                                                                                   | clean                                                           |

The unit-test count was worth confirming: it read 534 here against 539 remembered from another
branch. Re-running the baseline on 1.4.22 gave 534 too — the difference was that branch's own tests,
not anything the upgrade removed.

## Found while verifying, not caused by it

**`identity-smoke.e2e` had been red since 2026-08-21**, when plan 10.2-13 closed direct Better Auth
signup: three of its tests still expected `POST /api/auth/sign-up/email` to return 200. Repaired —
the signup test now pins the guard (403 `signup.direct_disabled`, a security invariant worth holding,
since it lives in a BA `before` hook that an upgrade could quietly stop invoking) and the two
session tests go through provision + bootstrap + sign-in.

**The built-in `admin` role has been impossible to assign since 2026-07-04.** `SYSTEM_ROLES.admin`
carries `staff: ['remove']`; `NON_DELEGATABLE` forbids exactly that; the `beforeUpdateMemberRole`
guard rejects any role containing it. Written up in
`.planning/todos/pending/admin-role-cannot-be-assigned.md` with three options — the choice is a
product one. `identity-role-changed.e2e` is red for this reason and stays red.

**`drizzle-kit generate` is broken** — the 10.2 squash left `0000_baseline.sql` without its snapshot,
so it emitted a 34 KB full-schema recreation instead of a three-column ALTER. This migration is
hand-written. See `.planning/todos/pending/drizzle-generate-is-broken.md`.

**None of these were caught by CI because `api:e2e` is not in the workflow.** `Affected test` runs the
`test` target; the e2e target is invoked by hand. Two suites rotted for weeks behind that gap.

## Left red, deliberately

- `identity-role-changed.e2e` — the unassignable `admin` role, above. Fixing it means choosing which
  powers `admin` holds.
- `identity-email-verification.e2e`, one test — also stale from 10.2-13. Attempted the repair, could
  not make it honest inside this task: `runBootstrap` runs in its own Nest context so the captured
  email adapter never sees the mail, and routing it through `POST /v1/signup` returns 400 for a
  reason that needs the AUTH-06 contract re-read. Reverted rather than leave a half-rewritten test.
