---
phase: 10-admin-order-intake
reviewed: 2026-08-17T23:45:09Z
depth: standard
files_reviewed: 48
files_reviewed_list:
  - apps/admin/e2e/adm-02-orders-workflow-smoke.spec.ts
  - apps/admin/e2e/adm-03-guest-status-loop.spec.ts
  - apps/admin/e2e/fixtures/seed-orders.ts
  - apps/admin/e2e/fixtures/seed-tenants.ts
  - apps/admin/playwright.config.ts
  - apps/admin/public/sounds/order-chime.wav
  - apps/admin/src/components/app-sidebar.tsx
  - apps/admin/src/components/nav-main.tsx
  - apps/admin/src/components/orders/accept-popover.spec.tsx
  - apps/admin/src/components/orders/accept-popover.tsx
  - apps/admin/src/components/orders/cancel-dialog.spec.tsx
  - apps/admin/src/components/orders/cancel-dialog.tsx
  - apps/admin/src/components/orders/enable-sound-banner.tsx
  - apps/admin/src/components/orders/order-card-refund.spec.tsx
  - apps/admin/src/components/orders/order-card.spec.ts
  - apps/admin/src/components/orders/order-card.tsx
  - apps/admin/src/components/orders/order-detail-sheet.spec.tsx
  - apps/admin/src/components/orders/order-detail-sheet.tsx
  - apps/admin/src/components/orders/order-filter-bar.tsx
  - apps/admin/src/components/orders/order-status-badge.tsx
  - apps/admin/src/components/orders/orders-empty-state.tsx
  - apps/admin/src/components/orders/refund-failed-banner.spec.tsx
  - apps/admin/src/components/orders/refund-failed-banner.tsx
  - apps/admin/src/components/orders/reject-popover.spec.tsx
  - apps/admin/src/components/orders/reject-popover.tsx
  - apps/admin/src/components/ui/popover.tsx
  - apps/admin/src/lib/api-client.ts
  - apps/admin/src/lib/hooks/use-order-sound.spec.ts
  - apps/admin/src/lib/hooks/use-order-sound.ts
  - apps/admin/src/lib/hooks/use-permissions.ts
  - apps/admin/src/lib/hooks/use-tab-title.ts
  - apps/admin/src/lib/i18n/messages/en.json
  - apps/admin/src/lib/i18n/messages/ru.json
  - apps/admin/src/lib/queries/identity.ts
  - apps/admin/src/lib/queries/orders.ts
  - apps/admin/src/lib/utils.ts
  - apps/admin/src/main.tsx
  - apps/admin/src/routes/(protected)/$brandSlug/orders.tsx
  - apps/admin/test/setup.ts
  - apps/website/components/checkout/checkout-form.tsx
  - apps/website/components/checkout/order-status-poller.tsx
  - apps/website/components/ui/checkbox.tsx
  - apps/website/lib/checkout-api.ts
  - apps/website/lib/checkout-schema.ts
  - apps/website/messages/en.json
  - apps/website/messages/ru.json
  - apps/website/messages/uk.json
  - apps/website/test/order-status-poller.spec.tsx
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 10: Code Review Report (Frontend)

**Reviewed:** 2026-08-17T23:45:09Z
**Depth:** standard
**Files Reviewed:** 48
**Status:** issues_found

## Summary

Reviewed the admin order-intake surface (`apps/admin`) and the guest-facing
checkout/status-tracker rewrite (`apps/website`) introduced by Phase 10,
diffed against base commit `57db91e`. Tenancy/location threading at
mutation call sites is correct everywhere checked — every accept/reject/
advance/cancel/refund/retry call passes the _order's own_ `locationId`
(from the feed row or the freshly-fetched detail), never the URL filter's
`useEffectiveLocation()` value, which is the right design for `?location=all`
mode and is exercised by `adm-02`'s "owner in all-mode mutates a
location-2 order" case. The owner-only refund gate is server-derived
(`GET /v1/me`'s `permissions` field via `computeEffectivePermissions`),
not a hardcoded client flag, and its DOM-absence (not just `disabled`) is
component-tested.

The two Critical findings below are both in `order-detail-sheet.tsx` and
share a root cause: neither the Cancel trigger nor the discretionary
refund form is gated on the order's current status, only on the
operator's permission — so both money-adjacent actions are rendered (and
functional, network-call-wise) on orders where the UI-SPEC's own state
table (Section 1) says they must not appear. Every test in
`order-detail-sheet.spec.tsx` fixtures the order at `status: 'accepted'`,
so this gap has no test coverage in either direction.

