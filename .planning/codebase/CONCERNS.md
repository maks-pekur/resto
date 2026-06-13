# Codebase Concerns

**Analysis Date:** 2026-05-24

## Tech Debt

**`correlationId` uses `randomUUID()` instead of OTel span (ADR-0020 I-4):**

- Issue: Envelopes emitted from identity hooks and tenancy repository construct `correlationId: randomUUID()` directly, breaking the trace link between inbound request and outbox event.
- Files: `apps/api/src/contexts/identity/identity-core.module.ts:110,127,151`, `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:300,316,327,342,356`
- Impact: Events cannot be correlated back to the originating request in distributed traces. The `buildEnvelope` helper referenced in ADR-0020 I-4 and the `@resto/events` CLAUDE.md does not exist yet — the ESLint rule banning `correlationId: randomUUID()` is also not yet implemented.
- Fix approach: Implement `buildEnvelope(contract, payload, opts)` in `packages/events/src/` that reads `getCorrelationId()` from ALS (already in `packages/events/src/correlation.ts`). Replace all direct `correlationId: randomUUID()` envelope constructions with calls to `buildEnvelope`.

**`appendToOutbox` does not validate the envelope before insert:**

- Issue: `packages/events/src/outbox/repository.ts:23` calls `tx.insert(schema.outboxEvents)` without running `EventEnvelope.parse(options.envelope)`. The DB `type` constraint is partial; a malformed envelope can reach the wire.
- Files: `packages/events/src/outbox/repository.ts:23-33`
- Impact: Malformed events surface as broker-side parse errors in consumers, not as build-time or insert-time failures.
- Fix approach: Add `EventEnvelope.parse(options.envelope)` at the top of `appendToOutbox` before the `tx.insert`. The parse is cheap and catches contract drift early.

**`OutboxDispatcher.stop()` is not idempotent:**

- Issue: `packages/events/src/outbox/dispatcher.ts:121-124` creates a new `Promise` and overwrites `#stopResolver` on each `stop()` call. A second concurrent `stop()` call orphans the first promise's resolver and the first caller waits forever.
- Files: `packages/events/src/outbox/dispatcher.ts:118-124`
- Impact: Graceful-shutdown path (two concurrent stop callers, or a re-entrant NestJS lifecycle hook) can deadlock.
- Fix approach: Cache the first stop call's promise and return it for subsequent callers: `if (this.#stopPromise) return this.#stopPromise; this.#stopPromise = new Promise(…)`.

**`releaseOutboxClaim` / `markOutboxDelivered` lack claim-ownership predicate:**

- Issue: `packages/events/src/outbox/repository.ts:123-128` releases a claim with only `WHERE id = ? AND deliveredAt IS NULL`. If dispatcher replica B reclaims a row whose visibility timeout expired while A is still processing it, A's `releaseOutboxClaim` clears B's claim.
- Files: `packages/events/src/outbox/repository.ts:110-128`
- Impact: Lost-update race under multiple dispatcher replicas; a row can be re-delivered while still being processed.
- Fix approach: Add a `claimedAt` column snapshot (or a `claim_token` UUID column) to scope `releaseOutboxClaim` and `markOutboxDelivered` to the claiming replica's specific claim.

**BCP-47 locale regex duplicated across two files:**

- Issue: The identical `localeKeyRegex = /^[a-z]{2}(?:-[A-Z]{2})?$/` is defined independently in `packages/domain/src/schema/tenant.ts:17` and `packages/domain/src/localized-text.ts:16`. The `@resto/domain` CLAUDE.md explicitly flags this as a drift trap.
- Files: `packages/domain/src/schema/tenant.ts:17`, `packages/domain/src/localized-text.ts:16`
- Impact: A future locale format change (e.g. accepting `zh-Hant`) must be updated in two places; one site will be missed.
- Fix approach: Export `BcpLocale` from `packages/domain/src/localized-text.ts` (or a new `_locale.ts`) and import it in `tenant.ts`.

**`NEXT_PUBLIC_API_ORIGIN` has a localhost fallback in server-side fetch:**

