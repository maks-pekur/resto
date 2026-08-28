---
title: The built-in `admin` role has been impossible to assign since 4 July
date: 2026-08-26
priority: high
status: pending
---

# A guard that rejects our own system role

`beforeUpdateMemberRole` refuses any target role containing a non-delegatable permission. The
built-in `admin` role contains one:

|                            |                                                    |
| -------------------------- | -------------------------------------------------- |
| `SYSTEM_ROLES.admin.staff` | `['invite', 'remove', 'roleCreate', 'roleUpdate']` |
| `NON_DELEGATABLE.staff`    | `['remove']`                                       |

So `containsNonDelegatable(SYSTEM_ROLES.admin)` is `true`, and promoting a member to `admin` returns
403 `role.insufficient_permissions` — "You cannot assign a role bearing non-delegatable
permissions". Every time, for everyone, including the owner.

## How it got here

- **2026-05-02** (56256990) — `admin` gets `staff: ['invite', 'remove', …]`.
- **2026-07-04 19:57** (d266dffe) — `NON_DELEGATABLE` gains `staff: ['remove']`.
- **2026-07-04 22:44** (9b1b4c05) — the guard lands, three hours later, and the two constants have
  contradicted each other ever since.

`identity-role-changed.e2e.spec.ts` has been red the whole time and nobody saw it, because
`admin:e2e` and `api:e2e` are not in `.github/workflows/ci.yml` — CI's "Affected test" runs the
`test` target only. Found while verifying the better-auth 1.6 upgrade, which is unrelated to it.

## The decision is yours, and it is a product one

**a. Drop `remove` from `admin`.** An admin invites and manages roles but cannot remove a member.
Narrowest change; makes the guard's intent true.

**b. Drop `staff: ['remove']` from `NON_DELEGATABLE`.** Removing a member becomes delegatable, which
also lets a custom role carry it. Widest blast radius — `ac: [...]` is in that list precisely so
nobody can grant themselves role management.

**c. Exempt system roles from the guard.** The guard exists to stop _custom_ roles smuggling in
privileges; the three built-ins are defined by us and reviewed. Keeps both constants as they are, at
the cost of a second code path.

I would take (a) unless you actually want admins removing staff, in which case (c). Not doing it
myself: which powers `admin` holds is a product call, not a cleanup.
