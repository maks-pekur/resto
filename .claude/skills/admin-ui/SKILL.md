---
name: admin-ui
description: Where files go in apps/admin and how to add a component, hook, query or test there. Use when creating, moving or reviewing anything under apps/admin/src — components, hooks, TanStack Query wrappers, routes, or their tests.
---

# apps/admin structure and component rules

The operator panel is a Vite + React SPA: TanStack Router (file-based routes), TanStack
Query, shadcn/ui on Tailwind 4, i18next in ru/en/es. It is the only app that may import
`@/*`; guest surfaces have their own rules in `apps/CLAUDE.md`.

## Where a file goes

```
src/
  components/
    ui/          shadcn primitives — generated, never hand-edited
    layout/      the shell: sidebar, header, nav, tenant identity, locale items
    common/      cross-screen pieces: empty-state, page-heading, route-error, theme-provider
    widgets/     dashboard cards, reusable and composable (kpi-card, dashboard-kpis, …)
    dashboard/   the dashboard screen itself
    menu/ orders/ roles/ settings/ tables/ team/ locations/   one folder per feature
  hooks/         every hook, including shadcn's use-mobile
  lib/           api-client, queries/, auth/, i18n/, qr/, menu/, utils
  routes/        thin TanStack Router files that mount a component and nothing else
test/            every test, mirroring src (test/components/widgets/…, test/lib/qr/…)
```

- **No test next to the code it tests.** `src/**` holds no `*.spec.*`. A unit test mirrors
  its subject's path under `test/`; a screen or routing test that spans several modules may
  sit at `test/` root.
- **Hooks live in `src/hooks`, never `src/lib/hooks`.** `@/hooks` is also the shadcn alias,
  so `npx shadcn add` keeps working.
- **A route file mounts a component.** Logic, data and markup belong in `components/`.

## Building a component

1. **Look for an existing one first** — `components/ui` for primitives, `components/common`
   and `components/widgets` for composed pieces. A second card that differs only in its
   numbers is a prop, not a new file.
2. **Split the reusable half out.** When a screen-specific component grows an inner piece
   another screen could want (a stat card, a delta badge, a filter bar), that piece moves to
   `widgets/` or `common/` and the screen composes it.
3. **shadcn first.** Add primitives with `npx shadcn add …`; do not hand-roll a dialog,
   sheet, popover or table. `components/ui/**` and `hooks/use-mobile.ts` are generated —
   they carry relaxed lint rules and must stay where the CLI expects them.
4. **Every string goes through i18next** with a `keyPrefix`, and lands in all three message
   files (`ru`, `en`, `es`). No literal user-facing text in JSX.
5. **Gate on permissions, never on role names.** `hasPermission(me, resource, action)` for
   what to render, `requirePermission(...)` on the route for what to refuse. Hiding a
   control is convenience; the route guard and the API are what actually refuse.
6. **Data comes from `lib/queries/*`,** typed from `@resto/api-client` (`components['schemas']`).
   Never re-declare a response shape by hand — the contract is the OpenAPI file.
7. **Money is a string** end to end; format with `formatMoney(value, currency)` at the edge.
8. **No comments** unless they carry a WHY a reader could not recover from the code —
   `apps/CLAUDE.md` holds the full rule.

## Before you call it done

`pnpm nx run admin:typecheck`, `pnpm --filter admin exec vitest run`, and eslint on the
files you touched. A moved file means its imports moved too: `@/components/<folder>/<name>`.
