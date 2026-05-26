import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb, type RestoTx } from '@resto/db';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import {
  appendToOutbox,
  buildEnvelope,
  TenantArchivedV1,
  TenantErasureCompletedV1,
  TenantOffboardingCancelledV1,
  TenantOffboardingScheduledV1,
  TenantProvisionedV1,
  TenantResumedV1,
  TenantSuspendedV1,
  type EventEnvelope,
} from '@resto/events';
import { eq, sql } from 'drizzle-orm';
import { Tenant, type TenantSnapshot, type TenantStatus } from '../domain/tenant.aggregate';
import { TenantNotFoundError } from '../domain/errors';
import type { TenantDomainEvent } from '../domain/events';
import type { TenantDomain, TenantDomainKind } from '../domain/tenant-domain';
import type { TenantRepository } from '../domain/ports';

const ALLOWED_STATUSES: ReadonlySet<TenantStatus> = new Set([
  'active',
  'suspended',
  'archived',
  'pending_offboarding',
  'erased',
]);
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

  async findCurrentTenant(): Promise<Tenant | null> {
    // requireTenantContext() runs here AND inside db.withTenant. Calling
    // explicitly first lets us hoist tenantId into the closure without
    // re-reading ALS inside the transaction callback.
    const { tenantId } = requireTenantContext();
    // ADR-0020 I-1: tenants.id IS the tenant id (not a tenant_id FK), so
    // the explicit filter is `eq(tenants.id, ctx.tenantId)` — provided by
    // loadByIdWithTx — with RLS (tenants_self_iso) as the second layer.
    return this.db.withTenant(async (tx) => this.loadByIdWithTx(tx, TenantId.parse(tenantId)));
  }

  async listCurrentTenantDomains(): Promise<readonly TenantDomain[]> {
    const { tenantId } = requireTenantContext();
    return this.db.withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.tenantDomains)
        .where(eq(schema.tenantDomains.tenantId, TenantId.parse(tenantId)));
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
          offboardingScheduledAt: snapshot.offboardingScheduledAt,
          offboardingExecutedAt: snapshot.offboardingExecutedAt,
          offboardingRequestedBy: snapshot.offboardingRequestedBy,
        })
        .onConflictDoUpdate({
          target: schema.tenants.id,
          set: {
            slug: snapshot.slug,
            displayName: snapshot.displayName,
            status: snapshot.status,
            locale: snapshot.locale,
            defaultCurrency: snapshot.defaultCurrency,
            stripeAccountId: snapshot.stripeAccountId,
            updatedAt: snapshot.updatedAt,
            archivedAt: snapshot.archivedAt,
            offboardingScheduledAt: snapshot.offboardingScheduledAt,
            offboardingExecutedAt: snapshot.offboardingExecutedAt,
            offboardingRequestedBy: snapshot.offboardingRequestedBy,
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

  listScheduledForErasure(): Promise<readonly TenantSnapshot[]> {
    return this.db.withoutTenant('tenancy.listScheduledForErasure', async (tx) => {
      const rows = await tx
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(
          sql`${schema.tenants.status} = 'pending_offboarding'
              AND ${schema.tenants.offboardingExecutedAt} IS NULL
              AND ${schema.tenants.offboardingScheduledAt} + INTERVAL '30 days' < NOW()`,
        );
      const tenants: TenantSnapshot[] = [];
      for (const row of rows) {
        const tenant = await this.loadByIdWithTx(tx, TenantId.parse(row.id));
        if (tenant) tenants.push(tenant.toSnapshot());
      }
      return tenants;
    });
  }

  async eraseTenant(
    id: TenantId,
    auditSalt: string,
    actorSubject: string,
  ): Promise<TenantSnapshot> {
    return this.db.withoutTenant('tenancy.eraseTenant', async (tx) => {
      const tenant = await this.loadByIdWithTx(tx, id);
      if (!tenant) {
        throw new TenantNotFoundError(id);
      }
      const currentSnapshot = tenant.toSnapshot();
      if (currentSnapshot.status === 'erased') {
        return currentSnapshot;
      }

      tenant.executeErasure(new Date());
      const erasedSnapshot = tenant.toSnapshot();

      await tx.execute(sql`SELECT app_allow_erasure(${id}::uuid)`);
      await tx.execute(
        sql`SELECT tenancy_erase_tenant(${id}::uuid, ${auditSalt}::text, ${actorSubject}::text)`,
      );
      await tx
        .update(schema.tenants)
        .set({
          status: erasedSnapshot.status,
          slug: erasedSnapshot.slug,
          displayName: erasedSnapshot.displayName,
          stripeAccountId: erasedSnapshot.stripeAccountId,
          offboardingExecutedAt: erasedSnapshot.offboardingExecutedAt,
          updatedAt: erasedSnapshot.updatedAt,
        })
        .where(eq(schema.tenants.id, id));

      for (const event of tenant.pullEvents()) {
        const envelope = domainEventToEnvelope(event);
        await appendToOutbox(tx, { envelope, aggregateId: id });
      }

      return erasedSnapshot;
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
      offboardingScheduledAt: row.offboardingScheduledAt,
      offboardingExecutedAt: row.offboardingExecutedAt,
      offboardingRequestedBy: row.offboardingRequestedBy,
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
      return buildEnvelope(
        TenantProvisionedV1,
        {
          tenantId: event.tenantId,
          slug: event.slug,
          displayName: event.displayName,
          defaultCurrency: event.defaultCurrency,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'TenantArchived':
      return buildEnvelope(
        TenantArchivedV1,
        { tenantId: event.tenantId },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'TenantOffboardingScheduled':
      return buildEnvelope(
        TenantOffboardingScheduledV1,
        {
          tenantId: event.tenantId,
          requestedBy: event.requestedBy,
          scheduledAt: event.scheduledAt,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'TenantOffboardingCancelled':
      return buildEnvelope(
        TenantOffboardingCancelledV1,
        {
          tenantId: event.tenantId,
          cancelledAt: event.cancelledAt,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'TenantErasureCompleted':
      return buildEnvelope(
        TenantErasureCompletedV1,
        {
          tenantId: event.tenantId,
          executedAt: event.executedAt,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'TenantSuspended':
      return buildEnvelope(
        TenantSuspendedV1,
        {
          tenantId: event.tenantId,
          requestedBy: event.requestedBy,
          suspendedAt: event.suspendedAt,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'TenantResumed':
      return buildEnvelope(
        TenantResumedV1,
        {
          tenantId: event.tenantId,
          resumedAt: event.resumedAt,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
  }
};
