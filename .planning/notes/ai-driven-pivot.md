---
title: AI-driven pivot — strategic context and decisions
date: 2026-05-27
context: exploration
status: decided
---

# AI-driven pivot — RestOS

Captured from `/gsd-explore` session on 2026-05-27. Strategic redirection of RestOS
positioning and rollout. Authoritative input for the upcoming `/gsd-new-milestone`
restructure of PROJECT.md + ROADMAP.md.

## Positioning shift

**Before:** "Multi-tenant restaurant SaaS — turnkey digital presence; optional POS
adapters." Stack-first, feature-led.

**After:** "**AI-driven** multi-tenant restaurant SaaS — AI is the differentiator,
present in every operator and guest interaction. Digital presence and ordering
remain the bedrock; AI is the layer on top, not a side feature."

## Competitive frame

- **iiko / r_keeper / Poster** — NOT competitors. They own back-of-house (POS,
  kitchen, fiscal). RestOS owns the customer-facing layer (site, ordering, guest
  chat, CRM, loyalty) + AI everywhere.
- **iiko integration = GTM channel**, not technical dependency. Partnership with
  iiko opens a sales channel to their existing customer base.
- **Tilda / no-code site builders** — NOT competitors. They build static sites;
  RestOS builds AI-assisted operational restaurants.
- **Standalone-capable is non-negotiable.** A restaurant that arrives without
  iiko (or any POS) must get full value from RestOS alone. iiko adapter is
  additive, never required (carries forward from existing CLAUDE.md constraint).

## The three AI surfaces

All three are part of the AI-driven identity. None is "the wedge" alone — together
they justify the positioning.

### 1. AI assistant in admin (operator-facing)

- Chat panel inside `apps/admin`
- Agentic: makes tool calls, not just text replies
- Capabilities: suggests promos from analytics, edits menu items, generates and
  sends reports to owner, helps compose menu copy, drafts emails
- Per-tenant context: knows the brand voice, menu, recent orders, operator's
  preferences

### 2. AI chat with guest (customer-facing)

- Widget on `apps/website` (and later `apps/qr-menu`)
- Capabilities: answers product questions, recommends items, upsells in cart based
  on order content, repeats previous order, addresses guest by name
- Per-tenant context: brand voice, menu, FAQ
- Per-customer profile: order history, dietary preferences, name, last visit
- Voice must match tenant brand, not generic "AI assistant" tone

### 3. AI onboarding constructor (operator-facing, one-shot)

- Wow-moment: restaurant signs up, AI walks them through 15–30 min flow that
  produces a working site + imported menu + domain + branding
- Inputs: photos of menu, brand info, sample dishes, address
- Outputs: published site, populated catalog, configured brand, optional theme
- This is the GTM "demo magnet" — visible AI value within first interaction

## Cross-cutting infra (per-tenant AI context + per-customer memory)

These are foundational to all three surfaces and must NOT be designed away during
MVP-1 even though MVP-1 ships without AI:

- **Per-tenant knowledge base** — RAG-ready store of menu, brand voice, FAQ,
  operator preferences. Scoped under tenant_id, respects ScopedTx + RLS.
- **Per-customer profile** — preferences, order history, name, contact, last
  visit. Lives in `crm` context (currently Phase 12 in old ROADMAP).
- **Conversation/thread storage** — both admin and guest chats persist threads;
  required for memory + audit + multi-turn.
- **LLM gateway** — provider abstraction (Anthropic primary), per-tenant cost
  caps, rate limits, observability, prompt cache control.
- **Tool registry** — agentic tool calls (edit menu, run report, add promo) MUST
  go through the same domain services as HTTP, with same tenancy + RBAC checks.
- **Event subscriptions** — AI subscribes to NATS subjects (orders, menu changes)
  to keep per-tenant context fresh without polling.

## Rollout strategy: platform first, AI later

Decided by user. Pragmatic over aspirational.

| Milestone | Scope                                                                                                                                                                                                                                         | Gate criterion                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP-1** | Standalone non-AI platform: admin shell, auth, catalog, customer site (web shopfront), QR-menu (after site), ordering, payments, delivery zones, admin order intake, basic CRM, basic analytics, content/SEO, self-serve onboarding (non-AI). | "First paying customer" — restaurant signs up, publishes site, takes paid orders. Target: **Q1 2027**.                                                    |
| **MVP-2** | AI agent platform + 3 AI surfaces. LLM gateway, per-tenant RAG, per-customer memory, tool registry. Admin assistant + guest chat + AI onboarding constructor.                                                                                 | Restaurant uses AI assistant in admin daily. Guest chat handles >X% of customer interactions. Onboarding completes in <30 min via AI. Target: Q2–Q3 2027. |
| **MVP-3** | Telegram bot as 4th delivery channel. iiko adapter as GTM channel into iiko customer base. Other POS adapters as needed.                                                                                                                      | Active iiko partnership pipeline. Telegram order volume measurable. Target: Q4 2027+.                                                                     |

**Q1 2027 first-paying-customer gate is preserved** under this rollout — MVP-1 is
ship-able without AI, taking standalone restaurants who want digital presence +
ordering. AI is the "version 2" marketing story.

**Risk acknowledged:** "AI-driven" marketing without AI in MVP-1 is a positioning
disconnect. Mitigation: position MVP-1 as "the platform; AI assistant coming Q2
2027" — early customers are bought in to roadmap, not just current state. Re-test
this assumption at MVP-1 close.

## MVP-1 phase reorder (vs old ROADMAP)

Old order (excerpt): Phase 5 QR-menu → Phase 6 Customer Site → Phase 7 Ordering.

**New order:** Customer Site BEFORE QR-menu. Site is the primary customer surface
in the AI-driven positioning (also the surface where the AI guest chat lives in
MVP-2). QR-menu remains in MVP-1 but after the site is live and proven.

## Things explicitly OUT of scope for now

- Staff app (front-of-house tablet for waiters/kitchen)
- Multi-language LLM tuning beyond ru/en
- Voice-mode AI (text-only at MVP-2)
- AI for kitchen/inventory optimization (back-of-house — that's iiko's domain)

## Open questions to resolve in `/gsd-new-milestone`

- Exact phase boundaries inside MVP-1 (how to slice the 8–12 phases that fall
  under it given new ordering)
- Which existing REQ-IDs in REQUIREMENTS.md survive vs need rework under AI
  positioning
- Whether MVP-1 should include "AI hooks" (event taps, customer profile fields)
  even if no AI surface ships — to avoid retrofitting later
- Whether Phase 16 "Self-serve Onboarding" (currently last) should be split into:
  non-AI onboarding (end of MVP-1) and AI constructor (MVP-2)

## Links

- Source conversation: `/gsd-explore` session 2026-05-27
- Related seeds: `[[mvp2-ai-platform]]`, `[[mvp3-channels-iiko]]`
- Next action: `[[restructure-roadmap-ai-driven]]`
