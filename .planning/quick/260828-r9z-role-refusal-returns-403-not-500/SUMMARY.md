---
quick_id: 260828-r9z
slug: role-refusal-returns-403-not-500
date: 2026-08-28
status: complete
branch: role-refusal-403
commits: [b257c96d, cb3f9888]
---

# Summary — role refusals return 403, and the test that hid it is gone

## Task 1 — the reported bug, fixed

`beforeUpdateMemberRole` threw a NestJS `ForbiddenException` from inside a Better Auth
hook; better-call treats a foreign throw as unhandled, logs `# SERVER_ERROR` and
returns 500. Now throws `APIError('FORBIDDEN', ...)`.

Proven end-to-end, not argued: `identity-role-changed.e2e`'s failure message moved
from `expected [200,201] to include 500` to `... include 403`, and `# SERVER_ERROR`
is gone from the log. That spec stays red — it is blocked on the admin-role product
decision, and this change alters the status of the refusal, not whether the role can
be granted.

## Task 2 — the reason it was never caught

`before-update-member-role-hook.spec.ts` did not test the hook. It contained an
**inline replica** of the logic, in the spec file, commented "mirrors the production
implementation exactly". It had drifted where it mattered most:

    replica  SYSTEM_ROLES.admin = { menu: ['read'] }       -> admin assignable
    prod     SYSTEM_ROLES.admin carries staff:['remove']   -> admin REFUSED

The replica certified behaviour production did not have, and stayed green from
2026-07-04 to the 2026-08-28 audit. It also offered zero verification for Task 1: it
would have passed whatever production threw, and after Task 1 it would have asserted
`ForbiddenException` — the opposite of the truth.

Fix: extracted the real hook into `role-assignability.ts` exporting
`assertRoleAssignable(...)`; `auth.config.ts` now calls it; the spec imports the real
function. The extraction is what makes Task 1 verifiable at all, since the only e2e
covering this path is blocked on a product decision.

Corroboration that the hook was the sole user of that logic: removing it left four
imports unused in `auth.config.ts` (`ForbiddenException`, `isNull`,
`containsNonDelegatable`, `SYSTEM_ROLES`), all since removed.

## The new gate was proven to fail

A test that cannot go red is decoration. Temporarily restoring the old
`ForbiddenException` throw turned **5 of 8 red**, including the explicit
"refuses as 403, not 500" case. The old replica would have stayed green through the
same experiment. Restored, 8/8.

Two of the new cases document reality rather than a wish:

- `admin` is currently unassignable — asserted against the REAL `SYSTEM_ROLES`, so the
  next edit to it is deliberate. Update when the founder decision lands.
- the refusal is BA-native, so better-call maps it to 403.

## Verification

api unit **543 passed / 71 files** (was 540 — net +3 in the rewritten spec).
e2e one process each: `role-grants` 2, `roles-privilege-escalation` 7,
`roles-cross-tenant-isolation` 5, `identity-invitation` 6, `organization-switch` 5 —
all green. `identity-role-changed` red as predicted, now on 403.
typecheck, lint, `pnpm openapi:check` (artefacts in sync) all pass.

## Still open

The `admin`-role product decision — three options in
`.planning/todos/pending/admin-role-cannot-be-assigned.md`. This change does not touch
it; it only makes the refusal legible to the client.