- Issue: `apps/admin/lib/api-server.ts:21` and `apps/admin/lib/api-server-internal.ts:3` use `process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3000'`. The `apps/CLAUDE.md` explicitly calls this out as a silent-routing bug: a deploy that forgets the env var routes all real users to a nonexistent local API.
- Files: `apps/admin/lib/api-server.ts:21`, `apps/admin/lib/api-server-internal.ts:3`
- Impact: Silent production failure if `NEXT_PUBLIC_API_ORIGIN` is missing from deploy config; no error is raised, traffic silently drops.
- Fix approach: Move to a centralised `apps/admin/lib/env.ts` that throws loudly when the var is missing outside `NODE_ENV=development`. Pattern mirrors how `apps/api/src/config/env.schema.ts` fails fast.

**`ADMIN_WEB_URL` also has a localhost fallback:**

- Issue: `apps/admin/app/forgot-password/actions.ts:15` uses `process.env.ADMIN_WEB_URL ?? 'http://localhost:3001'`, routing password-reset links to localhost in production if the var is missing.
- Files: `apps/admin/app/forgot-password/actions.ts:15`, `apps/admin/lib/api-server.ts:23`
- Impact: Password-reset emails in production contain `localhost` links that are dead.
- Fix approach: Same centralised env validation approach as above.

**`dependency-cruiser` domain boundary check is planned but absent:**

- Issue: The `packages/domain/CLAUDE.md` and `packages/CLAUDE.md` promise a `dependency-cruiser` rule enforcing zero infra imports from `@resto/domain`. Only a Nx ESLint module-boundaries rule exists (`packages/config-eslint/base.mjs:18-40`), which is tag-based and does not catch transitive imports of `drizzle-orm`, `@nestjs/*`, etc. within the domain package.
- Files: `packages/config-eslint/base.mjs`, `packages/domain/src/`
- Impact: An accidental `import { Injectable } from '@nestjs/common'` inside `@resto/domain` would not be caught by CI until the smoke test is written.
- Fix approach: Add a `dependency-cruiser` config at `packages/domain/.dependency-cruiser.cjs` that rejects any import whose resolved root is `@nestjs`, `drizzle-orm`, `pg`, `ioredis`, `nats`, or `axios`. Wire into `nx run domain:boundary-check`.

**`inbox_processed` table has no retention sweep:**

- Issue: `packages/db/migrations/0009_add_inbox_processed.sql:42` notes "a future retention migration will sweep old rows via DELETE." No job or migration exists yet. The table is also not excluded from the tenant-erase function (it is included, line 35 of `0011_tenancy_erase_function.sql`), but platform-level (null tenant_id) rows are never swept.
- Files: `packages/db/migrations/0009_add_inbox_processed.sql`, `packages/db/src/schema/inbox.ts:18`
- Impact: Table grows unbounded over time; large tables slow inbox dedup inserts and the periodic `SELECT ON CONFLICT` path.
- Fix approach: Add a scheduled SQL function or `@Cron` NestJS task that deletes rows where `processed_at < NOW() - INTERVAL '30 days'`. Document retention SLA.

**`suspend` tenant lifecycle state has no service implementation:**

- Issue: `TenantStatus` type includes `'suspended'` (`apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts:15`) but the tenancy application layer has no `SuspendTenantService`. Only `ArchiveTenantService` and `OffboardTenantService` exist.
- Files: `apps/api/src/contexts/tenancy/application/` (directory listing confirms no suspend service)
- Impact: Operators cannot suspend a tenant (e.g. billing failure, abuse). The `suspended` state is unreachable from the API.
- Fix approach: Add `SuspendTenantService` and expose `POST /internal/v1/tenants/:id/suspend` on `InternalTenantsController`.

**Offboarding erasure has no automated scheduler:**

- Issue: `TenantDrizzleRepository.listScheduledForErasure()` queries tenants past their 30-day cool-off, and `OffboardTenantService.executeErasure()` exists, but nothing calls them automatically. There is no cron job, NestJS `@Cron` decorator, or background task that polls and executes expired offboardings.
- Files: `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts:61`, `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:160-177`
- Impact: Tenants that pass the 30-day window are not erased until a human manually triggers `POST /internal/v1/tenants/:id/erase` or runs the `erase-tenant` CLI script. GDPR erasure SLAs could be missed.
- Fix approach: Add a `TenantErasureSchedulerService` with `@Cron('0 2 * * *')` (daily at 02:00) that calls `listScheduledForErasure()` and `executeErasure()` for each expired tenant.

