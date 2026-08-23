---
title: Fastify 4 → 5 and NestJS 10 → 11 — the HTTP stack is on an unmaintained security line
date: 2026-08-23
priority: high
blocks: nothing yet
blocked_by: nothing — this is schedulable work, and the longer it waits the further the gap grows
status: pending
---

# The API's HTTP stack has no security patches left

Found while clearing the dependency audit on 2026-08-23. The audit went from 109 advisories to 38;
what remains is not a long tail of stragglers but four coupled migrations, and one of them matters
more than the count suggests.

## The finding

`apps/api` runs Fastify **4.28.1** and NestJS **10.4.15**. Every advisory against that stack has a
patched version only in the **next major**:

| package                    | installed | vulnerable range | first patched | severity     |
| -------------------------- | --------- | ---------------- | ------------- | ------------ |
| `@fastify/middie`          | 8.3.3     | `<=9.3.1`        | 9.3.2         | **critical** |
| `fastify`                  | 4.28.1    | `<5.7.2`         | 5.7.2         | high         |
| `find-my-way`              | 8.2.2     | `<=9.6.0`        | 9.7.0         | high         |
| `@fastify/static`          | —         | `<=10.1.1`       | 10.1.2        | high         |
| `@nestjs/platform-fastify` | 10.4.15   | —                | 11.1.24       | high         |
| `@nestjs/core`             | 10.4.15   | —                | 11.1.18       | moderate     |

There is no 4.x or 8.x patch line. Staying put is not "patched later" — it is "not patched".

**Why the critical one is not academic here.** `@fastify/middie` is what NestJS middleware runs on
under `platform-fastify`, and the advisory is _middleware authentication bypass in child plugin
scopes_ plus _improper path normalization when using path-scoped middleware_. `TenantContextMiddleware`
is Nest middleware. It is the thing that binds `app.current_tenant` for every request. A middleware
bypass in this codebase is a tenant-isolation bypass, which is the one invariant the whole
architecture is built to protect (ADR-0020 I-1).

**Checked, 2026-08-23 — and it is not currently exploitable here.** Three things had to hold, and
all three do:

- `CorrelationMiddleware` and `TenantContextMiddleware` are registered with `forRoutes('*')` —
  globally, not path-scoped and not in a child plugin scope. Both advisory shapes need one of those.
- **Authorization does not live in middleware.** `AuthGuard`, `PermissionsGuard`,
  `LocationScopeGuard` and `RequireActiveTenantGuard` are Nest guards, running in the Nest pipeline
  rather than as middie middleware. A middie bypass skips the tenant _binding_, not the _checks_.
- Missing tenant context **fails closed**, verified against the running API: a guest route whose host
  resolves to nothing returns 404, an operator route with no session returns 401, and any repository
  call without a bound tenant throws before it reaches SQL.

So the correct reading is: this is a high-severity dependency on an unmaintained line that must be
scheduled, not an open door that must be closed tonight. Re-check this section if middleware is ever
registered path-scoped, or if any authorization moves out of a guard and into middleware.

## The three other majors, for scheduling

- **`better-auth` 1.4.22 → 1.6.22+** — one critical (OAuth refresh-token replay via the
  `oidc-provider` and `mcp` plugins, neither of which we load), plus high and moderate. Pinned with
  `=` in `apps/api` and exactly in `apps/admin`; they must move together. This owns sessions, the
  organization plugin and `dynamicAccessControl`, all of which phase 10.2 reshaped — so it needs its
  own pass with the org-switch and location-scope flows re-verified live, not just compiled.
- **`vitest` 2.1.8 → 3.2.6+** — the critical is _arbitrary file read and execute when the Vitest UI
  server is listening_. We never start the UI, so exposure is nil; it is still a major worth taking
  with `vite` 5 → 6, which the same upgrade forces.
- **OpenTelemetry `sdk-node` 0.57 → 0.217, `auto-instrumentations-node` 0.55 → 0.75** — several
  packages that must move as a set.

## Suggested order

1. Fastify 5 + NestJS 11 together — they are one migration, not two, and it closes middie,
   find-my-way and static as a side effect.
2. Better Auth 1.6, on its own, with the live org-switch walkthrough.
3. Vite 6 + Vitest 3.
4. OpenTelemetry as a set.

## What was already done, so it is not redone

`package.json` `pnpm.overrides` now pins 22 transitive packages to their patched floors — same-major
drop-ins only, each verified by install + full test run. Direct bumps: `nx` 22.7.7, `yaml` 2.8.3,
`esbuild` 0.28.1, `next` 16.2.11, `nodemailer` 8 → 9 (verified by sending a real password-reset
email through MailHog, not by compiling).

Two overrides pin two majors of the same package side by side (`brace-expansion@2` / `@5`,
`fast-uri@2` / `@3`) because both lines are present in the tree and each has its own patched floor.
Do not collapse them to a single range.
