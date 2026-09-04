---
title: Tenant logo and covers are stored as absolute URLs, so they break when the media host changes
date: 2026-09-04
priority: high
status: pending
---

# `tenants.theme` persists absolute media URLs instead of object keys

Found 2026-09-04 while exposing the dev QR menu through a VS Code tunnel. Changing
`MEDIA_PUBLIC_BASE_URL` fixed every dish photo and left the venue logo and all three
cover images pointing at the previous host, showing broken images to the guest.

## The inconsistency

| Asset | Stored as | Behaviour when the media host changes |
|-------|-----------|----------------------------------------|
| Menu item photos | `s3Key` in `menu_items.photos` | URL is built at read time — follows the new host |
| Modifier images | `image_s3_key` | same — follows |
| **Tenant logo + covers** | **full absolute URL in `tenants.theme`** | **frozen at whatever host was configured when it was written** |

`packages/domain/src/tenant-theme.ts` types them as `z.string().url()`, so the URL is the
persisted value, not a rendering of it. `seed-demo` writes the URL it computed at seed time;
the admin's logo upload does the same after receiving an `s3Key` from the presign endpoint.

## Why this matters beyond dev

This is not only a local-tunnel annoyance. Every one of these silently breaks a tenant's
branding while leaving dish photos intact, which makes it look like a CDN bug rather than a
data bug:

- moving object storage to a CDN or changing the CDN domain
- restoring a production dump into staging (or the reverse)
- any change of `MEDIA_PUBLIC_BASE_URL`, including adding a custom domain per tenant
- the R2/S3 migration the roadmap already anticipates

It also means the same object has two sources of truth: the key inside the URL, and the host
prefix that is no longer connected to configuration.

## The fix, and why it is smaller than it looks

The wire shape does not have to change. Guests and e-mail templates can keep receiving
`logoUrl` / `coverUrls` as absolute URLs — only persistence changes:

1. Store `logoKey` / `coverKeys` in the `tenants.theme` jsonb.
2. Build the absolute URLs at read time with the same `publicUrl()` the menu photos use.
3. Migration: convert existing rows by stripping the known `MEDIA_PUBLIC_BASE_URL` prefix;
   leave anything that does not match untouched and report it rather than guessing.

Note for whoever does it: e-mail templates (`guest-email-templates.ts`) need an absolute URL
and cannot fall back to a relative path, so the builder must stay server-side with access to
the configured base — a relative URL is not an option there.

## Related

- `packages/domain/src/tenant-theme.ts` — where the URL shape is declared
- `apps/api/src/contexts/tenancy/application/update-brand.service.ts` — the writer
- `apps/admin/src/components/settings/logo-upload.tsx` — receives an `s3Key`, then discards it
  in favour of the URL
- `apps/api/src/contexts/catalog/domain/public-photo-key.ts` — the key/URL pattern the menu
  photos already follow, and the one to copy