## Known Bugs

**`OutboxDispatcher.stop()` concurrent-call deadlock:**

- Symptoms: If `stop()` is awaited simultaneously by two callers, the second caller receives a promise that never resolves because `#stopResolver` is overwritten.
- Files: `packages/events/src/outbox/dispatcher.ts:118-124`
- Trigger: NestJS module destruction calling `onApplicationShutdown` while a test harness also calls `stop()`, or two concurrent integration test teardowns.
- Workaround: Ensure only one caller invokes `stop()`.

## Security Considerations

**`BrandTheme.logoUrl` accepts `javascript:` and `data:` URLs:**

- Risk: `packages/domain/src/brand-theme.ts:12` uses `z.string().url().nullable()` with no scheme restriction. A malicious operator can store `javascript:alert(1)` or `data:text/html,...` as their logo URL. If any client app interpolates this into `<img src>` or `<a href>`, it is an XSS vector.
- Files: `packages/domain/src/brand-theme.ts:12`
- Current mitigation: None at the schema layer.
- Recommendations: Add `.refine(u => u === null || /^https?:/i.test(u), 'must be http(s)')` matching the rule stated in `packages/domain/CLAUDE.md`.

**`BrandTheme.font` has no character allowlist:**

- Risk: `packages/domain/src/brand-theme.ts:18` validates `font` only with `.min(1).max(64)`. If any rendering layer interpolates the value into CSS (`font-family: ${theme.font}`) without sanitization, it enables CSS injection.
- Files: `packages/domain/src/brand-theme.ts:18`
- Current mitigation: The font field is not rendered anywhere yet (no usages found in apps). Risk is latent.
- Recommendations: Restrict to `/^[A-Za-z0-9 ,'"\-]+$/` or a fixed enum of approved font tokens before any rendering layer consumes it.

**`resto.active_brand` cookie missing `secure` flag:**

- Risk: `apps/admin/lib/actions/set-active-brand.ts:32-37` and `apps/admin/lib/actions/create-brand.ts:68-72` set the `resto.active_brand` cookie with `httpOnly: true, sameSite: 'lax'` but no `secure` flag. The `apps/CLAUDE.md` explicitly requires `secure: process.env.NODE_ENV === 'production'` for all server-action-set cookies.
- Files: `apps/admin/lib/actions/set-active-brand.ts:32-37`, `apps/admin/lib/actions/create-brand.ts:68-72`
- Current mitigation: None — the cookie is transmitted in plaintext over HTTP in any non-HTTPS context.
- Recommendations: Add `secure: process.env.NODE_ENV === 'production'` to both `cookieStore.set` calls.

**`stripeAccountId` has no max-length constraint:**

- Risk: `packages/domain/src/schema/tenant.ts:32` declares `stripeAccountId: z.string().nullable()` with no `.max()`. An attacker who can write this field (via a compromised internal endpoint) could store arbitrarily large strings.
- Files: `packages/domain/src/schema/tenant.ts:32`
- Current mitigation: The field is only writable by internal tooling (no public endpoint exposes it directly yet).
- Recommendations: Add `.max(255)` — Stripe account IDs are at most ~32 chars; 255 gives headroom.

**`imageS3Key` and `allergens` strings lack upper-bound constraints:**

- Risk: `apps/api/src/contexts/catalog/application/dto.ts:25-26` accepts `imageS3Key: z.string().min(1)` and `allergens: z.array(z.string().min(1))` with no `.max()` on strings or `.max()` on the array. The `packages/CLAUDE.md` rule requires max lengths on all free-text fields.
- Files: `apps/api/src/contexts/catalog/application/dto.ts:25-26`
- Current mitigation: None at the HTTP boundary.
- Recommendations: `imageS3Key: z.string().min(1).max(1024)`, `allergens: z.array(z.string().min(1).max(64)).max(50).nullable()`.

**Static identity placeholder `operator@example.com` renders in production UI:**

