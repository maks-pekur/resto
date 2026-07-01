import { Inject, Injectable } from '@nestjs/common';
import {
  appendToOutbox,
  buildEnvelope,
  BrandPaymentAccountLinkedV1,
  BrandPaymentCapabilitiesAppliedV1,
} from '@resto/events';
import { schema, TenantAwareDb, TenantScopedRepository } from '@resto/db';
import { BrandId, BrandSlug, BrandTheme, TenantId } from '@resto/domain';
import { and, asc, eq, inArray, like, ne, or } from 'drizzle-orm';
import {
  type Brand,
  type BrandOnboardingStatus,
  type BrandSnapshot,
} from '../domain/brand.aggregate';
import type { BrandRepository } from '../domain/ports';

const ROW_TO_SNAPSHOT = (row: {
  id: string;
  tenantId: string;
  slug: string;
  displayName: string;
  status: string;
  theme: unknown;
  paymentProvider: string | null;
  accountType: string | null;
  defaultCurrency: string | null;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeOnboardingStatus: string;
  stripeRequirementsDue: string[] | null;
}): BrandSnapshot => ({
  id: BrandId.parse(row.id),
  tenantId: TenantId.parse(row.tenantId),
  slug: row.slug,
  displayName: row.displayName,
  status: row.status as BrandSnapshot['status'],
  theme: row.theme === null || row.theme === undefined ? null : BrandTheme.parse(row.theme),
  paymentProvider: (row.paymentProvider ?? 'stripe') as 'stripe',
  accountType: row.accountType as BrandSnapshot['accountType'],
  defaultCurrency: row.defaultCurrency,
  stripeAccountId: row.stripeAccountId,
  stripeChargesEnabled: row.stripeChargesEnabled,
  stripePayoutsEnabled: row.stripePayoutsEnabled,
  stripeOnboardingStatus: row.stripeOnboardingStatus as BrandOnboardingStatus,
  stripeRequirementsDue: row.stripeRequirementsDue,
});

@Injectable()
export class BrandDrizzleRepository extends TenantScopedRepository implements BrandRepository {
  constructor(@Inject(TenantAwareDb) db: TenantAwareDb) {
    super(db);
  }

  findByDomainHost(host: string): Promise<BrandSnapshot | null> {
    return this.db.withoutTenant('tenancy.brands.findByDomainHost', async (tx) => {
      const rows = await tx
        .select({
          id: schema.brands.id,
          tenantId: schema.brands.tenantId,
          slug: schema.brands.slug,
          displayName: schema.brands.displayName,
          status: schema.brands.status,
          theme: schema.brands.theme,
          paymentProvider: schema.brands.paymentProvider,
          accountType: schema.brands.accountType,
          defaultCurrency: schema.brands.defaultCurrency,
          stripeAccountId: schema.brands.stripeAccountId,
          stripeChargesEnabled: schema.brands.stripeChargesEnabled,
          stripePayoutsEnabled: schema.brands.stripePayoutsEnabled,
          stripeOnboardingStatus: schema.brands.stripeOnboardingStatus,
          stripeRequirementsDue: schema.brands.stripeRequirementsDue,
        })
        .from(schema.brandDomains)
        .innerJoin(schema.brands, eq(schema.brands.id, schema.brandDomains.brandId))
        .where(eq(schema.brandDomains.domain, host.toLowerCase()))
        .limit(1);
      const row = rows[0];
      return row ? ROW_TO_SNAPSHOT(row) : null;
    });
  }

  findBySlug(slug: BrandSlug): Promise<BrandSnapshot | null> {
    return this.db.withoutTenant('tenancy.brands.findBySlug', async (tx) => {
      const rows = await tx
        .select({
          id: schema.brands.id,
          tenantId: schema.brands.tenantId,
          slug: schema.brands.slug,
          displayName: schema.brands.displayName,
          status: schema.brands.status,
          theme: schema.brands.theme,
          paymentProvider: schema.brands.paymentProvider,
          accountType: schema.brands.accountType,
          defaultCurrency: schema.brands.defaultCurrency,
          stripeAccountId: schema.brands.stripeAccountId,
          stripeChargesEnabled: schema.brands.stripeChargesEnabled,
          stripePayoutsEnabled: schema.brands.stripePayoutsEnabled,
          stripeOnboardingStatus: schema.brands.stripeOnboardingStatus,
          stripeRequirementsDue: schema.brands.stripeRequirementsDue,
        })
        .from(schema.brands)
        .where(and(eq(schema.brands.slug, slug), ne(schema.brands.status, 'erased')))
        .limit(1);
      const row = rows[0];
      return row ? ROW_TO_SNAPSHOT(row) : null;
    });
  }

  async findByTenantAndSlug(tenantId: TenantId, slug: BrandSlug): Promise<BrandSnapshot | null> {
    const row = await this.selectOne(
      schema.brands,
      and(eq(schema.brands.tenantId, tenantId), eq(schema.brands.slug, slug)),
    );
    return row ? ROW_TO_SNAPSHOT(row) : null;
  }

