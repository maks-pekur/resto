## CTO Review — Initial Roadmap (2026-05-24)

**Reviewer:** persona-cto
**Scope:** Initial 16-phase RestOS ROADMAP.md
**Verdict:** APPROVE WITH CONCERNS

The sequencing logic is sound and the foundation is genuinely mature. The concerns below are not blockers to starting — they are time bombs that need defusing before specific phase transitions, particularly Phases 7–9. None require a rewrite. All are fixable mid-stream if flagged now.

---

### Phase ordering concerns

**Phase 7 (Ordering) after Phase 6 (Customer Site) is the right call, but the dependency graph has a hidden inversion.**

Phase 6 (Customer Site) is listed as depending on Phase 4 only — but its Success Criteria include SITE-04 (delivery address + zone validity check) and SITE-05 (promo code + total breakdown). Both of these are dead UI without the ordering context (Phase 7) and delivery zones (Phase 10). The site cannot complete a real checkout until Phase 8 (Payments) is also live. This means Phase 6 can only be built as a _stub_ — the UI scaffolds, the menu renders, but the cart goes nowhere. That is fine if the phase plan documents it explicitly. If it does not, developers will either (a) block themselves on Phase 7 mid-Phase-6, or (b) wire up dummy flows that need ripping out later.

Recommended resolution: Phase 6 plans should explicitly scope the deliverable as "menu display + delivery/pickup mode selection + cart entry point — checkout button disabled until Phase 8 complete." Treat Phase 6 as a rendering and routing milestone, not a full checkout milestone. The SITE-08 (order confirmation) criterion should be gated to post-Phase-8, not Phase 6.

**Phase 10 (Delivery Zones) after Phase 9 (Admin Order Intake) is a sequencing error.**

Phase 10's DELV-05 requires geocoding + in-zone check at site checkout. For any delivery order to be accepted in Phase 9's operational view, a zone must exist — otherwise every delivery order silently has no zone validation and the operator is accepting deliveries to unknown addresses. The ROADMAP.md lists Phase 10 as depending on "Phase 6, Phase 7" but it actually needs to be buildable alongside Phase 8 so zones can be checked at checkout before Phase 9 opens the operational view.

Recommended resolution: Move Phase 10 to execute concurrently with Phase 8, or swap 9 and 10 so zones exist before the operational intake is live. Alternatively, Phase 9 success criteria should explicitly note that delivery validation is not enforced until Phase 10 merges, and ORDINT requirements should not claim operational completeness without it.

**Phase 11 (Promo) is correctly placed but PROMO-06 (pure domain discount) is a cross-phase contamination risk.**

The ordering context (Phase 7) needs to apply discounts at checkout. If Phase 11 comes after Phase 9 (operational intake), there is a window where orders are processed without any discount application. The guest-facing checkout (Phase 6, Phase 8) will accept payment on a cart total that does not reflect promo codes. SITE-05 explicitly requires promo code entry — but Phase 6 depends on Phase 4, not Phase 11. This is either a sequencing gap or an incorrect dependency in SITE-05.

Recommended resolution: Either (a) move PROMO-01/03/04/06 into Phase 7/8 scope as "basic promo application at checkout" and leave the admin UX for Phase 11, or (b) explicitly mark promo code entry in SITE-05 as a "UI placeholder, non-functional until Phase 11." The domain discount engine (PROMO-06) must exist before Phase 8 ships real payments — you cannot charge a guest the wrong total.

---

### Hidden risks

**Risk 1: Phase 1 is underestimated for solo throughput.**

Phase 1 has 15 requirements (TEN-01 through TEN-15). These include: building `SuspendTenantService` from scratch, implementing the automated erasure cron, creating `buildEnvelope` and the ALS-correlationId pipe, writing two ESLint custom rules, adding per-tenant OTel metrics with `tenant_id` labeling, and closing the NATS `max_deliver` / DLQ gap. That is 5–6 discrete engineering concerns across the DB, events, background jobs, and tooling layers. CONCERNS.md documents each with concrete file references — none are trivial. A solo developer completing all 15 TEN requirements to the success criteria quality bar (including the concurrent ALS leak test coverage in TEN-08) in under 3–4 weeks would be moving fast.

The risk is not that Phase 1 is the wrong thing to do — it is absolutely the right gate before anything is built on top. The risk is that the roadmap does not size it honestly, creating timeline pressure that causes TEN-08 (cross-tenant isolation under concurrent load) or TEN-14/TEN-15 (envelope + ESLint) to be shipped at MVP quality rather than production quality. Both of those are the last line of defense before a cross-tenant data leak.

**Risk 2: `OutboxDispatcher` claim-ownership race is unresolved when horizontal scaling happens.**

