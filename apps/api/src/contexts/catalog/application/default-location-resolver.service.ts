import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import type { TenantId } from '@resto/domain';
import { and, asc, eq } from 'drizzle-orm';
import { NoLocationForBrandError } from '../domain/errors';

@Injectable()
export class DefaultLocationResolverService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async resolveForBrand(brandId: string, tenantId: TenantId): Promise<string> {
    const locationId = await this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped
        .selectFrom(
          schema.locations,
          and(eq(schema.locations.brandId, brandId), eq(schema.locations.status, 'active')),
        )
        .orderBy(asc(schema.locations.createdAt), asc(schema.locations.id));
      return rows[0]?.id ?? null;
    });

    if (locationId === null) {
      throw new NoLocationForBrandError(brandId, tenantId);
    }
    return locationId;
  }
}
