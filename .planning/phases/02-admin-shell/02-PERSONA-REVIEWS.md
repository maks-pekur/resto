## CTO Review

**Severity legend:** BLOCK = must resolve in discuss; FLAG = address in phase; OK = noted.

### Per-question recommendations

1. **Signed cookie strategy — FLAG.** Reuse `BETTER_AUTH_SECRET` is the wrong move: rotating BA's secret would invalidate brand selections too, conflating identity TTL with UX state. NextAuth-style stateless JWT is overbuilt — we are storing one slug. **Recommendation:** dedicated `ACTIVE_BRAND_COOKIE_SECRET` (HMAC-SHA256 of `${userId}.${tenantId}.${slug}`) decoded server-side in the dashboard layout. Critically — brand identity is **never authoritative from cookie**; `apps/admin/lib/api-server.ts:103-117` already forwards `x-brand-slug` and the api MUST validate slug ∈ operator's visible brands per request. Cookie is a UX cache, the api is the source of truth. Brand-switch should NOT re-resolve tenant context (BA's `activeOrganizationId` already pins tenant at `api-server.ts:157-176`); only re-validate the brand belongs to that tenant.

2. **env validation — FLAG.** Do NOT mirror api's full `env.schema.ts` — admin has ~5 vars vs api's ~30. **Recommendation:** thin `apps/admin/lib/env.ts` with a single Zod schema, parsed eagerly at module load. Import it from `instrumentation.ts` (Next 16 boot hook) so it throws before any request renders. Test envs: gate with `process.env.NODE_ENV === 'test'` returning permissive defaults, mirroring `apps/api/src/config/env.schema.ts` pattern. Current code at `lib/api-server.ts:21-23` has the exact `?? 'http://localhost:3000'` anti-pattern called out in `apps/CLAUDE.md` — that's the real defect to fix, not architecture choice.

3. **Permission boundary — OK.** API authoritative + admin renders affordances is the correct pattern (matches BFF norms). Duplicating the role _check_ is fine; duplicating the role _definition_ is the smell. **Recommendation:** ship a tiny `lib/permissions.ts` exporting a typed `can(principal, action)` that reads role from the session payload — RSC components import this, NOT a hand-rolled role string-compare. When MVP-2 ships agentic tools, the same module is reused by the tool registry guard. 403→empty-state belongs in a shared `<ForbiddenState>` component, not per-page boilerplate.

4. **Scaffold gap-closure scope — BLOCK.** Phase 02 MUST strictly scope to `/login` + dashboard + brand-switcher + env.ts + 403 empty state + NavUser de-placeholder. The `/signup` `/forgot-password` `/reset-password` pages already exist (`apps/admin/app/{signup,forgot-password,reset-password}/`) — Phase 02 should leave them rendering "Coming in Phase 03" placeholders if they currently call unwired backend, OR no-op if their actions just bounce. Touching invitation/email/secure-cookie work pulls in AUTH-01..09 which is explicitly Phase 03. **Risk if not scoped:** Phase 02 balloons into a 3-week phase against solo throughput.

5. **AI-readiness markers — FLAG (lean YAGNI with one cheap reservation).** The pivot note says MVP-2 ships agentic chat in admin. The cost of reserving `/dashboard/assistant` route + a sidebar slot is ~10 LOC; the cost of retrofit later is one migration sprint. **Recommendation:** add a `NavMainItem` with `scope: 'tenant'` and `featureFlag: 'assistant'` (flag off in MVP-1), no route stub. Do NOT design per-tenant RAG / LLM gateway tables now. The `correlationId`-from-OTel-span invariant (ADR-0020 I-4) is the only AI-prep that materially matters because agent tool calls will piggyback the same envelope.

6. **/sign-in vs /login — FLAG.** Rename the REQ, not the code. The scaffold's `/login /signup /forgot-password /reset-password` is industry-standard shadcn convention; `/sign-in` is BA-doc convention. **Recommendation:** update REQUIREMENTS.md ADM-01 to read `/login`. Rationale: zero test/link churn, no break to e2e fixtures, matches existing scaffolding choice already merged. Document the call in PERSONA-REVIEWS as a deliberate REQ correction, not drift.

### Additional concerns not in the brief

- **HIGH — `set-active-brand.ts:32-36` violates `apps/CLAUDE.md` cookie rule.** Missing `secure: process.env.NODE_ENV === 'production'`. Same bug in `create-brand.ts:68-72`. Both must be fixed in Phase 02 regardless of HMAC decision.
- **HIGH — `api-server.ts` has no `AbortSignal.timeout(...)`.** `apps/CLAUDE.md` calls this out as no-exceptions; dashboard layout does `Promise.all` of two `apiFetch` calls (`dashboard/layout.tsx:15-19`) — a single hung upstream takes down every operator render. 10s read timeout + one retry on idempotent GET 5xx is the rule.
- **MEDIUM — `login/actions.ts:26-34` fans out 3 sequential api calls on sign-in** (sign-in, org/list, org/set-active). N+1-ish; folding into a single `/v1/auth/sign-in` orchestration on the api side is a Phase 03 refactor but worth flagging now.
- **MEDIUM — brand-tab-sync via `localStorage` `storage` event** (`brand-tab-sync.tsx:17-26`) is fine but races on rapid switching: two tabs each writing within ~50ms can have one tab read the stale cookie before its own `router.refresh()` finishes. Acceptable for MVP-1; mention in CONCERNS.md.
- **LOW — `NavUser` placeholder fix** (`app-sidebar.tsx:84-88`, `nav-user.tsx:74-82`) needs operator principal piped in via RSC; today the `<NavUser>` is `'use client'` so a server-side fetched `principal` prop must thread through `<AppSidebar>`. Trivial but mention in plan-phase.

### Phase 02 entry/exit posture

**Entry posture: green to discuss.** Scaffold is closer to done than the REQ list suggests — the architectural shape is correct. Phase is 60% bug-fixes against `apps/CLAUDE.md` rules + 40% genuine new code (env.ts, 403 empty state, NavUser wire-up, signed cookie HMAC).

**Exit gate:** every cookie set from server actions includes `secure`, every server-side fetch has a timeout, `lib/env.ts` throws in non-dev, REQ-doc says `/login`, AI route reservation is one nav item behind a flag. No new identity work bleeds in.

**Effort estimate:** 3–4 solo days, not the 5–7 the REQ list reads as.

## Product Strategist Review

**Severity legend:** BLOCK = must resolve in discuss; FLAG = address in phase; OK = noted.

### Per-question recommendations

1. **Sign-in → first useful action TTV — BLOCK.** Dashboard `/dashboard/page.tsx` does not exist yet; landing on an empty scaffold post-login is the #1 churn moment for SMB operators ("I gave you my email, what now?"). With Catalog (Phase 4) and Orders (Phase 10) not yet wired, the _only_ useful Phase 02 action is **"Create your first brand."** **Recommendation:** ship a deliberate task-list dashboard ("Setup Checklist": 1. Brand created ✓ 2. Add menu — _coming Phase 4_ 3. Connect payments — _Phase 8_). This converts "empty product" into "visible roadmap." Toast and Square both use checklist patterns for the same reason. Without this, Phase 02 ships a hollow shell.

2. **Brand-switcher for single-brand tenants — FLAG.** Current `brand-switcher.tsx:40` already conditionally hides the "All brands" item when `brands.length < 2`, but the switcher _trigger_ itself always renders, showing a useless dropdown for 90% of independent restaurants. **Recommendation:** when `brands.length === 1 && !canViewAllBrands`, render a non-interactive brand label (still shows initials + name as identity anchor), NOT a dropdown. The "+ Add brand" affordance moves to Settings → Brands. Multi-brand chains (the 10%) get full switcher. This is positioning: independents see a "clean app," chains see a "chain-aware app." Both audiences win.

3. **Empty-state voice — FLAG.** Phase 02 IS the right place to lock 2 templates because every subsequent phase (catalog, orders, CRM) inherits voice. **Recommendation:** ship `<EmptyState>` + `<ForbiddenState>` components (CTO already flagged the latter) with copy style: "calm, operator-respectful, action-first, zero exclamation marks." Example: _"No brands yet. Create your first brand to start building your menu."_ — not _"Oops! Looks like you haven't created any brands yet! 🎉"_. Operators in restaurants are mid-shift; cheery copy reads as mockery. Document the two templates in `apps/admin/components/empty-state.tsx` JSDoc as the canonical voice — future phases pattern-match.

4. **AI teaser placeholder — FLAG (lean opposite of CTO).** CTO says reserve a nav slot behind a flag. From GTM lens, that's invisible to the operator and adds zero buy-in. **Recommendation:** ship a single dashboard card _"AI assistant coming Q2 2027 — sign up for early access"_ with a Resend mailing-list opt-in. This (a) validates the AI-driven positioning the pivot doc is anxious about, (b) builds an MVP-2 launch list pre-launch, (c) collects signal on which operators care about AI vs. who is here for the platform alone — pricing-tier evidence. Counter-CTO: a flagged nav item is internal hygiene; a dashboard card is product marketing. The "empty promise" risk is real but mitigated by collecting _intent_, not promising delivery dates beyond Q2 2027 which is already in pivot doc.

5. **/sign-in vs /login — OK with CTO.** Agree: rename the REQ. But for the _button label_ and page H1, use **"Sign in"** (two words, B2B-standard — Toast, Square, Lightspeed, Stripe all use it). URL path `/login` is dev convention and operator never sees it. This is the right split: URLs match the codebase, UI matches the industry. No conversion risk because operators arrive via invitation links or bookmark.

6. **Onboarding entry-point — BLOCK.** Phase 02 has a gaping how-do-I-get-in question. `/signup` scaffold exists but Phase 16 (Self-serve Onboarding) is the official entry. **Recommendation:** Phase 02 explicitly assumes **invitation-only** entry (Phase 03/AUTH-02 work) and the `/signup` page renders a _"Self-serve signup launches Q4 2026 — request access"_ state. This is honest, prevents premature self-serve, and feeds the same Resend list as the AI teaser. Without this declaration, Phase 02 leaks scope into Phase 16.

7. **Empty-state vs forbidden-state distinction — FLAG.** ADM-06 conflation is a real product trap. An operator who sees "No brands here" for a 403 will call support thinking the data was deleted. **Recommendation:** two separate components, two separate iconographies (lucide `Inbox` for empty, `Lock` for forbidden), two copy patterns. Forbidden also surfaces _who to ask_ ("Contact your tenant owner to request access") — empty surfaces _what to do_ ("Create your first brand"). CTO already called out the shared `<ForbiddenState>` need; product layer is the copy + iconography contract.

### Additional product concerns not in the brief

- **HIGH — "Playground / Models / Documentation" placeholder nav items (`app-sidebar.tsx:38-69`) are shadcn-template debris.** Shipping these to a real operator destroys first-impression credibility ("this is a developer demo, not a product"). MUST be removed or replaced with real items (Brands, Settings, Account) before Phase 02 exits. This is the single biggest "looks unfinished" risk.
- **HIGH — `nav-projects.tsx` "Design Engineering / Sales & Marketing / Travel"** is the same debris pattern. Either remove `<NavProjects>` from `<AppSidebar>` in Phase 02 or wire to real data. Leaving it is worse than deleting it.
- **MEDIUM — TTV measurement instrumentation.** Phase 02 is the first phase with an operator-touchable funnel. Add a single OTel span `operator.first_useful_action` fired on first non-auth route render post-signin. Without baseline, future TTV claims are unfalsifiable.
- **MEDIUM — Workspace breadcrumb (`tenant-breadcrumb.tsx`).** For multi-brand chains, breadcrumb is the orientation anchor. Confirm it renders Tenant > Brand > Section, not just Section. Single-brand tenants: hide the Tenant level (it's redundant).
- **LOW — Account/profile route absent.** ADM-07 fixes NavUser email/role but where does clicking it lead? `/dashboard/account` doesn't exist. Either ship a minimal account page (email + role display + sign-out) or have the NavUser dropdown collapse to just sign-out for Phase 02.

### Product positioning posture

**Time-to-first-useful-action target: <30 seconds from sign-in to "I created something."** Today that something is a brand. The setup checklist makes this visible; without it, operators stare at an empty dashboard and bounce.

**MVP-1 voice locked in Phase 02 = compounding asset.** Every subsequent phase inherits the empty-state template, the forbidden-state template, the dashboard checklist pattern. Skimping here means re-doing it in Phase 4 (catalog) and Phase 10 (orders).

**AI-driven positioning needs a Phase 02 hook.** A dashboard card teasing MVP-2 + collecting early-access emails is the cheapest possible mitigation of the pivot doc's "AI marketing without AI in MVP-1 disconnect" risk. Defer this to Phase 16 and the launch story has no AI surface to point at on day 1.

**Phase exit posture: green to plan-phase, conditional on:** (a) Setup Checklist dashboard, (b) shadcn debris removed from sidebar, (c) empty-state + forbidden-state components shipped with locked voice, (d) brand-switcher collapses cleanly for single-brand tenants, (e) /signup renders honest "request access" state.

---

## Skeptic Review

**Posture:** Phase 02 is at high risk of _re-implementing under stub assumptions_ and _theatre-grade hardening_ on a scaffold no one has verified end-to-end.

### BLOCK

- **`apiFetch` violates two `apps/CLAUDE.md` rules right now** (`apps/admin/lib/api-server.ts:121-127`): no `AbortSignal.timeout`, no idempotent-GET single retry, and **no 401 handling — a stale BA session returns `{ ok: false, status: 401 }` and silently renders an empty dashboard instead of redirecting to `/login`**. This is a Phase 02 in-scope defect (it _is_ "wiring what exists"), not Phase 03 territory. Fix here or every downstream phase inherits broken auth UX.
- **Scaffold-verification gate missing from ADM-01..08.** Add an explicit ADM-00: "smoke-walk every existing route signed-in as fresh operator with 0 brands, 1 brand, 3 brands; non-owner role; expired session." Without it, Phase 02 will silently re-stub working code or ship broken code as "wired."

### FLAG

- **Signed `resto.active_brand` cookie is mostly theatre.** Threat model: operator forges _their own_ cookie for _their own_ tenant's other brand — but they already authenticated. Real control is api-side `(userId, tenantId, brandSlug)` re-authorization on every request. HMAC adds defense-in-depth against a stolen-but-unsigned cookie replay and gives a clean audit story; do not sell it as the security boundary. **The api-side brand membership re-check is the actual control and must exist regardless.** Confirm `/v1/me/brands` filters by role before treating the cookie as anything more than a UX hint.
- **ADM-08 (env-var boot assertions) is misfiled.** This is prod-readiness work, identical in shape to Phase 03's "close prod-readiness gaps." Moving it cuts Phase 02 scope ~12% and lets the phase stay laser-focused on the 6 user-facing items. Solo throughput rule: smaller phases ship.
- **`/signup` `/forgot-password` `/reset-password` debris.** CTO blocked backend changes — agreed. But the routes _exist and route_. Three options ranked: (1) **Replace page bodies with honest "Invite-only during early access — contact sales@resto.app" copy** (cheapest, no flag infra, ships clean), (2) feature-flag behind `FEATURE_SELF_SIGNUP=false` (over-built for Phase 02), (3) delete the route folders entirely (loses Phase 03 work). Pick (1). Shipping a real signup link that 500s or hits unwired Better Auth flows to the first paying customer is a credibility-killer.
- **AI-readiness placeholder in MVP-1 is a trap.** By Q2 2027 the actual AI UX won't match a dashboard card written in May 2026 — it will be torn out. Mitigation: make the placeholder an **email-capture card** ("Get early access to AI hosting"), not a "Coming soon" dead end. Email captures survive a UX rewrite; "Coming soon" cards expire on contact with reality.

### OK (skeptic-cleared, with conditions)

- 4-component scope (sidebar, brand-switcher, nav-user, breadcrumb) is the right wiring surface IF ADM-00 verification gate is added.

### Hidden assumptions Phase 02 must NOT take on faith

1. `/login/actions.ts` correctly handles BA 2FA TOTP challenge state (not just email+password happy path).
2. `apiFetch` retries idempotent GET 5xx — **it does not** (`api-server.ts:121`), so any flake in `/v1/me/brands` during boot crashes the dashboard.
3. `brand-tab-sync` handles 3+ concurrent tabs without thrash (BroadcastChannel storm on rapid switches).
4. `/v1/me/brands` returns correct `canViewAllBrands` for non-owner roles — untested with seeded non-owner.
5. `getActiveTenantId` (`api-server.ts:157`) memoizes via `cache()` per render — but a server action that mutates BA active org _within the same render_ will read a stale tenant id. Verify or document.
6. Dashboard layout does not crash on the 0-brand tenant (fresh signup) — empty-state path is the most-likely-broken path in scaffolds.

### Concrete cuts to defer

- **DEFER ADM-08 to Phase 03.** Wrong phase, wrong scope.
- **DEFER signed-cookie HMAC to Phase 03** if the api-side brand re-check is already in place; ship a plain cookie in Phase 02. (If api-side check is _not_ in place, that's a much bigger BLOCK than cookie signing.)

### Phase exit posture

**Conditional green**, contingent on: (a) ADM-00 scaffold verification gate added, (b) `apiFetch` 401-redirect + timeout + single-retry fixed in Phase 02 (not deferred), (c) signup/forgot/reset replaced with honest "invite-only" copy, (d) signed-cookie scope clarified as defense-in-depth (not the boundary), (e) ADM-08 moved to Phase 03, (f) AI placeholder is an email-capture or is cut.
