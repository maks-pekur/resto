---
title: Restructure ROADMAP under AI-driven positioning (MVP-1 / MVP-2 / MVP-3)
date: 2026-05-27
priority: high
blocks: any new phase work beyond Phase 01 (which is done and is direction-agnostic)
---

# Restructure ROADMAP via `/gsd-new-milestone`

Concrete next action after the 2026-05-27 `/gsd-explore` AI-driven pivot session.

## What needs to happen

Run `/gsd-new-milestone` (or `/gsd-phase` operations if the workflow allows
in-place restructure) to:

1. **Update PROJECT.md**
   - Rewrite positioning under "AI-driven multi-tenant restaurant SaaS" frame
   - Add explicit MVP-1 / MVP-2 / MVP-3 milestone gates (currently only MVP-1
     is implied as 16 phases)
   - Capture the iiko = partner / not competitor stance
   - Capture the standalone-first constraint (carried forward)
   - Acknowledge the "platform first, AI later" rollout

2. **Restructure ROADMAP.md**
   - Reorder MVP-1 phases — **Customer Site BEFORE QR-menu** (today: Phase 5
     QR-menu, Phase 6 Customer Site — swap them)
   - Confirm Phases 1–16 (the current MVP-1 list) actually correspond to MVP-1
     under new positioning. Likely:
     - Phase 16 "Self-serve Onboarding" should be **split**: non-AI version
       closes MVP-1; AI constructor version is MVP-2 Phase D
     - Phase 12 "CRM" needs to surface "per-customer profile" as a first-class
       data primitive (foundation for MVP-2 guest chat memory)
   - **Add MVP-2 milestone** with rough phase decomposition (see
     `[[mvp2-ai-platform]]` seed)
   - **Add MVP-3 milestone** (see `[[mvp3-channels-iiko]]` seed)

3. **Audit REQUIREMENTS.md**
   - Identify REQ-IDs that survive AI positioning unchanged
   - Identify REQ-IDs that need rework (e.g. customer profile schema needs
     AI-relevant fields)
   - Identify net-new REQ-IDs to add for MVP-1 prep work that enables MVP-2
     (event taps, customer profile, conversation primitive)

4. **Decide on "AI hooks" in MVP-1**
   - Open question: do we add cheap stubs in MVP-1 (event taps, customer profile
     fields, thread storage shells) to avoid retrofit later? Or strictly
     YAGNI-ship MVP-1 and pay the retrofit cost at MVP-2?
   - Recommend deciding this BEFORE Phase 2 planning starts so the foundation is
     correct from the start.

## Inputs (read before running `/gsd-new-milestone`)

- `.planning/notes/ai-driven-pivot.md` — authoritative positioning + rollout
- `.planning/seeds/mvp2-ai-platform.md` — MVP-2 scope sketch
- `.planning/seeds/mvp3-channels-iiko.md` — MVP-3 scope sketch
- Current `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md` — what we're updating

## Persona reviews to request during milestone setup

- persona-cto (architecture coherence across MVP-1→2→3, infra debt minimization)
- persona-skeptic (is "platform first, AI later" actually fundable? Marketing
  AI without AI in MVP-1 is risky)
- persona-product-strategist (positioning vs market readiness)
- persona-investor (timeline + capital implications of stretching to MVP-3)

## Done when

- [ ] PROJECT.md reflects AI-driven positioning + 3-milestone structure
- [ ] ROADMAP.md has explicit MVP-1/2/3 sections with phases under each
- [ ] MVP-1 phase order updated (Site before QR-menu)
- [ ] REQUIREMENTS.md audit complete; new REQs added for MVP-2 enabling work
- [ ] Decision made on "AI hooks in MVP-1" (yes/no with rationale)
- [ ] Persona reviews captured in PERSONA-REVIEWS.md
- [ ] Commit references all updated planning files

## Blocking concerns

- **Phase 01 is done.** This restructure should NOT invalidate Phase 01 outputs
  (tenancy hardening is direction-agnostic foundational work).
- **Phase 02 should not start** before this restructure completes — its scope
  (admin shell) is unchanged in principle but the wider milestone picture should
  be set first.
