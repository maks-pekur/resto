# Diet labels vs. marketing badges

**Decided 2026-09-02.** Two things look alike on a card and must not share a model.

## Diet labels — a fixed vocabulary (built)

`vegetarian`, `vegan`, `gluten_free`, `lactose_free`, `spicy`, `halal`, plus the fourteen EU
allergens. Fixed, because:

- **Filters only work on a shared word.** If one venue writes "без глютена", another "gluten free"
  and a third "БГ", the guest's filter matches one venue in three.
- **Translation comes free.** The preset is translated into every language a menu speaks; an
  operator's own label exists in the one language they typed it in.
- **Allergens are law.** EU 1169/2011 names the fourteen; free text there is a liability, not a
  feature.
- **Each label has a mark.** A preset gets a curated emoji; a custom string has none.

## How a label is shown (decided 2026-09-02)

- **On a menu card the mark joins the name** — "Маргарита 🥗" — rather than sitting on the photo.
  Tried first as a chip over the top-left corner; it fought the photography, and paired glyphs
  (`🚫🌾`) read as litter at that size.
- **In the dish's detail no mark is drawn at all.** The card already said it, and the sheet has the
  one thing that has to be there in writing: the allergen line.
- **The emoji always carries the word behind it**, visually hidden. A leaf is meaningless to a
  screen reader and ambiguous to a sighted guest who has never seen the convention; the sr-only
  word makes the card read as "Маргарита, вегетарианское" while looking like the emoji alone. The
  norm this follows lives in the wiki: `rules/guest-accessibility-floor.md`.
- **"Free from" is the ingredient struck through** with a CSS bar, not an emoji pair — one shape,
  and the strike follows the theme.
- **Vegan implies vegetarian in code**, so a vegan dish appears under the vegetarian filter and
  still shows one mark, the stronger one. Operators tick what is true; the implication is not
  their job to remember.

## Marketing badges — per tenant, not built yet

"Хит", "Новинка", "Фирменное", "Острое ×3" are not dietary information — they are the operator
selling. They want a different model:

- a tenant-level list of badges: localized text + an emoji the operator picks,
- a per-item reference to them,
- shown on the card like a diet mark, but **not** offered as a filter (a filter over one venue's
  invented words teaches the guest nothing),
- and this is where the "Хит" that replaced an automatic "popular items" section belongs.

Until that exists, do not let operators type free-form diet labels: it would fill the shared
vocabulary with strings nothing can filter, translate or draw.
