import { randomUUID } from 'node:crypto';
import { TenantId, type Currency, type TenantSlug } from '@resto/domain';
import type { TenantDomain } from './tenant-domain';
import type { TenantDomainEvent } from './events';
import { TenantAlreadyArchivedError } from './errors';

export type TenantStatus = 'active' | 'suspended' | 'archived';

export interface TenantSnapshot {
  readonly id: TenantId;
  readonly slug: TenantSlug;
  readonly displayName: string;
  readonly status: TenantStatus;
  readonly locale: string;
  readonly defaultCurrency: Currency;
  readonly stripeAccountId: string | null;
  readonly primaryDomain: TenantDomain;
  readonly customDomains: readonly TenantDomain[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export interface ProvisionInput {
  readonly slug: TenantSlug;
  readonly displayName: string;
  readonly locale?: string;
  readonly defaultCurrency: Currency;
  /** Hostname format `<slug>.menu.resto.app` — passed by the application service. */
  readonly primaryDomainHostname: string;
  readonly now?: Date;
}

/**
 * Aggregate root for the tenancy bounded context. Owns lifecycle
 * (provision / archive) plus invariants over the tenant's domain
 * mappings. Pure — no DB, no broker, no framework imports.
 *
 * The repository drains `pullEvents()` after `save` and translates the
 * events into outbox rows using contracts from `@resto/events`.
 */
export class Tenant {
  readonly #events: TenantDomainEvent[] = [];

  private constructor(private snapshot: TenantSnapshot) {}

  static fromSnapshot(snapshot: TenantSnapshot): Tenant {
    return new Tenant(snapshot);
  }

  static provision(input: ProvisionInput): Tenant {
    const now = input.now ?? new Date();
    const id = TenantId.parse(randomUUID());
    const primaryDomain: TenantDomain = {
      id: randomUUID(),
      tenantId: id,
      domain: input.primaryDomainHostname,
      kind: 'subdomain',
      isPrimary: true,
      verifiedAt: now,
      createdAt: now,
    };
    const snapshot: TenantSnapshot = {
      id,
      slug: input.slug,
      displayName: input.displayName,
      status: 'active',
      locale: input.locale ?? 'en',
      defaultCurrency: input.defaultCurrency,
      stripeAccountId: null,
      primaryDomain,
      customDomains: [],
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const tenant = new Tenant(snapshot);
    tenant.#events.push({
      kind: 'TenantProvisioned',
      tenantId: snapshot.id,
      slug: snapshot.slug,
      displayName: snapshot.displayName,
      defaultCurrency: snapshot.defaultCurrency,
      occurredAt: now,
    });
    return tenant;
  }

  archive(now: Date = new Date()): void {
    if (this.snapshot.status === 'archived') {
      throw new TenantAlreadyArchivedError(this.snapshot.id);
    }
    this.snapshot = {
      ...this.snapshot,
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
    };
    this.#events.push({
      kind: 'TenantArchived',
      tenantId: this.snapshot.id,
      occurredAt: now,
    });
  }

  toSnapshot(): TenantSnapshot {
    return this.snapshot;
  }

  pullEvents(): TenantDomainEvent[] {
    const events = [...this.#events];
    this.#events.length = 0;
    return events;
  }
}
