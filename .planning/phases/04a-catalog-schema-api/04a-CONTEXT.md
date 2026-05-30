# Phase 4a: Catalog Schema + API - Context

**Gathered:** 2026-05-30 (derived from `../04-catalog-admin/04-CONTEXT.md` after split into 4a/4b)
**Status:** Ready for planning
**Split reason:** Original Phase 4 scope was nearly doubled by user's instruction to redesign catalog schema under iiko nomenclature model. CTO HIGH-2 + Skeptic HIGH-4 + user feedback "ui проектировать отдельно так как это очень друдоемкий процесс" → split into 4a (backend foundation) + 4b (admin UI).

<domain>
## Phase Boundary

**Foundational catalog domain redesign aligned with iiko nomenclature model.** Backend-only phase: schema migration + DTO updates + new entities + public `/v1/menu` DTO extension + delayed-publish revert mechanism. **No admin UI in this phase** — that's Phase 4b.

After 4a ships, the database + API contracts are final. Phase 4b builds admin UX on top. Phase 5 (`apps/website`) and Phase 6 (`apps/qr-menu`) consume `/v1/menu` with the new fields without further schema work.

**Out of scope:** admin UI (→ 4b), customer site rendering (→ 5), QR-menu polish (→ 6).

</domain>

<schema_redesign_direction>

## Schema Redesign — iiko Alignment (FOUNDATIONAL — must finalize before 4b discuss-phase)

**User intent 2026-05-30:** "полностью пересмотреть номенклатурные группы и поля для всех items" под iiko nomenclature model. Foundational work — все остальные decisions в Phase 4b накладываются СВЕРХУ финализированной schema.

**Researcher's mandate (BEFORE producing RESEARCH.md):**

1. **Read iiko nomenclature docs** (canonical: `https://ru.iiko.help/articles/#!api-documentations/elementy-nomenklatury`). Since SPA closes content from non-browser fetchers, use open-source SDKs as proxy-source for actual field names:
   - `https://github.com/salesduck/iiko-cloud-api` — most complete; describes methods + request/response bodies
   - `https://github.com/kebrick/pyiikocloudapi` — Python client with typed models
   - `https://github.com/zmiulan/iiko-sdk` — TypeScript/JS SDK
   - `https://github.com/wollzy/iiko-go` — Go package
   - `https://www.postman.com/avatariya/iiko-cloud-api/overview` — Postman collection
2. **Build mandatory deliverable `04a-SCHEMA-MAP.md`** — table format:
   | iiko entity (Russian + English) | iiko fields (required vs optional, types) | Current RestOS equivalent | Proposed RestOS entity | Migration impact | Downstream consumers affected |
3. **Resolve open questions in RESEARCH.md:**
   - Hierarchical Группы (parent_id tree) vs flat categories? — iiko `Группа` is a tree. Researcher must recommend with downstream-cost analysis (admin IA, customer site rendering, partner integration).
   - `Размер` (size) as standalone entity vs embedded variant in item? — Trade-off: cleaner re-use across items vs simpler MVP UI. Researcher must trace size-ripple into Phase 7 (cart line, order line) — sizes affect every price-bearing entity downstream.
   - `Модификатор` vs `Группа модификаторов` — current `UpsertModifierInputSchema` has min/max selectable suggesting it's actually modeling a ModifierGroup. iiko separates clearly. Researcher must split into 2 entities and remap current usage.
   - ТТК (технико-технологическая карта) — full entity with ingredients-list + cost-breakdown vs only structured nutritional fields on item? MVP-1 chose structured БЖУ as layer 1; full ТТК deferred to v2. Researcher confirms no schema lock-in that prevents v2 ТТК.
   - Стоп-лист shape — table-with-rows (stop_list table) vs nullable column (`stopped_at` on items) vs runtime Redis flag? Researcher analyzes audit-trail + multi-replica consistency.
   - Стоп-лист с reason — iiko allows reason string. MVP-1 чёт plain on/off (D-13). Researcher confirms schema permits reason field added later without migration.
4. **Researcher recommends target schema** in RESEARCH.md (Drizzle table sketches) + rationale per entity. Planner then breaks into migration steps + service refactors + DTO updates + public DTO updates.

