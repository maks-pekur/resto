---
title: The built-in `admin` role has been impossible to assign since 4 July
date: 2026-08-26
priority: high
status: done
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

## Resolved 2026-08-28 — option (c), narrowed

Founder call: the manager may remove staff, so the built-in roles are trusted and
exempt from the non-delegatable guard.

**Narrowed during implementation, deliberately.** Option (c) as written above says
"exempt system roles". Taken literally that also exempts `owner`, which carries
`tenant:['delete','transfer']`, `billing:['update']` and all of `ac:*` — meaning the
guard currently blocks promotion to owner too, and a literal (c) would have silently
removed the only backstop against a direct Better Auth call minting a new owner. The
decision asked for "a manager can remove staff", not "anyone can be made an owner", so
`owner` keeps the guard.

Known consequence, accepted rather than overlooked: **a second co-owner still cannot be
promoted.** A restaurant cannot have two owners. Same family of bug, left open on
purpose — raise it as its own todo if co-ownership is wanted.

Fix: `role-assignability.ts` returns early for a built-in role that is not `owner`.
Unit spec updated — `admin` now allowed, `owner` still refused, both asserted against
the real `SYSTEM_ROLES`. `identity-role-changed.e2e` green for the first time since
2026-07-04; `roles-privilege-escalation` 7/7, `roles-cross-tenant-isolation` 5/5,
`role-grants` 2/2 unchanged.
