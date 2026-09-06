# Modifier price by size — deferred (2026-08-31)

Raised while adding dough-style modifier groups. Today a modifier option carries one
`price_delta`, flat: adding cheese costs the same on a 25 cm pizza and on a 35 cm one. Every
competitor charges by size, and a restaurant that wants to will have to price the largest pizza's
cheese into all three.

**Not built, on purpose.** No customer has asked, and the shape is easy to get wrong before one
does — per-size deltas, per-size free amounts, and "this option only exists on the large size" are
three different features that look alike from here.

**When it lands**, the smallest thing that works is an override table beside the option:

```
menu_modifier_option_prices (tenant_id, option_id, size_id, price_delta)
  primary key (option_id, size_id)
```

Read path: the published menu carries the overrides on the option; the guest picks the row for the
chosen size and falls back to the flat `price_delta` when there is none. That keeps every existing
menu working unchanged and leaves `price_delta` as the answer for dishes with no sizes at all.

Admin: the option row grows one price field per size of the items the group is attached to — which
is the awkward part, because a group attached to items with different size sets has no single list
of sizes. Worth resolving with a real restaurant's menu in hand rather than in the abstract.
