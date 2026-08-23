---
slug: location-slug-and-address
created: 2026-08-23
type: quick
branch: location-slug-and-address
---

# Locations get a slug, real coordinates, and an edit form

Founder asked for: slug in the URL instead of the id, slug derived from the name, a name the form
recommends by district ("Воскресенка"), mandatory exact coordinates, optional phone and email,
timezone inherited from the tenant, and a `/locations/$slug` route where `new` means create.

## What already exists

- **Phone and email** are already optional in `locations.contacts` (jsonb). Nothing to do.
- **The `new` sentinel route pattern** is established: `roles.$roleId.tsx`,
  `menu/items.$id.tsx`, `menu/modifier-groups.$id.tsx` all branch on `id === 'new'`. Reuse it.
- **Slug machinery** exists in `packages/domain/src/slug.ts` and `tenant-slug.ts`.

## What does not

- No `slug` on locations; the URL carries the id.
- **No coordinates at all.** `address` is one nullable free-text column, empty on all four demo rows.
- **No timezone on the tenant** — it has locale, currency and country only, so there is nothing to
  inherit from yet.
- **No update endpoint.** The controller has create, list and archive. A location cannot be edited.

## Decisions taken (founder delegated)

**Coordinates come from OpenStreetMap.** Nominatim address search plus a draggable marker. No API
key, no bill — the budget constraint is real and a map key is a recurring cost for a feature every
tenant touches once per location.

**Timezone lives on the tenant and is inherited as a default, not a law.** A chain can cross zones —
Spain has two, and a tenant in two countries certainly does. The location keeps its own column;
create pre-fills it from the tenant and lets it be overridden.

**Demo locations get coordinates in the seed.** They are fixtures, not customer data, so the honest
move is to give them real values rather than weaken the constraint for everyone.

## Tasks

### 1. Domain and schema

`locations.slug` (unique per tenant), `latitude` / `longitude` (`numeric`, not null for new rows),
`tenants.timezone`. `LocationSlug` value type in `packages/domain`, generated from the name.

**Reserve `new` and `all`.** `new` is the create-route sentinel; `all` is already the sentinel in
`?location=all`. A location named either would shadow a route or a mode. This is the same class of
bug `RESERVED_SLUGS` prevents for tenants, and it needs its own small list for locations.

Migration must not break the four existing rows: add columns nullable, backfill slugs from names and
coordinates from the seed, then tighten.

### 2. API

Create accepts name/address/coordinates/contacts and derives the slug server-side. **New `PATCH :id`**
so a location can be edited at all. List and single responses carry `slug`, `latitude`, `longitude`.

### 3. Admin

`/locations` — list plus an **Add new** button.
`/locations/$slug` — one form for both, `new` meaning create. The form shows the slug it will
generate as the name is typed, and recommends a district-style name.

### 4. URL

`?location=<slug>` instead of the id. The client resolves slug → id from the locations list it
already loads; the API keeps taking UUIDs in `x-location-id` and the session keeps storing a UUID.
Deliberately not teaching the API to accept slugs — that would push a display concern into the
tenant-isolation boundary.

## Verification

Static gates, plus behavioural against the running stack: create a location through the form, see it
in the list, edit it, confirm `?location=<slug>` drives the stop list and the order feed, and confirm
a location cannot be named `new` or `all`.
