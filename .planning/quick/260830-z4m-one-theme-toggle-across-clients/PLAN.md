---
quick_id: 260830-z4m
slug: one-theme-toggle-across-clients
date: 2026-08-30
branch: phase-10.3-qr-print
---

# One theme toggle, the same in every client

The founder pointed at the shadcnblocks admin demo and asked for its theme
switcher, "and it should be on all clients". What that demo actually carries is a
sun/moon icon button — click it, the icon changes, the theme changes. The colour
preset picker next to it is not wanted.

Where the three clients stand today:

| client  | control                                  | mechanism                       |
| ------- | ---------------------------------------- | ------------------------------- |
| admin   | three items buried in the avatar menu    | `.dark` class, `vite-ui-theme`  |
| qr-menu | a three-button segmented pill in the header | `data-theme`, `resto.theme`  |
| website | none at all — the site is always light   | never sets `data-theme`         |

## Decisions

- **One presentational component, three owners of state.** `ThemeToggle` takes
  `resolvedTheme` + `onToggle` and holds nothing. The admin keeps its class-based
  provider, the guest surfaces keep `useGuestTheme`. Unifying the mechanism itself
  was offered and declined as too expensive for the value.
- **Two states, not three.** A click flips light ⇄ dark. `system` survives as the
  starting value until the first click, so a guest who never touches the button
  still follows their phone. Reaching `system` again from the UI is gone —
  accepted deliberately.
- **The icon is driven by a prop, not a `dark:` variant.** The variant resolves
  differently in admin (`.dark` class) and guest (`data-theme`); a prop renders
  correctly under both.

## Tasks

1. `packages/ui` — add `guest/theme-toggle.tsx`, delete `guest/theme-switcher.tsx`,
   drop the now-dead `GUEST_THEMES`, add `toggleTheme` to `useGuestTheme`.
2. `apps/qr-menu` — swap both switcher sites for the toggle; rewrite
   `test/theme.spec.tsx` against the new control.
3. `apps/website` — new `ThemeControl` client component in the header (visible on
   phones, unlike the locale control), plus a pre-paint inline script so a guest
   with a stored dark preference does not get a flash of light.
4. `apps/admin` — depend on `@resto/ui`, expose `resolvedTheme` + `toggleTheme`
   from the provider (with a live `prefers-color-scheme` subscription), put the
   toggle in the header, strip the theme block out of the user menu, move the
   `themeLabel` message key to `nav`.

## Verification

`nx run-many -t typecheck` and the vitest suites for admin, website, qr-menu and
ui; eslint on every touched file.
