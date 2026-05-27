---
title: MVP-2 — AI agent platform + 3 AI surfaces
trigger_condition: MVP-1 closed; first paying customer onboarded; standalone platform stable in prod
planted_date: 2026-05-27
status: seed
---

# MVP-2: AI agent platform + 3 surfaces

Forward-looking scope block for the AI tier of RestOS. Activated after MVP-1
closes (first paying restaurant on the platform). High-level decomposition only —
real planning happens at `/gsd-new-milestone` time.

See full positioning context in `[[ai-driven-pivot]]`.

## Trigger conditions (when to wake this seed)

- [ ] MVP-1 first-paying-customer gate passed
- [ ] Payments live and stable >30 days
- [ ] Customer profile schema in place (or scheduled as the very first MVP-2 phase)
- [ ] No P0 incidents on standalone platform for 2 weeks
- [ ] Decision made on which LLM provider(s) — likely Anthropic primary

## Decomposition (rough — to be planned at activation)

### MVP-2 Phase A: AI agent platform foundation

Pre-requisite for all three surfaces. Pure infra, no user-visible AI yet.

- **LLM gateway** — provider abstraction (Anthropic primary, OpenAI fallback?),
  per-tenant cost caps, rate limits, prompt caching, observability via OTel
- **Per-tenant knowledge base** — RAG-ready vector store (pgvector? Pinecone?
  decision needed). Indexes: menu items, brand voice, FAQ, operator-curated docs.
  Scoped under tenant_id, respects ScopedTx + RLS double-enforcement.
- **Per-customer profile** — already partially exists in CRM (Phase 12 in old
  ROADMAP); extend with: dietary preferences, conversation embeddings, last
  interaction timestamp, opt-out flag (GDPR)
- **Conversation/thread storage** — new bounded context `conversations`? Or
  inside each surface? Owns: thread, message, tool-call record, eval trace
- **Tool registry** — agentic tools that wrap existing domain services. Tools
  inherit tenant context, principal, RBAC checks from caller. No raw DB writes.
- **Eval harness** — golden conversations, regression detection on prompt
  changes, per-tenant safety filters
- **NATS event subscriptions** — AI keeps knowledge base fresh by subscribing to
  menu/order/promo events. Inbox-based, deduped via `runDeduped`.

### MVP-2 Phase B: AI assistant in admin

Depends on Phase A.

- Chat widget in `apps/admin` sidebar
- Tools (subset of admin actions): read analytics, suggest promo, edit menu item
  (with diff preview + confirm), generate weekly report PDF, draft email
- Operator approves before destructive tool calls (no auto-edit at MVP-2)
- Per-tenant context: pulls from knowledge base + recent events
- Per-operator preferences (style, verbosity, language)
- Cost tracking visible to operator (or hidden behind owner role?)

### MVP-2 Phase C: AI guest chat

Depends on Phase A.

- Widget on `apps/website` (and on `apps/qr-menu` post-launch)
- Tools: search menu, recommend item, add to cart, lookup order, reorder last,
  apply known preference filter
- Per-tenant brand voice (configured in admin in Phase B)
- Per-customer profile + thread persistence (anonymous customers get a
  cookie-bound thread; authenticated customers get a real profile binding)
- Hand-off to human (operator chat or email) when AI can't resolve
- GDPR: customer can erase conversation history; export on request

### MVP-2 Phase D: AI onboarding constructor

Depends on Phase A + B + C all live (uses every primitive).

- New tenant signup → AI walks operator through:
  - "Tell me about your restaurant" — captures brand, cuisine, vibe
  - "Upload your menu" — OCR + LLM extraction from PDF/photos → catalog draft
  - "Pick a vibe" — generates 2–3 theme drafts, operator picks one
  - "Where are you" — address validation, sets timezone, currency, market defaults
  - "Sample dish photos" — uploads, generates copy
- Output: published draft site + populated catalog + brand applied
- Operator clicks "publish" — domain provisioned, payments setup deferred to
  one-click Stripe Connect onboarding (already built in MVP-1)
- Target: <30 min from signup to publishable site
- This replaces (or supersedes) the non-AI self-serve onboarding from MVP-1

## Open architectural questions (decide before activation)

- Vector store: pgvector (keeps stack tight, RLS-friendly) vs managed (Pinecone,
  Turbopuffer — cost-effective at scale but extra dependency)
- LLM provider lock-in: Anthropic primary fits user's existing context, but need
  fallback for cost/latency spikes
- Embedding model and re-embedding strategy on menu changes
- Conversation context window strategy (summarization, truncation, retrieval)
- Tool-call safety: human-in-the-loop boundaries (which actions need explicit
  operator approval vs auto-execute)
- Cost model: how to charge customers — flat fee, per-message, per-tenant cap?
- Multi-language: do we ship en+ru together or stage?

## Persona reviews to request at planning time

- persona-cto (architecture, vendor lock-in, ops cost)
- persona-skeptic (will operators actually use this? Or is it a feature in search
  of a need?)
- persona-product-strategist (positioning, GTM)
- persona-investor (unit economics with LLM costs in COGS)

## Related

- Positioning: `[[ai-driven-pivot]]`
- Predecessor scope: MVP-1 standalone platform (current ROADMAP, rearranged)
- Successor scope: `[[mvp3-channels-iiko]]`
