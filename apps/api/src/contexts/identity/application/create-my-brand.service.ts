import { Inject, Injectable } from '@nestjs/common';
import { runInTenantContext } from '@resto/db';
import type { BrandSlug, TenantId } from '@resto/domain';
import { ProvisionBrandService } from '../../tenancy/application/provision-brand.service';
import type { BrandSnapshot } from '../../tenancy/domain/brand.aggregate';
import { BrandSlugConflictError } from '../domain/brand-errors';

export interface CreateMyBrandInput {
  readonly tenantId: TenantId;
  readonly slug: BrandSlug;
  readonly displayName: string;
}

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Postgres unique-index names that signal a brand-slug collision —
 * either the per-tenant `(tenant_id, slug)` index or the global active-slug
 * index. Any other 23505 on the brand-create path is mapped through
 * unchanged so callers see the real cause instead of a misleading
 * `BrandSlugConflictError`. Constraint names match
 * `packages/db/src/schema/brands.ts`.
 */
const BRAND_SLUG_CONSTRAINTS: ReadonlySet<string> = new Set([
  'brands_tenant_slug_uq',
  'brands_slug_active_uq',
]);

@Injectable()
export class CreateMyBrandService {
  constructor(@Inject(ProvisionBrandService) private readonly provision: ProvisionBrandService) {}

  async execute(input: CreateMyBrandInput): Promise<BrandSnapshot> {
    return runInTenantContext({ tenantId: input.tenantId }, async () => {
      try {
        return await this.provision.execute({
          tenantId: input.tenantId,
          slug: input.slug,
          displayName: input.displayName,
        });
      } catch (err) {
        if (isBrandSlugConflict(err)) {
          throw new BrandSlugConflictError(input.slug);
        }
        throw err;
      }
    });
  }
}

/**
 * Walk the `.cause` chain (with cycle guard) looking for a Postgres
 * 23505 unique-violation tagged with one of the brand-slug constraint
 * names. Drizzle 0.45 wraps the original `PostgresError` inside a
 * `DrizzleQueryError` on `.cause`, so the walk is required.
 *
 * Other 23505s (e.g. a future `brand_default_settings` insert with its
 * own unique key) propagate unchanged.
 */
const isBrandSlugConflict = (err: unknown): boolean => {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (typeof cur === 'object' && cur !== null && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as {
      code?: string;
      constraint_name?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (e.code === PG_UNIQUE_VIOLATION) {
      const constraint = e.constraint_name ?? e.constraint;
      if (constraint !== undefined && BRAND_SLUG_CONSTRAINTS.has(constraint)) {
        return true;
      }
    }
    cur = e.cause;
  }
  return false;
};
