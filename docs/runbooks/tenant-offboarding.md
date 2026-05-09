# Tenant offboarding runbook

GDPR Article 17 erasure flow for a tenant who has formally requested deletion of their data.

## When to use

- Tenant has signed a formal offboarding / cancellation request and the contract has ended.
- Legal team has confirmed there is no outstanding billing dispute, audit hold, or regulatory requirement that overrides the erasure SLA.
- Operator running this flow has access to BA `user.id` for audit attribution.

NOT for support-mediated tenant pause or temporary suspension -- those are separate (see `tenants.status='suspended'`, currently unused).

## Pre-flight checklist

- [ ] Signed offboarding request on file in the support system.
- [ ] No open billing dispute (`stripe.charges.list?customer=<...>` returns no `pending` rows).
- [ ] Operator's BA `user.id` captured.
- [ ] Ticket reference recorded for audit trail.

## Step 1 -- Schedule the offboarding

Until the HTTP endpoint ships (RES-103/B), use a direct SQL update against the dev stack OR wait for phase 2. Once phase 2 is live:

```bash
curl -X POST "https://api.resto.app/internal/v1/tenants/$TENANT_ID/offboard" \
  -H "Content-Type: application/json" \
  -H "x-internal-token: $INTERNAL_API_TOKEN" \
  -d '{"requestedBy": "<your-ba-user-id>"}'
```

Expected: `202 Accepted` with the post-state snapshot showing `status='pending_offboarding'` and `offboarding_scheduled_at`. The tenant is immediately blocked from API traffic via `AuthGuard`'s archive pre-check (RES-127).

## Step 2 -- 30-day cool-off

The tenant has 30 calendar days to request cancellation. During this window:

- The tenant cannot access the API (returns `403 tenant.archived` on every authenticated request).
- The data is retained but inaccessible.
- A cancellation request resets the tenant to `active`.

## Step 3 -- Cancellation (only within 30 days)

```bash
curl -X DELETE "https://api.resto.app/internal/v1/tenants/$TENANT_ID/offboard" \
  -H "Content-Type: application/json" \
  -H "x-internal-token: $INTERNAL_API_TOKEN" \
  -d '{"cancelledBy": "<your-ba-user-id>"}'
```

After day 30 cancellation returns `409 tenant.offboarding_cool_off_expired` and is irreversible -- the next step is execution.

## Step 4 -- Erasure execution

Until phase 3 ships the scheduler, run the manual CLI on the api host:

```bash
pnpm resto:erase-tenant <slug>
```

The CLI prompts for confirmation (type the slug to confirm). It then calls the SECURITY DEFINER function `tenancy_erase_tenant(uuid, text)` (migration `0011`), which performs:

1. Cascade-deletes (in dependency order): `outbox_events`, `inbox_processed`, all menu tables (`menu_items`, `menu_modifiers`, `menu_categories`), `customer_profiles`, `invitation`, `organization_role`, `member`, `tenant_domains` for the tenant.
2. Anonymises `audit_log` rows scoped to the tenant. Top-level columns: `actor_subject` and `target_id` -> `erased:<sha256>` (one-way); `ip_address` and `user_agent` -> `NULL`. Inside `payload`: `userId` -> same hash form; `ipAddress` / `userAgent` / `email` -> JSON `null`.
3. Hard-deletes `user` rows for users who had zero remaining memberships (cascades via FK to `session`, `account`, `verification`, `two_factor`).

After the function returns, the repo:

4. Tombstones the `tenants` row via UPDATE: `displayName='[erased]'`, `slug='erased-<...>'`, `stripe_account_id=null`, `status='erased'`.
5. Emits `TenantErasureCompletedV1` to outbox -> audit consumer (RES-130) records the completion event.

Verification queries:

```sql
-- Tombstone present, status erased
SELECT id, status, slug, display_name, offboarding_executed_at
FROM tenants WHERE id = '<tenant-id>';

-- Tenant-scoped rows count = 0
SELECT
  (SELECT count(*) FROM member WHERE organization_id = '<tenant-id>') AS members,
  (SELECT count(*) FROM customer_profiles WHERE tenant_id = '<tenant-id>') AS customers,
  (SELECT count(*) FROM tenant_domains WHERE tenant_id = '<tenant-id>') AS domains,
  (SELECT count(*) FROM outbox_events WHERE tenant_id = '<tenant-id>') AS outbox;

-- Audit anonymised
SELECT actor_subject, target_id, ip_address, user_agent, payload->>'userId'
FROM audit_log WHERE tenant_id = '<tenant-id>' LIMIT 5;
-- Expect: actor_subject + target_id start with 'erased:'; ip_address + user_agent are NULL; payload->>'userId' same hash form
```

## What is NOT erased

- **Backups.** Per Article 17(3)(b), ongoing storage in immutable operational backups is exempt. Resto's backup retention is 7-30 days (per RES-102 / future runbook); tenant data ages out via natural rotation.
- **Audit trail rows themselves.** Kept (anonymised) for forensic / regulatory reporting needs (legitimate-interest retention).
- **Resto application logs (Pino -> Loki / CloudWatch).** Application logs may contain `tenant_id` references but no PII fields per the structured logging contract. Out of GDPR scope; no separate retention action required.

## Incident handling

- **Erasure aborted mid-execution.** Re-run `pnpm resto:erase-tenant <slug>`. The CLI is idempotent: rows already deleted are skipped; the tombstone update is `UPDATE` so a re-run is a no-op when the row is already `status='erased'`.
- **Stuck row (DB error).** Capture the error, the tenant id, and the step (deletion order in the spec). Escalate to the on-call DB engineer.
- **Cancellation requested after 30d.** Document the request, link to this runbook section, and respond with the policy-decision rationale (cool-off has elapsed, GDPR compliance commitment locks the timeline).

## References

- ADR-0018 (this file's design source).
- RES-127 (tenant-archive AuthGuard pre-check; same path used during cool-off).
- RES-130 (audit pipeline; consumes `TenantErasureCompletedV1`).