CONCERNS.md documents this precisely: `packages/events/src/outbox/repository.ts:110-128` — `releaseOutboxClaim` has no `claim_token` predicate. At 1 API replica (MVP-1 launch), this is invisible. At 2+ replicas (first scaling event after launch), outbox events can be double-delivered to NATS. Double-delivery of `order_paid` is survivable if `runDeduped` catches it at the consumer side — but double-delivery of `order_created` with a stale claim race means two audit rows for one order creation. More dangerously, `payment_intent.succeeded` processed twice through an inbox dedup gap produces two `paid` state transitions. This is a data corruption path, not just a cosmetic bug.

This does not need to be fixed in Phase 1 — but it must be fixed before Phase 8 ships real Stripe webhooks. It is not in any phase's requirements. It needs to be either added to Phase 8 scope or called out as a pre-Phase-8 gate.

**Risk 3: Better Auth `~1.4.22` is pinned to a pre-1.0-stability surface at exactly the wrong time.**

CONCERNS.md flags the `as unknown as BetterAuthPlugin` cast and the `__restoSignOut` context stash. Phase 3 (Auth Completion) is the phase where the most BA internals get touched — email callbacks, invitation flows, RBAC seeding. This is when a BA minor version bump is most likely (new feature needed = check changelog = consider upgrading). If BA 1.5.x ships between Phase 2 and Phase 3, any TypeScript gap in the organization plugin or changed context object structure produces CI failures mid-phase. The fix is cheap: pin to `=1.4.22` exactly (not `~1.4.22`) and make a deliberate upgrade decision a phase deliverable, not a dependency-manager decision.

**Risk 4: Phase 13 (Analytics) is doing OLAP queries on the OLTP database.**

ANL-04 (conversion funnel: menu view → add-to-cart → checkout → paid) requires cross-referencing event data or multi-table aggregations. At 1–10 tenants, a `GROUP BY` on the `orders` table is fine. At 100 tenants with meaningful order volume, unindexed analytical queries on the primary Postgres database create lock contention on Friday evenings — exactly the peak load window. There is no materialized view, no read replica, no analytics sink (Clickhouse, Redshift, even a pg_cron rollup table) in the current architecture. The ROADMAP.md does not plan one. This is acceptable for MVP-1, but it needs a flag: "Phase 13 analytics are direct OLTP queries — acceptable until 50 active tenants, revisit before scaling."

**Risk 5: The `feature-flags` package is an empty `.gitkeep` and zero phases require it.**

CONCERNS.md notes `packages/feature-flags/.gitkeep` — documented as "OpenFeature client with Unleash self-hosted." No phase in the roadmap scaffolds it or wires it. This matters because Phase 16 (Self-serve Onboarding) includes `ONB-05` (dev-mode skip-to-paid-flow toggle), which is a feature flag. Without a real flag system, this becomes a hardcoded `if (process.env.NODE_ENV !== 'production')` that either (a) ships to production, (b) requires a code change to toggle, or (c) gets skipped. More broadly, any A/B test on the onboarding flow, any gradual rollout of a new menu format, or any per-tenant feature gate requires this infrastructure. The roadmap should either (a) stub OpenFeature with an env-var provider in Phase 1 (2 hours of work), or (b) explicitly mark ONB-05 as "environment variable only, not feature-flag." Leaving the package as `.gitkeep` while the Phase 16 success criterion implies toggleable behavior is a deferred decision that will cost time at the worst moment.

---

### Build-vs-buy questions

**Delivery geocoding (DELV-05): OSM/Nominatim is the right default, but rate limits will bite.**

Nominatim's public API has a 1 req/sec hard limit with usage policy enforcement. At 10 concurrent checkout attempts, you will be throttled. The ROADMAP.md specifies "OSM/Nominatim" without a caching or self-hosting qualifier. The fix at MVP scale is cheap: add a Redis geocode cache keyed on normalized address string with a 24h TTL. A cache hit is free and handles 95%+ of delivery orders (guests reuse addresses). This should be a Phase 10 success criterion, not left implicit.

Post-50-tenant scale: self-hosted Nominatim on a t3.medium or Photon (faster, open-source) becomes necessary. Document this as a Phase 10 operational note.

**WYSIWYG editor (CONT-02, Tiptap): correct buy decision.**

Tiptap is the right call. It is open-source, React-native, and the schema is serializable to JSON for storage in Postgres. Do not let scope creep add a headless CMS — the four content pages (About, Delivery, Contact, FAQ) are well-defined and a Tiptap JSON blob per page is sufficient. This decision is locked correctly in PROJECT.md.

**Per-city SEO pages (CONT-03): template-based generation is correct, but the data model is missing.**

