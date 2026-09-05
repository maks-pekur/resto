---
title: The rehearsal's restore drill compares zero to zero on every run
date: 2026-09-05
priority: low
status: pending
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
