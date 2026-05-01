import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb, type RestoTx } from '@resto/db';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import { appendToOutbox, TenantProvisionedV1, type EventEnvelope } from '@resto/events';
import { eq } from 'drizzle-orm';
import { Tenant, type TenantSnapshot, type TenantStatus } from '../domain/tenant.aggregate';
import type { TenantDomainEvent } from '../domain/events';
import type { TenantDomain, TenantDomainKind } from '../domain/tenant-domain';
import type { TenantRepository } from '../domain/ports';

const ALLOWED_STATUSES: ReadonlySet<TenantStatus> = new Set(['active', 'suspended', 'archived']);
const ALLOWED_DOMAIN_KINDS: ReadonlySet<TenantDomainKind> = new Set(['subdomain', 'custom']);

@Injectable()
export class TenantDrizzleRepository implements TenantRepository {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async findById(id: TenantId): Promise<Tenant | null> {
    return this.loadById(id);
  }

  findBySlug(slug: TenantSlug): Promise<Tenant | null> {
    return this.db.withoutTenant('tenancy.findBySlug', async (tx) => {
      const rows = await tx
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(eq(schema.tenants.slug, slug))
        .limit(1);
      const id = rows[0]?.id;
      if (!id) return null;
      return this.loadByIdWithTx(tx, TenantId.parse(id));
    });
  }

  findByDomainHost(host: string): Promise<Tenant | null> {
    return this.db.withoutTenant('tenancy.findByDomainHost', async (tx) => {
      const rows = await tx
        .select({ tenantId: schema.tenantDomains.tenantId })
        .from(schema.tenantDomains)
        .where(eq(schema.tenantDomains.domain, host.toLowerCase()))
        .limit(1);
      const tenantId = rows[0]?.tenantId;
      if (!tenantId) return null;
      return this.loadByIdWithTx(tx, TenantId.parse(tenantId));
    });
  }

  listDomains(id: TenantId): Promise<TenantDomain[]> {
    return this.db.withoutTenant('tenancy.listDomains', async (tx) => {
      const rows = await tx
        .select()
        .from(schema.tenantDomains)
        .where(eq(schema.tenantDomains.tenantId, id));
      return rows.map(rowToTenantDomain);
    });
  }

  async save(tenant: Tenant): Promise<void> {
    const snapshot = tenant.toSnapshot();
    const events = tenant.pullEvents();

    await this.db.withoutTenant('tenancy.save', async (tx) => {
      await tx
        .insert(schema.tenants)
        .values({
          id: snapshot.id,
          slug: snapshot.slug,
          displayName: snapshot.displayName,
          status: snapshot.status,
          locale: snapshot.locale,
          defaultCurrency: snapshot.defaultCurrency,
          stripeAccountId: snapshot.stripeAccountId,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          archivedAt: snapshot.archivedAt,
        })
        .onConflictDoUpdate({
          target: schema.tenants.id,
          set: {
            displayName: snapshot.displayName,
            status: snapshot.status,
            locale: snapshot.locale,
            defaultCurrency: snapshot.defaultCurrency,
            stripeAccountId: snapshot.stripeAccountId,
            updatedAt: snapshot.updatedAt,
            archivedAt: snapshot.archivedAt,
          },
        });

      const domains = [snapshot.primaryDomain, ...snapshot.customDomains];
      for (const domain of domains) {
        await tx
          .insert(schema.tenantDomains)
          .values({
            id: domain.id,
            tenantId: domain.tenantId,
            domain: domain.domain,
            kind: domain.kind,
            isPrimary: domain.isPrimary,
            verifiedAt: domain.verifiedAt,
            createdAt: domain.createdAt,
            updatedAt: domain.createdAt,
            archivedAt: null,
          })
          .onConflictDoNothing({ target: schema.tenantDomains.id });
      }

      for (const event of events) {
        const envelope = domainEventToEnvelope(event);
        await appendToOutbox(tx, { envelope, aggregateId: snapshot.id });
      }
    });
  }

  private loadById(id: TenantId): Promise<Tenant | null> {
    return this.db.withoutTenant('tenancy.findById', (tx) => this.loadByIdWithTx(tx, id));
  }

  private async loadByIdWithTx(tx: RestoTx, id: TenantId): Promise<Tenant | null> {
    const tenantRows = await tx
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, id))
      .limit(1);
    const row = tenantRows[0];
    if (!row) return null;

    const domainRows = await tx
      .select()
      .from(schema.tenantDomains)
      .where(eq(schema.tenantDomains.tenantId, id));

    const primary = domainRows.find((d) => d.isPrimary);
    if (!primary) {
      throw new Error(`Tenant ${id} has no primary domain row.`);
    }
    const customDomains = domainRows.filter((d) => !d.isPrimary).map(rowToTenantDomain);

    const status = parseStatus(row.status);
    const snapshot: TenantSnapshot = {
      id: TenantId.parse(row.id),
      slug: TenantSlug.parse(row.slug),
      displayName: row.displayName,
      status,
      locale: row.locale,
      defaultCurrency: Currency.parse(row.defaultCurrency),
      stripeAccountId: row.stripeAccountId,
      primaryDomain: rowToTenantDomain(primary),
      customDomains,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
    };
    return Tenant.fromSnapshot(snapshot);
  }
}

const parseStatus = (raw: string): TenantStatus => {
  if (!ALLOWED_STATUSES.has(raw as TenantStatus)) {
    throw new Error(`Unknown tenant status "${raw}" in DB.`);
  }
  return raw as TenantStatus;
};

const parseDomainKind = (raw: string): TenantDomainKind => {
  if (!ALLOWED_DOMAIN_KINDS.has(raw as TenantDomainKind)) {
    throw new Error(`Unknown tenant_domains.kind "${raw}" in DB.`);
  }
  return raw as TenantDomainKind;
};

const rowToTenantDomain = (row: typeof schema.tenantDomains.$inferSelect): TenantDomain => ({
  id: row.id,
  tenantId: row.tenantId,
  domain: row.domain,
  kind: parseDomainKind(row.kind),
  isPrimary: row.isPrimary,
  verifiedAt: row.verifiedAt,
  createdAt: row.createdAt,
});

const domainEventToEnvelope = (event: TenantDomainEvent): EventEnvelope => {
  switch (event.kind) {
    case 'TenantProvisioned':
      return {
        id: randomUUID(),
        type: TenantProvisionedV1.type,
        version: TenantProvisionedV1.version,
        tenantId: event.tenantId,
        correlationId: randomUUID(),
        causationId: null,
        occurredAt: event.occurredAt,
        payload: {
          tenantId: event.tenantId,
          slug: event.slug,
          displayName: event.displayName,
          defaultCurrency: event.defaultCurrency,
        },
      };
    case 'TenantArchived':
      // No published v1 contract for archive yet — the outbox row is
      // still useful for ops, but the broker subject is the local form
      // until we publish a contract for it.
      return {
        id: randomUUID(),
        type: 'tenancy.tenant_archived.v1',
        version: 1,
        tenantId: event.tenantId,
        correlationId: randomUUID(),
        causationId: null,
        occurredAt: event.occurredAt,
        payload: { tenantId: event.tenantId },
      };
  }
};
