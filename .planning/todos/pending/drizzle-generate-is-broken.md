---
title: `drizzle-kit generate` emits a full schema recreation instead of a diff
date: 2026-08-26
priority: medium
status: pending
---

# The baseline squash kept the SQL and lost the snapshot

`packages/db/migrations/` holds `0000_baseline.sql` (the phase 10.2 squash of 82 migrations) but
`meta/` holds no `0000_snapshot.json`. Drizzle diffs against the snapshot, not the SQL, so with
nothing to compare to it treats the entire schema as new: adding three columns to `two_factor`
produced a **34 KB migration creating every table in the database**.

Caught because the output was obviously wrong. It would not be obvious to someone who ran
`pnpm db:generate`, saw a migration appear, and committed it — the result is a migration that fails
on any database that already has the tables.

## Fix

Generate the missing baseline snapshot so drizzle has a starting point (`drizzle-kit generate` with
the schema as it stood at the squash, keeping only `meta/0000_snapshot.json` and discarding the
SQL), then verify that a trivial column addition produces a one-line ALTER.

Until then, migrations must be hand-written — which `0001_two_factor_verified.sql` is, and says so
in its header.
