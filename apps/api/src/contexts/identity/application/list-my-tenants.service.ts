import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { member as memberTable, tenants as tenantsTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';

export interface TenantMembershipView {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly status: string;
}

export interface ListMyTenantsInput {
  readonly userId: string;
}

export interface ListMyTenantsResult {
  readonly tenants: readonly TenantMembershipView[];
}

/**
 * Post-merge replacement for the brand-scoped listing (D-07/D-40): there is
 * no scope dimension left inside a tenant, so this is a plain
 * membership lookup — every tenant `userId` has a `member` row for. Backs
 * the sign-in picker (D-02/D-17), which needs this to run before any
 * tenant is bound to the session.
 */
@Injectable()
export class ListMyTenantsService {
  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async execute(input: ListMyTenantsInput): Promise<ListMyTenantsResult> {
    const memberships = await this.authDb.db
      .select({ tenantId: memberTable.tenantId })
      .from(memberTable)
      .where(eq(memberTable.userId, input.userId));

    if (memberships.length === 0) return { tenants: [] };

    const tenantIds = memberships.map((m) => m.tenantId);
    const rows = await this.authDb.db
      .select({
        id: tenantsTable.id,
        slug: tenantsTable.slug,
        displayName: tenantsTable.displayName,
        status: tenantsTable.status,
      })
      .from(tenantsTable)
      .where(inArray(tenantsTable.id, tenantIds));

    return {
      tenants: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        displayName: r.displayName,
        status: r.status,
      })),
    };
  }
}
