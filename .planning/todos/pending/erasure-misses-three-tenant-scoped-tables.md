---
title: tenancy_erase_tenant leaves rows behind in three tenant-scoped tables
date: 2026-09-03
priority: high
status: pending
---

# GDPR erasure does not reach `table_sessions`, `order_feedback`, `service_requests`

`tenancy_erase_tenant` was written in `0003_table_zones_and_tables.sql` and has been
carried forward verbatim by every migration that touched it since — including
`0019_ingredient_library.sql` (phase 10.6), which added the three ingredient-library
tables to it but deliberately did not widen its scope further.

Three tables created after `0003` carry `tenant_id` and are absent from the function:

| Table | Added in |
|-------|----------|
| `table_sessions` | `0011` |
| `order_feedback` | `0015` |
| `service_requests` | `0017` |

Erasing a tenant therefore leaves their rows in place. `table_sessions` and
`service_requests` are the sharper end of this — a table session is guest-linked and
`order_feedback` can carry free text a guest typed. This is a real GDPR erasure hole,
not a tidiness issue, and it predates phase 10.6.

Found during phase 10.6 plan 02 while rewriting the function for the ingredient
library. Left untouched there on purpose: bundling an unrelated compliance fix into a
schema-reshape migration would have widened that phase's blast radius, and the fix
deserves its own erasure test rather than riding along on someone else's.

## What the fix needs

- Add the three `DELETE` statements to `tenancy_erase_tenant` in FK-safe order.
  `service_requests` and `table_sessions` both reference `restaurant_tables`;
  `order_feedback` references `orders`. All three must be deleted above the
  parent rows the existing function already removes.
- Audit for a fourth: the function is a hand-maintained list with no mechanism
  keeping it in sync with the schema. Enumerate every table carrying `tenant_id`
  and diff that against the function body rather than fixing only these three.
- Add a regression test in the shape phase 10.6 used for the ingredient tables —
  seed real rows for a tenant, run the function, assert they are gone. An
  empty-tenant smoke call proves nothing and is how this went unnoticed.
- Consider a standing test that fails when a `tenant_id`-carrying table exists
  that the function does not name, so the next migration cannot reopen this.

## Related

- `.planning/phases/10.6-ingredient-library-groups-and-how-they-reach-the-order/10.6-02-SUMMARY.md`
  records the original finding.
- `packages/db/migrations/0019_ingredient_library.sql` has the current function body
  and a comment naming these three tables as knowingly out of scope.
