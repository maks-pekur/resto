---
phase: 02
phase_name: Admin Shell
gathered: 2026-05-27
status: Ready for planning
---

# Phase 2: Admin Shell — Context

<domain>
## Phase Boundary

Close the user-visible gaps in `apps/admin` so that an authenticated tenant operator can sign in, land on a working dashboard, see their real brands and identity, and switch active brand — all over the existing Better Auth setup and existing `apps/api` endpoints. Plus close the two `apps/CLAUDE.md` rule violations already present in the scaffold and add the boot-time env guardrail the rest of MVP-1 will rely on.

**In scope:** ADM-01..08 (8 requirements), `/login` flow polish, `/dashboard` working layout, brand selection + switching with signed cookie, NavUser with real operator identity, 401 → `/login` redirect, 403 → empty-state component, `lib/env.ts` module, scaffold cleanup of shadcn template debris in sidebar, AI placeholder card on dashboard.

**Out of scope (Phase 03 territory — touch the routes only for honest "not yet wired" copy):** `/signup`, `/forgot-password`, `/reset-password` server actions, invitation flow, password reset email, email verification enforcement, RBAC seed migration, secure-cookie audit across all server actions (only the two flagged by CTO are fixed in Phase 02).

**Out of scope (future):** AI agent platform itself (MVP-2), Telegram channel (MVP-3), real iiko sync.

</domain>

<decisions>
## Implementation Decisions

### URL / routing

- **D-01:** Keep `/login` as the operator sign-in URL across `apps/admin`. Do NOT rename to `/sign-in`. The scaffold uses `/login` in ~12 places (proxy.ts redirect, dashboard layout, /forgot-password and /reset-password backlinks, login.spec.tsx test, reset-password action redirect). Renaming is pure churn for zero functional value. **Action:** update REQ ADM-01 wording in `REQUIREMENTS.md` from `/sign-in` to `/login`. UI button labels read **"Sign in"** (two words, B2B-SaaS standard) where appropriate.
- **D-02:** No new routes added in Phase 02 beyond what scaffold already declares. `/signup`, `/forgot-password`, `/reset-password` are NOT removed from the build — they exist but render an honest "Phase 03 work — not yet wired" state with a `<EmptyState>` (variant: forbidden) and a back-link to `/login`. Their existing `actions.ts` server actions are NOT touched in Phase 02 — they stay in `actions.ts` for Phase 03 to pick up.

### Cookie security model

- **D-03:** `resto.active_brand` cookie is **HMAC-signed** with a **dedicated** secret env var `ACTIVE_BRAND_COOKIE_SECRET`. Do NOT reuse `BETTER_AUTH_SECRET` — separating secrets prevents key-rotation coupling and bounds blast radius if one leaks. Cookie attributes: `secure: process.env.NODE_ENV === 'production'`, `httpOnly: true`, `sameSite: 'lax'`, no explicit `Domain` (defaults to host, which is correct for our subdomain admin model). Skeptic note: HMAC alone is defense-in-depth — the **authoritative** tenant/brand re-check happens api-side via `PermissionsGuard`. The cookie is a UX hint, never the security boundary.
- **D-04:** Fix the two `apps/CLAUDE.md` rule violations already present in scaffold: add `secure: process.env.NODE_ENV === 'production'` to cookies set in `apps/admin/lib/actions/set-active-brand.ts:32-36` and `apps/admin/lib/actions/create-brand.ts:68-72`. These cookies are leaking over passive HTTP without it.

### Env-var validation

- **D-05:** Introduce `apps/admin/lib/env.ts` — a thin module that parses `NEXT_PUBLIC_API_ORIGIN`, `ADMIN_WEB_URL`, `INTERNAL_API_TOKEN`, and `ACTIVE_BRAND_COOKIE_SECRET` via Zod, throws at module-load time in non-dev if any are missing, returns typed values for callers. No `?? 'http://localhost:3001'` fallbacks anywhere — every caller imports from `env.ts`. Called from `instrumentation.ts` (Next.js boot hook) so failures crash startup, not first request. Test env loads from `.env.test`.
- **D-06:** ADM-08 stays in Phase 02 (skeptic suggested moving to Phase 03 for scope economy, but `env.ts` is foundational — every other Phase 02 deliverable touches env vars, so it belongs upstream).

### Empty-state / forbidden-state UX

- **D-07:** Single shared `<EmptyState>` component with **two distinct variants**:
  - `variant="empty"` — genuinely no data (e.g., "Your tenant has 0 brands. Create your first brand to continue.") — friendly icon, primary CTA.
  - `variant="forbidden"` — permission denied (e.g., "This area requires the owner role. Ask your tenant owner to grant access.") — lock icon, no CTA except a back-link or "contact owner" hint.
