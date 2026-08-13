---
phase: 10
slug: admin-order-intake
status: draft
shadcn_initialized: true
preset: new-york / neutral (apps/admin AND apps/website — pre-existing, components.json unchanged this phase)
created: 2026-08-13
---

# Phase 10 — UI Design Contract

> **Founder framing, verbatim from CONTEXT.md: "admin is the kitchen."** This is not a CRUD page over orders — it is the screen a restaurant stares at during a Friday-evening service. Where a decision trades operator speed against developer convenience, operator speed wins. Every decision below is judged against a tablet on a counter, at arm's length, in a loud room, mid-service.
>
> Two surfaces are in scope: **`apps/admin`** (operator feed, TanStack Router + Vite + shadcn `new-york`/`neutral`, dark mode already live) and **`apps/website`** (guest live-status tracker, Next.js App Router + shadcn `new-york`/`neutral` + next-intl). Both share the same design-token contract via `packages/config-tailwind/preset.css` — colors declared once below apply to both surfaces.
>
> Locked decisions (D-01..D-17) are load-bearing on this document and are **not** re-litigated here. Where this spec makes a call CONTEXT.md left to discretion, it is stated as a decision, not a question — genuine open items are collected at the end.

---

## Design System

| Property          | Value                                                                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool              | shadcn (already initialized in both apps — no re-init this phase)                                                                                                                                                                                                                        |
| Preset            | `new-york` / `neutral` (`apps/admin/components.json`, `apps/website/components.json`)                                                                                                                                                                                                    |
| Component library | radix-ui                                                                                                                                                                                                                                                                                 |
| Icon library      | lucide-react                                                                                                                                                                                                                                                                             |
| Font              | System stack — `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif` (`packages/config-tailwind/preset.css` `--font-sans`; no webfont is loaded in either app — `apps/admin/index.html` has no font link, `--font-inter` fallback var is unset in the Vite app) |
| Language          | Russian first (`<html lang="ru">` in `apps/admin/index.html`; `i18next` `fallbackLng: 'ru'`). Every new string in this phase ships in Russian; English is the secondary/parity locale.                                                                                                   |

---

## Spacing Scale

Declared values (8-point scale, matches every existing admin surface — `px-4 lg:px-6` page gutters, `gap-4`/`gap-6` stacks):

| Token | Value | Usage                                                               |
| ----- | ----- | ------------------------------------------------------------------- |
| xs    | 4px   | Icon gaps, badge internal padding                                   |
| sm    | 8px   | Compact element spacing (chip gaps, form field gaps)                |
| md    | 16px  | Default element spacing, card padding, page gutter (`px-4 lg:px-6`) |
| lg    | 24px  | Section padding, Sheet section gaps                                 |
| xl    | 32px  | Layout gaps                                                         |
| 2xl   | 48px  | Major section breaks                                                |
| 3xl   | 64px  | Page-level spacing                                                  |

**Exceptions:**

- **48px minimum touch target on primary card-face actions** (Принять / Отклонить / status-advance button / Cancel confirm). The default shadcn `Button` `lg` size is 40px (`h-10`) — too small for a tablet at arm's length per the founder framing and Product persona's tap-target findings. Primary order actions get an explicit `h-12` (48px) override; this is the one place in the admin app that exceeds the component-library default, and it must stay consistent everywhere an order-status action lives (card face, Sheet header, Accept/Reject popovers).
- Secondary/icon actions (mute toggle, filter selects, the retry link in the refund-failed banner) use the existing default sizes (`h-9`/`h-8`) — no exception needed, these are not the rushed happy-path taps.
- Card-to-card gap in the feed is `gap-3` (12px, still a multiple of 4) — denser than the `md` default because the feed is a scrolling list of many small units, not a form.

---

## Typography

| Role       | Size | Weight | Line Height | Usage                                                                                                                                                                                             |
| ---------- | ---- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body       | 14px | 400    | 1.5         | Card meta text, table cells, Sheet body copy — matches every existing admin surface (`text-sm`)                                                                                                   |
| Label      | 12px | 500    | 1.2         | Badge/chip text, filter labels, timeline stamps (`text-xs font-medium`)                                                                                                                           |
| Subheading | 16px | 600    | 1.3         | Sheet section titles ("Состав заказа", "История заказа") — matches existing `CardTitle` weight                                                                                                    |
| Heading    | 24px | 600    | 1.2         | Page heading ("Заказы") — matches the existing `PageHeading` component (`text-2xl font-semibold`), do not introduce a new size here                                                               |
| Display    | 28px | 700    | 1.1         | The daily order number (`№{{n}}`) — the one number operators and guests actually read at a glance. Used identically on the admin card face, the admin detail Sheet header, and the guest tracker. |

---

## Color

Reuses the existing shared token contract (`packages/config-tailwind/preset.css` + `apps/admin/src/styles.css` `.dark` overrides) — **no new tokens are introduced.** This phase is, however, the **first consumer of `--success`/`--warning`** anywhere in the codebase (confirmed via repo-wide grep: zero prior `bg-success`/`bg-warning` usage) — they are declared in the preset and Tailwind will generate the utilities, but the executor should know this is untrodden ground, not an established pattern to copy from elsewhere.

| Role            | Value (light / dark)                                                                                                        | Usage                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dominant (60%)  | `--background` `oklch(1 0 0)` / `oklch(0.145 0 0)`                                                                          | Page background                                                                                                                                                                                                                                                                                                                                               |
| Secondary (30%) | `--card` / `--secondary` / `--sidebar` (`oklch(1 0 0)`/`oklch(0.97 0 0)` light, `oklch(0.205 0 0)`/`oklch(0.269 0 0)` dark) | Order cards, filter bar surface, Sheet background, sidebar                                                                                                                                                                                                                                                                                                    |
| Accent (10%)    | `--primary` `#16a34a` / `#22c55e` (green)                                                                                   | **Reserved for:** primary CTA buttons only — Принять / Готовится / Готово / Завершить advance actions (card face + Sheet), the "Новый" status chip's outline (not fill — see Order Card section), the sidebar's active-nav indicator, and the unaccepted-order counter badge's use of the color family is explicitly **not** this token (see Destructive row) |
| Destructive     | `--destructive` `#ef4444` / `#f87171`                                                                                       | **Reserved for:** the escalated-unaccepted card border + chip, the Cancel button + its `AlertDialog`, the refund-failed badge/banner (feed + card + Sheet), the "Отменён" status chip outline. **Never used for Reject** (see Order Card / Reject Flow — this is the deliberate D-09 asymmetry, do not "improve" it)                                          |
| Warning         | `--warning` `#f59e0b` / `#fbbf24`                                                                                           | **Reserved for:** the "Готовится" (preparing) status chip only                                                                                                                                                                                                                                                                                                |
| Success         | `--success` `#16a34a` / `#22c55e` (same hex as primary by design in this token set)                                         | **Reserved for:** the "Готово" (ready) status chip, the guest tracker's completed-step checkmarks, the Live-connection pill dot                                                                                                                                                                                                                               |

