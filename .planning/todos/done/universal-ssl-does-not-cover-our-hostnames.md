---
title: Cloudflare's free certificate does not cover the guest menu or per-tenant admin hostnames
date: 2026-09-04
priority: high
status: resolved
resolved: 2026-09-05
blocks: phase 07.5
---

# Universal SSL stops one level short of the hostname scheme this product is built on

Found 2026-09-04 while answering a question about registering a domain. Neither
`07.5-RESEARCH.md` nor any of plans 06-10 mentions certificate coverage depth — the only TLS
discussion is the Cloudflare↔origin hop (Origin CA), which is a different problem. This is
independent of which domain is chosen, free or paid.

## The rule

Cloudflare's Universal SSL, in a full setup, covers **the apex and first-level subdomains only**:

> "coverage is limited to the root domain (for example, `example.com`) and first-level subdomains
> (for example, `www.example.com` or `blog.example.com`)" … "Deeper subdomains — such as
> `dev.www.example.com` or `app3.dev.www.example.com` — are **not** covered"
> — developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/

Wildcard DNS records *can* be proxied on every plan including Free, so routing is not the issue.
The certificate is.

## What our four surfaces need

| Surface | Hostname | Depth below apex | Universal SSL |
|---|---|---|---|
| API | `api.<apex>` | 1 | covered |
| Website | `<apex>`, `<slug>.<apex>` | 0, 1 | covered |
| Admin (entry) | `admin.<apex>` | 1 | covered |
| **Admin (per tenant)** | `<slug>.admin.<apex>` | **2** | **NOT covered** |
| **Guest menu** | `<slug>.menu.<apex>` | **2** | **NOT covered** |

Both uncovered names are load-bearing and both are already committed in code, not merely planned:

- `GUEST_HOST_LABEL = 'menu'` in `guest-menu-url.service.ts:7` and `tenant-resolver.service.ts:9`;
  the guest URL is built as `${slug}.${GUEST_HOST_LABEL}.${apex}` and printed onto every QR sticker.
- `parseTenantSlugFromHost` / `adminUrlForTenant` in `apps/admin/src/lib/admin-host.ts` require
  exactly `<slug>.<ADMIN_HOST_SUFFIX>` where the suffix is `admin.<apex>` (D-21: "the tenant lives
  in the host, not a path segment"; D-24 makes the match label-by-label).
- `env.schema.ts` validates `ADMIN_WEB_ORIGIN_WILDCARD` as `https://*.admin.<apex>` and
  `CORS_ALLOWED_ORIGINS` as `https://*.menu.<apex>`.

Symptom if shipped unresolved: the browser refuses the connection at the TLS handshake. The guest
menu is unreachable — not slow, not broken-looking, **unreachable** — and so is every operator's
own admin subdomain. `/healthz`, `api.<apex>` and the marketing site would all be green.

## Options

1. **Advanced Certificate Manager — $10/month per zone.** Purchasable on any plan including Free.
   Enable Total TLS for automatic coverage of all proxied subdomains. Changes nothing in code.
   Raises the phase's recurring cost from ~€6.80/mo to ~€16/mo — it more than doubles the bill the
   founder approved, so it is a decision, not a line item.
2. **Flatten the guest menu to one level** — `<slug>-menu.<apex>`. Touches two constants and the
   resolver's shape test. Cheap.
3. **Flatten admin to one level** — `<slug>-admin.<apex>`. **Do not do this without redesigning
   the cookie scope.** `AUTH_COOKIE_DOMAIN` is `.admin.<apex>` precisely so the operator session
   cookie is not delivered to the guest menu and public site (D-21/D-24, and `env.schema.ts:137-140`
   says so explicitly). Flattening forces the scope to the bare apex, which hands the operator
   cookie to every guest surface. That is a security regression, not a rename.
4. **Upload a custom certificate** with the deeper names as SANs. Possible on any plan, but it is
   a renewal obligation the phase deliberately avoided when it chose a 15-year Origin CA cert
   over ACME.

## Recommendation

Option 1 or option 2, and the choice is the founder's because it is a cost question. Option 2 is
free but makes guest URLs slightly uglier and touches committed code; option 1 costs $10/mo and
touches nothing. Note that options 2 and 3 are not symmetric — the guest menu can be flattened
safely, admin cannot.

Whichever is chosen, it must land in phase 7.5 before go-live, and `verify-prod-origin.sh
--stage full` should assert a successful TLS handshake against a depth-2 hostname so this cannot
regress silently.

## Related

- [[tenant-primary-domain-ignores-configured-apex]] — the other place the hostname scheme is
  hardcoded rather than configured

---

## Resolution (2026-09-05)

**Option 5, not listed above: three apex domains, one per surface family.** The founder
registered three domains, each delegated to its own free Cloudflare zone, so every hostname
sits at depth <= 1 of its own apex and free Universal SSL covers all of them. Cost: three
one-time registrations, no recurring Cloudflare charge — against $10/mo per zone for
Advanced Certificate Manager (option 1) or an uglier guest URL plus a resolver change
(option 2, which would still have left admin unsolved).

| Parameter | Serves | Hostnames | Depth |
|---|---|---|---|
| `PUBLIC_APEX_DOMAIN` | website + API | `<apex>`, `*.<apex>`, `api.<apex>` | 0, 1 |
| `ADMIN_APEX_DOMAIN` | operator | `<admin-apex>`, `*.<admin-apex>` | 0, 1 |
| `GUEST_APEX_DOMAIN` | QR menu | `*.<guest-apex>` | 1 |

Landed across the phase-7.5 plans:

- **Plan 06** — three apex parameters gathered and recorded as GitHub variables; env
  templates, `AUTH_COOKIE_DOMAIN`, `ADMIN_WEB_*` and `CORS_ALLOWED_ORIGINS` reshaped;
  Origin CA scoped to the main zone only (the admin and guest Workers *are* the origin);
  new `infra/scripts/assert-hostname-depth.sh` guard.
- **Plan 07** — `GUEST_APEX_DOMAIN` added to the schema and the prod guardrails;
  `GUEST_HOST_LABEL` deleted from both files; `guestSlugLabel`'s two branches now both test
  the remainder against a configured apex, which is tighter than the shape test it replaces.
  Admin moved with configuration alone — all three validators accept a bare apex as the
  suffix.
- **Plan 08** — DNS across three zones; a live TLS handshake per zone in
  `verify-prod-origin.sh --stage full`, failing on certificate error specifically and
  printing the SAN list, so this cannot regress silently.
- **Plan 09** — build args and Worker routes per zone; the depth guard in CI.
- **Plan 10** — tenant provisioning writes the guest apex; the data audit's off-apex
  category checks `kind='subdomain'` rows against it.

Cookie isolation improved rather than degraded: `AUTH_COOKIE_DOMAIN=.<admin-apex>` is now a
different registrable domain from the guest and website surfaces. One consequence recorded
for [[guest-sign-in-with-google]]: a guest cookie issued on the guest apex is not shared
with the website on the main apex.