- **D-08:** Empty-state copy style locked for **all of MVP-1**: calm, operator-respectful, no exclamation marks (operators are mid-shift). 1-2 sentences max. Include the next concrete action when one exists. Example bad: "Oh no! You don't have any brands yet!" Example good: "Your tenant has no brands. Create one to start publishing your menu."

### apiFetch reliability hardening

- **D-09:** Add `AbortSignal.timeout(10_000)` to all server-side GET fetches in `apps/admin/lib/api-server.ts`; `30_000` for server-action POST fetches. Comply with `apps/CLAUDE.md` rule. Reads currently fan out via `Promise.all` in `app/dashboard/layout.tsx` — a single hung upstream = full operator outage. Timeout makes that bounded.
- **D-10:** Add **401 → redirect-to-`/login`** handling inside `apiFetch`. Currently a stale session silently renders an empty dashboard because `apiFetch` returns `{ ok: false }` and components don't know what to do. New behavior: on HTTP 401, `apiFetch` calls `redirect('/login?expired=1')` directly. Login page reads `?expired=1` and shows a small notice "Your session expired, please sign in again." Skeptic BLOCK.
- **D-11:** Add one retry (exactly one) on idempotent GET 5xx with ~500ms backoff. Mutations never retried. Per `apps/CLAUDE.md`.

### Dashboard "first useful action" — Setup Checklist

- **D-12:** Dashboard landing page renders a **Setup Checklist card** showing MVP-1 phase roadmap with current progress. Items in the order they unlock for the operator:
  1. ✓ Account created
  2. ✓ Brand set up (auto-checked once a brand exists in the tenant)
  3. ◯ Catalog — coming in Phase 4
  4. ◯ Customer site — coming in Phase 5
  5. ◯ Accepting orders — coming in Phase 7
  6. ◯ Payments (Stripe Connect) — coming in Phase 8
- **D-13:** The Setup Checklist is the **only** non-trivial content on the dashboard until Phase 4 lands. Acknowledged limitation: operators who arrive between Phase 02 and Phase 04 see roadmap, not orders. Mitigation: copy frames it honestly — "RestOS is being built for you. Here's what's coming next."

### Brand switcher behavior

- **D-14:** Brand switcher in sidebar auto-collapses to a static label (not a dropdown) when the tenant has exactly **1 brand**. Operators of single-brand tenants — likely 90% of MVP-1 customers — never see a dead-UI dropdown. Reappears as a dropdown when count ≥ 2. Brand creation (ADM-04) still works regardless: `<Plus />` icon next to the label in either mode.

### Sidebar cleanup

- **D-15:** Strip shadcn dashboard-07 template debris from `apps/admin/components/app-sidebar.tsx`: remove `Playground`, `Models`, `Documentation`, `Settings` (sub-nav debris), `Design Engineering`, `Sales & Marketing`, `Travel`, and any other template nav items. Final sidebar contents: **Dashboard**, **Brands**, **Settings**. Anything else is added by future phases when its feature ships.

### NavUser

- **D-16:** `nav-user.tsx` reads real operator identity from `/v1/principal` (or whatever `apiFetch` already exposes — confirm during scaffold smoke walk). Email is **always** the authenticated email, never `operator@example.com`. Role label is the operator's actual base role for the tenant (`owner` / `admin` / `staff`). Avatar = first-letter initial circle (no Gravatar / no upload in Phase 02).

### AI-readiness placeholder

