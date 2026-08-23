---
quick_id: 260823-fj1
slug: split-website-and-qr-menu-hosts
completed: 2026-08-23
status: complete
branch: split-guest-hosts
---

# The restaurant website has its own host now

## What the ask turned into

Founder asked for landing on the apex, admin on `admin.<domain>`, menu on `menu.<domain>`. Two
corrections came out of measuring:

**A single `menu.<domain>` cannot serve the guest menu.** The menu belongs to one restaurant and one
host cannot say which; the restaurant has to be in the hostname. `<slug>.menu.<domain>` was already
the rule and stays.

**The separation was already designed, just unreachable.** `apps/website` is not a landing page — it
is the restaurant's own public site (menu, about, delivery, contact, checkout, confirmation, themed
per tenant). Two docstrings already named `<slug>.resto.app` as its home. It was running on
`<slug>.menu.localhost:3002`, squatting the QR-menu host, because that was the only host the menu
API would answer to.

## What changed

`resolveByCustomerHost` now recognises two guest shapes instead of one: `<slug>.menu.<domain>` for
the QR menu, and `<slug>.<apex>` for the restaurant's site.

The website branch is gated on a new `PUBLIC_APEX_DOMAIN`. Two traps made that gate necessary, and
both are recorded in the code because they are easy to reintroduce:

- **`resto` is in `RESERVED_SLUGS`.** Gating the second label on that set would have rejected
  `pizza.resto.app` — the very host being added. That set answers "may a tenant be called this", not
  "may this appear in a hostname".
- **A stranger's domain would have resolved by accident.** `pizzapalace.com` splits to
  `[pizzapalace, com]`; a tenant whose slug happened to match would have been served on a domain
  they never registered. Verified domains still go through `findByDomainHost` and nothing else.

`PUBLIC_APEX_DOMAIN` is optional, and unset means today's behaviour exactly — only `.menu.` resolves.
No environment changes until it opts in.

Also fixed, both found while chasing the founder's login failure:

- **The login form stopped lying.** `login.tsx` printed "Invalid email or password." for _any_
  failure — a dead API, a rejected origin, a refused cookie. Only 401/403 is a credential verdict
  now; everything else says what actually happened. This is what turned a missing cookie domain into
  an hour of hunting a password that was never wrong.
- **The `AUTH_COOKIE_DOMAIN` docstring** told the reader to leave it unset in dev. That advice
  predates D-21: the tenant lives in the hostname now, so every sign-in hops from `admin.<domain>` to
  `<slug>.admin.<domain>`, and a host-only cookie does not survive the hop. Dev needs
  `.admin.localhost` for the same reason production needs `.admin.resto.app`.

## Verification

`typecheck` 11/11 · `lint` 10/10 · format clean · api unit 530 · payments 88 · ordering 84 ·
tenancy 6 · identity 8 · admin 16 files · resolver spec 28.

The host boundary was probed against the running API rather than asserted:

| host                             | menu API | meaning                        |
| -------------------------------- | -------- | ------------------------------ |
| `pizza.menu.localhost`           | 200      | QR menu                        |
| `pizza.localhost`                | 200      | restaurant website             |
| `burger.localhost`               | 200      | a different restaurant         |
| `localhost`                      | 404      | RestOS landing — no tenant     |
| `admin.localhost`                | 404      | operator                       |
| `pizza.admin.localhost`          | 404      | operator                       |
| `api` / `www` / `menu.localhost` | 404      | infrastructure labels          |
| `pizza.example.com`              | 404      | foreign domain, not registered |
| `nosuchtenant.localhost`         | 404      | unknown slug                   |

And the surfaces themselves: `pizza.localhost:3002` renders Pizza Palace's menu,
`burger.localhost:3002` renders Burger Barn's, the apex 404s. Sign-in at `admin.localhost:4000`
still lands with a session that survives the hop to `pizza.admin.localhost:4000`; a wrong password
returns 401 and now reads as a credential problem rather than a mystery.

## Not done

- **No RestOS landing at the apex.** It 404s today. That is a page that does not exist yet, not a
  routing bug.
- **The website app does not refuse `.menu.` hosts itself.** In dev it will still answer there; in
  production the reverse proxy routes by host. The tenant-isolation boundary is in the API and that
  one is correct, so app-level host gating would be belt-and-braces rather than a fix.
- **`qr-menu` was not started or re-pointed.** It keeps `<slug>.menu.<domain>`, which is unchanged.

## Commits

- `2b156502` docs: require commit+push on task completion, always ask before merge
- `fa37694a` feat(api): serve the restaurant website on its own host, apart from the QR menu
- `c01111a3` fix(admin): report the real sign-in failure instead of blaming the password
