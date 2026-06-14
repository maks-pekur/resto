import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { member as memberTable, session as sessionTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';

@Injectable()
export class RevokeUserSessionsService {
  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async revokeAllForTenant(tenantId: string): Promise<{ revokedSessionsCount: number }> {
    const members = await this.authDb.db
      .select({ userId: memberTable.userId })
      .from(memberTable)
      .where(eq(memberTable.organizationId, tenantId));
    const userIds = members.map((m) => m.userId);
    if (userIds.length === 0) {
      return { revokedSessionsCount: 0 };
    }
    const deleted = await this.authDb.db
      .delete(sessionTable)
      .where(
        and(inArray(sessionTable.userId, userIds), eq(sessionTable.activeOrganizationId, tenantId)),
      )
      .returning({ id: sessionTable.id });
    return { revokedSessionsCount: deleted.length };
  }
}