"Auto-generated from a single template per zone" requires a `city` or `zone` entity in the data model. Nothing in the current bounded contexts or schema (as documented in ARCHITECTURE.md) has this. If it lives in the `tenancy` context as a `Location.city` field, the SEO generation is a read-only view over tenant data. If it requires a separate `seo_pages` table with editor-supplied overrides per city, that is a new data model. This is a Phase 15 planning decision but it needs to be made before Phase 15 design starts — otherwise "auto-generated SEO pages" may require schema migration at a late stage.

**Server-Sent Events for real-time order intake (ORDINT-02): acceptable MVP choice, bounded risk.**

SSE over HTTP/2 is a pragmatic choice for solo-team MVP — no WebSocket server upgrade needed on Fastify, no Socket.io dependency. The risk is connection multiplexing: at 10 operators watching live feeds, 10 persistent SSE connections held by the API server increase memory pressure and complicate graceful shutdown (connections must be flushed before process exit). The `onApplicationShutdown` hook must drain SSE connections. This is not in any phase's success criteria. Add it to Phase 9.

---

### Scaling / operational concerns

**The outbox advisory lock (`pg_try_advisory_lock(4815115)`) at Phase 7 volume.**

At MVP-1 with one API replica, the advisory lock is fine — it prevents concurrent outbox dispatch within a single process restart window. At 2+ replicas, the lock becomes a distributed election mechanism. `OutboxDispatcherService` already documents this as leader-elected, but there is no health check that exposes "am I the outbox leader?" status. When a non-leader replica boots and silently hands off dispatching, there is no observable signal that the handoff succeeded. At Phase 7+ (real orders flowing), a failed leader election that silently stops outbox dispatch means orders are placed but `order_paid` events are never emitted — the operator sees no order in the intake feed. This is a P0 operational failure mode with no current alerting.

Recommended action: Add an OTel gauge metric `outbox.is_leader` (1 or 0) and a `/health/readiness` probe that marks the pod NOT ready if the outbox has not dispatched in >30 seconds when it holds the lock. This is a Phase 1 or Phase 7 deliverable, not post-MVP.

**Redis cache version-counter collision on outage (CONCERNS.md: Redis outage version-collision scenario).**

This is documented in CONCERNS.md but not addressed in any phase's requirements. Phase 4 (Catalog Admin) triggers publish flows that bump the Redis version counter. If Redis is down during a publish, two operators publishing simultaneously (even unlikely at MVP) get `Date.now()` as the version key, causing one publish to silently serve a stale cache. The fix (Postgres `nextval` sequence as authoritative fallback) is a one-migration task. It should be a Phase 4 success criterion since that is when publish flows first go live.

**Rate-limiting is per-instance, not distributed.**

CONCERNS.md explicitly flags `apps/api/src/shared/security.ts:62-75` — `identityBuckets` in-process `Map`. At single replica, correct. At 2+ replicas, per-email brute-force protection is divided by replica count. For MVP-1 at a single replica, this is acceptable. But the ROADMAP.md has no phase that migrates this to Redis INCR. If horizontal scaling happens before this is addressed (e.g., for a Friday evening traffic spike), auth brute-force protection is broken. This is a LOW-priority gap at current scale but should be documented as a pre-scaling gate, not left invisible.

**`inbox_processed` table unbounded growth is not assigned to any phase.**

TEN-13 covers this (daily deletion of `inbox_processed` rows older than 30 days) and is correctly in Phase 1. Good — this is the one concern item that is properly assigned. But Phase 1 success criteria do not explicitly verify that the retention sweep runs correctly for platform-level (null `tenant_id`) rows vs. tenant-scoped rows. CONCERNS.md notes that the `tenancy_erase` function includes the table but platform-level rows are never swept. The TEN-13 success criterion in Phase 1 should be expanded: "scheduler deletes both tenant-scoped and platform-level `inbox_processed` rows older than 30 days."

---

### Specific phase adjustments recommended

**Phase 1: Add `OutboxDispatcher.stop()` idempotency fix as an explicit deliverable.**

CONCERNS.md documents the concurrent-call deadlock at `packages/events/src/outbox/dispatcher.ts:118-124`. This is a known graceful-shutdown bug. Phase 1 is the hardening phase. Add it. It is a 5-line fix. The cost of not fixing it is a potential deadlock in test teardown that produces flaky CI, which will cost more time to debug than the fix.

**Phase 1: Add `appendToOutbox` envelope validation as an explicit deliverable.**

`packages/events/src/outbox/repository.ts:23` — no `EventEnvelope.parse()` before insert. Phase 1 introduces the `buildEnvelope` helper (TEN-14). Pair it with the validation gate. Without it, malformed envelopes from the new ordering context (Phase 7) will surface as broker-side parse errors rather than insert-time failures.

