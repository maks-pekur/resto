import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb, type RestoTx } from '@resto/db';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import {
  appendToOutbox,
  TenantArchivedV1,
  TenantErasureCompletedV1,
  TenantOffboardingCancelledV1,
  TenantOffboardingScheduledV1,
  TenantProvisionedV1,
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

  async eraseTenant(id: TenantId, auditSalt: string): Promise<TenantSnapshot> {
    return this.db.withoutTenant('tenancy.eraseTenant', async (tx) => {
      const tenant = await this.loadByIdWithTx(tx, id);
      if (!tenant) {
        throw new TenantNotFoundError(id);
      }
      const currentSnapshot = tenant.toSnapshot();
      if (currentSnapshot.status === 'erased') {
        return currentSnapshot;
      }

      const memberRows = await tx
        .select({ userId: schema.member.userId })
        .from(schema.member)
        .where(eq(schema.member.organizationId, id));
      const orphanCandidates = memberRows.map((row) => row.userId);

      await tx.delete(schema.outboxEvents).where(eq(schema.outboxEvents.tenantId, id));
      await tx.delete(schema.inboxProcessed).where(eq(schema.inboxProcessed.tenantId, id));
      await tx.delete(schema.menuItems).where(eq(schema.menuItems.tenantId, id));
      await tx.delete(schema.menuModifiers).where(eq(schema.menuModifiers.tenantId, id));
      await tx.delete(schema.menuCategories).where(eq(schema.menuCategories.tenantId, id));
      await tx.delete(schema.customerProfiles).where(eq(schema.customerProfiles.tenantId, id));
      await tx.delete(schema.invitation).where(eq(schema.invitation.organizationId, id));
      await tx
        .delete(schema.organizationRole)
        .where(eq(schema.organizationRole.organizationId, id));
      await tx.delete(schema.member).where(eq(schema.member.organizationId, id));
      await tx.delete(schema.tenantDomains).where(eq(schema.tenantDomains.tenantId, id));

      await tx.execute(sql`
        UPDATE audit_log
        SET
          actor_subject = 'erased:' || encode(digest(${auditSalt} || actor_subject, 'sha256'), 'hex'),
          payload = (
            CASE
              WHEN payload IS NULL THEN NULL
              ELSE jsonb_set_lax(
                     jsonb_set_lax(
                       jsonb_set_lax(
                         CASE
                           WHEN payload ? 'userId' AND jsonb_typeof(payload->'userId') = 'string'
                           THEN jsonb_set(
                                  payload,
                                  '{userId}',
                                  to_jsonb('erased:' || encode(digest(${auditSalt} || (payload->>'userId'), 'sha256'), 'hex'))
                                )
                           ELSE payload
                         END,
                         '{ipAddress}',
                         NULL,
                         false,
                         'use_json_null'
                       ),
                       '{userAgent}',
                       NULL,
                       false,
                       'use_json_null'
                     ),
                     '{email}',
                     NULL,
                     false,
                     'use_json_null'
                   )
            END
          )
        WHERE tenant_id = ${id}
      `);

      if (orphanCandidates.length > 0) {
        await tx.execute(sql`
          DELETE FROM "user"
          WHERE id = ANY(${orphanCandidates}::text[])
          AND NOT EXISTS (SELECT 1 FROM member WHERE member.user_id = "user".id)
        `);
      }

      tenant.executeErasure(new Date());
      const erasedSnapshot = tenant.toSnapshot();
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
      return {
        id: randomUUID(),
        type: TenantArchivedV1.type,
        version: TenantArchivedV1.version,
        tenantId: event.tenantId,
        correlationId: randomUUID(),
        causationId: null,
        occurredAt: event.occurredAt,
        payload: { tenantId: event.tenantId },
      };
    case 'TenantOffboardingScheduled':
      return {
        id: randomUUID(),
        type: TenantOffboardingScheduledV1.type,
        version: TenantOffboardingScheduledV1.version,
        tenantId: event.tenantId,
        correlationId: randomUUID(),
        causationId: null,
        occurredAt: event.occurredAt,
        payload: {
          tenantId: event.tenantId,
          requestedBy: event.requestedBy,
          scheduledAt: event.scheduledAt,
        },
      };
    case 'TenantOffboardingCancelled':
      return {
        id: randomUUID(),
        type: TenantOffboardingCancelledV1.type,
        version: TenantOffboardingCancelledV1.version,
        tenantId: event.tenantId,
        correlationId: randomUUID(),
        causationId: null,
        occurredAt: event.occurredAt,
        payload: {
          tenantId: event.tenantId,
          cancelledAt: event.cancelledAt,
        },
      };
    case 'TenantErasureCompleted':
      return {
        id: randomUUID(),
        type: TenantErasureCompletedV1.type,
        version: TenantErasureCompletedV1.version,
        tenantId: event.tenantId,
        correlationId: randomUUID(),
        causationId: null,
        occurredAt: event.occurredAt,
        payload: {
          tenantId: event.tenantId,
          executedAt: event.executedAt,
        },
      };
  }
};
