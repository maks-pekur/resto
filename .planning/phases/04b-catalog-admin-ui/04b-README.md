# Phase 4b: Catalog Admin UI — Placeholder

This phase is **not yet ready** for discuss-phase or plan-phase. It depends on Phase 4a (Catalog Schema + API) being complete.

## Why this phase exists separately

Phase 4 was split into 4a (backend schema + API) and 4b (admin UI) on 2026-05-30 because:

1. User requested iiko nomenclature schema redesign — foundational, doesn't belong in UI work
2. User said: "ui проектировать отдельно так как это очень друдоемкий процесс" — UI is labor-intensive, needs its own workstream
3. CTO HIGH-2 + Skeptic HIGH-4 (in `../04-catalog-admin/PERSONA-REVIEWS.md`) both recommended splitting scope for solo-founder throughput

## Expected workflow when Phase 4a is done

1. `/gsd:ui-phase 4b` — produce `04b-UI-SPEC.md` design contract (layouts, components, design tokens, copy)
2. `/gsd:discuss-phase 4b` — revisit UX decisions in light of finalized schema:
   - **D-08 (auto-save-draft vs explicit Save)** — Product Strategist HIGH-2 recommends auto-save-draft + explicit Publish (to confirm with user)
   - **D-10** — already revised to delayed-publish in 4a (see `04a-CONTEXT.md` D-4a-05); 4b only needs to wire the UX (5s undo toast)
   - **Hierarchical categories** — if 4a researcher recommends hierarchical Группы, D-01 (sidebar IA) and D-02 (items table) may need revision
   - **Badge copy** — `Paused` / `Стоп` vs `86'd` (Growth Marketer MED-1)
   - **"Preview as customer" link** to qr-menu (Growth Marketer HIGH-1)
3. `/gsd:plan-phase 4b` — researcher + planner produce execution plans

## Reference artifacts

- `../04-catalog-admin/04-CONTEXT.md` — original Phase 4 CONTEXT (pre-split, contains UI decisions that may need revision)
- `../04-catalog-admin/04-DISCUSSION-LOG.md` — original discussion log
- `../04-catalog-admin/PERSONA-REVIEWS.md` — 4-persona review (must read before discuss-phase 4b)
- `../04a-catalog-schema-api/04a-CONTEXT.md` — backend foundation
- `../04a-catalog-schema-api/04a-SCHEMA-MAP.md` — produced by 4a researcher
- `../04a-catalog-schema-api/04a-RESEARCH.md` — produced by 4a researcher
- `../04a-catalog-schema-api/04a-SUMMARY.md` — produced after 4a execution completes
