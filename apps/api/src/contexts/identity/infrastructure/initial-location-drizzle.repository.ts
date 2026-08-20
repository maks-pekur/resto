import { Inject, Injectable, Logger } from '@nestjs/common';
import { getTenantContext, schema, TenantAwareDb, type RestoTx } from '@resto/db';
import { and, asc, eq } from 'drizzle-orm';

@Injectable()
export class InitialLocationDrizzleRepository {
  private readonly logger = new Logger(InitialLocationDrizzleRepository.name);

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  // D-01 (phase 10.2): the historical brand entity merged 1:1 into tenant and its
  // satellite table was dropped — the second positional argument (still supplied by
  // the unrewritten BA hook at identity-core.module.ts:302/auth.config.ts:428) IS the
  // tenant id now. No lookup table remains to translate one into the other.
  async resolveForUserInBrand(userId: string, tenantId: string): Promise<string | null> {
    try {
      const boundTenantId = getTenantContext()?.tenantId;
      if (boundTenantId) {
        return await this.db.withTenant((tx) => this.#resolveScoped(tx, userId, boundTenantId));
      }

      return await this.db.withTenantId(tenantId, (tx) =>
        this.#resolveScoped(tx, userId, tenantId),
      );
    } catch (err) {
      this.logger.error({ err, userId, tenantId }, 'resolveForUserInBrand failed');
      return null;
    }
  }

  async #resolveScoped(tx: RestoTx, userId: string, tenantId: string): Promise<string | null> {
    const memberRows = await tx
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.userId, userId), eq(schema.member.tenantId, tenantId)))
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
        ),
      )
      .where(
        and(
          eq(schema.member.userId, userId),
          eq(schema.member.tenantId, tenantId),
          eq(schema.memberLocationScope.tenantId, tenantId),
        ),
      )
      .orderBy(asc(schema.locations.createdAt), asc(schema.locations.id));

    if (scopedRows.length !== 1) return null;
    return scopedRows[0]?.id ?? null;
  }
}
