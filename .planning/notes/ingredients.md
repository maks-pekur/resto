# Ingredients — design (2026-09-02)

A guest picks toppings on a dish: each one has a photo, a name, an optional description and a
price, tapping it frames the tile and drops a check into its corner, and the dish price moves. The
operator builds them once, in the Menu tab, and reuses them — a "For pizza" set attached to every
new pizza, plus one-off extras attached to a single dish.

## Naming: this is a modifier, and it stays one in the code

iiko and Syrve — the POS this catalog was shaped against in Phase 4a — draw a line RestOS should
not blur:

- **An ingredient** is a line of the assembly chart (ТТК): flour 250 g, mozzarella 80 g. It exists
  for costing and stock write-off, has no separate price, and the guest never sees it. RestOS
  already has the shallow end of this — `menu_items.ingredients`, a display-only text array.
- **A modifier** is a nomenclature product in its own right (`type: Modifier`) with its own id,
  name, image and price. It is what the guest adds, and it is the only thing that reaches the
  order.

What this feature describes — photo, price, guest taps it, price moves, kitchen reads it — is the
second one. `/api/1/nomenclature` returns a dish with two separate fields, and they are exactly the
two attachment modes asked for here:

- `modifiers[]` — simple modifiers bound to that dish one at a time;
- `groupModifiers[]` — a whole group, carrying `childModifiers[]` and `minAmount` / `maxAmount` /
  `required`.

The iiko back office calls the group a "modifier scheme" and describes it as attaching a standard
package of modifiers to similar products — the same sentence as the request that started this.
Order lines carry `modifiers: [{ productId, amount, productGroupId, price }]`, i.e. rows beside the
dish, never a comment.

**Decision.** The database, the domain and the iiko mapping keep saying `modifier`. The admin UI
and the guest UI say **Ingredients**. Two words for two audiences: the partner integration speaks
the partner's language, the restaurant speaks its own.

To stop the two meanings sharing one word inside the code, `menu_items.ingredients` is renamed to
`menu_items.composition` and labelled "Состав" in the admin. It is admin-only — the published menu
DTO never exposed it — so the rename costs one migration, one DTO field and one form label.

## Data model

### The library

`menu_modifier_options` becomes a tenant-level reusable entity rather than a row owned by one
group. New columns:

- `description jsonb` — `LocalizedText`, nullable.
- `image_s3_key text` — nullable, opaque key, presigned at read time by the catalog repository, the
  same contract `menu_items.photos` already follows. Never a URL in the column, never a raw key
  across the API boundary.
- `source text NOT NULL DEFAULT 'manual'` and `source_external_id text` — mirroring `menu_items`.
  `source_external_id` is where an iiko modifier product id lands, and it is what makes the MVP-3
  adapter thin.

`archived_at` is already there via `timestampsColumns()`; archiving is the only removal, as
everywhere else.

Dropped: `modifier_group_id`. Membership moves out, below.

`min_amount` / `max_amount` stay and gain a defined reading: **effective min is `min_amount ?? 0`,
effective max is `max_amount ?? 1`.** Every existing row is NULL and therefore keeps behaving as a
plain add-once option.

### Two new link tables

```
menu_modifier_group_options (tenant_id, group_id, option_id, sort_order)
  primary key (group_id, option_id)

menu_item_modifier_options  (tenant_id, item_id, option_id, sort_order)
  primary key (item_id, option_id)
```

Both carry `tenant_id` and composite tenant FKs to their two parents, per ADR-0020 I-2, and lead
every index with `tenant_id`.

The first says which ingredients a group holds and in what order — and lets one ingredient sit in
several groups, so bacon priced once appears in both "For pizza" and "For burgers".

The second is the one-at-a-time attachment: iiko's `products[].modifiers`.

`menu_item_modifier_groups` is unchanged. `menu_modifier_groups` gains `sort_order` so the operator
controls the order of blocks inside a dish.

### Migration

One row in `menu_modifier_group_options` per existing option, taken from its current
`modifier_group_id` with its current `sort_order`, then the column is dropped. Placed orders are
untouched: `order_modifiers` stores a name and price snapshot, not a live reference.

## Selection rules

Min / max / required stay on the **group**, as today. Single ingredients attached to a dish carry
no group rule — a free set, take any.

`max_selectable` counts **distinct chosen options**, not their amounts: choosing double cheese is
one choice. An option held at amount 0 (see below) counts as not chosen and satisfies nothing.

iiko puts min / max on the dish-to-group link, so one group can behave differently on two dishes.
RestOS does not, on purpose — the link table can grow three columns the day a real menu asks. Noted
so the divergence is a decision, not an oversight.