- Risk: `apps/admin/components/app-sidebar.tsx:86` hard-codes `email: 'operator@example.com'` in a `placeholderUser` object and renders it in `<NavUser>`. The `apps/CLAUDE.md` explicitly forbids static identity placeholders in shipping UI as a phishing-cue removal and unfinished-look issue.
- Files: `apps/admin/components/app-sidebar.tsx:84-88`
- Current mitigation: None — this value is shown to every signed-in operator.
- Recommendations: Load real user info from `apiFetch('/api/auth/get-session')` and pass it down from the layout RSC to `<AppSidebar>`.

**Email adapter not wired for `sendResetPassword` and `sendInvitationEmail`:**

- Risk: `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:137,152` falls back to `() => Promise.resolve()` for both callbacks. In staging/production, `assertEmailAdapterWired` only checks `sendVerificationEmail` (`apps/api/src/contexts/identity/identity-core.module.ts:28`). Operators who trigger forgot-password or receive team invitations on staging/production see no email.
- Files: `apps/api/src/contexts/identity/identity-core.module.ts:28-44`, `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:137,152`
- Current mitigation: `assertEmailAdapterWired` will throw on staging/production if `sendVerificationEmail` is missing, but the other two callbacks are silently no-ops.
- Recommendations: Add `sendResetPassword` and `sendInvitationEmail` to `REQUIRED_EMAIL_CALLBACKS` or add explicit assertions. Wire Resend/SMTP adapter (RES-12).

**NATS consumer missing `max_deliver` and DLQ config:**

- Risk: `packages/events/src/infrastructure/nats-subscriber.ts:60-66` creates consumers with `ack_policy: Explicit` and `max_ack_pending: options.maxInFlight ?? 1` but no `max_deliver` limit and no dead-letter-queue subject. A poison message (malformed envelope that always throws) will redeliver indefinitely, stalling the consumer.
- Files: `packages/events/src/infrastructure/nats-subscriber.ts:60-66`
- Current mitigation: None — `RunningSubscription.#run()` calls `msg.nak()` on parse failure and the message redelivers forever.
- Recommendations: Set `max_deliver: 5` and `dead_letter: 'dlq.${subject}'` in the consumer config; add `ack_wait` aligned to expected handler latency.

**`#run()` in `RunningSubscription` has no top-level try/catch on the iterator:**

- Risk: `packages/events/src/infrastructure/nats-subscriber.ts:123-138` — if the `for await` iterator itself throws (broker disconnect, stream deletion), the rejection is unhandled because `start()` calls `this.#loop = this.#run()` without attaching a rejection handler.
- Files: `packages/events/src/infrastructure/nats-subscriber.ts:111-112`
- Current mitigation: `stop()` catches the loop promise (`this.#loop.catch(() => undefined)`), but only at shutdown time. A mid-run iterator error before `stop()` is an unhandled rejection.
- Recommendations: Wrap the entire `for await` block in a try/catch that re-invokes `#run()` with backoff, or ensure `start()` attaches `.catch(this.#onError)`.

## Performance Bottlenecks

**`apiFetch` in admin makes an extra `GET /api/auth/get-session` per server-side render:**

- Problem: `apps/admin/lib/api-server.ts:157-176` — `getActiveTenantId` fires a BA session lookup before every `apiFetch` call. While `React.cache()` deduplicates within a single render pass, each new RSC render or server action invocation makes a fresh network round-trip to the API.
- Files: `apps/admin/lib/api-server.ts:157-176`
- Cause: The active organization ID is not stored in a dedicated cookie; it must be derived by parsing the BA session every time.
- Improvement path: Persist `activeOrganizationId` to a separate signed `resto.active_tenant_id` cookie (alongside `resto.active_brand`) set during `POST /api/auth/organization/set-active`. Reads become cookie lookups (zero network hops).

**Catalog `PublishedMenu` is fully deserialized on every cache miss:**

- Problem: `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` assembles the full published menu (all categories, items, variants, modifiers) with multiple sequential queries per request on every Redis cache miss.
- Files: `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`
- Cause: No query batching or DataLoader pattern; N+1 risk on items with variants/modifiers.
- Improvement path: Use a single JOIN query or `Promise.all` to fan out item fetches. The Redis cache (when healthy) amortizes this to near-zero per qr-menu request, but any Redis outage degrades every public menu request to multiple sequential DB queries.