## Critical Issues

### CR-01: Cancel trigger is rendered for orders in any status, including already-completed and already-canceled orders

**File:** `apps/admin/src/components/orders/order-detail-sheet.tsx:396-408`
**Issue:** `canCancel` is computed purely from the permission check —
`const canCancel = can('order', 'cancel');` (line 181) — and the footer
unconditionally renders `<CancelDialog>` whenever `canCancel` is true,
with no reference to `detail.status` anywhere in the component:

```tsx
{
  canCancel ? (
    <CancelDialog
      brandSlug={brandSlug}
      order={{
        id: detail.id,
        shortNumber: detail.shortNumber,
        locationId: detail.locationId,
        total: detail.total,
        currency: detail.currency,
      }}
      onCanceled={onClose}
    />
  ) : null;
}
```

`CancelDialogOrder` (`cancel-dialog.tsx:32-38`) doesn't even carry a
`status` field, so the dialog has no way to self-gate either. This
directly contradicts UI-SPEC Section 1's state table, which lists "Cancel"
as an available detail-only action **only** for `accepted`/`preparing`/
`ready` rows — the `Завершён (completed)` row's detail-only action is
"Discretionary refund (owner)" only, and the `Отменён (canceled)` row's
is "view reason in detail" only. D-08 ("Cancel is allowed at every stage
up to `completed`") likewise implies cancel stops being offered once an
order is actually `completed` or already `canceled`.

**Concrete failure scenario:** any operator holding `order:cancel`
(per D-06 this is everyone who works with orders — owner, admin, manager,
cashier-foh, kitchen) opens the detail Sheet for an order handed to the
guest yesterday (`status: 'completed'`) or one already rejected/canceled
earlier today. The "Отменить заказ" button renders exactly as it does for
a live `accepted` order — same outline-destructive styling, same `h-12`
size, no visual or textual indication it is stale. Nothing in the client
prevents them from opening the `AlertDialog`, picking a reason, and
firing `cancelOrderMutation` against a settled order. Whether the backend
rejects this is outside this review's file scope, but the client offering
a seemingly-live, money-triggering control on a settled order is itself
the defect the UI-SPEC's per-state action table exists to prevent — and
every test in `order-detail-sheet.spec.tsx` only fixtures `status:
'accepted'`, so this path is completely unverified.

**Fix:**

```tsx
const CANCELABLE_STATUSES = new Set(['accepted', 'preparing', 'ready']);
const canCancel =
  can('order', 'cancel') && CANCELABLE_STATUSES.has(detail.status);
```

### CR-02: Discretionary refund form is rendered for orders in any status, permitting a second full refund on an already-canceled/refunded order

**File:** `apps/admin/src/components/orders/order-detail-sheet.tsx:180, 353-392`
**Issue:** `canRefund` is likewise permission-only —
`const canRefund = can('billing', 'update');` — with no `detail.status`
check gating the refund section (lines 353-392). Per UI-SPEC Section 1,
"Discretionary refund (owner)" is a detail-only action listed **only**
for the `Завершён (completed)` row; `accepted`/`preparing`/`ready` rows'
detail-only action is "Cancel" (which already auto-refunds the full
amount per D-10), and the `Отменён (canceled)` row's detail-only action
is "view reason in detail" — not refund again.

Compounding this, the "Доступно к возврату" (available-to-refund) hint
and the amount `Input`'s default value both use `detail.total` (the
order's original total) unconditionally:

```tsx
<p className="text-xs text-muted-foreground">
  {t('refund.remainingHint', {
    amount: formatMoney(detail.total, detail.currency),
  })}
</p>
```

there is no already-refunded-amount field to subtract (acknowledged as a
known interim gap in `10-12-SUMMARY.md`), so for an order that already
received a full auto-refund via Reject/Cancel, this hint still reads
"Доступно к возврату: {full original total}" and the form is still
present and submittable.

**Concrete failure scenario:** an owner opens the detail Sheet for an
order that guest-rejected an hour ago (`status: 'canceled'`,
already fully refunded by D-09's auto-refund). The refund section renders
exactly as it would for a genuinely-unrefunded completed order, defaults
the amount field to the full original total, and "Оформить возврат" is
enabled the moment a reason is typed. Submitting it fires
`refundOrderMutation` for the **full amount a second time** against an
order that was already refunded in full — a real double-refund risk if
the backend's remaining-balance check has any gap (out of this review's
file scope to verify). Separately, an owner could also refund an order
that is merely `accepted` (food not even started, no completion yet),
which the state table does not offer at that stage at all.

**Fix:**

```tsx
const canRefund = can('billing', 'update') && detail.status === 'completed';
```

(paired with a real remaining-balance field from the API, tracked
separately per `10-12-SUMMARY.md`'s own noted follow-up, to make the hint
accurate once a prior partial refund exists).

## Warnings

### WR-01: `toMinorUnits()` produces `NaN` for leading-dot decimal amounts, silently breaking legitimate refund entries

**File:** `apps/admin/src/lib/utils.ts:13-21`
**Issue:**

```ts
export function toMinorUnits(value: string): number {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', frac = ''] = unsigned.split('.');
  const fracPadded = frac.padEnd(2, '0').slice(0, 2);
  const minor = parseInt(whole, 10) * 100 + parseInt(fracPadded, 10);
  return negative ? -minor : minor;
}
```

Array-destructuring defaults only apply when the destructured element is
`undefined`, not when it is an empty string. `<input type="number">`
accepts a leading-dot value like `.50` per the HTML5 floating-point-number
grammar (no digits required before the dot), so a refund amount typed as
`.50` produces `unsigned.split('.') === ['', '50']` — `whole` is `''`,
the `'0'` default never fires, `parseInt('', 10)` is `NaN`, and the whole
computation becomes `NaN`. `JSON.stringify({ amountMinor: NaN, ... })`
serializes `NaN` to `null`, so the discretionary-refund `Input`
(`order-detail-sheet.tsx:362-371`, the only call site) silently sends an
invalid payload for a value the operator typed as a perfectly normal
partial-refund amount, surfacing only the generic
"Не удалось оформить возврат." toast with no indication why.
**Fix:**

```ts
const [wholeRaw, frac = ''] = unsigned.split('.');
const whole = wholeRaw === '' ? '0' : wholeRaw;
```

### WR-02: Discretionary refund amount has no client-side bound validation before the mutation fires

**File:** `apps/admin/src/components/orders/order-detail-sheet.tsx:183-184, 362-371`
**Issue:**

```tsx
const refundDisabled =
    refundMutation.isPending || refundAmount.trim() === '' || refundReason.trim() === '';
...
<Input id="refund-amount" type="number" min={0} step="0.01" value={refundAmount} onChange={...} />
```

`min={0}` on a controlled `<input type="number">` is not a keystroke
guard — browsers still accept a manually-typed leading `-` in the raw
value — and there is no `max`. `refundDisabled` only checks for a
pending mutation or an empty string, not that `Number(refundAmount) > 0`
or `<= detail.total`. A stray leading `-` (fat-fingered, or a numeric
keypad slip) or an accidental extra digit is not caught anywhere in the
client before `refundOrderMutation` is called with the resulting
`amountMinor`.
**Fix:** disable submit unless `Number(refundAmount) > 0 &&
Number(refundAmount) * 100 <= toMinorUnits(detail.total)`, and surface an
inline validation message rather than relying solely on a failed
round-trip.

### WR-03: Guest status tracker's manual retry uses a stale status closure, mis-scheduling the next poll on a double failure

**File:** `apps/website/components/checkout/order-status-poller.tsx:82-123`
**Issue:** the polling `useEffect`'s dependency array is
`[orderId, initialStatus.status]`, so its body — including the
`retryRef.current = () => { ...; runPoll(status.status); }` assignment —
runs exactly once per mount (`initialStatus` is a stable prop). `status`
in that closure is therefore permanently bound to whatever it equaled at
that single render (i.e. `initialStatus.status`), even though `status`
state is updated many times afterward via `setStatus(next)` as the order
progresses through `accepted → preparing → ready → completed`. The
ongoing polling loop itself is unaffected (it correctly threads the fresh
`next.status` through `scheduleNext`), but `handleRetry` — the guest's
"Обновить" button after a failed poll — always calls
`runPoll(initialStatus.status)`, not the order's actual current status.
Since `currentStatus` is only consulted in `runPoll`'s `.catch()` branch
(`scheduleNext(currentStatus)`, which picks the retry interval via
`pollIntervalMs` and short-circuits on `TERMINAL_STATUSES.has(...)`), the
practical effect is confined to a double-failure edge case (a poll fails,
the guest clicks retry, and that retry _also_ fails): the next
reschedule uses the wrong interval and the wrong terminal check for the
order's true current status. `order-status-poller.spec.tsx`'s retry test
only exercises the immediate first-poll failure (`status.status` still
equals `initialStatus.status` at that point), so this divergence is
unexercised.
**Fix:** thread the live status through a ref updated on every
`setStatus` call (e.g. `statusRef.current = next.status` inside `.then()`),
and have `retryRef.current` read `statusRef.current` instead of the
closed-over `status`.

### WR-04: "Has this brand ever had an order" activation check is bounded to the last 7 days, not all-time

**File:** `apps/admin/src/routes/(protected)/$brandSlug/orders.tsx:129-140`
**Issue:**

```tsx
const activationCheckQuery = useQuery({
  ...ordersFeedQuery(brandSlug, locationId ?? 'all', {
    statusFilter: 'all_today',
    datePreset: 'week',
    limit: 1,
  }),
  enabled: locationId !== undefined && mainEmpty,
});
const isActivationEmpty =
  mainEmpty &&
  activationCheckQuery.isSuccess &&
  (activationCheckQuery.data.data?.total ?? 0) === 0;
```

`OrderDatePreset` only has `'today' | 'yesterday' | 'week'` — there is no
all-time option — so the widest net this check can cast is 7 days. A
brand that has processed real orders before (activation already happened)
but simply had zero orders in the current filtered view **and** zero
orders in the trailing 7 days (a slow week, a seasonal closure, a
multi-week gap between visits) will incorrectly be shown the bespoke
"Здесь появятся ваши первые заказы" activation empty-state — including
the payments/menu/location checklist and the QR/copy-link CTA — as if
this were day one, instead of the plain "Ничего не найдено" filtered-empty
state.
**Fix:** either add a true all-time existence check (a cheap `EXISTS`-style
endpoint, not a filtered feed page) or accept the current approximation
explicitly and widen the copy to not claim "your first orders" when it
cannot actually distinguish the two cases.

## Info

### IN-01: Accept popover's custom-minutes confirm silently no-ops on invalid input

**File:** `apps/admin/src/components/orders/accept-popover.tsx:60-64`
**Issue:** `confirmCustom` returns early with no user-visible feedback
when `customMinutes` is non-integer or outside `[5, 180]` — the operator
taps "Принять" in the custom-ETA flow and, on an out-of-range value,
nothing happens at all (no toast, no inline error, no shake). On a
tablet mid-service this reads as an unresponsive button rather than a
rejected value.
**Fix:** show a short inline validation message (or `showError`) when the
guard fails, matching the "Try again" / visible-failure discipline used
elsewhere in this phase.

### IN-02: Guest status tracker's current step has no `aria-current`/programmatic "current step" semantics

**File:** `apps/website/components/checkout/order-status-poller.tsx:203-244`
**Issue:** the 4-step tracker communicates "current" purely via color
class (`border-primary bg-primary`) and font-weight/case changes on the
step label — there is no `aria-current="step"` (or equivalent) on the
active step's container, so a screen-reader user gets four sequential
labels with no signal about which one is "now."
**Fix:** add `aria-current={state === 'current' ? 'step' : undefined}` to
each step's wrapping `<div>`.

### IN-03: Escalation-repeat chime interval is torn down/recreated on every feed content change

**File:** `apps/admin/src/lib/hooks/use-order-sound.ts:66-89`
**Issue:** the 30s-repeat effect's dependency array is
`[unacceptedRows, play]`; `unacceptedRows` is the `groups.waiting` array
computed fresh each render. TanStack Query's default `structuralSharing`
means this reference is stable when the feed's polled response is
unchanged, but on any real content change (a new order arrives, one gets
accepted) the reference changes and this `setInterval` is cleared and
restarted, resetting its own 5s internal countdown right as the feed
happens to be busy — exactly the period an operator is most likely to be
juggling several unaccepted orders at once. The per-order last-chime
timestamps persist across recreations (stored in a `ref`, not reset), so
this self-corrects rather than silently losing the escalation chime
outright, but the check cadence becomes less predictable during exactly
the busy periods D-14 is meant to cover.
**Fix:** track `unacceptedRows` via a ref updated in a separate effect and
drop it from this effect's dependency array, keeping a single long-lived
interval for the component's lifetime.

---

_Reviewed: 2026-08-17T23:45:09Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