**Phase 4: Add Redis version counter fallback as a success criterion.**

As described above — publish flow is a Phase 4 deliverable; the version counter race on Redis outage must be closed before publish flows go live. Add: "menu version counter uses Postgres `nextval` sequence as fallback when Redis is unavailable."

**Phase 6: Explicitly scope the checkout as a stub.**

Phase 6 success criteria include SITE-08 (order confirmation after payment success) which is impossible without Phase 7 and Phase 8. Either move SITE-08 to Phase 8's success criteria list (which already covers the payment confirmation flow) or reword Phase 6's success criteria to make clear that "cart → checkout → confirmation" is a Phase 8 deliverable, with Phase 6 delivering "menu display → mode selection → cart entry point."

**Phase 7: Add claim-token column to outbox as a Phase 7 prerequisite.**

Before Phase 7 ships a real ordering context with real NATS events, the outbox claim-ownership race must be closed. Add to Phase 7 scope: "add `claim_token UUID` column to `outbox_events`, scope `releaseOutboxClaim` and `markOutboxDelivered` to the claiming replica's token." This is a single migration + 10-line repository change. Waiting until there are financial events in the outbox to fix a known data corruption path is not acceptable.

**Phase 8: Add `outbox.is_leader` OTel metric and readiness probe.**

As described in the scaling section — before real Stripe events flow through the outbox, the leader-election observability gap must be closed. A missed `payment_intent.succeeded` event that never dispatches because the outbox leader silently failed is a P0 incident. Add to Phase 8: "outbox dispatcher exposes `outbox.is_leader` gauge metric; readiness probe fails if leader has not dispatched in >30 seconds."

**Phase 9: Add SSE connection drain to `onApplicationShutdown`.**

Server-Sent Events connections must be drained before the NestJS app shuts down. Without this, a rolling deploy during active order intake drops all operator connections mid-feed with no reconnection signal. Add to Phase 9 success criteria: "graceful shutdown closes all active SSE connections with a `retry:` event instructing clients to reconnect."

**Phase 10: Add Nominatim geocoding cache.**

Redis-backed geocode cache keyed on normalized address, 24h TTL. Without it, 10 concurrent checkout attempts hit Nominatim's 1 req/sec public API limit. This is a Phase 10 deliverable, not a post-Phase-10 optimization.

**Phase 11: Move PROMO-06 (pure domain discount engine) to Phase 7 or Phase 8.**

The discount calculation must exist before real payments are processed. A checkout that accepts payment without applying a valid promo code is a guest-facing pricing error. The operator cannot manually reconcile incorrect charges after Stripe has settled the payment. The admin UX (PROMO-01, PROMO-02) can wait for Phase 11, but the domain calculation layer must precede Phase 8.

**Phase 16: Wire `feature-flags` stub or explicitly downgrade ONB-05.**

Either scaffold OpenFeature with an env-var provider in Phase 1 (2 hours), or change ONB-05 to "dev-mode skip via `SKIP_PAYMENT_FLOW=true` environment variable" and remove the feature-flag implication. The empty `packages/feature-flags/.gitkeep` must not be a silent import failure at Phase 16.

---

### Things the roadmap got right

**Depth-first foundation before product breadth.** The decision to run Phase 1 (tenancy hardening) before any customer surface is built is architecturally correct. The platform is genuinely mature — RLS double-enforcement, composite FK, scoped transactions, transactional outbox, OTel bootstrapping — and it would be a serious mistake to start building ordering on top of open GDPR, ALS leak, and audit gaps. The roadmap does not compromise on this.

**Admin before customer surfaces.** Running Phases 2–4 (admin shell, auth, catalog) before Phases 5–6 (QR-menu, site) is the right call. You cannot test customer-facing flows without a working menu to publish, and you cannot publish a menu without admin auth. This is obvious in retrospect but many roadmaps get it backwards.

**Stripe Connect architecture.** The decision to use Stripe Connect with application fees rather than a custom payment gateway is the correct build-vs-buy call. It offloads PCI compliance, payout routing, and multi-currency to Stripe's infrastructure. The `NoopStripeConnectAdapter` behind a port is exactly the right pattern — Phase 8 swaps the adapter without touching the domain. This is a genuine architectural strength.

**No POS in MVP-1.** This is correct. Every POS adapter you build before having paying customers is a speculation tax. The port abstraction (POS-03 in v2 requirements) is the right engineering bet — design the interface when you know what iiko and r_keeper actually require, not before.

**Bounded context seams are correct for eventual splitting.** The `ordering` context (Phase 7) is designed as a new bounded context from day one, not bolted onto `catalog` or `tenancy`. When ordering volume justifies a separate database or service, the seam already exists. This is not premature — it is the correct default given the platform's DDD discipline.

