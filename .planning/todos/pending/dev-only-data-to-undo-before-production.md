---
title: Dev-only rows and env values put in by hand — what must be undone before a real deploy
date: 2026-09-04
priority: high
status: pending
---

# Hand-made dev state that must not reach production

Written while wiring the phone to a VS Code tunnel on 2026-09-04. Some of it is env, which the
boot guardrail now refuses outside development; some of it is **data**, which no guardrail can
see. This file is the list for the data half, so nothing is remembered only by whoever typed it.

## The env half — already fails loudly, no action needed

`assertProdGuardrails` now rejects, in staging and production, any of
`MEDIA_PUBLIC_BASE_URL`, `S3_ENDPOINT`, `ADMIN_WEB_URL`, `WEBSITE_PUBLIC_URL`,
`BETTER_AUTH_BASE_URL`, `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL` whose host is
loopback, `*.devtunnels.ms`, `*.nip.io`, `*.lvh.me`, `*.trycloudflare.com` or an ngrok domain —
and a `PUBLIC_APEX_DOMAIN` of the same shape, because that one is printed onto every QR sticker.
The previous check only compared against exact documented dev defaults, so a tunnel URL — nobody's
default — went straight through.

## The data half — MUST be undone by hand

### 1. A tunnel registered as a primary *verified custom domain* (the dangerous one)

```sql
SELECT t.slug, d.domain, d.kind, d.is_primary, d.verified_at
FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id
WHERE d.domain ~ '(devtunnels\.ms|nip\.io|lvh\.me|localhost|ngrok)';
```

`GuestMenuUrlService` prefers a primary verified custom domain over the apex, so this row decides
what every QR sticker says. Left in place against a real database it points guests at a tunnel
that no longer exists — and it looks legitimate, because "verified custom domain" is a production
concept, not a dev flag. Delete the row and restore the previous primary:

```sql
DELETE FROM tenant_domains WHERE domain = '<the tunnel host>';
UPDATE tenant_domains SET is_primary = true WHERE domain = '<slug>.menu.<apex>';
```

Note the partial unique index that allows only one primary per tenant: clear the old flag before
inserting, or drop the new row before restoring — the insert fails silently under
`ON CONFLICT DO NOTHING` otherwise.

### 2. Brand media rewritten by hand

`tenants.theme` holds media **keys** now (that part is intended and permanent). But during the
switch the rows were rewritten with `REPLACE(theme::text, '<old host>', ...)`. Confirm no absolute
URL survived anywhere:

```sql
SELECT slug, theme FROM tenants WHERE theme::text LIKE '%http%';
```

Anything returned is still frozen to whatever host it was written with. See
[[tenant-theme-stores-absolute-media-urls]] for the migration that finishes this.

### 3. Demo content set by hand that `seed-demo` does not produce

None of this is harmful in production — it simply will not exist there, and its absence looks
like a broken feature rather than empty data. It is listed because the same gaps will hit the
next person who runs the demo:

- `tenants.content_locales` was `{ru}` while the content is `ru`/`en`/`uk`, so the guest language
  switcher hid itself (it needs two locales). Set by hand to `{ru,en,uk}`.
- No table zones and no tables at all, so a QR code could not be scanned and no order could be
  placed. Created by hand: one zone, six tables.
- The second demo tenant (`burger`) has no locations — `seed-demo` fails partway with
  `auth.tenant_mismatch` when it switches tenants.

**The real fix is in `seed-demo` itself**, not in these rows: a demo that cannot take an order is
not a demo. Three separate symptoms, one cause.

## Related

- `apps/api/src/config/prod-guardrails.ts` — the env half, with tests in
  `apps/api/test/unit/prod-guardrails.spec.ts`
- `apps/api/src/contexts/tenancy/application/guest-menu-url.service.ts` — why the domain row
  outranks the apex
