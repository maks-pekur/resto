---
title: The rehearsal's restore drill compares zero to zero on every run
date: 2026-09-05
priority: low
status: done
closed: 2026-09-06
---

# `PASSED tenants=0 orders=0 menu_items=0 tenant_domains=0` reads as proof and is not

`local-prod-rehearsal.sh` migrates a fresh database and never seeds it, so
`restore-drill.sh` compares an all-zero manifest against an all-zero restore. The line it
prints is indistinguishable from a meaningful pass.

**This is not a defect in the drill.** Plan 06 verified the counting mechanism separately
against a real dataset (2 tenants / 7 orders / 27 menu_items / 3 tenant_domains) with both a
passing case and a deliberately-tampered-manifest failing case, and `07.5-06-SUMMARY.md:204`
records the zero-count caveat explicitly rather than letting it pass as evidence. The honesty
is already there.

What is missing is that the *standing* check — the one that runs on every rehearsal, forever —
cannot fail. The one-time proof decays: the person who runs this in six months sees a green
`PASSED` with four zeros and reasonably reads it as "restore verified".

## Fix

Seed a handful of rows into the rehearsal database before `backup-nightly.sh` runs — two
tenants and a few orders is enough — so the manifest carries non-zero counts and the
comparison discriminates on every run. `seed-demo` refuses outside `NODE_ENV=development`
(`tools/scripts/seed/commands/seed-demo.ts:991`) and the rehearsal is deliberately
`NODE_ENV=production`, so this wants a handful of direct INSERTs in the script rather than the
seed CLI.

Plan 10's production drill runs against real data and does not have this problem; this is only
about the local rehearsal's own repeatable value.

## Related

- The phase's own standing rule, which this is an instance of: a verifier that cannot fail is
  not a verifier. See [[universal-ssl-does-not-cover-our-hostnames]] for the defect that rule
  was written after.

## Closed 2026-09-06 (07.5-14 Task 2)

`local-prod-rehearsal.sh` now inserts two tenants, two locations, two tenant_domains rows, two
menu_categories, three menu_items and three orders directly via `psql` (as the Postgres admin
role, after `provision-roles-ci.ts` and before `backup-nightly.sh`), and asserts all four
manifest-tracked counts are non-zero before calling `backup-nightly.sh`, failing loudly
otherwise. Observed counts on both sides of a real restore, from a live rehearsal run:

- Seeded (pre-backup): `tenants=2 orders=3 menu_items=3 tenant_domains=2`
- `backup-nightly.sh` manifest: `{"tenants":2,"orders":3,"menu_items":3,"tenant_domains":2}`
- `restore-drill.sh: PASSED elapsed=7s tenants=2 orders=3 menu_items=3 tenant_domains=2 observed_rto=7s`

The drill was also watched failing: the same dump's manifest was copied and hand-tampered
(`tenants: 2 -> 3`), and `restore-drill.sh` run again against the tampered copy reported
`restore-drill.sh: FAILED — tenants expected=3 actual(resto_app)=2`, then correctly exited
non-zero. A green `PASSED` now means something.
