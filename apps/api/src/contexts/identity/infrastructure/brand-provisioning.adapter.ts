import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import { BrandQueriesService } from '../../tenancy/application/brand-queries.service';
import { ProvisionBrandService } from '../../tenancy/application/provision-brand.service';
import type {
  BrandProvisioningPort,
  IdentityBrandView,
  ProvisionIdentityBrandInput,
} from '../application/ports/brand-provisioning.port';
import { BrandDisplayNameTakenError, BrandSlugConflictError } from '../domain/brand-errors';

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

/**
 * Postgres unique-index for the per-tenant case-insensitive
 * `display_name` constraint (RES-182). Detected separately from the
 * slug constraints so we can surface a different domain error and let
 * the controller render a distinct 409 code.
 */
const BRAND_DISPLAY_NAME_CONSTRAINT = 'brands_tenant_display_name_active_uq';

@Injectable()
export class BrandProvisioningAdapter implements BrandProvisioningPort {
  constructor(
    @Inject(BrandQueriesService) private readonly queries: BrandQueriesService,
    @Inject(ProvisionBrandService) private readonly provisioner: ProvisionBrandService,
  ) {}

  async listForTenant(
    tenantId: TenantId,
    brandIds?: readonly string[],
  ): Promise<readonly IdentityBrandView[]> {
    const snapshots = await this.queries.listForTenant(tenantId, brandIds);
    return snapshots.map((snapshot) => ({
      id: snapshot.id,
      slug: snapshot.slug,
      displayName: snapshot.displayName,
    }));
  }

  async findActiveSlugsByPrefix(prefix: string): Promise<readonly string[]> {
    return this.queries.findActiveSlugsByPrefix(prefix);
  }

  async provision(input: ProvisionIdentityBrandInput): Promise<IdentityBrandView> {
    try {
      const snapshot = await this.provisioner.execute({
        tenantId: input.tenantId,
        slug: input.slug,
        displayName: input.displayName,
      });
      return {
        id: snapshot.id,
        slug: snapshot.slug,
        displayName: snapshot.displayName,
      };
    } catch (err) {
      // Slug conflicts checked first — slug is the primary, name is the
      // secondary surface. Order matters when the same INSERT fails
      // both: the operator gets the slug error and tries again with a
      // new slug; if name is also a dupe, they retry once more.
      if (matchesUniqueConstraint(err, BRAND_SLUG_CONSTRAINTS)) {
        throw new BrandSlugConflictError(input.slug);
      }
      if (matchesUniqueConstraint(err, new Set([BRAND_DISPLAY_NAME_CONSTRAINT]))) {
        throw new BrandDisplayNameTakenError(input.displayName);
      }
      throw err;
    }
  }
}

/**
 * Walk the `.cause` chain (with cycle guard) looking for a Postgres
 * 23505 unique-violation tagged with one of the supplied constraint
 * names. Drizzle 0.45 wraps the original `PostgresError` inside a
 * `DrizzleQueryError` on `.cause`, so the walk is required.
 *
 * Returning `true` means the caller can confidently translate the error
 * into a domain conflict; other 23505s propagate unchanged so we never
 * mis-label an unrelated unique violation.
 */
const matchesUniqueConstraint = (err: unknown, names: ReadonlySet<string>): boolean => {
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
      if (constraint !== undefined && names.has(constraint)) {
        return true;
      }
    }
    cur = e.cause;
  }
  return false;
};
