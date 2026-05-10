import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { BrandId, BrandSlug, BrandTheme, TenantId } from '@resto/domain';
import { and, eq, inArray, like, ne, or } from 'drizzle-orm';
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
    // Host resolution runs BEFORE tenant context is bound (middleware
    // uses this to derive the tenant from the host) — must stay
    // `withoutTenant`. Inlines the brand row fetch so it does not call
    // out to `findById` (which is `withTenant`).
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
    // Slug-only lookups also run pre-tenant (middleware fallback path
    // when a brand subdomain identifies the brand without a tenant
    // header). `withoutTenant` is correct here.
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
    // Called only after a tenant context is bound (operator flows).
    // Defense-in-depth: rely on RLS to scope the read to the active
    // tenant (RES-173).
    return this.db.withTenant(async (tx) => {
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
    // Operator-facing lookup. RLS scopes the row to the active tenant —
    // a forged brand-id from another tenant resolves to `null` even if
    // the request happens to know a real id (RES-173).
    return this.db.withTenant(async (tx) => {
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
    if (brandIds?.length === 0) return [];
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

  findActiveSlugsByPrefix(prefix: string): Promise<readonly string[]> {
    // Global slug lookup (RES-180): slug uniqueness is platform-wide
    // (`brands_slug_active_uq`). Runs `withoutTenant` because the
    // suggestion logic must see slugs across ALL tenants — RLS-scoped
    // read would only show the current tenant's brands and miss
    // collisions in others. The `LIKE` pattern escape covers `_` and
    // `%` so slugs with those characters never match unintendedly,
    // even though the `BrandSlug` regex forbids them today.
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
        );
      return rows.map((r) => r.slug);
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
