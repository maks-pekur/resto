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


---

## Update 2026-09-06 — the dev environment now runs behind a Cloudflare Tunnel

The founder needed a free, phone-reachable setup, so the four dev servers are exposed through a
named tunnel (`resto-dev`, config in `~/.cloudflared/config.yml`) on the real single apex. That
replaced the VS Code devtunnel this file was originally written about, and the stale
`MEDIA_PUBLIC_BASE_URL` pointing at it — item 2 above — is now corrected rather than pending.

**None of it is in the repository**, which is the point: `~/.cloudflared/` and `.env` are local, and
the one code change (`DEV_TUNNEL_APEX` in both `vite.config.ts` files) takes the apex from the
environment so no domain literal was committed.

What is now hand-set in the local `.env`, and what it replaced:

| Key | Now | Was | Why it matters |
|---|---|---|---|
| `PUBLIC_APEX_DOMAIN` | the tunnel apex | `localhost` | the apex would otherwise not be recognised as itself |
| `ADMIN_WEB_URL` | `https://<apex>/admin` | `http://admin.localhost:4000` | pre-07.4 subdomain shape |
| `BETTER_AUTH_BASE_URL` | `https://<apex>` | `http://localhost:5001` | |
| `AUTH_COOKIE_DOMAIN` | **commented out** | `.admin.localhost` | 07.4 D-05: unset gives a host-only cookie |
| `TENANT_DEV_FALLBACK_SLUG` | **commented out** | `pizza` | see below |
| `MEDIA_PUBLIC_BASE_URL` | `https://<apex>/resto-dev` | a dead VS Code devtunnel | images 404'd |

`apps/website/.env.local`: `WEBSITE_URL` and `NEXT_PUBLIC_API_ORIGIN` both moved to the apex.

**`TENANT_DEV_FALLBACK_SLUG` deserves its own note.** It turns *any* unresolved host into one fixed
tenant. On `localhost` that is a convenience; behind a real domain it made the apex serve a
restaurant's storefront instead of the landing, and it took three separate causes to diagnose
because each one alone produced the same symptom. It is `NODE_ENV === 'development'`-gated
(`tenant-context.middleware.ts`), so it cannot reach production — but anyone reviving it while a
tunnel is up should know what it does to the apex.

**Two things that will bite whoever picks this up:**

- The website caches `fetchMenuPublic` for 300s (`api-client.ts:26`). After changing
  `MEDIA_PUBLIC_BASE_URL` the old image URLs keep being served for five minutes, which looks
  exactly like the change not working. Restart the website rather than concluding the fix failed.
- Verifying a media URL with `curl` **from the same machine** proves nothing: `localhost:9000`
  resolves there and returns 200 whatever the public base says. Check that the emitted URL is the
  public one before trusting the status code.

Restore points for the two local files were left at `/tmp/env.backup` and `/tmp/web-env.backup`.

---

## Update 2026-09-06 — a Google OAuth client secret must be rotated

Google was wired as a Better Auth social provider on 2026-09-05 (`bf8a5a45`), and real credentials
are set in the local `.env` — which is gitignored, so nothing leaked through the repository.

**But the client secret was pasted into a session transcript.** Transcripts are summarised, stored
and re-read; treat the value as disclosed.

- **Rotate before any production deploy.** Google Cloud Console → the OAuth 2.0 client → add a new
  secret, update `.env` and whatever renders `infra/docker/env/api.env`, then delete the old one.
- Nothing fails loudly if this is skipped: the old secret keeps working. This file is the only
  record.
- No guardrail can help here — the value is a real credential, not a dev default, so
  `assertProdGuardrails` has nothing to match on.
- The provider is optional-gated (`identity-core.module.ts:265`): clearing both `GOOGLE_CLIENT_ID`
  and `GOOGLE_CLIENT_SECRET` turns Google off rather than breaking boot, so an unrotated secret can
  be removed under time pressure without a code change.

See [[guest-sign-in-with-google]] for what the provider is still missing on the guest side.
