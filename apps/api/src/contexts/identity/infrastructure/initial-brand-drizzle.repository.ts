import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { and, asc, eq } from 'drizzle-orm';

@Injectable()
export class InitialBrandDrizzleRepository {
  private readonly logger = new Logger(InitialBrandDrizzleRepository.name);

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async resolveForUserInTenant(userId: string, tenantId: string): Promise<string | null> {
    try {
      return await this.db.withTenantId(tenantId, async (tx) => {
        const memberRows = await tx
          .select({ role: schema.member.role })
          .from(schema.member)
          .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, tenantId)))
          .limit(1);
        const role = memberRows[0]?.role;
        if (role === 'owner') {
          const rows = await tx
            .select({ id: schema.brands.id })
            .from(schema.brands)
            .where(eq(schema.brands.tenantId, tenantId))
            .orderBy(asc(schema.brands.createdAt), asc(schema.brands.id))
            .limit(1);
          return rows[0]?.id ?? null;
        }
        const scopedRows = await tx
          .select({ id: schema.brands.id })
          .from(schema.memberLocationScope)
          .innerJoin(
            schema.locations,
            and(
              eq(schema.memberLocationScope.locationId, schema.locations.id),
              eq(schema.locations.status, 'active'),
            ),
          )
          .innerJoin(schema.brands, eq(schema.locations.brandId, schema.brands.id))
          .innerJoin(
            schema.member,
            and(
              eq(schema.member.id, schema.memberLocationScope.memberId),
              eq(schema.member.userId, userId),
            ),
          )
          .where(eq(schema.memberLocationScope.tenantId, tenantId))
          .orderBy(asc(schema.brands.createdAt), asc(schema.brands.id))
          .limit(1);
        return scopedRows[0]?.id ?? null;
      });
    } catch (err) {
      this.logger.error(
        {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          userId,
          tenantId,
        },
        'resolveForUserInTenant failed',
      );
      return null;
    }
  }
}
