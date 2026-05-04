# ADR 0016: Admin app stack — Next.js 15 + shadcn/ui + Tailwind 4

- **Status:** accepted
- **Date:** 2026-05-03
- **Deciders:** Resto core team
- **Supersedes:** —
- **Superseded by:** —

## Context

`apps/admin` is the operator UI for tenants — staff sign in, manage the
catalog, configure tenant-level settings, and (later) view orders, run
reports, and invite team members. It ships in MVP-2 alongside the Better
Auth identity context (ADR-0013).

ADR-0010 already pinned the framework to **Next.js 15 (App Router, RSC)**
for both `apps/admin` and `apps/website`. Two decisions remain:

1. Which **design system / component library** to standardize on.
2. Which **Tailwind major version** to adopt at scaffolding.

The forces in play:

- **Operators are the authoritative consumers of the API.** The admin UI
  is what exercises Better Auth's cookie flow, organization
  `set-active`, RBAC permission checks, and the operator-facing catalog
  surface in real browser context. The component layer needs to stay
  out of the way of those integrations rather than dictate them.
- **Designers and engineers will both edit components.** A tool that
  encourages "open the file and rewrite the markup" beats a tool that
  hides primitives behind a styled facade — the moment the design
  brief diverges from the library's defaults, the styled facade fights
  back.
- **A11y is non-negotiable** — operators include people on assistive
  tech; every interactive control must be keyboard- and
  screen-reader-friendly. We do not want to re-implement
  WAI-ARIA combobox / listbox / dialog from scratch.
- **Cross-app reuse is real but limited.** `apps/website` and
  `apps/qr-menu` will share _some_ primitives (button, dialog,
  typography tokens) but most admin components — sidebar shells, data
  tables, command palette — are admin-only.
- **Bundle size matters less for admin** than for the QR menu (operator
  network is office Wi-Fi, not 3G), but we still avoid runtime CSS-in-JS
  costs where free.

## Decision

Standardize the admin UI on:

- **Next.js 15 (App Router, RSC, TypeScript)** — already chosen in ADR-0010.
- **shadcn/ui** as the component layer (Radix primitives + Tailwind
  classes; components are scaffolded into `apps/admin/components/ui/`
  and owned by us).
- **Tailwind CSS v4** (CSS-first config, `@theme` blocks; no
  `tailwind.config.js`).

shadcn is **not** treated as a library dependency — its components are
copied into the app and edited in place. The CLI (`npx shadcn@latest add
…`) is the upgrade path: when shadcn ships an improved `sidebar-07`, we
re-run the command, diff the result, and merge what we want.

Components live initially under `apps/admin/components/`. Truly
cross-app primitives migrate to `packages/ui` only when the second app
needs them (delaying the "shared package" decision keeps scope small
and avoids guessing the boundary).

## Alternatives considered

### Mantine

**Strongest argument:** the most batteries-included React component
library — DataGrid, DatePicker, Notifications, Modals, Hooks — all in
one package, all with first-class TypeScript types. Excellent
documentation. Mature.

**Rejected because:** Mantine components are styled with
`@mantine/core` CSS that ships at runtime; theming and customization
require either deep CSS overrides or migration to Mantine's emotion-
based engine. Diverging from Mantine's design language (which we will
have to do — Resto has its own brand) means fighting the framework on
every brief change. shadcn's "you own the file" model is the opposite
trade-off and matches our team's preference for explicit code over
configuration.

### Chakra UI v3

**Strongest argument:** Chakra v3 dropped emotion in favor of Panda CSS

- extracted primitives — much closer to shadcn's approach than v2
  was. Strong a11y story.

**Rejected because:** Chakra v3 is still maturing (mid-2026 reality
check: API churn is real), the Panda integration adds another
build-time tool to learn, and the primitive coverage is narrower than
shadcn. We are choosing the more battle-tested "primitive + Tailwind"
combo even though both are technically Radix-backed.

### MUI (Material UI)

**Strongest argument:** the largest React component ecosystem;
DataGrid Pro is an industry leader. Stable, well-typed.

**Rejected because:** Material Design is a brand language we do not
want to inherit. Customizing MUI to a non-Material brand is a
multi-week effort that pays back only if we use the heavier Pro
components. Our brief is closer to Linear / Vercel than to Material;
shadcn is the natural fit for that aesthetic.

### Headless UI (Tailwind Labs)