  async findById(id: BrandId): Promise<BrandSnapshot | null> {
    const row = await this.selectOne(schema.brands, eq(schema.brands.id, id));
    return row ? ROW_TO_SNAPSHOT(row) : null;
  }

  async listForTenant(
    tenantId: TenantId,
    brandIds?: readonly string[],
  ): Promise<readonly BrandSnapshot[]> {
    if (brandIds?.length === 0) return [];
    return this.withTenant(async (scoped) => {
      const whereClauses = [
        eq(schema.brands.tenantId, tenantId),
        ne(schema.brands.status, 'erased'),
      ];
      if (brandIds !== undefined) {
        whereClauses.push(inArray(schema.brands.id, [...brandIds]));
      }
      const rows = await scoped
        .selectFrom(schema.brands, and(...whereClauses))
        .orderBy(asc(schema.brands.displayName));
      return rows.map(ROW_TO_SNAPSHOT);
    });
  }

  findActiveSlugsByPrefix(prefix: string, limit: number): Promise<readonly string[]> {
    const escaped = prefix.replace(/[\\%_]/g, (m) => `\\${m}`);
    return this.db.withoutTenant('tenancy.brands.findActiveSlugsByPrefix', async (tx) => {
      const rows = await tx
        .select({ slug: schema.brands.slug })
        .from(schema.brands)
        .where(
          and(
            ne(schema.brands.status, 'erased'),
            or(eq(schema.brands.slug, prefix), like(schema.brands.slug, `${escaped}-%`)),
          ),
        )
        .limit(limit);
      return rows.map((r) => r.slug);
    });
  }

  async save(snapshot: BrandSnapshot, primaryDomainHostname: string): Promise<void> {
    await this.withTenant(async (scoped) => {
      await scoped
        .insertInto(schema.brands, {
          id: snapshot.id,
          slug: snapshot.slug,
          displayName: snapshot.displayName,
          status: snapshot.status,
        })
        .onConflictDoNothing({ target: [schema.brands.tenantId, schema.brands.slug] });

      await scoped
        .insertInto(schema.brandDomains, {
          brandId: snapshot.id,
          domain: primaryDomainHostname,
          kind: 'subdomain',
          isPrimary: true,
        })
        .onConflictDoNothing({ target: schema.brandDomains.domain });
    });
  }

  findByStripeAccountId(stripeAccountId: string): Promise<BrandSnapshot | null> {
    return this.db.withoutTenant('tenancy.brands.findByStripeAccountId', async (tx) => {
      const rows = await tx
        .select({
          id: schema.brands.id,
          tenantId: schema.brands.tenantId,
          slug: schema.brands.slug,
          displayName: schema.brands.displayName,
          status: schema.brands.status,
          theme: schema.brands.theme,
          paymentProvider: schema.brands.paymentProvider,
          accountType: schema.brands.accountType,
          defaultCurrency: schema.brands.defaultCurrency,
          stripeAccountId: schema.brands.stripeAccountId,
          stripeChargesEnabled: schema.brands.stripeChargesEnabled,
          stripePayoutsEnabled: schema.brands.stripePayoutsEnabled,
          stripeOnboardingStatus: schema.brands.stripeOnboardingStatus,
          stripeRequirementsDue: schema.brands.stripeRequirementsDue,
        })
        .from(schema.brands)
        .where(eq(schema.brands.stripeAccountId, stripeAccountId))
        .limit(1);
      const row = rows[0];
      return row ? ROW_TO_SNAPSHOT(row) : null;
    });
  }

  async updatePaymentConnection(brand: Brand): Promise<void> {
    const snapshot = brand.toSnapshot();
    const events = brand.pullEvents();
    await this.withTenant(async (scoped, tx) => {
      await scoped
        .updateTable(
          schema.brands,
          {
            paymentProvider: snapshot.paymentProvider,
            accountType: snapshot.accountType,
            stripeAccountId: snapshot.stripeAccountId,
            stripeChargesEnabled: snapshot.stripeChargesEnabled,
            stripePayoutsEnabled: snapshot.stripePayoutsEnabled,
            stripeOnboardingStatus: snapshot.stripeOnboardingStatus,
            stripeRequirementsDue: snapshot.stripeRequirementsDue,
          },
          eq(schema.brands.id, snapshot.id),
        )
        .execute();
      for (const event of events) {
        const envelope =
          event.kind === 'BrandPaymentAccountLinked'
            ? buildEnvelope(
                BrandPaymentAccountLinkedV1,
                {
                  brandId: event.brandId,
                  tenantId: event.tenantId,
                  stripeAccountId: event.stripeAccountId,
                  accountType: event.accountType,
                },
                { tenantId: event.tenantId, occurredAt: event.occurredAt },
              )
            : buildEnvelope(
                BrandPaymentCapabilitiesAppliedV1,
                {
                  brandId: event.brandId,
                  tenantId: event.tenantId,
                  chargesEnabled: event.chargesEnabled,
                  payoutsEnabled: event.payoutsEnabled,
                  onboardingStatus: event.onboardingStatus,
                },
                { tenantId: event.tenantId, occurredAt: event.occurredAt },
              );
        await appendToOutbox(tx, { envelope, aggregateId: snapshot.id });
      }
    });
  }
}
