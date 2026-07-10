import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { and, asc, eq } from 'drizzle-orm';

@Injectable()
export class InitialLocationDrizzleRepository {
  private readonly logger = new Logger(InitialLocationDrizzleRepository.name);

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async resolveForUserInBrand(userId: string, brandId: string): Promise<string | null> {
    try {
      const tenantId = await this.db.withoutTenant(
        'identity.initial-location-pin: resolve tenant for brand',
        async (tx) => {
          const rows = await tx
            .select({ tenantId: schema.brands.tenantId })
            .from(schema.brands)
            .where(eq(schema.brands.id, brandId))
            .limit(1);
          return rows[0]?.tenantId ?? null;
        },
      );
      if (!tenantId) return null;

      return await this.db.withTenantId(tenantId, async (tx) => {
        const memberRows = await tx
          .select({ role: schema.member.role })
          .from(schema.member)
          .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, tenantId)))
          .limit(1);
        if (memberRows[0]?.role === 'owner') return null;

        const scopedRows = await tx
          .select({ id: schema.locations.id })
          .from(schema.memberLocationScope)
          .innerJoin(schema.member, eq(schema.memberLocationScope.memberId, schema.member.id))
          .innerJoin(
            schema.locations,
            and(
              eq(schema.memberLocationScope.locationId, schema.locations.id),
              eq(schema.locations.status, 'active'),
              eq(schema.locations.brandId, brandId),
            ),
          )
          .where(eq(schema.member.userId, userId))
          .orderBy(asc(schema.locations.createdAt), asc(schema.locations.id));

        if (scopedRows.length !== 1) return null;
        return scopedRows[0]?.id ?? null;
      });
    } catch (err) {
      this.logger.error({ err, userId, brandId }, 'resolveForUserInBrand failed');
      return null;
    }
  }
}