**Important:** RestOS schema column names CAN stay in English (`menu_item`, `category`, `modifier_group`) as long as entity shapes and relationships match iiko. UI-copy in admin/website can use Russian terms (Группа, Блюдо, Модификатор) per `<feedback-iiko-catalog-model>` memory.

**Migration risk:** existing catalog tables have dev-seed data but zero paying customers. Breaking changes acceptable. Researcher must inventory downstream dependencies:

- `apps/qr-menu/` mocks reading `/v1/menu`
- `packages/api-client/` generated DTO (`openapi-typescript` from `docs/api/openapi.yaml`)
- `apps/api/test/e2e/tenant-isolation.spec.ts` (Phase 01 TEN-08 cross-tenant net)
- ESLint composite-FK audit rule (verify name + location)
- Phase 03 audit pipeline event-handler maps (`ACTION_TARGET_KIND` etc.)

</schema_redesign_direction>

<decisions>
## Implementation Decisions (4a-specific — backend only)

### Schema additions (mandatory — convergence of 3+ personas)

- **D-4a-01: Add `source` provenance enum on items** (Product Strategist HIGH-3 + Growth Marketer HIGH-2). Values: `manual / ai_generated / imported_iiko / imported_csv`. Prevents tenant-data retrofit in MVP-2 (AI onboarding) and MVP-3 (iiko sync).
- **D-4a-02: Replace `imageS3Key TEXT` with `photos JSONB[]` (or `item_photos` table)** (Product Strategist HIGH-1 + Growth Marketer MED-4 + Skeptic MED). UI ships single-photo in MVP-1 (4b), but schema is forward-compatible. Each photo entry: `{ s3Key, sortOrder, alt? }`.
- **D-4a-03: Structured БЖУ as 4 nullable fields per 100g** + estimated flag (D-06 from 04-CONTEXT confirmed; Product Strategist MED add `estimated: boolean` to handle AI-populated values). Schema: `proteins decimal(5,2) nullable`, `fats decimal(5,2) nullable`, `carbs decimal(5,2) nullable`, `kcal smallint nullable`, `nutrition_estimated boolean default false`.
- **D-4a-04: Slug hygiene** (Growth Marketer HIGH-4) — Zod schema: `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`, auto-transliterate Cyrillic via `cyrillic-to-translit-js` or equivalent. Add `item_slug_aliases` table with composite FK `(item_id, tenant_id, alias)` — every slug change creates an alias row; public `/v1/menu` route resolves both current + alias for SEO.

### Publish flow (revised by personas)

- **D-4a-05: Delayed-publish revert mechanism** (CTO HIGH-1 + Skeptic HIGH-2 convergence — supersedes original D-10). Publish click does NOT immediately write snapshot + emit outbox event. Instead:
  1. Set in-memory pending-publish state with 5-second timer
  2. If user clicks Undo within 5s → timer cancelled, nothing written
  3. After 5s elapses → write snapshot, bump menu_version, emit `catalog.menu_published.v1` (or `catalog.menu_first_published.v1` for first publish per Growth Marketer HIGH-3) via outbox, invalidate Redis cache
  - No compensating outbox events, no snapshot rollback, honest with the outbox contract.
- **D-4a-06: First-publish vs republish event types** (Growth Marketer HIGH-3). Distinct contracts:
  - `catalog.menu_first_published.v1` — tenant's very first publish (activation signal for Phase 13/14 funnel)
  - `catalog.menu_republished.v1` — every subsequent publish
- **D-4a-07: Redis menu-version with nextval fallback** (CAT-10). When Redis is unavailable, derive menu_version from Postgres sequence `menu_versions_seq` via `nextval()`. Resolves cache-key collision on concurrent publish during Redis outage.

### API surface