Accent reserved for: primary order-advance actions and the active-nav/unaccepted-counter indicator — **never** for Reject, never decoratively.

---

## Copywriting Contract

| Element                                            | Copy                                                                                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary CTA                                        | **Принять** (Accept order — opens the ETA popover, see Accept Flow)                                                                                                                    |
| Empty state heading (activation, zero orders ever) | Здесь появятся ваши первые заказы                                                                                                                                                      |
| Empty state body                                   | Поделитесь ссылкой на заказ, и всё, что оплатят гости, появится здесь.                                                                                                                 |
| Error state                                        | Не удалось загрузить заказы / Проверьте соединение и попробуйте снова. + **Повторить** button (never a dead-end message — matches `apps/CLAUDE.md`'s mandatory "Try again" affordance) |
| Destructive confirmation                           | Cancel (Отменить заказ): "Отменить заказ №{{n}}? Будет оформлен возврат {{amount}}. Это действие нельзя отменить." confirm button repeats the amount: "Отменить и вернуть {{amount}}"  |

Full copy deck (every string, both surfaces) is in **Section 12** below.

---

## Registry Safety

| Registry        | Blocks Used                                                                                                                                                                                             | Safety Gate                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| shadcn official | `apps/admin`: **add** `popover` (net-new — see Component Inventory). `apps/website`: **add** `checkbox` (net-new, for marketing consent). All other components used are already installed in both apps. | not required (official registry) |
| Third-party     | none                                                                                                                                                                                                    | not applicable                   |

No third-party registry is used or proposed. No vetting gate required.

---

## Component Inventory

**`apps/admin/src/components/ui/` — already installed, reuse as-is:**
`alert-dialog`, `badge`, `button`, `card`, `dialog`, `select`, `separator`, `sheet`, `skeleton`, `sonner`, `switch`, `table`, `textarea`, `tooltip`, plus the shell primitives (`sidebar`, `dropdown-menu`, `breadcrumb`, `avatar`, `collapsible`, `form`, `input`, `input-group`, `item`, `field`, `label`, `progress`, `tabs`).

**`apps/admin` — need to add this phase:**

- `popover` (`npx shadcn add popover`) — used for the Accept ETA quick-choice and the Reject reason chips (Sections 4, 5). Nothing in the current admin app uses Popover yet.

**Reuse (do not rebuild) — existing project utilities directly applicable to this phase:**

- `apps/admin/src/lib/menu/format-age.ts` — `formatAge()`/`formatDuration()` already produce exactly the Russian short-duration strings ("5м назад", "12м") this phase's time-in-state chip needs. Reuse verbatim, do not write a second formatter.
- `apps/admin/src/components/menu/status-badge.tsx` — the `EXTRA_CLASS`-on-`Badge` pattern (variant + a targeted className override for non-standard colors like amber) is the established precedent for the order status chip; follow its shape exactly for the 8-state order chip.
- `apps/admin/src/components/page-heading.tsx`, `apps/admin/src/components/empty-state.tsx` — reuse for the page header and the two non-activation empty states.
- `apps/admin/src/lib/ui/toast-helpers.ts` (`showSuccess`/`showError`) — use for every mutation toast in this spec.
- `apps/admin/src/lib/hooks/use-effective-location.ts` — the feed's only location authority (D-02). Do not invent a parallel filter.

**`apps/website/components/ui/` — already installed, reuse as-is:**
`alert-dialog`, `badge`, `button`, `dialog`, `form`, `input`, `label`, `radio-group`, `scroll-area`, `separator`, `sheet`, `skeleton`, `sonner`, `tabs`, `tooltip`.

**`apps/website` — need to add this phase:**

- `checkbox` (`npx shadcn add checkbox`) — the marketing-consent checkbox at checkout (D-17). Not present today (no `checkbox.tsx` under `apps/website/components/ui/`).

---

## 1. The Order Card

The core object of this phase. One card per order, never a dense table row — this is a tablet-at-arm's-length surface, not a spreadsheet.

**Card anatomy (all states):** `Card` (rounded-lg border, `--card` background), `p-4` internal padding, header row = Display-size daily number (`№{{n}}`) top-left + status chip top-right (+ location Badge in `all` mode, see below), a body row of 1–2 lines of order summary (item count, fulfillment mode icon), a footer row of action button(s). The long internal key (`20260810-A7K2M`-shaped `orderNumber`) is **never shown on the card** — it appears only in the detail Sheet, small and muted, for support reference.

### State table

| State                                                       | Trigger                                                                                             | Card background / border                                                                                                         | Status chip (variant + copy)                                                                                                   | Actions on card face                                                                                                                    | Actions in detail only       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Новый (new, unaccepted)                                     | `status='paid'`, `acceptedAt=null`, age < 5 min                                                     | `bg-card`, `border-border` (default)                                                                                             | `outline` with `border-primary text-primary` — "Новый"                                                                         | **Принять** (h-12, `variant="default"`, primary), **Отклонить** (h-12, `variant="outline"`, neutral — not destructive, see Reject Flow) | —                            |
| Просрочен (escalated)                                       | same, but age ≥ 5 min (hardcoded `UNACCEPTED_ESCALATION_MS`, default 5 min — see Open Questions #1) | `bg-destructive/10`, `border-2 border-destructive`                                                                               | `destructive` solid, pulsing (`animate-pulse`) — "Ждём {{duration}}"                                                           | Same two buttons, now on a red card                                                                                                     | —                            |
| Принят (accepted)                                           | `status='accepted'`                                                                                 | `bg-card`, `border-border`                                                                                                       | `secondary` — "Принят"                                                                                                         | **Готовится** (h-12, primary)                                                                                                           | Cancel                       |
| Готовится (preparing)                                       | `status='preparing'`                                                                                | `bg-card`, `border-border`                                                                                                       | custom `bg-warning text-warning-foreground` (follow `status-badge.tsx`'s `EXTRA_CLASS` pattern) — "Готовится"                  | **Готово** (h-12, primary)                                                                                                              | Cancel                       |
| Готово (ready)                                              | `status='ready'`                                                                                    | `bg-card`, `border-l-4 border-success`                                                                                           | custom `bg-success text-success-foreground` — "Готово"                                                                         | **Выдан** (h-12, primary)                                                                                                               | Cancel                       |
| Завершён (completed)                                        | `status='completed'`                                                                                | `bg-muted/40` (dimmed, `opacity-80`)                                                                                             | `outline` + `text-muted-foreground` — "Завершён"                                                                               | none (terminal, tap opens detail only)                                                                                                  | Discretionary refund (owner) |
| Отменён (canceled — both reject and cancel intents)         | `status='canceled'`                                                                                 | `bg-muted/40` (dimmed)                                                                                                           | `outline` `border-destructive text-destructive` — "Отменён"                                                                    | none                                                                                                                                    | view reason in detail        |
| **Возврат не прошёл** (overlay flag, not a distinct status) | any terminal order where its `payment_refunds` row has `status='failed'`                            | **Does not dim** even though the order is terminal — stays `bg-destructive/10`, full opacity, so it is never mistaken for "done" | destructive solid badge (icon `AlertTriangle`) pinned top-right, overrides/sits beside the terminal chip — "Возврат не прошёл" | **Повторить возврат** (card face — the one terminal-state card that keeps an action)                                                    | —                            |

**Time-in-state chip:** every active card (new/accepted/preparing/ready) carries a small secondary chip next to the status chip: relative duration via `formatDuration()`/`formatAge()` (reuse verbatim). Color progression: green text `< 5 min`, amber `5–15 min`, red `> 15 min` (Product persona's banding). This is independent of the escalation chip above — escalation is specific to the _unaccepted_ state and fires at 5 min, not 15. A `Tooltip` on the chip reveals the exact timestamp (accessibility — see Section 13).

**Location label (`all` mode, D-02):** an `outline` `Badge` with a `MapPin` icon, top-right next to the status chip, showing the location name (never "all"). Only rendered when `useEffectiveLocation().mode === 'all'`.

**Daily order number:** Display-size (28px/700), `№{{shortNumber}}`, top-left of every card — the single largest element on the card, exactly as the founder framing demands ("the number staff will call out").

---

## 2. Feed Layout & Sort

**Viewport assumption:** primary target is a tablet in landscape, ~1024–1366px wide, sitting on a counter; must degrade cleanly to a laptop browser window (this is a page inside the existing admin shell, not a kiosk app — D-01). Minimum touch target for primary actions is 48px (Spacing Scale exception above); secondary controls (filters, mute toggle) use the existing 32–36px defaults since they are not rushed-tap targets.

**Layout:** single scrollable column of cards on <1280px width; `grid-cols-2 gap-4` on ≥1280px. Max card width in single-column mode: 640px, centered.

**Sort — solves D-03's "an active order gets lost by end of service" without a second tab, via grouping + sort order, exactly as CONTEXT.md instructs:**

Three visually-separated groups, each with a small sticky sub-header (`text-xs uppercase text-muted-foreground`, not a tab — no click target, purely a visual anchor as the operator scrolls):

1. **Ждут** — unaccepted orders (`status='paid'`, not yet accepted), sorted **oldest first** (the longest-waiting, most urgent card is always at the very top of the whole feed).
2. **В работе** — accepted/preparing/ready, sorted **oldest first** (matches kitchen FIFO expectations).
3. **Завершены** — completed/canceled/refunded, sorted **newest first** (operators rarely scroll into history mid-service; the most recent terminal order is the one someone might still be asking about).

A group with zero orders is omitted entirely (no empty "Ждут" header taking up space). This is the whole mechanism that makes D-03's single-filtered-list survive a Friday close — no tab, no toggle, just sort + grouping.

**Explicitly not built this phase (do not silently add):** full-screen/kiosk "Focus mode," a board/column-per-status layout, `navigator.wakeLock`. D-01 locked a dedicated page inside the existing shell; Product persona's HIGH-4 kiosk-mode recommendation was recorded and overruled by the founder — revisit post-first-customer, not here.

---

## 3. Filter Bar

Sticky row directly below `PageHeading`, above the feed groups. Horizontal flex, `gap-2`, wraps on narrow width.

| Control                | Component                                                                                                                         | Options                                                                                              | Default      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| Статус                 | `Select` (installed)                                                                                                              | Активные (paid+accepted+preparing+ready) · Все за сегодня · Завершены · Отменены · Возврат не прошёл | **Активные** |
| Дата                   | `Select`                                                                                                                          | Сегодня · Вчера · 7 дней                                                                             | **Сегодня**  |
| Канал                  | **static `Badge`, not an interactive control** — "Сайт" only, with a `Tooltip`: "Появятся другие каналы, когда подключим QR-меню" | —                                                                                                    | n/a          |
| Live/Reconnecting pill | `Badge variant="outline"` + colored dot                                                                                           | "В сети" (green dot) / "Переподключение…" (amber dot, pulsing)                                       | В сети       |

**Channel is honest by design, per D-04's own instruction ("be honest in the UI").** `apps/qr-menu` has no order-submission path yet, so a real filter dropdown with one meaningful option is dead UI that implies a choice that doesn't exist. Render a static labeled badge instead of a fake interactive `Select` — this satisfies ORDINT-08's data/plumbing requirement (the `channel` column and query support exist) without lying to the operator about what's filterable today. When a second channel ships (QR ordering), this becomes a real `Select` — do not build that now.

No custom date-range picker this phase (no Calendar/DatePicker component is installed) — three fixed presets only. This is a deliberate scope-down to avoid pulling in a new shadcn component for a control the "today at a glance" framing doesn't need.

---

## 4. Accept Flow with ETA Capture (D-15)

**Control: `Popover`, anchored to the card-face "Принять" button.** Not a `Dialog` — a Popover keeps the rest of the feed visible behind it (context-preservation matters more than modal weight for the highest-frequency action in the app).

**Contents:** title "Через сколько будет готово?" (Subheading, 16px), then a row of 4 time chips — **15 / 20 / 30 / 45 мин** — plus a 5th "Другое" chip. **20 мин is pre-highlighted/larger** (matches a sensible per-restaurant default; see Open Questions if a per-location default ships later, this stays the fallback).

**Tap-count (critical path, count every tap):**

- Happy path: tap **Принять** (1) → tap a time chip, e.g. **20 мин** (2) → done, order accepted with `eta_at = now + 20min`. **2 taps.**
- Custom path: tap **Принять** (1) → tap **Другое** (2) → type minutes in the inline `Input type="number"` (step 5, min 5, max 180) → tap **Принять** confirm (3). **3 taps.**

This is D-15's design read literally: "Accept opens a quick choice" — the operator always makes an explicit ETA choice, no silent zero-interaction accept. Tapping any fixed chip fires the mutation immediately (chip tap = confirm, no second button for the 4 common values).

**Server contract:** the popover posts `{ prepMinutes: number }`, not a raw timestamp — the API computes `eta_at` server-side to avoid client clock skew.

**Toast on success:** "Заказ №{{n}} принят — будет готов к {{time}}" (localized clock time, not a duration — matches what the guest tracker will also show).

---

## 5. Reject Flow (D-09)

**One tap on the card face → reason chips → done.** Deliberately lightweight — this happens before any food exists, and D-09 is explicit that it must never look scary or be confused with the harder-to-reach Cancel.

- **Trigger:** "Отклонить" button, card face, `variant="outline"` (neutral gray border, **not** `variant="destructive"` — this is the visual half of D-09's asymmetry; Accept is the filled-primary button, Reject is a plain outline button, same visual weight class as any secondary action anywhere else in the app).
- **Control:** the same `Popover` pattern as Accept, anchored to "Отклонить". Contents: title "Почему отклоняем?", then 7 reason chips (fixed set, shared with Cancel per Growth HIGH-6 — one taxonomy, one report later):

  Нет в наличии · Кухня перегружена · Гость отменил · Гость не выходит на связь · Проблема с оплатой · Дубликат заказа · Другая причина

- **Tap count:** tap **Отклонить** (1) → tap a reason chip (2) = fires immediately, **2 taps**. "Другая причина" opens an inline `Textarea` (max 500 chars) + confirm button = **3 taps**.
- On success: card animates into the "Завершены" group with the "Отменён" chip; toast "Заказ №{{n}} отклонён — возврат {{amount}} оформлен" (full amount, always — D-09's "always full auto-refund").
- **The word "rejected" never reaches the guest** — the guest tracker (Section 11) shows guest-safe wording mapped from the reason code, never the operator-facing chip label verbatim.

---

## 6. Cancel Flow (D-09 / D-10)

**Deliberately harder to reach than Reject — buried in the order detail, never on the card face, never adjacent to a status-advance button.**

- **Location:** inside the Order Detail `Sheet` (Section 7), in the footer, below a `Separator`, visually and spatially isolated from the status-advance button (which lives at the top of the Sheet, near the header) — this spatial separation is itself part of the "never mis-tapped next to Ready" requirement, not just a styling choice.
- **Trigger button:** "Отменить заказ", `variant="outline"` with `text-destructive border-destructive` (outline, not solid — a solid destructive button here would read as equally "one-tap-away" as Reject, undermining the asymmetry; the friction is the `AlertDialog` that follows, not the trigger's paint).
- **Confirmation:** `AlertDialog` (modal, centered, dimmed backdrop — genuinely heavier than Reject's inline Popover):
  - Title: **"Отменить заказ №{{n}}?"**
  - Description **names the refund amount explicitly**: "Будет оформлен возврат {{amount}}. Это действие нельзя отменить."
  - A required `Select` for reason (same 7-value taxonomy as Reject — not free chips here, the modal is already the friction, no need for a second chip UI).
  - `AlertDialogCancel` = "Закрыть" (dismiss, order untouched).
  - `AlertDialogAction` (destructive) = **"Отменить и вернуть {{amount}}"** — the amount is repeated in the confirm button itself, the single strongest anti-mis-tap signal available.
- On success: toast "Заказ №{{n}} отменён — возврат {{amount}} оформлен".

**Cancel always issues a full auto-refund (D-10) — there is no partial/none option inside this flow.** A cashier using Cancel makes no financial judgment call. Partial or no-refund is a _separate_, owner-gated control inside the same Sheet's discretionary Refund section (Section 7) — never surfaced here.

**Visual differentiation from Reject, summarized:** Reject = inline Popover, outline button, chip-tap-is-confirm, 2 taps, lives on the card. Cancel = modal AlertDialog, outline-destructive trigger, dropdown reason + a second explicit confirm tap naming the money, lives buried in the detail. The _interaction weight itself_ is the differentiator, not just color.

---

## 7. Order Detail

**Component: `Sheet`, `side="right"`, `className="sm:max-w-lg"` (~512px), full-width on mobile.** Triggered by tapping the card body (not an action button) — keeps the feed visible, dimmed, behind it so the operator never loses their place mid-service. This is a deliberate choice over a separate route: context-preservation during a rush outweighs deep-linkability for this phase.

**Section order, top to bottom:**

1. **Refund-failed banner** (conditional, only if applicable — pinned above everything else, see Section 9).
2. **Header:** Display-size `№{{n}}` + status chip + time-in-state chip; internal `orderNumber` shown small/muted/`font-mono` below, for support reference only.
3. **Primary status-advance button** — right under the header, `h-12`, contextual label (Готовится / Готово / Выдан depending on current status) — placed high so it's reachable without scrolling past the item list.
4. **Fulfillment info:** mode label (Самовывоз / В зале — "Доставка" renders as a label only, **never** an "in transit"/dispatch stage; Phase 9 is not shipped, per Skeptic HIGH-6 the feed must not render a lifecycle the backend cannot back), table/pickup identifier, scheduled time if present.
5. **Гость (customer):** name, phone (`tel:` link), email if present.
6. **Состав заказа (items):** name × qty, modifiers indented under each line, per-line price; totals breakdown (subtotal / service fee / discount / total) at the bottom.
7. **История заказа (timeline):** small vertical stepper of populated per-state timestamps (accepted/preparing/ready/completed, or the cancel record) — every timestamp this phase's migration adds becomes visible here, which is also the cheapest possible UI for the operational-metrics data CTO/Growth personas asked for.
8. **Возврат (discretionary refund) — owner-only, rendered only when the signed-in operator's permission set includes the billing/refund permission** (`billing:update` per current RBAC — read via the same pattern `locations.tsx` uses for its `isOwner` check). Arbitrary-amount `Input` (defaulted to the remaining refundable amount), reason `Textarea`, "Оформить возврат" button. **If the operator lacks the permission, this entire section is omitted — not shown-disabled.** A visible-but-disabled control that a cashier can never use is exactly the kind of confusing surface `apps/CLAUDE.md`'s "no static identity placeholders" spirit warns against; omission is cleaner than a dead control.
9. **Footer — Отменить заказ** (Section 6), gated on the order-cancel permission (D-06; exact RBAC verb is a backend/planner decision, see Open Questions #4), visually separated by a `Separator` from everything above.

---

## 8. Alerting (D-14)

- **Chime:** a short (~1s) two-tone bell, `HTMLAudioElement`. Fires **once** when a new unaccepted order arrives. If that order crosses the 5-minute escalation threshold (Section 1) without being accepted/rejected, the chime **repeats every 30s** until it is — this distinguishes "a new order arrived" from "you are ignoring an order," matching D-12's "the sound repeats" language, which is specifically about the escalated state, not every poll tick.
- **Autoplay-policy gate (real browser constraint, design around it, not discover it late):** on first visit to `/orders` in a session (localStorage flag `orders.soundUnlocked`), render a full-width `Card` banner above the filter bar: **"Включите звук уведомлений"** / "Чтобы не пропустить новый заказ, разрешите звук в этой вкладке." / button **"Включить звук"**. The click plays a short blip to unlock the AudioContext, then the banner hides permanently. Every subsequent `Audio.play()` call is wrapped in `.catch()` — if it still rejects (rare), show a persistent small warning next to the mute toggle: **"Звук может не работать в этом браузере."** A silently-failed chime with no visible sign anything is wrong is explicitly the failure mode D-14 calls out.
- **Mute toggle:** `Switch`, label "Звук", `Volume2`/`VolumeX` icon, in the filter bar. Persisted per-device (`localStorage`, not per-account — a tablet bolted to one counter keeps its own setting). **Default: sound ON** (per D-14's own instruction — a chime during a quiet hour is a lesser failure than a silent miss).
- **Tab title:** `document.title = unacceptedCount > 0 ? \`(${unacceptedCount}) Заказы\` : 'Заказы'` — matches D-14's literal example verbatim (`(2) Заказы`). Restore the base title on route unmount.
- **Known, documented limitation (do not silently over-promise):** modern browsers throttle JS timers in backgrounded tabs to roughly one firing per minute after prolonged hidden state. "A backgrounded tab still signals" is real and buildable, but its cadence degrades from 5s to ~1min while hidden — this is a platform constraint, not a bug, and the executor should not be asked to "fix" it.

---

## 9. Refund-Failure Surface (D-11)

Three surfaces, from least to most zoomed-in, all pointing at the same underlying "this order has a `payment_refunds` row with `status='failed'`" fact:

1. **Feed-level banner** — sticky, full-width, directly above the filter bar, appears only when ≥1 order in the current brand/location scope has a failed refund. **"{{count}} возврат(а) не прошли — требуется действие"** (i18next plural forms, see Copy Deck) with a **"Показать"** action that sets the Status filter to "Возврат не прошёл". Persistent — does not auto-dismiss, unlike a toast, because this is money sitting broken, not a transient event.
2. **Card-level** — the affected card does **not** dim into the terminal group's usual muted styling (Section 1's overlay-flag row); it stays full-opacity, red-tinted, with a destructive badge (icon `AlertTriangle`, "Возврат не прошёл") and keeps a card-face action: **"Повторить возврат"** — the one exception to "terminal cards have no actions."
3. **Detail-level** — a banner pinned at the very top of the Sheet (above even the header): `bg-destructive/10 border border-destructive text-destructive rounded-md p-3`, "Возврат {{amount}} не прошёл." + **"Повторить"** button, with the raw technical failure reason available underneath in small muted text (operator/debug detail, never guest-facing).

This is explicitly the answer to the agenda's "whether it needs a feed-level banner so it is not missed" — yes, because D-11's whole premise is that a failed refund must never silently block the kitchen _or_ silently disappear from view.

---

## 10. Loading / Empty / Error States

**Loading (first paint, no cached data):** 3 `Skeleton` cards matching the real card's dimensions — no bare spinner.

**Empty — brand has zero orders ever (the tenant's activation moment, Product LOW-21):** a bespoke card, not the generic `EmptyState`:

- Heading: **"Здесь появятся ваши первые заказы"**
- Body: "Поделитесь ссылкой на заказ, и всё, что оплатят гости, появится здесь."
- A 3-item checklist (✓/✗ pulled from already-existing queries — payments status, menu-publish status, location status; no new backend endpoint needed): Приём платежей подключен · Меню опубликовано · Точка открыта.
- The ordering link with a copy button ("Скопировать ссылку") and a downloadable QR code (**"Скачать QR-код"** — flag: verify a QR-generation dependency isn't already present elsewhere before adding a new one, see Open Questions #3).

**Empty — filtered view legitimately has zero rows** (e.g. "Завершены" + today, nothing done yet): the existing generic `EmptyState` component, `variant="empty"`, title "Ничего не найдено", body "Измените фильтры или проверьте другую дату." — deliberately the _plain_ pattern, reserving the bespoke activation design for the true zero-orders-ever case only.

**Error — the safety-critical distinction the agenda calls out: "cannot reach the server" must never look like "no orders."**

- If the feed already has data and a poll fails: **keep showing the stale list**, do not clear it. Flip the Live pill to "Переподключение…" (amber, pulsing) and show a thin inline banner under the filter bar: "Не удалось обновить список — показаны данные на {{time}}" + **"Обновить"** button (satisfies `apps/CLAUDE.md`'s mandatory Try-again affordance).
- If the very first load fails (no cached data — the moment "empty" and "down" would otherwise be indistinguishable): render a structurally distinct full-panel error state — `WifiOff`/`AlertTriangle` icon, heading **"Не удалось загрузить заказы"**, body "Проверьте соединение и попробуйте снова.", button **"Повторить"**. This must look nothing like either empty state — different icon, different copy register, a retry button where the empty states have none.

---

## 11. Guest-Facing Status Page (`apps/website`)

Rewrite target: `apps/website/components/checkout/order-status-poller.tsx`. This is the other half of the two-screen demo the founder's Specific Ideas section calls "the strongest thing this phase produces."

- **`TERMINAL_STATUSES`** becomes `{'completed', 'canceled', 'refunded', 'failed'}` — `'paid'` is removed (today's bug: polling stops the instant payment confirms, per D-16).
- **Poll cadence by status:** `created`/`requires_action` 2s (payment confirming, highest urgency) · `paid` 5s (waiting on accept — highest guest anxiety) · `accepted`/`preparing` 15s · `ready` 30s · terminal: stop.
- **Visual: a 4-step horizontal tracker** (vertical stack on mobile) — **Оплачен → Принят → Готовится → [Готов к выдаче | Готово — принесём к столу]** (the last label swaps by `fulfillmentMode`; a `delivery` order uses the same "Готово" label as pickup — **never** an "in transit"/dispatch step, per Skeptic HIGH-6, since Phase 9 does not exist yet). Current step: filled `--primary` circle + connecting line. Complete steps: `--success` checkmark. Future steps: muted ring, no fill.
- **Typography:** step label 12px/500, uppercase, `text-muted-foreground` when inactive, 14px/600 `text-foreground` when active/complete. Step indicator: `size-8` (32px) circle.
- **ETA row**, directly under the tracker: once `etaAt` is present (from `accepted` onward), **"Будет готово к {{time}}"** (localized clock time). Before an ETA exists (order still `paid`, not yet accepted): **"Ресторан скоро примет ваш заказ"** — never a fabricated time.
- **Daily number**, not the internal key: Display-size (28px/700) `№{{shortNumber}}` replaces the current small mono `orderNumber` display. The long internal key is dropped from guest view entirely — the guest never needs it (matches Growth LOW-20: "display it, never route on it," extended here to "don't even display the long one").
- **Location block** (`ready`/`accepted`, pickup): location name + address + "Построить маршрут" link + tap-to-call phone if present.
- **Terminal — declined/canceled:** replaces the tracker with a distinct card, never a 5th tracker step:
  - Reject: heading **"Ресторан не смог принять ваш заказ"**
  - Cancel-after-accept: heading **"Заказ отменён рестораном"**
  - Both: a guest-safe reason line (mapped from the reason code — **never** the operator-facing chip label, see Copy Deck's mapping table) + **"Возврат {{amount}} оформлен — поступит на карту в течение 5–10 рабочих дней."**
  - **"Вернуться в меню"** CTA.
- **Never render a raw status enum.** Replace `status.replace('_', ' ')` with an explicit status → label map (Copy Deck).
- **Reconnecting affordance, guest side too:** small muted "Обновляем статус…" during a poll; on a failed poll, keep the last known status visible and show "Не удалось обновить. **Обновить**" (same Try-again discipline as the admin side).
- **i18n correction, in-path for this phase:** the current checkout components are hardcoded English despite `next-intl` infrastructure already existing (`apps/website/lib/i18n`, `messages/{ru,uk,en}.json`) with an established `checkout.*` namespace. Since this component's copy is being rewritten anyway for the new statuses, route it through `useTranslations()` with new `checkout.status.*` keys in all three locale files, Russian written first — do not add more hardcoded English on top of debt already flagged by research (E.15).

---

## 12. Copy Deck

All strings below are Russian, written for the operator (admin) or the guest (website) as the reader — no developer jargon, no raw enum values, matching the existing `ru.json` tone (no exclamation marks, ellipsis for in-progress states, "Не удалось X." for failures, "Попробуйте ещё раз." for generic retries).

### Admin (`apps/admin`) — new `orders.*` i18next namespace, mirrors the `menu.*` structure

**Navigation**

| Key                                                    | Russian                                |
| ------------------------------------------------------ | -------------------------------------- |
| `nav.orders`                                           | Заказы                                 |
| Tab title (dynamic, not a JSON key — `document.title`) | `(N) Заказы` when N > 0, else `Заказы` |
| Sidebar badge aria                                     | Непринятых заказов: {{count}}          |

**Feed**

| Key                              | Russian                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `orders.feed.groupWaiting`       | Ждут                                                     |
| `orders.feed.groupInProgress`    | В работе                                                 |
| `orders.feed.groupDone`          | Завершены                                                |
| `orders.feed.live`               | В сети                                                   |
| `orders.feed.reconnecting`       | Переподключение…                                         |
| `orders.feed.staleNotice`        | Не удалось обновить список — показаны данные на {{time}} |
| `orders.feed.staleRetry`         | Обновить                                                 |
| `orders.feed.refundBanner_one`   | {{count}} возврат не прошёл — требуется действие         |
| `orders.feed.refundBanner_few`   | {{count}} возврата не прошли — требуется действие        |
| `orders.feed.refundBanner_many`  | {{count}} возвратов не прошли — требуется действие       |
| `orders.feed.refundBannerAction` | Показать                                                 |

**Filters**

| Key                                 | Russian                                         |
| ----------------------------------- | ----------------------------------------------- |
| `orders.filters.statusLabel`        | Статус                                          |
| `orders.filters.statusActive`       | Активные                                        |
| `orders.filters.statusAllToday`     | Все за сегодня                                  |
| `orders.filters.statusCompleted`    | Завершены                                       |
| `orders.filters.statusCanceled`     | Отменены                                        |
| `orders.filters.statusRefundFailed` | Возврат не прошёл                               |
| `orders.filters.dateLabel`          | Дата                                            |
| `orders.filters.dateToday`          | Сегодня                                         |
| `orders.filters.dateYesterday`      | Вчера                                           |
| `orders.filters.dateWeek`           | 7 дней                                          |
| `orders.filters.channelLabel`       | Канал                                           |
| `orders.filters.channelSiteOnly`    | Сайт                                            |
| `orders.filters.channelHint`        | Появятся другие каналы, когда подключим QR-меню |

**Card**

| Key                             | Russian           |
| ------------------------------- | ----------------- |
| `orders.card.newBadge`          | Новый             |
| `orders.card.escalatedBadge`    | Ждём {{duration}} |
| `orders.card.acceptedBadge`     | Принят            |
| `orders.card.preparingBadge`    | Готовится         |
| `orders.card.readyBadge`        | Готово            |
| `orders.card.completedBadge`    | Завершён          |
| `orders.card.canceledBadge`     | Отменён           |
| `orders.card.refundFailedBadge` | Возврат не прошёл |
| `orders.card.acceptBtn`         | Принять           |
| `orders.card.rejectBtn`         | Отклонить         |
| `orders.card.startPreparingBtn` | Готовится         |
| `orders.card.markReadyBtn`      | Готово            |
| `orders.card.completeBtn`       | Выдан             |
| `orders.card.locationBadgeAria` | Точка: {{name}}   |
| `orders.card.dailyNumber`       | №{{n}}            |

**Accept**

| Key                               | Russian                                      |
| --------------------------------- | -------------------------------------------- |
| `orders.accept.title`             | Через сколько будет готово?                  |
| `orders.accept.chip15`            | 15 мин                                       |
| `orders.accept.chip20`            | 20 мин                                       |
| `orders.accept.chip30`            | 30 мин                                       |
| `orders.accept.chip45`            | 45 мин                                       |
| `orders.accept.customChip`        | Другое                                       |
| `orders.accept.customPlaceholder` | Минут                                        |
| `orders.accept.customConfirm`     | Принять                                      |
| `orders.accept.acceptedToast`     | Заказ №{{n}} принят — будет готов к {{time}} |
| `orders.accept.failedToast`       | Не удалось принять заказ.                    |

**Reject** (reason set shared with Cancel — see Assumption in Open Questions #2)

| Key                              | Russian                                             |
| -------------------------------- | --------------------------------------------------- |
| `orders.reject.title`            | Почему отклоняем?                                   |
| `orders.reasons.outOfStock`      | Нет в наличии                                       |
| `orders.reasons.kitchenBusy`     | Кухня перегружена                                   |
| `orders.reasons.guestRequested`  | Гость отменил                                       |
| `orders.reasons.guestNoShow`     | Гость не выходит на связь                           |
| `orders.reasons.paymentIssue`    | Проблема с оплатой                                  |
| `orders.reasons.duplicate`       | Дубликат заказа                                     |
| `orders.reasons.other`           | Другая причина                                      |
| `orders.reject.otherPlaceholder` | Опишите причину                                     |
| `orders.reject.rejectedToast`    | Заказ №{{n}} отклонён — возврат {{amount}} оформлен |
| `orders.reject.failedToast`      | Не удалось отклонить заказ.                         |

**Cancel**

| Key                               | Russian                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `orders.cancel.triggerBtn`        | Отменить заказ                                                   |
| `orders.cancel.dialogTitle`       | Отменить заказ №{{n}}?                                           |
| `orders.cancel.dialogDescription` | Будет оформлен возврат {{amount}}. Это действие нельзя отменить. |
| `orders.cancel.reasonLabel`       | Причина                                                          |
| `orders.cancel.reasonRequired`    | Выберите причину.                                                |
| `orders.cancel.dismissBtn`        | Закрыть                                                          |
| `orders.cancel.confirmBtn`        | Отменить и вернуть {{amount}}                                    |
| `orders.cancel.canceledToast`     | Заказ №{{n}} отменён — возврат {{amount}} оформлен               |
| `orders.cancel.failedToast`       | Не удалось отменить заказ.                                       |

**Detail**

| Key                                 | Russian          |
| ----------------------------------- | ---------------- |
| `orders.detail.internalNumberLabel` | Внутренний номер |
| `orders.detail.customerTitle`       | Гость            |
| `orders.detail.itemsTitle`          | Состав заказа    |
| `orders.detail.timelineTitle`       | История заказа   |
| `orders.detail.timelineCreated`     | Оплачен          |
| `orders.detail.timelineAccepted`    | Принят           |
| `orders.detail.timelinePreparing`   | Готовится        |
| `orders.detail.timelineReady`       | Готово           |
| `orders.detail.timelineCompleted`   | Выдан            |
| `orders.detail.timelineCanceled`    | Отменён          |
| `orders.detail.totalsSubtotal`      | Сумма            |
| `orders.detail.totalsService`       | Сервисный сбор   |
| `orders.detail.totalsDiscount`      | Скидка           |
| `orders.detail.totalsTotal`         | Итого            |

**Discretionary refund**

| Key                               | Russian                              |
| --------------------------------- | ------------------------------------ |
| `orders.refund.title`             | Возврат                              |
| `orders.refund.amountLabel`       | Сумма возврата                       |
| `orders.refund.reasonLabel`       | Причина                              |
| `orders.refund.reasonPlaceholder` | Например: гость пожаловался на блюдо |
| `orders.refund.submitBtn`         | Оформить возврат                     |
| `orders.refund.remainingHint`     | Доступно к возврату: {{amount}}      |
| `orders.refund.successToast`      | Возврат {{amount}} оформлен          |
| `orders.refund.failedToast`       | Не удалось оформить возврат.         |
| `orders.refund.retryBtn`          | Повторить возврат                    |
| `orders.refund.failedBanner`      | Возврат {{amount}} не прошёл         |

**Alerts**

| Key                              | Russian                                                         |
| -------------------------------- | --------------------------------------------------------------- |
| `orders.alerts.enableSoundTitle` | Включите звук уведомлений                                       |
| `orders.alerts.enableSoundBody`  | Чтобы не пропустить новый заказ, разрешите звук в этой вкладке. |
| `orders.alerts.enableSoundBtn`   | Включить звук                                                   |
| `orders.alerts.soundBlockedHint` | Звук может не работать в этом браузере.                         |
| `orders.alerts.muteToggleLabel`  | Звук                                                            |
| `orders.alerts.muteOnAria`       | Звук включён                                                    |
| `orders.alerts.muteOffAria`      | Звук выключен                                                   |

**Empty / error**

| Key                              | Russian                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| `orders.empty.activationTitle`   | Здесь появятся ваши первые заказы                                      |
| `orders.empty.activationBody`    | Поделитесь ссылкой на заказ, и всё, что оплатят гости, появится здесь. |
| `orders.empty.checklistPayments` | Приём платежей подключен                                               |
| `orders.empty.checklistMenu`     | Меню опубликовано                                                      |
| `orders.empty.checklistLocation` | Точка открыта                                                          |
| `orders.empty.copyLinkBtn`       | Скопировать ссылку                                                     |
| `orders.empty.linkCopiedToast`   | Ссылка скопирована                                                     |
| `orders.empty.downloadQrBtn`     | Скачать QR-код                                                         |
| `orders.empty.filteredTitle`     | Ничего не найдено                                                      |
| `orders.empty.filteredBody`      | Измените фильтры или проверьте другую дату.                            |
| `orders.error.initialLoadTitle`  | Не удалось загрузить заказы                                            |
| `orders.error.initialLoadBody`   | Проверьте соединение и попробуйте снова.                               |
| (retry button)                   | reuse existing `common.retry` = "Повторить"                            |

### Website (`apps/website`) — extends the existing `checkout.*` next-intl namespace, new `checkout.status.*`

| Key                                | Russian                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `checkout.status.stepPaid`         | Оплачен                                                                   |
| `checkout.status.stepAccepted`     | Принят                                                                    |
| `checkout.status.stepPreparing`    | Готовится                                                                 |
| `checkout.status.stepReadyPickup`  | Готов к выдаче                                                            |
| `checkout.status.stepReadyDineIn`  | Готово — принесём к столу                                                 |
| `checkout.status.waitingAccept`    | Ресторан скоро примет ваш заказ                                           |
| `checkout.status.etaLabel`         | Будет готово к {time}                                                     |
| `checkout.status.updating`         | Обновляем статус…                                                         |
| `checkout.status.updateFailed`     | Не удалось обновить статус.                                               |
| `checkout.status.retry`            | Обновить                                                                  |
| `checkout.status.declinedTitle`    | Ресторан не смог принять ваш заказ                                        |
| `checkout.status.canceledTitle`    | Заказ отменён рестораном                                                  |
| `checkout.status.refundLine`       | Возврат {amount} оформлен — поступит на карту в течение 5–10 рабочих дней |
| `checkout.status.backToMenu`       | Вернуться в меню                                                          |
| `checkout.status.orderNumberLabel` | Заказ №{n}                                                                |
| `checkout.status.locationLabel`    | Точка                                                                     |
| `checkout.status.getDirections`    | Построить маршрут                                                         |
| `checkout.status.callRestaurant`   | Позвонить                                                                 |
| `checkout.consent.label`           | Присылайте новости и акции ресторана                                      |
| `checkout.consent.hint`            | Необязательно. Сообщения о статусе заказа мы отправим в любом случае.     |

**Guest-safe reason mapping — operator reason code → guest-facing phrase (never the operator chip label verbatim):**

| Reason code        | Guest-facing phrase                           |
| ------------------ | --------------------------------------------- |
| `out_of_stock`     | этого блюда сейчас нет в наличии              |
| `kitchen_too_busy` | кухня сейчас не справляется с потоком заказов |
| `guest_requested`  | по вашей просьбе                              |
| `guest_no_show`    | мы не смогли с вами связаться                 |
| `payment_issue`    | возникла проблема с оплатой                   |
| `duplicate_order`  | это повторяющийся заказ                       |
| `other`            | по техническим причинам                       |

---

## 13. Accessibility + Contrast

- **Never color-alone.** The escalated card carries literal text ("Ждём {{duration}}") plus a pulsing `AlertCircle` icon, not just a red background. The refund-failed indicator carries an `AlertTriangle` icon and the words "Возврат не прошёл," not just red. All 8 status chips are text-labeled, never icon-only dots — 8 states cannot be reliably told apart by hue alone, especially across the light/dark switch this app already supports.
- **Contrast comes free from the existing token pairs** — as long as the executor uses the semantic classes (`bg-destructive text-destructive-foreground`, `bg-warning text-warning-foreground`, `bg-success text-success-foreground`) rather than raw hex, both light and dark mode contrast are already correct by construction (every pair above is already defined in `apps/admin/src/styles.css` / `packages/config-tailwind/preset.css`). This phase is simply the first to actually consume the warning/success pair — call this out in review, since there's no existing usage to visually diff against.
- **Focus states** come from the existing shadcn primitives' built-in `focus-visible` rings (Button, Badge, Popover, Select, Switch) — no new work required.
- **Sound state is never color-only** — the `Switch` thumb position already communicates on/off independent of color; keep the existing shadcn `Switch` as-is, do not restyle it to rely on a color swap alone.
- **Touch targets:** 48px minimum on every primary order-status action (Spacing Scale exception) — this is itself an accessibility requirement (WCAG 2.5.5 target-size), not just an ergonomics choice.
- **Precision on hover/focus:** the time-in-state chip's relative text ("12м") is backed by a `Tooltip` showing the exact timestamp — serves both precision-minded operators and anyone who needs the literal time, not just a fuzzy duration.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

## Open Questions

Genuine gaps this agent could not resolve from the repo, CONTEXT.md, or the persona reports — the founder should answer these, not the executor guessing silently.

1. **Exact escalation-threshold minutes for the "unaccepted order turns red" behavior (D-12).** CONTEXT.md gives only an illustrative display example ("shows 'waiting 20 min'"), not a pinned trigger point. This spec defaults the threshold to **5 minutes** (distinct from the generic 15-minute time-in-state amber/red banding) so the loudest alarm in the app fires well before the founder's own example text would display. Confirm or adjust the single hardcoded constant before implementation.
2. **The 7-value cancel/reject reason taxonomy is shared verbatim between this spec and `10-RESEARCH.md` Section A.3, which itself flags the set as `[ASSUMED]`** (not verified against iiko's actual cancel-reason taxonomy, per the canonical-refs instruction to borrow iiko's shapes where sensible). Because this taxonomy becomes both a database CHECK constraint and the literal chip labels shown to operators, it should be confirmed once, not drift between the migration and the UI independently.
3. **QR-code generation for the empty-state activation checklist (Section 10) may require a new dependency.** No existing QR-generation utility was found in this research pass (onboarding flow, if it has one, wasn't checked). Verify before committing to "downloadable QR PNG" as part of the empty state, or scope it down to the copy-link button only for this phase.
4. **The exact RBAC permission key gating Reject/Cancel visibility in the UI is not yet locked** — CONTEXT.md's D-06 leaves the exact verb (`order:cancel` vs. reuse of `order:update-status`) to planner discretion, and `10-RESEARCH.md` Section B.5 recommends the new `order:cancel` verb. This spec assumes the UI checks a single boolean derived from whichever verb is chosen; the planner must ensure the client-side visibility check and the server-side enforcement key are the same string, or the UI will show a button the server then 403s.

---

_UI-SPEC for Phase 10 — Admin Order Intake. Sources: `10-CONTEXT.md` (D-01..D-17, locked), `10-RESEARCH.md` (A–H, code-grounded), `10-PERSONA-PRODUCT.md`, `10-PERSONA-GROWTH.md`, `10-PERSONA-REVIEWS.md`, and a direct read of `apps/admin/src` + `apps/website` current components/tokens/i18n._
