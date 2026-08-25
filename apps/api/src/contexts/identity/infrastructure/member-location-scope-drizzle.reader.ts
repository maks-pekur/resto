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
            eq(schema.member.tenantId, input.tenantId),
          ),
        ),
    );
    if (rows.length === 0) return null;
    return rows.map((r) => r.locationId);
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

  // D-01 (phase 10.2): locations lost their brand dimension when brand merged 1:1 into
  // tenant, so the query below no longer filters by it — every active tenant location
  // is in scope now (further narrowed to membership scope for non-owners), a
  // deliberate widening of the pre-merge result set (F-28: tenant-scope reproduces
  // exactly what brand-scope used to mean, since one tenant is one former brand).
  async findPinnableLocations(input: {
    userId: string;
    tenantId: TenantId;
    isOwner: boolean;
  }): Promise<readonly PinnableLocation[]> {
    if (input.isOwner) {
      return this.db.withTenant(async (tx) =>
        tx
          .select({
            id: schema.locations.id,
            name: schema.locations.name,
            slug: schema.locations.slug,
          })
          .from(schema.locations)
          .where(
            and(
              eq(schema.locations.tenantId, input.tenantId),
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
          slug: schema.locations.slug,
        })
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
            eq(schema.member.tenantId, input.tenantId),
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