**Self-serve onboarding as the final integration milestone (Phase 16).** Placing onboarding last ensures every prior phase is production-quality before the public sign-up path is opened. The alternative — onboarding early and iterating — creates a support burden before the product is complete. The Q1 2027 target with onboarding at Phase 16 implies that a curated first customer (not self-serve) can be onboarded manually after Phase 9, which is the right interim approach.

---

## Skeptic Review — Initial Roadmap (2026-05-24)

**Reviewer:** persona-skeptic
**Scope:** Initial 16-phase RestOS ROADMAP.md
**Verdict:** APPROVE WITH CONCERNS

---

### Hidden assumptions

**1. "The conversion funnel dashboard requires frontend event tracking" — but no tracking layer is planned.**

ANL-04 requires showing "menu view → add-to-cart → checkout → paid" conversion rates. This is not derivable from order records alone. You need client-side instrumentation — page view events, cart-add events — sent somewhere and queryable. No analytics ingestion layer, no event store, no PostHog/Mixpanel/custom schema for these events appears anywhere in Phases 1–16 or in the existing codebase (grep on `track`, `page_view`, `add_to_cart` returns nothing across `apps/`). The roadmap assumes these numbers just exist. They won't unless Phase 5 or Phase 6 actively emits and persists funnel events. This is a silent blocker for Phase 13's most-marketed requirement.

**2. "Nominatim will geocode checkout addresses reliably at production load."**

DELV-05 / SITE-04 use OSM/Nominatim for geocoding at checkout. Nominatim's public instance is rate-limited to 1 request/second per IP by their ToS. A single restaurant with 5 concurrent checkouts during Friday dinner can trip this. Self-hosting Nominatim requires a 50GB+ planet import and significant ops overhead. The roadmap specifies the choice but assumes away the operational cost. There is no fallback provider, no caching strategy, and no rate-limit acknowledgement anywhere in the planning documents. The REQUIREMENTS.md mentions Nominatim exactly once (DELV-05) with no qualifier.

**3. "Phase 16 self-serve onboarding is the last piece — everything before it works without it."**

The roadmap's ordering assumes Phases 1–15 are fully independently usable, and Phase 16 merely threads them together. But ONB-01 specifically eliminates the "separate create org step" — which changes the auth + tenancy signup flow established in Phases 2–3. If this changes the user creation contract, it may require backtracking into Better Auth's org-creation path built months earlier. The "thread everything together" framing understates the scope of what may be breaking changes to the auth surface. Phase 16 may not be a pure integration phase — it may be a partial rebuild of Phase 2–3's UX.

**4. "FIN-06 (RestOS SaaS billing line) makes sense without a billing engine."**

FIN-06 requires showing "RestOS SaaS billing line for the period." The REQUIREMENTS.md Out of Scope table explicitly excludes self-serve SaaS billing in MVP-1 ("invoice-billed manually"). What does "the billing line" show if there is no automated billing system? A hardcoded constant? A placeholder? This requirement either means something much simpler than written (just display the tier name and monthly fee from a config constant) or silently requires a partial billing engine. It has no definition of what "for the period" means when billing is manual. As written, FIN-06 is an empty requirement.

**5. "Both customer surfaces (QR-menu and Site) are built before the ordering engine."**

Phase 5 builds `apps/qr-menu` cart and ordering UI (dine-in). Phase 6 builds `apps/website` cart and ordering UI (delivery/pickup). Both terminate at the same `ordering` bounded context built in Phase 7 — which doesn't exist yet. Phase 6's success criteria explicitly includes "promo code field and final total breakdown" (SITE-05) — but the promo engine is Phase 11 and the ordering context is Phase 7. These phases are building UX shells for a backend that doesn't exist yet. This creates either dead UI or an uncosted second-pass wiring that is nowhere in the phase success criteria.

**6. "The guest learns what happened to their order."**

SPEC section 4's delivery scenario says "live-статус → push на изменения" is part of the experience. ORD-02's state machine goes `accepted → preparing → ready → completed`. No requirement in Phases 7–9 or anywhere in MVP-1 specifies how the guest learns their order moved states. No email notification, no push, no SSE to the guest-facing site, no polling endpoint for order status. The operator has real-time updates (ORDINT-02). The guest gets the confirmation page (SITE-08) and then silence. For dine-in QR this is tolerable. For a delivery order where a guest paid €40 and has no feedback loop, this generates calls to the restaurant and Stripe disputes.

---

### MVP omissions

**A. No guest order status visibility (critical for delivery).**