## Default-in, and taking it out

An option with `default_amount > 0` is one the kitchen puts on unless told otherwise. The guest hook
already arrives with those tiles checked (`use-item-selection.ts`), so "no onion" is the same
entity as "extra bacon", pre-selected.

**The bug this closes:** unchecking one currently sends nothing, and the kitchen puts the onion on
anyway. A deselected default must reach the order as `amount: 0`, so the ticket reads "no onion".

- Cart and API accept `amount: 0` **only** for options whose `default_amount > 0`; zero on anything
  else is meaningless and is rejected.
- An `amount: 0` row contributes no money and no group count.
- The operator order card and the kitchen ticket render a zero-amount modifier as "без <name>",
  visually distinct from an added one.

## Amounts above one

Per-option `max_amount` governs it. When a selected tile's effective max is greater than 1, the
tile grows a `− n +` stepper; at max 1 there is no stepper and nothing changes for existing menus.

Money per row: `price_delta × max(0, amount − free_amount)`. That is the existing
`free_of_charge_amount` semantics finally used, rather than a second free-count concept.

Admin exposes it as one field on the ingredient inside a group — "how many times it can be added",
default 1.

## Stop list

Ingredients run out the way dishes do, so the stop list learns a second target:

```
menu_option_stop_list (id, tenant_id, location_id, option_id, stopped_at, reason, stopped_by_user_id)
  unique (tenant_id, location_id, option_id)
```

A separate table rather than a nullable column on `menu_stop_list`: the existing table's unique
index and FK stay exactly as they are, and the item read path does not change shape.

It shares `catalog_location_stop_version` — the same per-location counter, because both overlays
invalidate the same per-location menu. No second counter, no second cache key.

Read path, in `loadPublishedMenu`'s stop overlay:

- a stopped ingredient is omitted from the published menu for that location;
- **if omitting it leaves a required group of a dish with no options, that dish is stopped too** —
  otherwise the guest meets a dish they cannot legally configure.

Order creation rejects a stopped ingredient the way it rejects a stopped item, with its own error
code so the guest UI can name it.

Admin: the existing stop-list screen gains an Ingredients section beside the items one, and the
Today's-86 widget counts both.

## Public menu payload

- Ingredients travel **once**, in a top-level `modifierOptions[]`; groups and items reference them
  by id. One bacon in three groups is one payload entry and one price — dedupe and a guarantee in
  the same move.
- Each carries `description` and `imageUrl` (presigned, TTL matched to the menu cache TTL, as
  item photos already are).
- `PublishedMenuItem` gains `extraOptionIds[]` beside `modifierGroupIds[]`.
- `PublishedMenuModifierGroup` carries `optionIds[]` instead of inline options.

Any write to an ingredient, a group, or a membership bumps `catalog_menu_version`; CDN and ETag
invalidation follow with no extra machinery. Stop-list writes bump the location counter instead.

This is a breaking change to the `/v1/menu` shape. Both consumers — `apps/qr-menu` and
`apps/website` — go through `packages/ui/src/guest` and `packages/api-client`, and both ship in
this phase, so the change is coordinated rather than versioned.

## Pricing and the order

The server owns price and always did: `CatalogMenuPricingAdapter` builds a snapshot from the
published menu and the order aggregate prices against it, ignoring anything the browser claims.
Three additions:

1. The dish's allowed set is the **union** of its groups' options and its own single options.
   Anything outside it is refused.
2. Per-row money is `price_delta × max(0, amount − free_amount)`, with amount validated against
   `[min_amount ?? 0, max_amount ?? 1]`.
3. `amount: 0` is accepted only for a default-in option, and prices at zero.

`order_modifiers` needs no new column. It already stores `option_id`, `name_snapshot`,
`price_delta`, `amount` and a nullable `modifier_group_id` — which is `NULL` for a single ingredient
attached straight to the dish. **Nothing goes into the order comment.**

The iiko mapping is then one row to one element:

| RestOS | iiko / Syrve |
| --- | --- |
| `menu_modifier_options` row | nomenclature product, `type: Modifier` |
| `option.source_external_id` | that product's `id` |
| `menu_modifier_groups` + membership | modifier scheme / `groupModifiers[].id` + `childModifiers[]` |
| `menu_item_modifier_options` | `products[].modifiers[]` (simple) |
| `menu_item_modifier_groups` | `products[].groupModifiers[]` |
| `order_modifiers` row | order item's `modifiers[]` entry: `productId`, `amount`, `productGroupId`, `price` |

## API

Following the conventions already in `catalog.controller.ts` (`@Controller('v1/catalog')`):

