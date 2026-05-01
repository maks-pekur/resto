import type { Currency, TenantId, TenantSlug } from '@resto/domain';

/**
 * Domain events raised by the `Tenant` aggregate.
 *
 * Pure data — no broker awareness. The repository drains
 * `tenant.pullEvents()` after save and translates each into an outbox
 * envelope using `@resto/events` contracts.
 */

export interface TenantProvisionedDomainEvent {
  readonly kind: 'TenantProvisioned';
  readonly tenantId: TenantId;
  readonly slug: TenantSlug;
  readonly displayName: string;
  readonly defaultCurrency: Currency;
  readonly occurredAt: Date;
}

export interface TenantArchivedDomainEvent {
  readonly kind: 'TenantArchived';
  readonly tenantId: TenantId;
  readonly occurredAt: Date;
}

export type TenantDomainEvent = TenantProvisionedDomainEvent | TenantArchivedDomainEvent;
