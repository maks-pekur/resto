---
title: URL scheme — one apex, admin on a path, tenant storefront on a subdomain
date: 2026-09-05
status: decided
supersedes: the three-apex scheme (PUBLIC_APEX_DOMAIN / ADMIN_APEX_DOMAIN / GUEST_APEX_DOMAIN)
---

# One apex domain, decided 2026-09-05 by the founder

| Hostname | Surface | Audience |
|---|---|---|
| `<apex>` | marketing landing | public |
| `<apex>/admin` | operator admin | staff |
| `<slug>.<apex>` | the restaurant's storefront | guests, from home |
| `<slug>.<apex>/qr` | the QR menu | guests, at a table |
| `api.<apex>` | API | nobody directly |

**The storefront ships in the first release** — the founder confirmed it is needed now, not later.
That settles the root collision: a person who types `<slug>.<apex>` is at home and wants the
storefront; a person who scans a sticker is at a table and gets `/qr`.

## Why this replaces the three-apex scheme

The three-apex scheme existed for exactly one reason: Cloudflare's free Universal SSL covers an
apex and its **first-level** subdomains only, so `<slug>.menu.<apex>` and `<slug>.admin.<apex>`
(both depth 2) had no certificate and would have failed at the TLS handshake. Three separate
registrable domains kept every hostname at depth 1.

This scheme reaches the same result with **one** domain, because the only per-tenant hostname is
`<slug>.<apex>` — depth 1, covered. Admin tenancy moves into the path, where certificate depth
does not apply at all.

Consequences: one zone instead of three, one set of DNS records, one renewal date, and
`ADMIN_APEX_DOMAIN`/`GUEST_APEX_DOMAIN` collapse back into `PUBLIC_APEX_DOMAIN`.

## Industry check (2026-09-05)

- **Shopify moved in this direction**: `<store>.myshopify.com/admin` → `admin.shopify.com/store/<store>`,
  stated reasons being faster loads and smoother switching between stores.
- Same shape at Stripe (`dashboard.stripe.com`), Vercel (`vercel.com/<team>`), Linear, Notion.
- Subdomain-per-tenant admin survives mainly at Slack and Atlassian, both legacy and SSO-driven.
- Guest-facing storefronts stay on subdomains everywhere: `<shop>.myshopify.com`, `<name>.square.site`.
- Published SaaS domain-structure guidance recommends the slug in the path specifically because
  **it makes TLS much easier** — the exact wall this project hit.

## What this costs

**New work, and the only part that is not deployment config:** admin tenancy moves from the host
to the path. Today `apps/admin/src/lib/admin-host.ts` derives the tenant from the hostname and five
call sites hard-navigate to `<slug>.<admin-apex>` (`main.tsx:141,154`, `pick-tenant.tsx:46`,
`login.tsx:129`, `onboarding/index.tsx:44,71`). Server-side, operator traffic resolves its tenant
from the host in production — `shouldAcceptTenantSlugHeader` (`tenant-context.middleware.ts:122`)
accepts a tenant header only in dev/test or on `/internal/v1/*` with the internal token. So this
touches the code path that decides whose data a request may reach, and deserves its own plan and
review rather than an in-flight edit.

**Properties that were being defended by the host, and what happens to them:**

- *Edge cache isolation* — **unaffected**. The tenant stays in the host for every guest surface, so
  cache keys still differ per tenant. Plan 07's Worker and its cross-tenant test survive unchanged.
  It never applied to admin anyway: the admin Worker caches nothing (`cf: {cacheTtl: 0}`, always
  `X-Resto-Cache: BYPASS`).
- *In-memory query cache across a tenant switch* — **preserved if the switch stays a full page
  load**. Phase 10.2 named a stale query cache as a threat (T-10.2-14-02, T-10.2-16-02) and closed
  it with a hard cross-origin navigation. A path switch must therefore keep a real reload, not a
  client-side route change.
- *Two tabs on two tenants* — **regressed**, narrowly. Cookies and `activeTenantId` are per-origin,
  not per-tab, so an operator holding several **separate companies** can have one tab silently
  follow another's switch. A chain is one tenant with locations inside, so the ordinary operator has
  exactly one tenant and never meets this. Accepted knowingly.

**Rework:** plans 08-10 are re-planned (they had not executed). Plan 07's Worker routing changes —
the cache logic survives, the route patterns and the admin Worker do not. Plan 06 is nearly
untouched: values change, files do not.

## Domains

`restos.pp.ua` is the apex. `qmenu.pp.ua` is no longer needed. `adminrestos.pp.ua` was registered
but **must not be activated** — the founder was told to leave it, preserving the registration slot.

## Not decided here

Whether the admin path-tenancy change lives inside phase 7.5 as a new plan, or as its own small
phase ahead of the remaining deploy plans. It is a prerequisite either way.
