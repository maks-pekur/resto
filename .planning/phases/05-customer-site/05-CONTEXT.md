# Phase 5: Customer Site - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold `apps/website` (currently an empty `.gitkeep`) as the public customer-facing web storefront: render a tenant's published menu, let a guest pick delivery/pickup, enter an address (zone check is a stub until Phase 9), build a cart (promo field non-functional until Phase 11, checkout button disabled until Phase 8), provide contact info + order time, plus minimal content pages and subdomain / custom-domain tenant resolution.

Requirements: SITE-01..07, SITE-09, SITE-10 (per ROADMAP Phase 5 detail). SITE-08 (order confirmation) ships in Phase 8.

**Not this phase:** real payment (Phase 8), real delivery-zone validation (Phase 9 → MVP-2), functional promo codes (Phase 11 → MVP-2), full content/theme editor (Phase 15 → MVP-2), AI guest chat (MVP-2).
</domain>

<decisions>
## Implementation Decisions

### Surface strategy (website vs qr-menu)

- **D-01:** Website-first. The realistic first paying tenant is a delivery/takeaway business, so Phase 5 (website) precedes Phase 6 (qr-menu) as the roadmap already orders it.
- **D-02:** Two thin surface apps over a shared layer — `@resto/api-client` + `@resto/ui` + shared cart logic. "Only qr-menu / only website / both" is a per-tenant choice, NOT a different architecture. Build website fresh but factor reusable menu/cart pieces into the shared packages so qr-menu (Phase 6) consumes the same layer.
- **D-03:** SEO is the website's job (stable menu URLs, content pages, custom domain, per-city landing in Phase 15/MVP-2). qr-menu is `noindex` — table-session URLs (`?table=`) must never be indexed. (qr-menu SEO decision recorded here so Phase 6 inherits it.)

### Stack

- **D-04:** `apps/website` uses the LATEST Next.js (App Router + RSC), not pinned to admin's current `16.2.6`. Follow `apps/admin` patterns (`apiFetch`, env loading, RSC) but on the newer Next.
- **D-05:** Default locale is `en` for the website. This intentionally diverges from the `ru` default locked for admin/qr-menu in Phase 04b — the public storefront defaults to English. (Locale still resolves URL > cookie > Accept-Language as in qr-menu; only the fallback differs.)

### Shopfront browsing UX

- **D-06:** Single-page menu: sticky category navigation + a persistent cart (drawer/sidebar). Item opens in a modal for modifier selection (Wolt / Uber Eats pattern) — not a separate page per item.

### Checkout flow

- **D-07:** Delivery vs pickup is chosen up front (banner above the menu) because it affects pricing/availability. Cart drawer → a single checkout page (address when delivery + contact + order time + a disabled "pay" button). No multi-step stepper for MVP — one page.

### Content pages (SITE-10)

- **D-08:** Minimal — static / seeded About / Delivery / Contact / FAQ rendered from a simple per-tenant content field. A full operator content editor / WYSIWYG is Phase 15 (MVP-2), not this phase.

### Claude's Discretion

- Component breakdown, RSC vs client-island boundaries, data-fetching shape against `/v1/menu`, address-input widget, and exact shared-package extraction are implementation details for research/planning.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements

- `.planning/ROADMAP.md` — Phase 5 detail block (goal, success criteria) + the 2026-06-12 scope-rebalance note
- `.planning/REQUIREMENTS.md` — SITE-01..10 (note: the traceability table still labels SITE as "Phase 6" — stale since the 2026-05-27 reorder; ROADMAP Phase 5 is authoritative)
- `.planning/notes/ai-driven-pivot.md` — rationale for website-before-qr-menu surface ordering

### Codebase patterns

- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONVENTIONS.md` — module boundaries, app structure, naming
- `apps/admin/lib/api-server.ts` — `apiFetch` server-fetch pattern to mirror in website
- `apps/qr-menu/src/` (`api/client.ts`, `api/types.ts`, `components/MenuView.tsx`, `MenuItemCard.tsx`, `ItemDetail.tsx`, `i18n/`) — the existing guest menu render; the reference + the code to factor into the shared layer
- `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts` — the public `/v1/menu` contract the site reads
- `apps/api/src/contexts/tenancy/application/tenant-resolver.service.ts` + `tenant-and-brand-resolver.service.ts` + `infrastructure/tenant-drizzle.repository.ts` (`findByDomainHost`) — host → tenant resolution (subdomain + `tenant_domains`)
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/qr-menu/src/api/client.ts` + `types.ts`: working `/v1/menu` fetch + types — candidate to lift into `@resto/api-client`.
- `apps/qr-menu/src/components/*` (MenuView, MenuItemCard, ItemDetail): the menu-render + modifier-selection UI to generalize into `@resto/ui` so both surfaces share it.
- `apps/admin` Next.js 15 RSC app: stack reference for `apps/website` (App Router layout, `apiFetch`, env schema, typed routes).
- `packages/api-client` (generated from `docs/api/openapi.yaml`) + `packages/ui` (shadcn): shared packages the website consumes.
- `packages/domain/src/brand-theme.ts`: per-tenant theming source.

### Established Patterns

- Public menu reads must stay fast on cold Redis (degraded mode acceptable, must not crash) — a project-wide performance constraint that applies to the site's menu fetch.
- Locale resolution: URL > cookie > Accept-Language (from qr-menu) — reuse, but website fallback = `en` (D-05).
- Apps import only from `@resto/*` packages; never app-to-app — so website cannot import from qr-menu directly; shared code must move into a package (reinforces D-02).

### Integration Points

- `/v1/menu` (public-menu.controller) — primary read.
- Host → tenant resolution (tenancy resolvers) — website resolves tenant by subdomain / custom domain; needs a dev-local resolution strategy (subdomains are awkward locally — planner to decide query-param/header fallback for dev).
- Cart total breakdown wires to Phase 7 (ordering) / Phase 8 (payments) / Phase 11 (promo) later; Phase 5 shows subtotal + (stub) delivery only.
  </code_context>

<specifics>
## Specific Ideas

- Shopfront feel: Wolt / Uber Eats style (sticky category nav, persistent cart, item modal) — D-06.
- qr-menu must be `noindex`; website carries all SEO — D-03.
  </specifics>

<deferred>
## Deferred Ideas

- Full operator content/theme editor (WYSIWYG, per-city SEO landing, sitemap) → Phase 15 (MVP-2).
- Functional promo code field → Phase 11 (MVP-2); Phase 5 renders it non-functional.
- Real delivery-zone validation (geocode + polygon) → Phase 9 (MVP-2); Phase 5 uses an inline stub.
- AI guest chat widget on the website → MVP-2 Phase C.
- Optional guest account creation depth (SITE-06 says "optional account creation") — keep minimal in Phase 5; richer customer accounts relate to CRM (Phase 12, MVP-2).

### Reviewed Todos (not folded)

- `restructure-roadmap-ai-driven.md` ("Restructure ROADMAP under AI-driven positioning") — matched on generic keywords only; the roadmap restructure was already executed in the 2026-06-12 rebalance. Not a Phase 5 feature. Not folded.
  </deferred>

---

_Phase: 5-customer-site_
_Context gathered: 2026-06-12_