- **D-17:** Dashboard renders a **second card** (below Setup Checklist) — the **AI assistant preview card**. User decision 2026-05-27.
  - **Copy:** "AI-помощник скоро будет" + 1-sentence description of what it will do (suggest promos, edit menu, generate reports, chat with guests on your behalf) + "Launching Q2 2027".
  - **Action:** small inline email input + "Notify me" button. Submits to `POST /v1/marketing/notify-list` (new endpoint — confirm with Phase 02 plan; if endpoint doesn't exist, ship a stub that logs the email + returns 202 and add backlog todo).
  - **Why:** mitigate the "AI-driven marketing without AI in MVP-1" disconnect surfaced in the pivot notes. Collect pre-launch list as GTM ammunition. Honest about timing.
  - **Persona dissent:** Skeptic flagged risk that placeholder gets torn out by MVP-2 — accepted; tearing it out at MVP-2 is fine because by then the real AI panel replaces it. Email capture is the load-bearing piece, not the card itself.

### Verification gate — ADM-00

- **D-18:** Add a **scaffold smoke-walk** as ADM-00 (new requirement; append to REQUIREMENTS.md ADM section). Before any new code is written, the planner runs Playwright/e2e through these 6 scenarios on the existing scaffold to verify what works vs. what's stubbed:
  1. Login with valid creds → land on `/dashboard` rendering the operator's brand list
  2. Tenant with 0 brands → dashboard does not crash; shows EmptyState (empty variant) prompting brand creation
  3. Tenant with 3+ brands → brand switcher renders as dropdown; switching persists across navigation
  4. Non-owner role → `/v1/me/brands` filters by role correctly (currently unverified)
  5. Expired session → first authenticated nav redirects to `/login?expired=1` (new behavior — will fail until D-10 ships, that's the point)
  6. 3+ open tabs → `brand-tab-sync` keeps active brand consistent without race
- **D-19:** ADM-00 results inform plan-phase: scenarios that pass = "don't rebuild, only test". Scenarios that fail = "build/fix this in Phase 02". Locks the gap-closure scope precisely.

### Plan structuring

- **D-20:** Phase 02 likely ships across **2–3 PRs**, not one monolithic. Suggested grouping (planner refines):
  - PR 1: Foundation — `lib/env.ts` + cookie `secure:` fix + AbortSignal.timeout + 401 redirect + ADM-00 smoke walk infrastructure
  - PR 2: User-facing — EmptyState component (both variants) + Sidebar cleanup + Setup Checklist + AI preview card + brand-switcher single-brand collapse + NavUser real-data wiring
  - PR 3 (optional): Honest "Phase 03 — not yet wired" empty states on /signup, /forgot-password, /reset-password
- **D-21:** Estimated **3–4 solo working days** (CTO reframing — was 5–7 in raw-REQ reading; scaffold is more done than ROADMAP suggests).

### Claude's Discretion

The following implementation details are mine to decide during planning/execution; user does not need to weigh in:

- Concrete HMAC algorithm (HS256 vs HS512), cookie size budget, secret rotation procedure
- `<EmptyState>` component file location, prop API, Tailwind classes
- Exact email-input UX on AI card (inline vs modal, optimistic confirmation)
- Setup Checklist progress detection logic (read from STATE.md? Hard-coded list? Query phase status from api?)
- Sidebar item ordering, icon choices, hover/active states
- Test framework details for ADM-00 (Playwright config, fixture seeding, CI integration)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project + milestone context

- `.planning/PROJECT.md` — AI-driven positioning, MVP-1/2/3 structure, Phase 02 listed under Active section
- `.planning/notes/ai-driven-pivot.md` — authoritative pivot context; explains WHY the AI preview card exists in MVP-1
- `.planning/ROADMAP.md` Phase 2 section — phase goal, success criteria, dependencies
- `.planning/REQUIREMENTS.md` §"Admin Shell (`ADM`)" lines 33-44 — ADM-01..08 + ADM-00 (to be added after this discuss)

### Apps-level rules (MUST follow)

- `apps/CLAUDE.md` — server fetch timeout requirement, one-retry rule, open-redirect refinement, cookie `secure:` requirement, INTERNAL_API_TOKEN server-only rule, env-var no-fallback rule, no static identity placeholders rule. **The two known violations in current scaffold are CALLED OUT and fixed in Phase 02 — see D-04 + D-09.**

### Prior phase decisions (carry-forward)

- `.planning/phases/01-tenancy-hardening/01-CONTEXT.md` — patterns: monolithic-phase-with-PR-grouping (D-04), wave-based dependency execution
- `.planning/phases/02-admin-shell/02-PERSONA-REVIEWS.md` — CTO + Product Strategist + Skeptic findings for Phase 02. Decisions D-01 through D-21 directly reference findings here.

### Existing scaffold (verify state via ADM-00 before extending)

- `apps/admin/app/dashboard/layout.tsx` — current dashboard layout with `apiFetch('/v1/tenants/me')` + `getMyBrands()` fan-out
- `apps/admin/app/login/actions.ts` — current sign-in server action (3-call fan-out; do NOT refactor in Phase 02, Phase 03 candidate)
- `apps/admin/lib/api-server.ts` — `apiFetch` helper to extend with timeout + 401 redirect + retry
- `apps/admin/lib/actions/set-active-brand.ts` — cookie write to harden (D-03, D-04)
- `apps/admin/lib/actions/create-brand.ts` — cookie write to harden (D-04)
- `apps/admin/components/app-sidebar.tsx` — sidebar to clean up (D-15)
- `apps/admin/components/brand-switcher.tsx` — auto-collapse logic for 1-brand tenants (D-14)
- `apps/admin/components/brand-tab-sync.tsx` — multi-tab race verification (ADM-00 scenario 6)
- `apps/admin/components/nav-user.tsx` — real-data wiring (D-16)

### Codebase maps (Phase 02 reusable patterns)

- `.planning/codebase/ARCHITECTURE.md` §"DDD + Hexagonal layout per context" — admin does NOT add a new bounded context; it consumes existing `tenancy` + `identity` endpoints
- `.planning/codebase/STACK.md` — Next.js 16.2.6, React 19, Tailwind 4, shadcn/ui (new-york / neutral)
- `.planning/codebase/CONVENTIONS.md` — file naming (`*.tsx` pages, `*-form-client.tsx` for client form fragments), `apiFetch` server-only pattern

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable assets

- `apps/admin/lib/api-server.ts:apiFetch` — central HTTP wrapper. Phase 02 extends with timeout + retry + 401 redirect. Don't add a parallel client.
- `apps/admin/lib/me-brands.ts:getMyBrands` — already wraps `/v1/me/brands`; reuse as-is unless ADM-00 reveals it returns wrong shape for non-owner roles.
- `components/ui/sidebar.tsx` — shadcn sidebar primitive. Use SidebarProvider / SidebarInset / SidebarMenu. Don't roll a custom sidebar.
- `components/theme-provider.tsx` + `components/theme-toggle.tsx` — light/dark already wired. Phase 02 doesn't touch theme; brand-color theming is Phase 15.

### Established patterns

- **Server components for data; client components for interaction.** The scaffold splits with `*-form-client.tsx` for any form needing `'use client'`. Phase 02 mirrors this.
- **`apiFetch` is server-only.** Importing it into a client component leaks `INTERNAL_API_TOKEN`. The build will succeed silently. NEVER let this happen in Phase 02 work.
- **Cookies set via `next/headers` `cookies()`** in server actions. Read via `cookies().get(name)?.value` in server components / layouts.

### Integration points

- `apps/api` already exposes `/v1/tenants/me`, `/v1/me/brands`, `/v1/principal` (verify last one in ADM-00), `POST /v1/tenancy/brands`. Phase 02 does NOT add new api endpoints except possibly `POST /v1/marketing/notify-list` for the AI card email capture — and that one may be deferred to a stub if not trivial.
- Auth: Better Auth runs in-process inside `apps/api`. `apps/admin` proxies auth requests via `proxy.ts` to `apps/api/api/auth/*`. Phase 02 does NOT modify proxy.ts.
- The `proxy.ts` middleware already redirects unauthenticated requests to `/login` — D-10 extends this to also catch 401 responses inside live RSC renders.

</code_context>

<specifics>
## Specific Ideas

- **AI preview card copy** (user-decided, 2026-05-27): "AI-помощник скоро будет" header + 1-sentence value description + "Launching Q2 2027" + inline email capture with "Notify me" button. Card lives below the Setup Checklist on `/dashboard`.
- **Empty-state copy voice**: calm, operator-respectful, no exclamation marks. Reference example (from D-08): "Your tenant has no brands. Create one to start publishing your menu." This style is locked for all of MVP-1 — future phases inherit it.
- **Sidebar contents (final)**: Dashboard, Brands, Settings — nothing else until features ship.

</specifics>

<deferred>
## Deferred Ideas

### Deferred to Phase 03 (Auth Completion)

- `/signup` real implementation (invitation flow, email send, account creation)
- `/forgot-password` + `/reset-password` real implementation (Resend SMTP, single-use link, email verification enforcement)
- 2FA TOTP enablement UI in account settings (AUTH-07)
- All cookies set by server actions (not just the two flagged in D-04) audited for `secure:` flag — full sweep is Phase 03 work
- Refactor of `apps/admin/app/login/actions.ts` 3-call sign-in fan-out (CTO suggested) — postponed to Phase 03 since Phase 03 already touches auth
- Better Auth context-stash for sign-out audit cleanup (AUTH-11)

### Deferred to MVP-2 (AI tier)

- The actual AI agent chat panel in admin sidebar — replaces the placeholder card from D-17
- LLM gateway, per-tenant RAG, per-customer memory, tool registry
- See `.planning/seeds/mvp2-ai-platform.md`

### Backlog / unspecified

- `POST /v1/marketing/notify-list` endpoint — if not trivial to add for the AI card email capture, ship a stub that logs the email + returns 202; add backlog todo to wire real subscription handling. Real handling is post-MVP-1.
- Brand theming (logo, accent color) — Phase 15 (CONT-01)
- Operator avatar upload — post-MVP

### Not folded from todo review

- The only matched todo was `restructure-roadmap-ai-driven.md` (already completed via direct PROJECT/ROADMAP edits — false positive on phase 2 keyword match).

</deferred>

---

_Phase: 02-admin-shell_
_Context gathered: 2026-05-27_
