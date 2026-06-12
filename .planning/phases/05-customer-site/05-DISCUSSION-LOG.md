# Phase 5: Customer Site - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 5-customer-site
**Areas discussed:** Surface strategy (website vs qr-menu), SEO ownership, Stack/locale, Shopfront UX, Checkout flow, Content pages

---

## Surface strategy (website vs qr-menu) + SEO

User challenged the "website is primary" assumption: "а точно для qr-menu не нужно seo? ... что если ресторатору нужно будет только qr-menu?"

Resolution:

- qr-menu does NOT need SEO — reached by physical QR scan, `?table=` URLs should be `noindex`. SEO belongs to the website.
- "Only qr-menu" is a real tenant model (dine-in only) → neither surface is globally primary; it's a per-tenant choice.
- Architecture: shared `@resto/api-client` + `@resto/ui` + cart logic; two thin surface apps over it.

| Option                                | Description                                                                      | Selected |
| ------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Delivery/pickup first (website-first) | First paying tenant is delivery/takeaway; keep Phase 5 website → Phase 6 qr-menu | ✓        |
| Dine-in first (qr-menu-first)         | Reorder: qr-menu first (simpler — no address/zones), faster to first paid order  |          |
| Both equal                            | Build shared layer first, then both thin apps                                    |          |

**User's choice:** Website-first (delivery/pickup is the realistic first paying tenant).
**Notes:** qr-menu-first was surfaced as the leaner path to a first paid order (no delivery/address/zone complexity), but the user's first-tenant bet is delivery/takeaway, so the roadmap order stands.

---

## Stack & default locale

Freeform directive: "и nextjs бери latest дефолтная локаль en"

**User's choice:** `apps/website` on the LATEST Next.js (App Router + RSC); default locale `en`.
**Notes:** Default locale `en` intentionally diverges from the `ru` default locked for admin/qr-menu in Phase 04b.

---

## Shopfront UX / Checkout / Content pages

Defaults proposed (food-ordering standard) and accepted wholesale.

| Option              | Description                                                                                                            | Selected |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| Accept all defaults | Storefront (sticky cat-nav + cart drawer + item modal), checkout (mode upfront + single page), content (static/seeded) | ✓        |
| Adjust shopfront    | Discuss layout further                                                                                                 |          |
| Adjust checkout     | Discuss checkout shape further                                                                                         |          |
| Adjust content      | Discuss content pages further                                                                                          |          |

**User's choice:** Accept all defaults.
**Notes:** Shopfront = Wolt/Uber Eats pattern; checkout = delivery/pickup chosen up front + one checkout page (no stepper); content = static/seeded About/Delivery/Contact/FAQ (full editor deferred to Phase 15/MVP-2).

## Claude's Discretion

- Component breakdown, RSC vs client-island boundaries, data-fetching shape, address widget, exact shared-package extraction — left to research/planning.

## Deferred Ideas

- Full content/theme editor → Phase 15 (MVP-2)
- Functional promo codes → Phase 11 (MVP-2)
- Real delivery-zone validation → Phase 9 (MVP-2)
- AI guest chat widget → MVP-2 Phase C
- Richer guest accounts → CRM (Phase 12, MVP-2)
