---
quick_id: 260828-r9z
slug: role-refusal-returns-403-not-500
date: 2026-08-28
branch: role-refusal-403
---

# Role-change refusals must return 403, not 500

From the e2e audit of 2026-08-28.

## Task 1 — the reported bug

`beforeUpdateMemberRole` throws NestJS `ForbiddenException` from inside a Better Auth
`organizationHooks` callback (auth.config.ts:292, 299, 306). BA's router (better-call)
only understands its own `APIError`; anything else is an unhandled throw, so it logs
`# SERVER_ERROR` and returns **500**. BA's own error object even carries
`status: 403, code: 'role.insufficient_permissions'` — discarded on the wire.

Three refusal paths, all wrong the same way:

- cannot verify target role permissions (db read threw)
- unknown/archived target role slug (T-083-17 fail-closed)
- target role bears non-delegatable permissions

Consequence: a legitimate authorization refusal looks like a server fault. The admin
UI cannot show a reason, `ProblemDetailsFilter` redacts `detail` on 5xx (RES-175) so
the body carries nothing actionable, and fake 5xx inflate the server-error rate.

Fix: `new APIError('FORBIDDEN', { code, message })`, matching the in-repo precedent at
auth.config.ts:487 and organization-switch.plugin.ts:37/51/61. `APIError` is already
imported (auth.config.ts:3).

## Task 2 — the reason nobody noticed (found while checking for baked-in 500s)

`apps/api/test/unit/identity/before-update-member-role-hook.spec.ts` does NOT test the
hook. It contains an **inline replica** of the hook logic, written in the spec file,
commented "This mirrors the production implementation exactly."

It does not mirror it, and the drift is load-bearing:

    replica  SYSTEM_ROLES.admin = { menu: ['read'] }        -> admin is assignable
    prod     SYSTEM_ROLES.admin carries staff: ['remove']   -> admin is REFUSED

So the replica certifies behaviour production does not have. This is why the
admin-role bug survived from 2026-07-04 to the audit: the unit test was green
throughout, because it was testing its own copy.

It also means the replica gives **zero verification value for Task 1** — it would stay
green whatever the production throw type is, and after Task 1 it would assert
`ForbiddenException` while production throws `APIError`, i.e. assert the opposite of
the truth.

Fix: extract the real hook body into an exported, importable function and have both
`auth.config.ts` and the unit test use it. This is the only way to actually verify
Task 1, since the one e2e that covers this path (`identity-role-changed.e2e`) is
blocked on the separate admin-role product decision and stays red either way.

- new `role-assignability.ts` next to auth.config.ts, exporting
  `assertRoleAssignable({ newRole, orgId, authDb })`
- `auth.config.ts` hook body becomes a call to it
- unit spec imports the real function; replica deleted

## Verification

- unit: `before-update-member-role-hook.spec.ts` rewritten against the real function,
  including a case proving `admin` is refused (the drift the replica hid)
- api unit suite, `identity-role-changed.e2e`, `role-grants.e2e`,
  `roles-privilege-escalation.e2e`, `roles-cross-tenant-isolation.e2e`, one process each
- typecheck, lint, `pnpm openapi:check`

`identity-role-changed.e2e` is expected to STAY RED: it is blocked on the admin-role
product decision, and this change alters only the status code of the refusal, not
whether the role can be assigned. Its failure message should move from 500 to 403.

## Out of scope

- the admin-role product decision itself