**Strongest argument:** by the Tailwind team; integrates with Tailwind
flawlessly; primitives only — no opinions on visuals.

**Rejected because:** Headless UI primitive coverage is narrower than
Radix (no Combobox, no Toast, no Tooltip until recently). shadcn ships
the same "primitives + Tailwind" recipe but with broader Radix
coverage and pre-built blocks like the sidebar shells we already plan
to use.

### Tailwind 3 (vs Tailwind 4)

**Strongest argument for staying on v3:** Tailwind 3 is the safer,
more documented choice — most plugins and community examples target
it.

**Rejected because:** shadcn's CLI generates v4 setups by default
(`@import "tailwindcss"`, `@theme` blocks). Forcing v3 means manually
re-templating every shadcn-CLI output. v4 also drops the
`tailwind.config.js` file in favor of CSS-first configuration —
fewer JS build dependencies, faster cold start.

## Consequences

### Positive

- **Component ownership.** Every admin component lives in
  `apps/admin/components/`. No upgrades break us; the shadcn CLI is a
  scaffolder, not a dependency.
- **Tailwind discipline.** Single CSS pipeline; no runtime CSS-in-JS.
  Server components stream pre-baked HTML and CSS — fast first paint.
- **A11y by default.** Radix primitives (under shadcn) ship correct
  WAI-ARIA semantics; we add visuals on top, not the other way around.
- **Block-level scaffolding** (`sidebar-07`, dashboard-01, login-03)
  gives us non-trivial layouts to start from and removes the "blank
  canvas" problem.
- **Future packages/ui migration is cheap.** When `apps/website` or
  `apps/qr-menu` grows real components, we lift the shared ones into
  `packages/ui` — shadcn explicitly documents the monorepo pattern.

### Negative

- **No "import and go" components for complex widgets.** DataGrid,
  DatePicker, Combobox-with-search are not turnkey — we compose them
  from primitives. First-time effort is real; subsequent reuse is
  cheap.
- **Tailwind class strings get long.** `cn()` and `cva()` mitigate
  this; reviewers will sometimes need to mentally parse a `flex
items-center gap-2 px-4 py-2 rounded-md …` chain.
- **Tailwind 4 is younger** than v3. Edge-case bugs are likelier; the
  upgrade path from v3 to v4 is documented but not always seamless.
  We accept v4 to avoid the future v3 → v4 migration.
- **Per-app component duplication** until `packages/ui` materializes.
  This is by design — premature sharing locks in the wrong boundary.

### Neutral

- **Lucide as the icon library.** shadcn's default; consistent stroke
  weight and metadata. Easy to swap if a brief demands.
- **`@/` path alias** for `apps/admin/` (shadcn's convention; matches
  Next.js defaults).

## Implementation notes

- Scaffolding entry-point: `apps/admin/`. Project tags
  `scope:admin`, `type:app`, `layer:ui` in `apps/admin/project.json`.
- ESLint flat config extends `@resto/config-eslint/react`; Tailwind 4
  has no `tailwind.config.js` — theme tokens live in
  `apps/admin/app/globals.css` under `@theme`.
- shadcn config: `apps/admin/components.json`. Path aliases:
  - `components` → `@/components`
  - `ui` → `@/components/ui`
  - `lib` → `@/lib`
  - `utils` → `@/lib/utils`
- First sidebar shell: `npx shadcn@latest add sidebar-07` from
  `apps/admin/`. The block lays down `app-sidebar.tsx`,
  `nav-{main,projects,user}.tsx`, `team-switcher.tsx` plus the
  `components/ui/sidebar.tsx` primitive.
- Module-boundary rule allows `scope:admin` to depend on
  `scope:shared`. No app-to-app dependencies.
- Vitest unit smoke test at `apps/admin/test/unit/shell.spec.tsx`
  renders the layout to assert the bundle compiles.
- Production runtime image lands in a follow-up alongside the api
  Dockerfile parity work (RES-86 family).

## Follow-ups

- Better Auth login flow on `apps/admin/app/login/page.tsx` (separate
  PR).
- `@resto/api-client` package generated from the api OpenAPI spec —
  admin's first concrete dependency on `packages/`.
- Catalog admin UI — depends on operator-facing catalog controllers
  (currently internal-only via `InternalTokenGuard`).
- Production Dockerfile + Helm chart for admin once staging exists.
