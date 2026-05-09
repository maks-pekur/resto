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

export interface TenantOffboardingScheduledDomainEvent {
  readonly kind: 'TenantOffboardingScheduled';
  readonly tenantId: TenantId;
  readonly requestedBy: string;
  readonly scheduledAt: Date;
  readonly occurredAt: Date;
}

export interface TenantOffboardingCancelledDomainEvent {
  readonly kind: 'TenantOffboardingCancelled';
  readonly tenantId: TenantId;
  readonly cancelledAt: Date;
  readonly occurredAt: Date;
}

export interface TenantErasureCompletedDomainEvent {
  readonly kind: 'TenantErasureCompleted';
  readonly tenantId: TenantId;
  readonly executedAt: Date;
  readonly occurredAt: Date;
}

export type TenantDomainEvent =
  | TenantProvisionedDomainEvent
  | TenantArchivedDomainEvent
  | TenantOffboardingScheduledDomainEvent
  | TenantOffboardingCancelledDomainEvent
  | TenantErasureCompletedDomainEvent;