- **D-4a-08: Regenerate `docs/api/openapi.yaml`** (Growth Marketer MED-2) as Phase 4a deliverable + add CI drift-check (`pnpm openapi:check` exits non-zero if generated yaml differs from committed). Enables partner-readiness for MVP-3.
- **D-4a-09: Public `/v1/menu` DTO** inherits all new fields automatically (it's read from the same Drizzle schema via `get-published-menu.service.ts`). No special work required beyond ensuring the published-menu serialization includes new fields.
- **D-4a-10: Stop-list shape** — researcher recommends in RESEARCH.md (table vs column). MVP-1 chose runtime-state (separate from draft/published) at the UX level (D-11); the technical shape is a backend choice. Whichever shape — stop-list mutations emit `catalog.item_stopped.v1` / `catalog.item_unstopped.v1` envelopes via outbox.

### Out-of-scope decisions (deferred to 4b CONTEXT after schema is final)

- D-01..D-04 (admin IA, list view, default filter, editor surface) → revisited in 4b discuss-phase
- D-05 (multilang UX) → 4b
- D-06 (БЖУ UI layout) → 4b (schema field decisions live in 4a; form layout in 4b)
- D-07 (photo upload UX) → 4b
- D-08 (auto-save-draft vs explicit Save) → 4b discuss-phase (Product Strategist HIGH-2 recommends auto-save-draft + explicit Publish — to be confirmed)
- D-09 (status badges + sticky publish bar) → 4b
- D-11..D-13 (stop-list UX placement + reset) → 4b
- "Preview as customer" link (Growth Marketer HIGH-1) → 4b
- Badge copy `Paused` vs `86'd` (Growth Marketer MED-1) → 4b

</decisions>

<canonical_refs>

## Canonical References

### iiko domain model (foundational — researcher reads FIRST)

- `https://ru.iiko.help/articles/#!api-documentations/elementy-nomenklatury` — iiko "Элементы номенклатуры" official docs
- 5 open-source iiko SDKs (above) as proxy field-source

### Project artifacts

- `.planning/REQUIREMENTS.md` §"Catalog Admin (CAT)" — original CAT-01..CAT-10 (now distributed across 4a + 4b)
- `.planning/ROADMAP.md` §"Phase 4a: Catalog Schema + API" — updated 2026-05-30
- `.planning/PROJECT.md` §"Catalog (partial)" — Validated foundations
- `.planning/phases/04-catalog-admin/04-CONTEXT.md` — original Phase 4 CONTEXT (pre-split)
- `.planning/phases/04-catalog-admin/04-DISCUSSION-LOG.md` — original discussion log
- **`.planning/phases/04-catalog-admin/PERSONA-REVIEWS.md`** — 4-persona review with all HIGH findings + unresolved conflicts (must read)
- `.planning/phases/04-catalog-admin/PERSONA-CTO.md`, `PERSONA-SKEPTIC.md`, `PERSONA-PRODUCT-STRATEGIST.md`, `PERSONA-GROWTH-MARKETER.md` — full per-persona reports

### Codebase entry points (current state)

- `apps/api/src/contexts/catalog/` — existing bounded context (domain, application services, Drizzle repository, Redis cache adapter, S3 image-URL adapter)
- `apps/api/src/contexts/catalog/application/dto.ts` — current `UpsertCategoryInputSchema` / `UpsertItemInputSchema` / `UpsertModifierInputSchema`
- `apps/api/src/contexts/catalog/application/publish-menu.service.ts` — current publish (7-line version bump — needs delayed-publish refactor)
- `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` — current admin endpoints
- `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts` — public `/v1/menu`
- `packages/db/src/schema/menu.ts` — current catalog tables (composite FK + RLS preserved per `tenant_id` column on every child)
- `packages/events/src/contracts/` — outbox event contracts (need to add `catalog.menu_first_published.v1`, `catalog.menu_republished.v1`, `catalog.item_stopped.v1`, `catalog.item_unstopped.v1`)
- `packages/api-client/src/generated/api.ts` — auto-generated DTO from `docs/api/openapi.yaml` (downstream consumer that breaks if schema changes)
- `apps/qr-menu/` — currently mocks or reads `/v1/menu` (downstream consumer)
- `apps/api/test/e2e/tenant-isolation.spec.ts` — Phase 01 TEN-08 cross-tenant net (must continue to pass after migration)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Catalog bounded context exists** — `domain/` (ports + errors), `application/` (services + DTO), `infrastructure/` (Drizzle repo + Redis cache + S3 adapter), `interfaces/http/` (controllers + error-mapping) all in place
- **`get-published-menu.service.ts`** — serializes published menu to public DTO; new schema fields propagate here automatically once schema is updated
- **`packages/domain/src/{LocalizedText,Slug,MoneyAmount,CurrencyValue}`** — value-objects used in DTOs; will reuse for new entities (sizes, modifier groups)
- **`packages/events/src/envelope.ts:buildEnvelope`** — outbox envelope builder; new event contracts plug in directly
- **`packages/db/src/client.ts:ScopedTx`** — auto-injects tenantId on INSERT, appends `eq(table.tenantId, ...)` on SELECT/UPDATE; all new entities use this; researcher confirms composite FK on every new child table

### Established Patterns to Preserve

- DDD + Hexagonal split (no new bounded context — extend existing `catalog/`)
- Zod DTO source of truth + `createZodDto` for NestJS HTTP DTO + `z.infer` for TS types
- ScopedTx + RLS double-enforcement (ADR-0020 I-1)
- `db.withTenantId` for backend mutations outside HTTP middleware (ADR-0020 I-6)
- Composite FK `(parent_id, tenant_id)` on every tenant-scoped child table (ADR-0020 I-2)
- `buildEnvelope` for outbox emission, never direct EventEnvelope literal (ADR-0020 I-4)
- No hard deletes (`resto_app` has no DELETE privilege except documented bypass paths)

### Integration Points (downstream consequence map)

- **Customer surfaces** (`apps/qr-menu`, `apps/website`) — read `/v1/menu`; new fields show up automatically
- **Audit context** — new events (`catalog.menu_first_published.v1`, `catalog.menu_republished.v1`, `catalog.item_stopped.v1`, `catalog.item_unstopped.v1`) need `ACTION_TARGET_KIND` map entries in `record-audit.service.ts`
- **Outbox + NATS** — events emit via `appendToOutbox` within `db.withTenantId` (ADR-0020 I-6); no `runInTenantContext` outside HTTP middleware
- **Better Auth org plugin** — `PermissionsGuard` enforces `staff:menu:write` / `staff:menu:publish` permissions; researcher confirms tokens exist in `SYSTEM_ROLES` (Phase 03 wired drift-guard)
- **Phase 7 (Ordering, future)** — cart line + order line both reference catalog item + size + modifier choices. Schema choices in 4a directly affect cart/order schema. Researcher MUST annotate sizes/variants/modifier shape with "Phase 7 ripple: X" notes.
- **MVP-3 iiko integration (future)** — schema alignment makes integration adapter shallow. Researcher annotates SCHEMA-MAP with "iiko adapter complexity: shallow/medium/deep" per entity.

</code_context>

<specifics>
## Specific Ideas

- iiko `Группа` (group) — currently maps to RestOS `category`. iiko supports nested groups; researcher recommends if MVP-1 needs tree or flat is acceptable.
- iiko `Размер` (size) — semi-independent entity, not always tied to one product. Researcher must trace use cases and recommend embedded variant (simpler) vs standalone entity (closer to iiko).
- iiko ТТК — full recipe entity with ingredients + cost. MVP-1 ships only structured nutrition (БЖУ + kcal) on item. Researcher confirms no schema lock-in that prevents adding ТТК in v2.
- Photo schema as `JSONB[]` — Postgres array of structured objects: `{ s3Key: string, sortOrder: int, alt?: string }`. MVP-1 always has length 1; v2 multi-photo just inserts more rows in the array.

</specifics>

<deferred>
## Deferred Ideas (to 4b or later)

### To Phase 4b (UI work)

- Sidebar IA + items table view + default filter (D-01..D-03)
- Item editor UX (D-04..D-07)
- Draft/Publish UX layer (D-08, D-09 — D-10 backend revised in 4a as D-4a-05)
- Stop-list UX placement + reset behavior (D-11..D-13)
- "Preview as customer" link (Growth Marketer HIGH-1)
- Badge copy translation `86'd` → `Paused` / `Стоп` (Growth Marketer MED-1)
- Stale-stop-list warning at >24h (Skeptic MED + Product Strategist MED)
- Sticky publish bar copy + auto-expand >5 changes

### To v2

- Multi-photo gallery UI (schema is forward-compatible in 4a)
- Multilingual editor tabs
- Hierarchical categories UI (if researcher recommends hierarchical schema, the IA needs to support it in 4b; v2 UI for power-users)
- Bulk operations
- Auto-reset stop-list at tenant-local 03:00
- Stop-list with reason
- Confirm modal before publish (toggle per tenant)
- Full ТТК (recipe + ingredients + cost breakdown)

### Reviewed Todos (not folded)

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 4a-Catalog Schema + API_
_Context gathered: 2026-05-30 (split from Phase 4 on this date)_