See assumption 6. SITE-08 (confirmation page with order number) is the last communication. There is no requirement for an order confirmation email, no status polling endpoint, no SSE stream to the website. For any restaurant doing delivery via `apps/website`, this will generate immediate support burden at the first paying customer. One email per order — "Your order #1234 has been accepted / is being prepared / is on its way" — is table-stakes and costs one `sendOrderStatusEmail` call wired to the Resend adapter that already exists from AUTH-01. There is no such requirement in Phases 1–16.

**B. No handling of menu item availability at order time.**

Stop-lists are manual (CAT-07). There is no requirement specifying what happens when an operator marks an item as 86'd while it is in active carts or has been ordered but not yet accepted. Can a guest complete checkout with a stopped item? The immutable snapshot (ORD-04) captures prices at creation — but nothing validates availability at checkout submission. An operator accepts an order containing a stopped item, then manually rejects it and refunds. Who eats the Stripe processing fee? No requirement addresses this race. At first paying customer, this will happen.

**C. No handling of concurrent catalog edits.**

Two operators (owner + manager) editing the same menu simultaneously. No optimistic locking, no version conflict error, no last-write-wins disclosure. CONCERNS.md surfaces concurrent menu edits as a Skeptic concern (PROJECT.md:164 explicitly lists it in the persona definition), but zero requirements across Phases 1–16 address it. For a single-operator restaurant this is low risk. For a 3-location network with shared menu and two managers it will corrupt catalog state silently on publish.

**D. No order confirmation email to the guest.**

The ordering flow ends at SITE-08: "Guest sees order confirmation page with order number after payment success." If the guest closes the tab, they have no record of their order beyond browser history. No email receipt, no order reference in any communication channel. This is the most basic expectation of an online order flow. The Resend adapter is being wired in AUTH-01 (Phase 3) — the infrastructure exists. But no requirement in any of the 135 v1 requirements asks for an order confirmation email to the guest. This is a genuine omission, not a deferral.

**E. "Scheduled order time" (SITE-07) has no backend model in Phase 7.**

SITE-07 requires the guest to choose "ASAP or scheduled interval." Phase 7 (ORD-01 through ORD-10) defines the Order aggregate and state machine with no `scheduled_for` field, no validation that the scheduled time falls within operating hours, and no mechanism to hold the order in a pending state until the scheduled window opens. The UI requirement exists in Phase 6. The backend field is absent from Phase 7. This is not a deferred feature — SITE-07 is a v1 requirement with no implementation home.

**F. No guest-visible refund confirmation.**

PAY-09 / FIN-03 cover the operator initiating refunds. But nowhere in Phases 1–16 is there a requirement for the guest to receive a refund confirmation. The guest paid, the order was rejected or canceled, the refund was triggered — and they get silence. A guest who calls the restaurant asking "where is my refund?" because they received no confirmation is a support ticket and a chargeback risk.

---

### Premature optimizations

**1. TEN-15 (ESLint rule rejecting direct `EventEnvelope` construction) as a Phase 1 CI gate.**

The only callers that need fixing today are in `identity` and `tenancy` contexts. The `ordering` context — the first high-volume event source — does not exist yet. Making a CI-blocking ESLint rule that prevents any direct `correlationId: randomUUID()` construction in Phase 1 means the rule gates every future developer before a single paying customer exists. The fix it enforces is real and correct (`buildEnvelope` via CONCERNS.md). But a CI-blocking lint rule is maximalist for Phase 1. A runtime warning from `buildEnvelope` that logs when the fallback UUID is used would achieve the same tracing benefit without a hard gate. The ESLint rule is appropriate once the ordering context exists and events matter financially.

**2. TEN-10 (per-tenant OTel metrics with `tenant_id` label) at zero paying tenants.**

Per-tenant outbox lag, HTTP request rate, and error rate by `tenant_id` label in Phase 1. This requires a metrics backend that can handle cardinality-split on `tenant_id`. At zero tenants, this instruments a void. At 10 tenants, it is fine. At 1000 tenants, every label value is a separate metrics series — Datadog charges per custom metric by series count. The roadmap does not acknowledge the cardinality ceiling or the operational cost. This is a post-10-tenant feature masquerading as a Phase 1 foundation requirement.

**3. PROMO-02 (CSV bulk import of promo codes).**

Bulk CSV import of one-time-use promo codes is for a restaurant running a multi-thousand-code loyalty launch campaign. First 10 paying customers will manually create 3–5 promo codes each at most. CSV import adds file upload parsing, validation, error reporting, and a UX surface. Removing it does not break the product. Per SPEC section 8.3: "Что если убрать эту фичу — продукт ещё имеет смысл?" Yes. Trivially yes. Move PROMO-02 to v2.

