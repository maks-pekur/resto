import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { TenantId } from '@resto/domain';
import { and, eq } from 'drizzle-orm';
import type {
  MemberLocationScopeReader,
  PinnableLocation,
} from '../application/ports/member-location-scope-reader.port';

@Injectable()
export class MemberLocationScopeDrizzleReader implements MemberLocationScopeReader {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async findLocationScopeForMember(input: {
    userId: string;
    tenantId: TenantId;
  }): Promise<readonly string[] | null> {
    const rows = await this.db.withTenant(async (tx) =>
      tx
        .select({ locationId: schema.memberLocationScope.locationId })
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
            eq(schema.memberLocationScope.tenantId, input.tenantId),
            eq(schema.member.userId, input.userId),
            eq(schema.member.organizationId, input.tenantId),
          ),
        ),
    );
    if (rows.length === 0) return null;
    return rows.map((r) => r.locationId);
  }

  async findReachableBrandsForMember(input: {
    userId: string;
    tenantId: TenantId;
  }): Promise<readonly string[] | null> {
    const rows = await this.db.withTenant(async (tx) =>
      tx
        .selectDistinct({ brandId: schema.brands.id })
        .from(schema.memberLocationScope)
        .innerJoin(schema.member, eq(schema.memberLocationScope.memberId, schema.member.id))
        .innerJoin(
          schema.locations,
          and(
            eq(schema.memberLocationScope.locationId, schema.locations.id),
            eq(schema.locations.status, 'active'),
          ),
        )
        .innerJoin(schema.brands, eq(schema.locations.brandId, schema.brands.id))
        .where(
          and(
            eq(schema.memberLocationScope.tenantId, input.tenantId),
            eq(schema.member.userId, input.userId),
            eq(schema.member.organizationId, input.tenantId),
          ),
        ),
    );
    if (rows.length === 0) return null;
    return rows.map((r) => r.brandId);
  }

  async findRoleForMemberAtLocation(input: {
    userId: string;
    locationId: string;
  }): Promise<string | null> {
    const rows = await this.db.withTenant(async (tx) =>
      tx
        .select({ role: schema.memberLocationScope.role })
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
            eq(schema.memberLocationScope.locationId, input.locationId),
            eq(schema.member.userId, input.userId),
          ),
        )
        .limit(1),
    );
    return rows[0]?.role ?? null;
  }

  async findPinnableLocations(input: {
    userId: string;
    tenantId: TenantId;
    brandId: string;
    isOwner: boolean;
  }): Promise<readonly PinnableLocation[]> {
    if (input.isOwner) {
      return this.db.withTenant(async (tx) =>
        tx
          .select({
            id: schema.locations.id,
            name: schema.locations.name,
            brandId: schema.locations.brandId,
          })
          .from(schema.locations)
          .where(
            and(
              eq(schema.locations.tenantId, input.tenantId),
              eq(schema.locations.brandId, input.brandId),
              eq(schema.locations.status, 'active'),
            ),
          ),
      );
    }

    return this.db.withTenant(async (tx) =>
      tx
        .select({
          id: schema.locations.id,
          name: schema.locations.name,
          brandId: schema.locations.brandId,
        })
        .from(schema.memberLocationScope)
        .innerJoin(schema.member, eq(schema.memberLocationScope.memberId, schema.member.id))
        .innerJoin(
          schema.locations,
          and(
            eq(schema.memberLocationScope.locationId, schema.locations.id),
            eq(schema.locations.status, 'active'),
            eq(schema.locations.brandId, input.brandId),
          ),
        )
        .where(
          and(
            eq(schema.memberLocationScope.tenantId, input.tenantId),
            eq(schema.member.userId, input.userId),
            eq(schema.member.organizationId, input.tenantId),
          ),
        ),
    );
  }

  async listLocationRolesForMember(input: {
    memberId: string;
    tenantId: TenantId;
  }): Promise<readonly { locationId: string; role: string }[]> {
    const rows = await this.db.withTenant(async (tx) =>
      tx
        .select({
          locationId: schema.memberLocationScope.locationId,
          role: schema.memberLocationScope.role,
        })
        .from(schema.memberLocationScope)
        .innerJoin(
          schema.locations,
          and(
            eq(schema.memberLocationScope.locationId, schema.locations.id),
            eq(schema.locations.status, 'active'),
          ),
        )
        .where(
          and(
            eq(schema.memberLocationScope.memberId, input.memberId),
            eq(schema.memberLocationScope.tenantId, input.tenantId),
          ),
        ),
    );
    return rows.filter((r): r is { locationId: string; role: string } => r.role !== null);
  }
}
