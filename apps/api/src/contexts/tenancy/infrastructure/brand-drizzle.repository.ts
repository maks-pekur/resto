import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb, TenantScopedRepository } from '@resto/db';
import { BrandId, BrandSlug, BrandTheme, TenantId } from '@resto/domain';
import { and, asc, eq, inArray, like, ne, or } from 'drizzle-orm';
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
        })
        .from(schema.brands)
        .where(eq(schema.brands.slug, slug))
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
}
