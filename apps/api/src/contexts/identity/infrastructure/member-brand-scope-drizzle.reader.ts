import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { TenantId } from '@resto/domain';
import { and, eq } from 'drizzle-orm';
import type { MemberBrandScopeReader } from '../application/ports/member-brand-scope-reader.port';

@Injectable()
export class MemberBrandScopeDrizzleReader implements MemberBrandScopeReader {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async findBrandScopeForMember(input: {
    userId: string;
    tenantId: TenantId;
  }): Promise<readonly string[] | null> {
    const rows = await this.db.withTenant(async (tx) =>
      tx
        .select({ brandId: schema.memberBrandScope.brandId })
        .from(schema.memberBrandScope)
        .innerJoin(schema.member, eq(schema.memberBrandScope.memberId, schema.member.id))
        .where(
          and(
            eq(schema.memberBrandScope.tenantId, input.tenantId),
            eq(schema.member.userId, input.userId),
            eq(schema.member.organizationId, input.tenantId),
          ),
        ),
    );
    if (rows.length === 0) return null;
    return rows.map((r) => r.brandId);
  }
}
