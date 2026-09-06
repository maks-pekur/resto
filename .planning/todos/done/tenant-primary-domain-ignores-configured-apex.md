---
title: Tenant provisioning hardcodes `menu.resto.app`, ignoring PUBLIC_APEX_DOMAIN
date: 2026-09-04
priority: medium
status: done
---

# Every provisioned tenant gets a primary domain on an apex the platform may not own

Found 2026-09-04 while re-planning phase 7.5, sweeping for domains that would survive into
production as literals. Two application services build the tenant's primary domain row from a
module constant instead of configuration:

- `apps/api/src/contexts/tenancy/application/provision-tenant.service.ts:9`
- `apps/api/src/contexts/tenancy/application/finalize-tenant-onboarding.service.ts:7`

```ts
const PRIMARY_DOMAIN_SUFFIX = 'menu.resto.app';
// ...
primaryDomainHostname: `${input.slug}.${PRIMARY_DOMAIN_SUFFIX}`,
```

`PUBLIC_APEX_DOMAIN` already exists for exactly this and is read by `GuestMenuUrlService` and
`TenantResolverService`. These two writers ignore it.

## What this does NOT break — checked, so nobody re-derives it

- **QR stickers are fine.** `Tenant.provision` writes the row with `kind: 'subdomain'`
  (`tenant.aggregate.ts:159`), and `GuestMenuUrlService` only prefers a domain whose kind is
  `'custom'`. It falls through to `PUBLIC_APEX_DOMAIN`, so the sticker carries the real apex.
- **Host resolution is fine.** `TenantResolverService.guestSlugLabel` matches `<slug>.menu.<rest>`
  by shape, not against the apex (`tenant-resolver.service.ts:113`), so guests arriving at the
  real apex resolve.

## What it does break

The persisted `tenant_domains` primary row is simply wrong on any apex other than `resto.app` —
it names a host the platform does not serve and may not own. That row is what the operator sees
as their menu address, and `is_primary` on it is load-bearing: see
[[dev-only-data-to-undo-before-production]] for the partial unique index that allows one primary
per tenant, and for how a wrong primary row misdirects operators.

It is latent today only because the configured apex happens to match the constant.

## Fix

Inject `Env` into both services and build the suffix as `menu.${env.PUBLIC_APEX_DOMAIN}`.
`PUBLIC_APEX_DOMAIN` is `.optional()` in `env.schema.ts`, so decide deliberately what provisioning
does when it is unset — `GuestMenuUrlService` throws with a good message and that precedent is
worth copying, since a tenant provisioned with a wrong primary domain is harder to notice than one
that failed to provision.

`GUEST_HOST_LABEL` (`'menu'`) is already a shared constant — reuse it rather than re-embedding the
literal in a template string.

## Resolved 2026-09-05 — phase 07.5-13, superseded by the single-apex collapse

`GUEST_APEX_DOMAIN` is deleted in the same plan (07.5-13) that closes this todo — `menu.` as a
guest-host label no longer exists at all, so the fix implemented is narrower and simpler than what
this todo proposed above.

**What the todo got wrong, so nobody re-derives it:** `GUEST_HOST_LABEL` was never a real constant
in this codebase — grepping `apps/api/src` for it at close time returns nothing. The todo's
proposed fix (`menu.${env.PUBLIC_APEX_DOMAIN}`) also predates the single-apex decision and would
have been wrong to implement literally: under one apex, the guest host and the website host are
the same host, so the primary domain row is `<slug>.<PUBLIC_APEX_DOMAIN>` with no `menu.` label at
all, not `<slug>.menu.<PUBLIC_APEX_DOMAIN>`.

**What actually shipped:** both writers (`provision-tenant.service.ts`,
`finalize-tenant-onboarding.service.ts`) now inject `Env` and compose the primary domain through
`guestHostForTenant` (`apps/api/src/shared/guest-links.ts`) — the same shared helper
`GuestMenuUrlService` and the guest confirmation-email link use — passing `null` for the
"no existing domains yet" case, so the formula is exactly `<slug>.<PUBLIC_APEX_DOMAIN>`. Both throw,
naming the tenant slug, when `PUBLIC_APEX_DOMAIN` is unset, matching this todo's own precedent
argument.

**What this does NOT fix, and is not this plan's job:** rows already written by the old
`menu.resto.app` constant exist in any database that has provisioned a tenant before this change.
Clearing or migrating those pre-existing rows is plan 07.5-10's production data audit, not a
migration shipped here.