**4. ANL-04 (conversion funnel: menu view → add-to-cart → checkout → paid).**

This metric requires client-side event instrumentation (see hidden assumption 1). It is not a SQL query over the `orders` table. Building a funnel display without the instrumentation layer is a UI panel showing zeros. Even with instrumentation, a restaurant processing 30 orders/day generates a funnel that rounds to statistical noise. This is a feature for a restaurant at 500+ orders/month wanting to optimize their checkout flow. For MVP-1 first 10 tenants, "order conversion rate = orders paid / orders created" is computable server-side and tells the same story. Redefine ANL-04 or move the full funnel to v2.

**5. CONT-03 (per-city SEO landing pages) in Phase 15.**

Auto-generated per-city SEO pages for a restaurant with one location and one delivery zone generate one page. Google does not index new pages in under weeks to months. For the first 10 paying customers, the SEO benefit within the MVP-1 timeline is zero. The feature requires: a zone-to-city mapping model, a template engine, URL routing for per-city slugs, sitemap integration, and per-page meta editing. That is 2–4 days of solo engineering for zero measurable return at MVP scale. Cut from MVP-1.

---

### Over-engineering

**1. Phase 8: Full Stripe Connect Express onboarding before any tenant has a Stripe account.**

The roadmap replaces `NoopStripeConnectAdapter` with full Stripe Connect Express: account onboarding via `account_link`, `account.updated` webhooks, application fee routing, idempotent inbox dedup for Stripe events. This is architecturally correct for a multi-tenant SaaS. The failure mode of the simpler alternative: RestOS collects payments into its own Stripe account for the first few tenants and handles payouts manually (or via Stripe Payouts) until Connect is live. The consequence: for first 10 customers, this avoids the "cannot accept live orders until Stripe KYC completes" blocker — KYC for Stripe Connect Express can take days in EU markets and requires business verification documents. The roadmap does not acknowledge that the most critical first-customer moment ("can I take my first online payment?") is blocked not by RestOS's readiness but by Stripe's KYC timeline. At minimum, Phase 8's success criteria should include a "pending onboarding" state that does not block catalog, CRM, or admin operation while KYC is in progress.

**2. CONT-02 (Tiptap WYSIWYG) for four static content pages.**

Four content pages: About, Delivery, Contact, FAQ. A WYSIWYG editor adds: a rich editor dependency, serialization format decisions (HTML vs ProseMirror JSON), sanitization requirements (XSS vector if the output is unsanitized), and rendering parity testing between editor output and site display. The failure mode of the simpler alternative (plain `<textarea>` with Markdown, or fixed structured fields per page): operators cannot use bold or bullet points. That is survivable for 10 customers. Tiptap is a v2 feature. Use a Markdown textarea in MVP-1 — DOMPurify + `marked` renders it safely and the editor can be upgraded later without touching the data model.

**3. Phase 16 as a separate phase rather than a thin integration layer.**

Phase 16 depends on all 15 prior phases. Its requirements (ONB-01 through ONB-05) describe an onboarding wizard over already-built features. If each prior phase was built with solo-operator manual setup in mind (which they are — you can manually onboard the first 10 customers), then Phase 16 is approximately 1–2 weeks of wizard UI work, not a full phase. The roadmap's phase structure treats it as equivalent to Phase 9 (Admin Order Intake) in scope. This may inflate the estimate of what is needed to reach "first paying customer" — if manual onboarding suffices for first 10, Phase 16 can be a Phase 17 (post-first-revenue) milestone.

---

### Features that could be cut without breaking the product for first 10 paying tenants

1. **CONT-03** (per-city SEO pages) — zero indexed impact within MVP timeline. Move to v2.
2. **PROMO-02** (CSV bulk import of promo codes) — manual creation is sufficient at MVP scale. Move to v2.
3. **ANL-04** (full conversion funnel) — replace with server-side order conversion rate; full funnel needs instrumentation that doesn't exist.
4. **FIN-06** (RestOS SaaS billing line) — either define it as a hardcoded config display or remove it; it cannot be a meaningful metric without a billing engine.
5. **QRM-10** (multi-language switcher in QR-menu) — single operator-configured language per tenant is sufficient for first 10 EU customers. The i18n infrastructure cost in Phase 5 is non-trivial.
6. **CAT-08** (draft-vs-published diff view) — useful UX, non-trivial to implement correctly. An operator can visually review before publishing. Defer.
7. **TEN-10** (per-tenant OTel cardinality metrics) — zero return at zero tenants. Add at 20+ tenants when the signal is observable.
8. **Phase 16 entirely** — manual onboarding for first 10 customers. Build the wizard after first revenue confirms the product works.

---

### Specific phase adjustments recommended

