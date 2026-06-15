---
phase: 07-ordering
plan: 02
subsystem: ordering
tags: [schema, migration, events, rls, ordering]
dependency_graph:
  requires:
    [packages/db/src/schema/brands.ts, packages/db/src/schema/tenants.ts]
  provides:
    [
      packages/db/src/schema/ordering.ts,
      packages/db/migrations/0049_ordering_tables.sql,
      packages/events/src/contracts/ordering.ts,
    ]
  affects: [packages/db/src/schema/index.ts, packages/events/src/index.ts]
tech_stack:
  added: []
  patterns:
    [
      compositeTenantFk,
      tenantParentUniqueIndex,
      FORCE RLS + _iso policy,
      defineEventContract triple-export,
    ]
key_files:
  created:
    - packages/db/src/schema/ordering.ts
    - packages/db/migrations/0049_ordering_tables.sql
    - packages/events/src/contracts/ordering.ts
  modified:
    - packages/db/src/schema/index.ts
    - packages/db/migrations/meta/_journal.json
    - packages/events/src/index.ts
decisions:
  - Ordered DDL so orders + its tenantParentUniqueIndex precede order_items, and order_items + its tenantParentUniqueIndex precede order_modifiers — required for composite FK references to resolve in one pass
  - No timestampsColumns() on orders or payments — status ('canceled'/'refunded') is the soft-delete pattern; archived_at would be wrong semantic
  - OrderCreatedV1Payload carries only orderId/tenantId/brandId/orderNumber/fulfillmentMode/total/currency/itemCount — no customer PII (GDPR minimisation, T-07-PII)
  - ORD-08 and ORD-11 recorded as VERIFY-ONLY — no rebuild required
metrics:
  duration: 9 minutes
  completed: 2026-06-14
  tasks: 3
  files: 6
---

# Phase 07 Plan 02: Ordering Persistence + Event Contracts Summary

Four ordering tables with FORCE RLS + composite FKs + hand-written migration 0049, plus five `ordering.*` event contracts exported from `@resto/events`.

## Tasks Completed

| Task | Name                                                          | Commit  | Files                                                                                       |
| ---- | ------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| 1    | Drizzle schema — orders/order_items/order_modifiers/payments  | 4f4114f | packages/db/src/schema/ordering.ts, packages/db/src/schema/index.ts                         |
| 2    | Hand-written migration 0049 + journal entry + RLS             | 8933c99 | packages/db/migrations/0049_ordering_tables.sql, packages/db/migrations/meta/\_journal.json |
| 3    | Five ordering.\* event contracts + ORD-08/ORD-11 verification | 0e5304b | packages/events/src/contracts/ordering.ts, packages/events/src/index.ts                     |

## Acceptance Criteria — Verified

- [x] All four composite FK names present: `orders_brand_fk`, `order_items_order_fk`, `order_modifiers_order_item_fk`, `payments_order_fk`
- [x] `tenantParentUniqueIndex` call count >= 2 (orders + order_items — both needed as FK parents)
- [x] `scheduled_for` column present on orders (ORD-12)
- [x] `orders_idempotency_key_uq` unique index on (tenant_id, idempotency_key) (ORD-10)
- [x] `timestampsColumns()` NOT used on orders or payments (status-as-soft-delete)
- [x] All four tables re-exported from `packages/db/src/schema/index.ts`
- [x] `pnpm nx run db:typecheck` passes
- [x] Migration 0049 applies cleanly — `pnpm nx run db:db:migrate` exits 0
- [x] `ENABLE ROW LEVEL SECURITY` × 4 in migration
- [x] `FORCE ROW LEVEL SECURITY` × 4 in migration
- [x] `orders_iso`, `order_items_iso`, `order_modifiers_iso`, `payments_iso` policies × 4 in migration
- [x] `_journal.json` has idx-49 entry, valid JSON
- [x] `packages/db:test` 26 files / 188 tests pass (tenant-isolation suite included)
- [x] 5 contract types matching `ordering.order_(created|paid|canceled|refunded|status_changed).v1`
- [x] No PII (`customer_name`/`customer_phone`) in `ordering.ts` contracts
- [x] All 5 contracts + payload types re-exported from `packages/events/src/index.ts`
- [x] `pnpm nx run events:typecheck` passes
- [x] `events:test` 9 files / 42 tests pass (outbox-claim-ownership spec green — ORD-11)

## ORD-08 Verification (VERIFY-ONLY — no code change)

`ordering.>` is confirmed present in `STREAM_SUBJECTS` in `apps/api/src/infrastructure/nats.module.ts` at line 29. ORD-08 was already satisfied before Plan 02. No implementation task required.

## ORD-11 Verification (VERIFY-ONLY — no code change)

`outbox_events.claim_id UUID` column confirmed in:

- Schema: `packages/db/src/schema/outbox.ts` (column definition)
- Migration: `packages/db/migrations/0047_outbox_claim_id.sql`
- Repository: `packages/events/src/outbox/repository.ts` — `releaseOutboxClaim` and `markOutboxDelivered` both scope their WHERE to `eq(schema.outboxEvents.claimId, claimId)`
- Guard spec: `packages/events/test/integration/outbox-claim-ownership.spec.ts` — passes green

Cosmetic note (D-06): the requirement text says `claim_token`; the shipped column name is `claim_id`. Per decision D-06 this is accepted as satisfying ORD-11. The column name is NOT renamed.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

| Flag               | File                                            | Description                                                                                                          |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| T-07-01 mitigated  | packages/db/migrations/0049_ordering_tables.sql | ENABLE + FORCE RLS + `_iso` policy on all 4 tables                                                                   |
| T-07-02 mitigated  | packages/db/src/schema/ordering.ts              | compositeTenantFk on order_items→orders and order_modifiers→order_items with tenantParentUniqueIndex on both parents |
| T-07-PII mitigated | packages/events/src/contracts/ordering.ts       | OrderCreatedV1Payload has no customer_name/customer_phone; grep gate confirmed                                       |

## Self-Check: PASSED

| Check                                                  | Result |
| ------------------------------------------------------ | ------ |
| packages/db/src/schema/ordering.ts exists              | FOUND  |
| packages/db/migrations/0049_ordering_tables.sql exists | FOUND  |
| packages/events/src/contracts/ordering.ts exists       | FOUND  |
| commit 4f4114f exists                                  | FOUND  |
| commit 8933c99 exists                                  | FOUND  |
| commit 0e5304b exists                                  | FOUND  |
| db:typecheck                                           | PASS   |
| events:typecheck                                       | PASS   |