## Fragile Areas

**Better Auth context stash via `ctx.context as { __restoSignOut? }` cast:**

- Files: `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:220-230, 263-267`
- Why fragile: The before/after hook pair communicates via a private stash property grafted onto BA's internal `ctx.context` object using `as unknown as { __restoSignOut? }`. This is an undocumented BA internals pattern. A BA upgrade that changes the context object shape would silently break sign-out audit events with no TypeScript error.
- Safe modification: Test sign-out audit thoroughly after every BA version bump. Consider extracting the stash to a module-level `WeakMap<object, Stash>` keyed on the request to avoid the cast.
- Test coverage: `apps/api/test/e2e/identity-audit.e2e.spec.ts` covers the happy path; no tests for the case where the stash is not found.

**`NATS_DISABLED` flag bypasses event publication silently:**

- Files: `apps/api/src/infrastructure/nats.module.ts:57,83`
- Why fragile: When `NATS_DISABLED=true`, the NATS module provides a null publisher. `OutboxDispatcher` no-ops gracefully, but no warning is emitted to indicate events are being dropped. In a misconfigured staging deploy this is invisible.
- Safe modification: Log a `warn` at startup when `NATS_DISABLED=true` (not just in the module constructor, but in the dispatcher's `onError` default handler).
- Test coverage: No test verifies that `NATS_DISABLED=true` still writes outbox rows (only that publishing is skipped).

**`identityBuckets` in-memory rate-limit store does not survive restarts or horizontal scale:**

- Files: `apps/api/src/shared/security.ts:62-75`
- Why fragile: The per-email rate-limit buckets for sign-in/reset are held in a `Map<string, IdentityBucket>` in process memory. Multiple api replicas do not share the counter, so per-email brute-force protection is only enforced per-instance.
- Safe modification: This is documented as "acceptable for MVP-1". Replacement path: move the per-email bucket to Redis using `INCR` + `EXPIRE` (the same pattern already used for menu version counters).
- Test coverage: `apps/api/test/e2e/auth-brute-force.e2e.spec.ts` tests the in-process path; no multi-replica test exists.

**`qr-menu` ships source maps to production (`sourcemap: true`):**

- Files: `apps/qr-menu/vite.config.ts:8`
- Why fragile: The `apps/CLAUDE.md` explicitly forbids this: "Customer-facing apps must NOT ship source maps to production." Source maps expose the full unminified source tree to any user who opens browser dev tools on the qr-menu domain.
- Safe modification: Change to `sourcemap: 'hidden'` and configure Sentry (or equivalent) to consume the hidden maps from the CI artifact store.
- Test coverage: `apps/qr-menu/test/bundle-no-dev-leak.spec.ts` checks for dev-only code leaks but does not assert the source map mode.

**`feature-flags` package is an empty placeholder:**

- Files: `packages/feature-flags/.gitkeep`
- Why fragile: The `packages/CLAUDE.md` documents it as "OpenFeature client with the configured provider (Unleash self-hosted)." Nothing is implemented. Any code that attempts to import from `@resto/feature-flags` will fail at build time.
- Safe modification: Either scaffold a minimal always-off stub or remove the package from `pnpm-workspace.yaml` and `tsconfig.base.json` paths until it is needed.

## Scaling Limits

**`INTERNAL_API_TOKEN` is a flat shared secret with no per-caller identity:**

- Current capacity: Single token for all internal callers (seed CLI, admin app, ops scripts).
- Limit: There is no audit trail of which caller invoked which internal endpoint. A compromised token grants full access to all `/internal/v1/*` routes (tenant provisioning, erasure, bootstrap).
- Scaling path: ADR-0012 defers per-user IAM to MVP-2. Intermediate step: issue per-caller tokens stored in Vault, rotate on breach.

**Redis catalog version counter is in-process fallback on Redis outage:**

- Current capacity: When Redis is available, per-tenant menu versioning is correct across replicas.
- Limit: On Redis outage, `bump()` returns `Date.now()` as a fallback version. Two concurrent bumps in the same millisecond return the same "version," causing cache-key collisions where one replica serves a stale menu after a publish.
- Scaling path: Add an in-DB sequence-backed version counter as the authoritative fallback (Postgres `nextval` on a `menu_versions` table) when Redis is unavailable.

## Dependencies at Risk

**`better-auth` pinned at `~1.4.22` (minor-patch only):**

- Risk: BA's 1.x surface is pre-1.0 stability. The organization plugin's type cast `as unknown as BetterAuthPlugin` (`apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:153`) and the internal `ctx.context.__restoSignOut` stash are both workarounds for upstream type gaps. BA 1.5.x or 2.x could break both.
- Impact: Silent runtime regression in sign-in/sign-out audit events; TypeScript errors that block CI.
- Migration plan: Pin to a specific patch, audit CHANGELOG before every bump, test all identity e2e specs against the new version before merging.

**`nats` package at `^2.29.1`:**

- Risk: NATS.js 3.x is in development and brings breaking API changes to `JetStreamClient`. The current subscriber code uses the `consume()` API introduced in 2.x.
- Impact: Build or runtime failure if a minor/major bump is auto-resolved.
- Migration plan: Lock to `~2.29.1`; upgrade intentionally when 3.x stabilises.

## Missing Critical Features

**No automated tenant erasure executor:**

- Problem: `listScheduledForErasure()` + `executeErasure()` are implemented but nothing invokes them automatically.
- Blocks: GDPR right-to-erasure SLA compliance. Tenants past their 30-day cool-off window accumulate indefinitely until a human runs the CLI.

**Email delivery is a no-op in all environments:**

- Problem: `sendResetPassword` and `sendInvitationEmail` fall back to `() => Promise.resolve()`. The Resend SMTP adapter (RES-12) is not implemented.
- Blocks: Forgot-password flow (link is never sent), team member invitation flow, email verification for new sign-ups in staging/production.

**Stripe Connect is a no-op adapter:**

- Problem: `apps/api/src/contexts/tenancy/tenancy.module.ts:22` wires `NoopStripeConnectAdapter`. The `stripe_account_id` column is always `NULL`.
- Blocks: All payment processing, payout routing, and any feature gated on having a Stripe account.

**`suspend` tenant status is unreachable from the API:**

- Problem: `TenantStatus` includes `'suspended'` but no service or HTTP endpoint transitions a tenant to this state.
- Blocks: Billing-failure lockout, abuse-response suspension.

## Test Coverage Gaps

**BA hook stash failure path not tested:**

- What's not tested: What happens when `ctx.context.__restoSignOut` is absent in the `after` hook (e.g., the `before` hook was not reached, or BA's context shape changed).
- Files: `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:262-270`
- Risk: Silent loss of sign-out audit events without any error surfacing.
- Priority: Medium

