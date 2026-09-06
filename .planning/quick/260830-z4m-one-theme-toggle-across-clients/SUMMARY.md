---
quick_id: 260830-z4m
slug: one-theme-toggle-across-clients
date: 2026-08-30
status: complete
branch: phase-10.3-qr-print
commits: [766532a8]
---

# Summary — one theme toggle, the same button in all three clients

`ThemeToggle` in `@resto/ui` is a sun/moon icon button that holds no state: it takes
`resolvedTheme` and `onToggle`. The icon is chosen from the prop rather than a `dark:`
variant, because the admin swaps themes with a `.dark` class and the guest surfaces
with `data-theme` — a variant would render correctly in only one of them.

A press flips light ⇄ dark. `system` stays the starting value until the first press
and is no longer reachable from the UI; that was the founder's call, taken over the
three-state cycle.

## What each client got

- **admin** — the toggle sits in the header next to the user menu, and the three theme
  items are gone from that menu so the control lives in one place. The provider now
  exposes `resolvedTheme` and subscribes to `prefers-color-scheme`, so an operator on
  `system` follows the OS live instead of only at reload. `nav.user.theme*` message
  keys collapsed into a single `nav.themeLabel`.
- **qr-menu** — the three-button pill is replaced by the toggle in both header and
  footer.
- **website** — had no theme control at all and was permanently light. It now has the
  toggle in the header (visible on phones, unlike the locale control), one shared
  `useGuestTheme` instance behind a context in `GuestUi` so a second control can never
  drift from the first, a toaster that follows the resolved theme instead of a
  hardcoded `light`, and a pre-paint inline script so a guest with a stored dark
  preference does not get a flash of white.

## Verification

- `nx run-many -t typecheck` — admin, website, qr-menu, ui: pass.
- `nx run-many -t test` — admin, website, qr-menu: pass. `apps/qr-menu/test/theme.spec.tsx`
  rewritten against the toggle; new `apps/admin/src/components/theme-provider.spec.tsx`
  covers press → dark → light, persistence and restore.
- `admin build` — the emitted CSS carries the toggle's classes, which proves the new
  `@source '../../../packages/ui/src'` line reaches the shared package.
- `website build` — passes with production-shaped env. The `nx build` run fails on
  `WebsiteEnvValidationError` for localhost URLs, which is the pre-existing dev-env
  guardrail and unrelated to this change.
- Not verified in a browser: no dev stack was started for this task.
