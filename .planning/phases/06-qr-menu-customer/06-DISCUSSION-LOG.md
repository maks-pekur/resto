# Phase 6: QR-Menu Customer - Discussion Log

> Audit trail only. Decisions live in CONTEXT.md.

**Date:** 2026-06-12
**Phase:** 6-qr-menu-customer
**Areas discussed:** cart-store sharing, table binding (QRM-08), existing Vite components, locale/i18n (QRM-10)

## Cart-store sharing + table + Vite components (1–3)

Recommendations presented; user chose **"Принять всё (1-3)"**.

- D-02: extract Zustand cart store → new `@resto/cart`, shared by website + qr-menu; UI components NOT shared (Next/shadcn vs Vite). Alternative considered: duplicate the store in qr-menu (rejected — drift risk).
- D-03: `table` field + `setTable` on the shared store; `?table=` on mount, manual fallback.
- D-04: extend existing qr-menu Vite components; keep qr-menu's own styling (no shadcn).

## Locale (QRM-10)

User chose **`en`** (align with website D-05) over ru-market default. Resolution URL>cookie>Accept-Language unchanged.

## Stack note

qr-menu stays Vite (QRM-11 mandates a Vite build) — settled by requirements, not discussed as open.

## Deferred

- Order submission → Phase 7; payments → Phase 8; AI guest chat → MVP-2; full @resto/ui component library not pursued.
