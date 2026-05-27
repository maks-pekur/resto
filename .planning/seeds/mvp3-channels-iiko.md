---
title: MVP-3 — Telegram channel + iiko adapter
trigger_condition: MVP-2 closed; AI platform stable in prod; positioning validated with paying tenants
planted_date: 2026-05-27
status: seed
---

# MVP-3: Telegram channel + iiko adapter (and other POS)

Forward-looking expansion of RestOS distribution and integration surface.
Activated after MVP-2 (AI tier) is stable in production.

See full positioning context in `[[ai-driven-pivot]]`.

## Trigger conditions (when to wake this seed)

- [ ] MVP-2 (AI surfaces) closed and stable >30 days
- [ ] At least 5–10 paying tenants on full RestOS (signal that positioning works
      and channel expansion is justified)
- [ ] Conversations with iiko partnership team initiated (B2B sales takes time)
- [ ] Telegram bot platform decision (aiogram? grammY? Bot API directly?)

## Decomposition (rough — to be planned at activation)

### MVP-3 Phase A: Telegram bot as 4th delivery channel

Reuses everything from MVP-1 (ordering) + MVP-2 (AI guest chat).

- Per-tenant Telegram bot — restaurant owns its bot, RestOS hosts the runtime
- Catalog browsing in Telegram (inline keyboard, mini-app, or web app embedded)
- Cart + checkout flow (likely Telegram Payments or fallback to web checkout)
- AI guest chat reused — same agent, same per-customer memory, just different
  transport. User's identity links across web + Telegram via phone or login code.
- Push notifications for order status (Telegram excels here)
- Bot setup wizard in admin (operator pastes Telegram bot token, RestOS does
  the rest)

### MVP-3 Phase B: iiko adapter (B2B GTM channel)

The adapter is a sales tool more than a technical feature — it unlocks a sales
channel to iiko's existing customer base who already pay for POS but lack the
RestOS-style digital + AI layer.

- Catalog sync (iiko → RestOS): pull menu items, modifiers, stop-list, prices.
  Conflict resolution: iiko is source of truth for ops-side fields, RestOS owns
  AI-generated copy + photos.
- Order sync (RestOS → iiko): push new orders into iiko fiscal/kitchen flow.
- Customer sync (RestOS → iiko): optional, depending on iiko CRM capabilities.
- Webhook + polling reliability (iiko APIs have known limitations — research
  before committing)
- Auth model: per-tenant iiko API credentials, securely stored
- Marketing positioning: "Already on iiko? Add RestOS in 10 min and get AI guest
  chat + digital storefront on top."

### MVP-3 Phase C (optional): r_keeper / Poster / other POS adapters

Pattern repeats from iiko — each adapter is a sales channel into a specific POS
customer base. Only build if iiko adapter validates the partnership GTM motion.

## Strategic notes

- **iiko adapter is a sales tool**, not a feature for existing RestOS customers.
  Standalone restaurants (who arrived without a POS) gain nothing from this work.
  Justify ROI by partnership pipeline, not feature parity.
- **Telegram channel is a feature for existing customers.** It expands order
  volume from the existing tenant base, especially in markets where Telegram is
  the dominant chat platform (RU, UA, post-Soviet, parts of EU/SEA).
- **Order: Telegram likely first** (lower partnership-coordination cost) unless
  iiko partnership conversation moves fast.

## Open questions

- Telegram regulatory: which markets, what's the Telegram Payments availability,
  how does AI guest chat behave in Telegram's content moderation context
- iiko API stability — how often does iiko break us? Need ops budget for adapter
  maintenance
- Multi-POS abstraction: build one adapter, then generalize, or build the
  abstraction up-front? Bias toward concrete-first (build iiko, learn, then
  generalize when 2nd POS arrives)

## Persona reviews to request at planning time

- persona-cto (adapter maintenance burden, multi-vendor abstraction risk)
- persona-investor (does the iiko channel actually move pipeline, or is it a
  vanity integration?)
- persona-product-strategist (multi-channel UX coherence — operator manages one
  store across web/QR/Telegram without confusion)

## Related

- Positioning: `[[ai-driven-pivot]]`
- Predecessor scope: `[[mvp2-ai-platform]]`