**Multi-replica per-email rate-limit bypass:**

- What's not tested: Two concurrent requests to different api replicas exceeding the per-email cap.
- Files: `apps/api/src/shared/security.ts:62-75`
- Risk: An attacker running parallel requests against multiple load-balanced replicas bypasses per-email brute-force protection.
- Priority: Medium

**`suspend` tenant transition:**

- What's not tested: The `suspended` status is referenced in `TenantStatus` and `brand.aggregate.ts` but there are no unit or integration tests for a suspend path.
- Files: `apps/api/test/unit/tenancy/`, `apps/api/test/e2e/tenancy.e2e.spec.ts`
- Risk: When a `SuspendTenantService` is eventually added, the status transition logic will be untested until deliberately added.
- Priority: Low (feature not yet implemented)

**Source map mode not asserted in qr-menu bundle test:**

- What's not tested: `apps/qr-menu/test/bundle-no-dev-leak.spec.ts` checks for dev code but does not assert that source maps are `'hidden'` rather than `true`.
- Files: `apps/qr-menu/test/bundle-no-dev-leak.spec.ts`, `apps/qr-menu/vite.config.ts:8`
- Risk: The current `sourcemap: true` config is a production security concern (full source exposure) that CI does not catch.
- Priority: High

**Redis outage version-collision scenario:**

- What's not tested: Concurrent `bump()` calls during a Redis outage both returning `Date.now()` and causing a cache-key collision.
- Files: `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts:70-77`
- Risk: Stale menus served after a publish event during Redis outage; no test would catch a regression.
- Priority: Low

---

_Concerns audit: 2026-05-24_
