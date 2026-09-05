---
title: Every API error body names resto.app, a domain the project does not own
date: 2026-09-05
priority: low
status: pending
---

# `type: "https://resto.app/problems/<code>"` in every RFC-7807 body

`apps/api/src/shared/exception.filter.ts:91` builds the problem `type` from a hardcoded
`resto.app`, and `zod-validation.pipe.ts:8` documents the same. The apex is now `restos.pp.ua`,
and `resto.app` is not the project's domain.

## Decided 2026-09-05: not fixed in phase 7.5, and here is why

RFC 7807 `type` is an **identifier, not a link** — it is explicitly not required to resolve. It is
also part of the public API contract: a client may match on it, `docs/api/openapi.yaml` is
committed, and the repo runs an OpenAPI drift gate. Changing it is therefore a contract change with
no functional gain, in a phase whose job is standing up a box.

The cost is not zero either: the literal is asserted in **eight places across six test files**
(`exception.filter.spec.ts`, `tenants-controller`, `catalog`, `identity-smoke`, `security`,
`tenancy` e2e).

## The residual, and the fix when someone takes it

The URI ships in **every** error body the API emits — guest checkout failures included, not just
operator-facing ones — and `resto.app` belongs to a third party. Nobody clicks a `type` URI and it is
never rendered as a link, so the risk stays low; but the audience is wider than "an operator", and
the cost of the fix grows with every client that starts branching on the value.

**Do it before the first paying customer**, not open-ended.

The right fix is **not** to swap in the new apex, which would recreate the same problem the next
time the domain moves. Use a domain-free URN — `urn:resto:problem:<code>` — which is a legitimate
RFC 7807 `type`, never resolves, never needs to, and never has to be re-pointed. Do it as its own
small change with the contract regeneration and the six spec files in one commit.

## Related

- [[universal-ssl-does-not-cover-our-hostnames]] — the other place a hardcoded domain shaped a
  design decision.
