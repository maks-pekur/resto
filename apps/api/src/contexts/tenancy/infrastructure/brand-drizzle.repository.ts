import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { BrandId, BrandSlug, BrandTheme, TenantId } from '@resto/domain';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { BrandSnapshot } from '../domain/brand.aggregate';
import type { BrandRepository } from '../domain/ports';

const ROW_TO_SNAPSHOT = (row: {
  id: string;
  tenantId: string;
  slug: string;
  displayName: string;
  status: string;
  theme: unknown;
}): BrandSnapshot => ({
  id: BrandId.parse(row.id),
  tenantId: TenantId.parse(row.tenantId),
  slug: row.slug,
  displayName: row.displayName,
  status: row.status as BrandSnapshot['status'],
  theme: row.theme === null || row.theme === undefined ? null : BrandTheme.parse(row.theme),
});

@Injectable()
export class BrandDrizzleRepository implements BrandRepository {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  findByDomainHost(host: string): Promise<BrandSnapshot | null> {
    return this.db.withoutTenant('tenancy.brands.findByDomainHost', async (tx) => {
      const rows = await tx
        .select({
          id: schema.brandDomains.brandId,
        })
        .from(schema.brandDomains)
        .where(eq(schema.brandDomains.domain, host.toLowerCase()))
        .limit(1);
      const brandId = rows[0]?.id;
      if (!brandId) return null;
      return this.findById(BrandId.parse(brandId));
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
        })
        .from(schema.brands)
        .where(eq(schema.brands.slug, slug))
        .limit(1);
      const row = rows[0];
      return row ? ROW_TO_SNAPSHOT(row) : null;
    });
  }

  findByTenantAndSlug(tenantId: TenantId, slug: BrandSlug): Promise<BrandSnapshot | null> {
    return this.db.withoutTenant('tenancy.brands.findByTenantAndSlug', async (tx) => {
      const rows = await tx
        .select({
          id: schema.brands.id,
          tenantId: schema.brands.tenantId,
          slug: schema.brands.slug,
          displayName: schema.brands.displayName,
          status: schema.brands.status,
          theme: schema.brands.theme,
        })
        .from(schema.brands)
        .where(and(eq(schema.brands.tenantId, tenantId), eq(schema.brands.slug, slug)))
        .limit(1);
      const row = rows[0];
      return row ? ROW_TO_SNAPSHOT(row) : null;
    });
  }

  findById(id: BrandId): Promise<BrandSnapshot | null> {
    return this.db.withoutTenant('tenancy.brands.findById', async (tx) => {
      const rows = await tx
        .select({
          id: schema.brands.id,
          tenantId: schema.brands.tenantId,
          slug: schema.brands.slug,
          displayName: schema.brands.displayName,
          status: schema.brands.status,
          theme: schema.brands.theme,
        })
        .from(schema.brands)
        .where(eq(schema.brands.id, id))
        .limit(1);
      const row = rows[0];
      return row ? ROW_TO_SNAPSHOT(row) : null;
    });
  }

  async listForTenant(
    tenantId: TenantId,
    brandIds?: readonly string[],
  ): Promise<readonly BrandSnapshot[]> {
    if (brandIds !== undefined && brandIds.length === 0) return [];
    return this.db.withTenant(async (tx) => {
      const whereClauses = [
        eq(schema.brands.tenantId, tenantId),
        ne(schema.brands.status, 'erased'),
      ];
      if (brandIds !== undefined) {
        whereClauses.push(inArray(schema.brands.id, [...brandIds]));
      }
      const rows = await tx
        .select({
          id: schema.brands.id,
          tenantId: schema.brands.tenantId,
          slug: schema.brands.slug,
          displayName: schema.brands.displayName,
          status: schema.brands.status,
          theme: schema.brands.theme,
        })
        .from(schema.brands)
        .where(and(...whereClauses))
        .orderBy(schema.brands.displayName);
      return rows.map(ROW_TO_SNAPSHOT);
    });
  }

  async save(snapshot: BrandSnapshot, primaryDomainHostname: string): Promise<void> {
    await this.db.withTenant(async (tx) => {
      await tx
        .insert(schema.brands)
        .values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          slug: snapshot.slug,
          displayName: snapshot.displayName,
          status: snapshot.status,
        })
        .onConflictDoNothing({ target: [schema.brands.tenantId, schema.brands.slug] });

      await tx
        .insert(schema.brandDomains)
        .values({
          brandId: snapshot.id,
          tenantId: snapshot.tenantId,
          domain: primaryDomainHostname,
          kind: 'subdomain',
          isPrimary: true,
        })
        .onConflictDoNothing({ target: schema.brandDomains.domain });
    });
  }
}
