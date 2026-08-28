# apps/

## Purpose

Deployable applications. Each subdirectory is an independently buildable and
deployable artifact. Apps depend on `packages/*` for shared code; apps must
not depend on each other.

## Layout

- `api/` — NestJS modular monolith (single deployable bundling all bounded
  contexts: tenancy, catalog, ordering, payments, reservations, loyalty,
  inventory, analytics, notifications, audit; identity returns in MVP-2 —
  see ADR-0012). Will gain a child CLAUDE.md once scaffolded.
- `admin/` — Next.js 15 (App Router, RSC) admin panel for tenant operators.
  Scaffolded; uses shadcn/ui (`new-york`, `neutral`) on Tailwind 4 per
  ADR-0016. shadcn-managed dirs (`components/ui/**`,
  `hooks/use-mobile.ts`, sidebar-07 navigation files) have relaxed ESLint
  rules so `npx shadcn add …` stays a clean upgrade path. Strict TS is
  on except `exactOptionalPropertyTypes` (incompatible with Radix
  prop spreads).
- `website/` — Next.js tenant storefront (multi-tenant SSR; one Next app
  serves all tenants via host-based routing). Guest chrome, menu, item dialog
  and cart come from `@resto/ui`; only checkout is website-specific.
- `qr-menu/` — Vite + React + Tailwind 4; customer-facing menu accessed by QR
  code at the table. Mobile-first and optimized for cold-start speed on mobile
  networks — the item dialog and cart sheet are lazy chunks. Renders the same
  `@resto/ui` guest components as `website/`.

## Rules

### Comments (HARD)

- **Default: NO comments.** Code with well-named identifiers documents itself.
- **Exceptions only — a critical WHY**: hidden constraint, counterintuitive
  workaround, subtle invariant, or ADR/ticket reference that prevents a
  future reader from re-discovering the same landmine. Keep to ≤2 lines.
- **Forbidden:**
  - `// what this does` comments (the code already shows it).
  - File-header doc blocks restating the file's role.
  - `// added for X / fix for #Y` (belongs in commit message, not code).
  - Section-divider banners (`// ============`).
  - JSDoc on internal helpers; only on package public API where the
    contract is non-obvious.
  - Comments on test bodies — `describe`/`it` names document intent.
- This applies retroactively. When touching a file, strip comments that
  fail the WHY bar.

### Layering

- Apps only import from `@resto/*` packages, never reach into another app's
  source.
- Every app has its own `eslint.config.mjs`, `tsconfig.json`, `project.json`
  (Nx).
- Infra concerns (DB connection, Redis, NATS) come from
  `packages/db` and equivalent — apps wire them at the composition root only.
- New app → add a child `CLAUDE.md` here only if it deviates from these
  defaults.

### Network calls (server-side and client-side)

- **Server-side `fetch` must have `AbortSignal.timeout(...)`.** No exceptions.
  A slow upstream without a timeout hangs the request indefinitely, exhausts
  RSC render handles in Next, and drains client UI on Vite. Defaults: `10s`
  for reads, `30s` for actions; document the choice in the call site.
- **One retry, only on idempotent `GET` 5xx.** Customer-path GETs (qr-menu
  menu fetch, admin reads) survive a single rolling-deploy hiccup with one
  ~500ms-backoff retry. Do not retry mutations.
- **The error UI must offer a "Try again" affordance.** A user staring at
  "Please try again in a moment" with no button to do so is a usability
  defect (qr-menu WR-03 type).

### Auth + tenancy at the web layer

- **Server actions that consume `next=` / `redirect=` query params must
  refine against protocol-relative URLs.** `z.string().startsWith('/')`
  accepts `//evil.com`; add `.refine(s => !/^\/[\\/]/.test(s))`. Open
  redirect is the easiest phishing primitive (apps/admin CR-01).
- **All cookies must include `secure: process.env.NODE_ENV === 'production'`.**
  Session cookies leak over passive HTTP otherwise.
- **Tenant and location context is server-side, never its own cookie.**
  The session cookie identifies the session; Better Auth's own
  `session.activeOrganizationId` (mapped to `active_tenant_id` in our
  schema, D-41) and `active_location_id` hold the context and cannot be
  forged. A signed `resto.active_brand` cookie existed (phase 02-03, HMAC +
  dedicated secret + four I/O sites) and was retired for brand-in-URL
  (D-03); the brand dimension itself was later merged into tenant
  (D-04/D-40, phase 10.2). Do not reintroduce a context cookie.