**Phase 5 (QR-Menu Customer):** Remove QRM-10 (language switcher) from Phase 5 scope. i18n infrastructure for a Vite app in Phase 5 adds complexity before ordering exists. A single language per tenant config is sufficient for first 10 paying customers. The language switcher belongs in Phase 15 (Content & SEO) or later, where i18n is handled alongside the website.

**Phase 6 (Customer Site):** SITE-05 references "promo code field and final total breakdown" — this requires Phase 11 (Promo) and Phase 7 (Ordering) to be complete first. Either move Phase 6 after Phase 11 in the sequence, or scope Phase 6's checkout as a shell: "promo code field present, non-functional until Phase 11; total breakdown shows subtotal only until Phase 7 wires discount and delivery calculations." This must be stated explicitly in success criteria, or the phase will fail its own criteria as written.

**Phase 7 (Ordering):** Add one schema requirement: `orders` table includes `scheduled_for TIMESTAMPTZ NULL` to support SITE-07 (scheduled order time). Without this field, SITE-07's UI has no backend storage target. Adding it later requires a migration at a phase when the ordering context is already in production. It is a one-line schema addition now.

**Phase 8 (Payments):** Add a "pending onboarding" UX state as a Phase 8 success criterion: "operator can use catalog, CRM, and admin fully while Stripe Connect onboarding is pending or under review; only the 'Accept payments' live switch is blocked." Without this, a tenant whose Stripe KYC is delayed cannot use the product they are paying for during the verification window.

**Phase 9 (Admin Order Intake):** Add a missing requirement: guest order status visibility. A minimal `GET /v1/orders/:id/status` public endpoint that the delivery confirmation page polls (or an SSE stream) to show "accepted / preparing / on its way" is table-stakes for any delivery order. This is not a Staff app feature. It is a public read endpoint. Add it to Phase 9 as ORDINT-09.

**Phase 13 (Analytics):** Redefine ANL-04. Replace "conversion funnel from menu view → add-to-cart → checkout → paid" with "order conversion rate = paid orders / checkout initiations." The latter is computable from server-side data. The former requires client-side event instrumentation planned in no phase. If the full funnel is required, add a "funnel event emission" requirement to Phase 5 or Phase 6 and cost it explicitly.

**Phase 15 (Content & SEO):** Remove CONT-03 (per-city SEO pages) from MVP-1. Move to v2 requirements. Replace with: "Per-tenant `sitemap.xml` lists all published menu categories and content pages" — already partially covered by CONT-05 and achievable without the city-landing-page engine.

**Phase 16 (Self-serve Onboarding):** Move to post-revenue. First 10 customers get manually onboarded (white-glove). Phase 16 scope becomes a post-Phase-9 milestone tracked separately, not a dependency for first paying customer. If this is retained as MVP-1, flag explicitly that ONB-01's "no separate create org step" changes the auth flow from Phases 2–3 and may require backtracking into Better Auth's org creation path.

---

### Things the roadmap got right

1. **No Staff app in MVP-1.** Admin order intake via Phase 9 as a substitute is the correct MVP-bar call. The Staff app (KDS, waiter view, courier view) would add 6–8 weeks for a surface that the first paying restaurant owner can live without — they check the admin on a tablet.

2. **No POS integration in MVP-1.** Correctly classified as Out of Scope. "Own core, optional POS sync" is the right positioning and product narrative. Building a POS adapter before the ordering engine exists is building a socket before the house.

3. **Stripe Connect chosen over Stripe Checkout for multi-tenancy.** The long-term architecture is correct and the `NoopStripeConnectAdapter` behind a port is the right pattern. Phase 8 swaps the adapter without touching the domain. The concern above about onboarding latency is operational, not architectural.

4. **No Google Maps dependency (Leaflet + OSM).** Correct cost call. Google Maps usage fees compound with tenant count. OSM/Leaflet is free and sufficient for polygon delivery zone editing.

5. **SaaS billing deferred to manual invoicing.** First 10 customers can be invoiced by hand. Building a billing engine before product-market fit is a classic premature investment. The Out of Scope table handles this correctly.

6. **Hard deletes forbidden at `resto_app` level.** Correct architectural invariant. Soft-delete-only with scheduled erasure is the right GDPR posture and it is locked at the DB privilege level, not just the application level.

7. **MVP-1 surface = Admin + QR-menu + Site, no Telegram MA.** The deferred surfaces are genuinely non-critical for first-customer value. Ordering from a mobile browser via `apps/website` is sufficient. Telegram MA is a growth feature, not a table-stakes requirement.

8. **Phase 12 (CRM) before Phase 13 (Analytics).** CRM data (customer records, order history) feeds Analytics. Getting the customer record layer right before building dashboards over it is the correct sequence.
