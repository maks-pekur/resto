# Plan 05-05 — Summary

**Plan:** 05-05 — Single-page checkout
**Status:** Complete
**Wave:** 5
**Requirements:** SITE-04, SITE-06, SITE-07

## What was built

- `lib/checkout-schema.ts` — `createCheckoutSchema(mode)` zod factory: `name` (min 1), `phone` (regex), `address` required only when `mode==='delivery'` (via `superRefine`), `orderTime` discriminated union `{kind:'asap'} | {kind:'scheduled', at}`; exported `CheckoutForm` type.
- `components/checkout/address-input.tsx` — `Input` + on-blur zone check; Phase 5 stub always returns valid → green "We deliver to this area" badge; the yellow out-of-zone state is implemented but never triggered (Phase 9 wires the real geocode/polygon check).
- `components/checkout/order-time-selector.tsx` — `RadioGroup` ASAP / Schedule; scheduled reveals a `datetime-local` input.
- `components/checkout/order-summary.tsx` — reads `items` + `selectSubtotal` from the cart store; per-line totals (`tabular-nums`), subtotal, and a stub delivery-fee row shown only in delivery mode.
- `components/checkout/checkout-form.tsx` — `useForm` + `zodResolver(createCheckoutSchema(mode))` (`mode: onChange`), single-column max-640: AddressInput (delivery only), contact name+phone (`FormField`+`Input`) with a non-functional "create an account (coming soon)" hint, OrderTimeSelector, OrderSummary, and a full-accent **disabled** "Place order" button (`disabled` + `aria-disabled` + `aria-describedby`) inside a Tooltip "Payment processing coming soon". No onClick/submit initiates payment (D-07). Empty cart → message + link back to the menu.
- `app/checkout/page.tsx` — RSC shell: TenantHeader + CheckoutForm (no CategoryNav/CartDrawer); tenant gating reused from the menu page; `generateMetadata` with `robots: { index: false }` (transactional page).
- shadcn `form`, `input`, `label`, `radio-group`, `tooltip` added.
- `test/checkout-form.spec.tsx` — schema (name/phone/address-by-mode/scheduled-time), address green-badge, order-time reveal.

## Verification

- `nx typecheck website` — pass
- `nx lint website` — pass
- `nx test website` — 47/47 pass (6 files)
- `nx build website` — pass (`/`, `/about`, `/delivery`, `/contact`, `/faq`, `/checkout`)

## Deviations / notes

- **Execution recovery (whole wave by hand):** per user direction, 05-04/05/06 were completed by the orchestrator after the executor agents truncated. 05-05 was implemented directly. TDD RED-first was not followed in the hand build (schema + tests written together, all green).
- `form.tsx` was copied from `apps/admin` (identical shadcn new-york) because the `shadcn add` CLI stalled on an interactive "overwrite button.tsx?" prompt.
- Scope fences held: no payment path (Phase 8), zone check is a stub (Phase 9), promo non-functional (Phase 11). Phase 7 MUST re-validate the form server-side at order creation (threat T-05-05-T).

## Key files

- apps/website/lib/checkout-schema.ts
- apps/website/components/checkout/{checkout-form,address-input,order-time-selector,order-summary}.tsx
- apps/website/app/checkout/page.tsx