- **`INTERNAL_API_TOKEN` is server-only.** Never reach it from a client
  component or import a module that uses it from a client boundary. The
  build will succeed; it just ships the token to the browser.
- **Static identity placeholders are forbidden in shipping UI.** Rendering
  `operator@example.com` to a real signed-in operator removes the visual
  cue that helps them spot a phishing redirect; also looks unfinished.

### Env vars at the web layer

- **`NEXT_PUBLIC_*` / `VITE_*` env vars MUST NOT have production fallback
  values.** `getEnv('NEXT_PUBLIC_API_ORIGIN') ?? 'http://localhost:3001'`
  silently routes real users to a nonexistent local API when the deploy
  forgets the var. Fail loudly at module load in non-dev, centralise via
  `lib/env.ts`. This is the same family as the root rule
  ([ADR-0020 I-3](../docs/adr/0020-multi-tenancy-and-event-bus-invariants.md));
  the rule applies on both sides of the network boundary.
- **`VITE_*` is baked into the bundle at build time.** A `VITE_TENANT_SLUG`
  override without a `if (import.meta.env.DEV)` runtime guard creates a
  bundle that silently cross-tenants every customer if ever set in a
  production build environment (qr-menu CR-02).

### Source maps + production hygiene

- **Customer-facing apps must NOT ship source maps to production.** Use
  `'hidden'` sourcemaps and upload via Sentry/equivalent; strip `.map` from
  the deploy artifact. Mobile-cellular customers do not need them; your
  error tracker does (qr-menu CR-01).
- **Public-facing apps must have a CSP at the CDN/web-server layer.** At
  minimum `img-src`, `script-src 'self'`, `connect-src` allowlists.
- **The public menu reads (`GET /v1/menu`, `/v1/menu/items/:id`,
  `/v1/menu/availability`) are edge-cached** — they emit
  `Cache-Control: public` + an `ETag` (menu = `menuVersion`/`s-maxage=300`,
  availability = `stopVersion`/`s-maxage=5`) and MUST stay `Set-Cookie`-free
  and never gain `Cache-Control: private`/`no-store`. A stop changes only the
  availability ETag, never the menu ETag. The `menu-response.e2e`
  no-`Set-Cookie` test is the regression net; CDN setup lives in
  `docs/runbooks/menu-edge-caching.md`.

### Guest surfaces — one visual system (HARD)

`website/` and `qr-menu/` are one brand to the guest holding the phone. They
ship a single visual system; `admin/` is an operator surface and is exempt.

- **Tokens live in `@resto/config-tailwind`, components in `@resto/ui`.** A
  colour, radius, font or spacing written into an app's own stylesheet or as a
  Tailwind arbitrary value (`bg-[oklch(0.97_0_0)]`, `text-[20px]`) cannot be
  changed for both surfaces at once and silently opts that element out of
  tenant theming (`buildTenantThemeVars` overrides custom properties at
  runtime). Use the token classes.
- **Anything both surfaces render lives in `@resto/ui`** — header, footer,
  locale switcher, category rail, item card, item detail, cart sheet, cart bar.
  Copying instead of sharing is how the two cart drawers, two money parsers and
  one half-translated string set happened.
- **shadcn/ui (`new-york`, `neutral`) is the only component base.** No parallel
  hand-rolled dialog/sheet/tabs. `packages/ui/components.json` targets the
  shared package, so `npx shadcn add …` stays a clean upgrade path.
- **`@resto/ui` must not import `next/*`.** The two framework-specific concerns
  — image component and translation function — arrive through
  `GuestUiProvider`; a shared component that needs a `typeof window` check or
  an `isNext` prop is a design failure.
- **Every guest page is a complete document: header, content, footer.** The QR
  menu is a page, not a widget.
- Design decisions go through the `ui-ux-pro-max` skill, React/Next
  implementation through `vercel-react-best-practices`. Visual reference for
  the guest look is Dodo Pizza (`shift.dodobrands.io`).

Full rule: `~/work/llm-wiki/personal/rules/guest-surface-visual-parity.md`.