- `GET modifier-options` — library listing, searchable, paginated.
- `POST modifier-options` — exists; loses its required `groupId`, gains description / image / amounts.
- `PATCH modifier-options/:id/archive` — mirrors `items/:id/archive`.
- `PUT modifier-groups/:id/options` — set membership and order in one write.
- `PUT items/:id/modifier-options` — set a dish's single ingredients, mirroring
  `PUT items/:id/modifier-groups`.
- `POST stop-list/options` and `DELETE stop-list/options/:optionId`; `GET stop-list` and
  `GET stop-list/aggregate` grow an ingredients section.
- `POST photo-upload-url` — unchanged endpoint, new server-side key prefix
  `tenant/<tenantId>/ingredients/<uuid>.<ext>`. The prefix is chosen server-side, as it already is
  for items, so a leaked token cannot cross tenants.

## Admin UI — Menu tab

- **New sub-tab "Ингредиенты"** — a card grid (photo, name, price). The editor sheet holds photo,
  name, description, price, how-many-times-addable, default-in, archive. Photo upload reuses
  `photo-upload.tsx`.
- **"Группы модификаторов" → "Группы ингредиентов"** — selection rules plus a picker over the
  library with drag ordering, and a "create new" path that does not leave the sheet.
- **Item card** — one "Ингредиенты" block with two rows of chips: attached groups, and single
  ingredients, each row with its own add sheet. The composition text field moves out of this block
  into the item's description form, where it belongs; it currently sits inside
  `item-modifier-groups-card.tsx`, which is half of why the two meanings got tangled.

## Guest UI

One component in `packages/ui/src/guest/`, so `apps/qr-menu` and `apps/website` both get it.

- **Tile**: photo, name, `+price`. Chosen: `border-primary`, `bg-primary-tint`, and a round check in
  the corner. A selected tile whose effective max exceeds 1 shows `− n +`.

**Shape and behaviour are two independent axes, and neither needs a flag on the group.** Dough is
the same entity as a topping — it just has no photo and a rule of exactly one.

|  | no photos | any photo |
| --- | --- | --- |
| max 1 (dough, sauce) | today's segmented control | tile grid, the check moves to the tapped tile |
| max > 1 (toppings) | today's checkbox rows | tile grid, a check per chosen tile |

- **Shape comes from photos**: a block renders as tiles when at least one of its ingredients has
  one. The operator's lever is the photo itself, which is the lever they already reach for; a
  display-style switch in the admin would be one more thing to set and to get wrong.
- **Behaviour comes from the rules**: effective max 1 means radio semantics — tapping another tile
  moves the selection rather than being silently ignored — and `is_required` decides only whether
  the last one can be cleared. Today the single-choice branch also demands `is_required`
  (`isSingleChoiceGroup`), so a max-1 optional group falls into checkbox rows where the second tap
  quietly does nothing. Keying on max alone fixes that.
- Existing dough and sauce groups carry no photos, so **nothing about them changes on the day this
  ships**; they become grids only if someone uploads photos for them.
- The control underneath stays a real `<input>` — `checkbox` for multi, `radio` for max 1 — as the
  current rows do, so keyboard and screen-reader behaviour comes free rather than being rebuilt.
- `useItemSelection` extends to single ingredients, amounts, and zeroed defaults; the live price
  already reads from it.

## Tests

- Order aggregate, unit: an option outside the dish's union is refused; price comes from the
  snapshot and not the request; amount clamped to `[min, max]`; `amount: 0` allowed only for a
  default-in option and priced at zero; `free_amount` subtracted before multiplication.
- Repository, integration on real Postgres: tenant isolation on both new link tables, and the
  composite-FK guard rejecting a cross-tenant `option_id`.
- Published menu: a stopped ingredient disappears; a dish whose required group is emptied by a stop
  disappears with it; version counters bump on every write path.
- Component: tile selection, the check corner, the stepper, and a photoless group still rendering
  rows.
- E2E: two toppings chosen and one default removed → cart price, order total and `order_modifiers`
  rows all agree, and the operator card shows "без ...".

## Deliberately not in this phase

- **Price per size** — cheese costing more on a 35 cm pizza. Already deferred with a design in
  `modifier-pricing.md`; the override table hangs off the option and nothing here blocks it.
- **Per-dish group rules** — iiko's min/max on the dish-to-group link. The link table can take the
  columns when a real menu needs them.
- **Assembly charts** — real ingredients with grams and cost. Back-of-house, iiko's domain, and not
  something RestOS should own before it owns stock.
- **Nested modifiers** — a modifier that itself carries modifiers. iiko supports it; nobody has
  asked.
