import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import type { TenantId } from '@resto/domain';
import { eq } from 'drizzle-orm';
import type { MenuVersionPort, StopVersionPort } from '../domain/ports';

@Injectable()
export class PostgresMenuVersionAdapter implements MenuVersionPort, StopVersionPort {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async current(_tenantId: TenantId): Promise<number> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped.selectFrom(schema.catalogMenuVersion).limit(1);
      return rows[0]?.menuVersion ?? 1;
    });
  }

  async currentStop(locationId: string): Promise<number> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped
        .selectFrom(
          schema.catalogLocationStopVersion,
          eq(schema.catalogLocationStopVersion.locationId, locationId),
        )
        .limit(1);
      return rows[0]?.stopVersion ?? 1;
    });
  }
}
