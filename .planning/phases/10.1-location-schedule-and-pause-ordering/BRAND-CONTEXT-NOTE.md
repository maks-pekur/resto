---
kind: cross-phase-note
from: 10.2-brand-pinned-sessions
created: 2026-08-19
---

# Heads-up for 10.1 planning: brand context is changing in 10.2

Phase 10.2 (inserted 2026-08-19) fixes one brand per session, chosen at
sign-in, and **removes the brand switcher**. The location switcher stays and
becomes the only in-app context control.

## What this means for 10.1

- Do not design pause/schedule UI that depends on the brand switcher being
  present, or on an operator changing brand without a new sign-in.
- The location switcher is unaffected — 10.1 is location-grain work and
  should be safe as planned.
- If any 10.1 surface assumes a brand-wide view across brands, flag it now
  rather than after 10.2 lands.

## Unsettled, may affect route shape

Whether the URL segment (`/{brandSlug}`, decision D-03) or the session pin is
the brand authority is an open question in 10.2. If the segment is dropped,
the admin route tree changes shape. Prefer building 10.1 routes the same way
the existing ones are built so a later move is mechanical.

Full entry: `.planning/ROADMAP.md` → `### Phase 10.2: Brand-pinned sessions`.
