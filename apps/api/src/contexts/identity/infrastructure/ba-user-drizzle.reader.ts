import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { user as userTable, member as memberTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from './better-auth/auth-db';
import type { BaUserReader, BaUserRecord } from '../application/ports/ba-user-reader.port';

@Injectable()
export class BaUserDrizzleReader implements BaUserReader {
  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async findUserByEmail(email: string): Promise<BaUserRecord | null> {
    const rows = await this.authDb.db
      .select({ id: userTable.id, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  async findOwnerByOrganization(organizationId: string): Promise<BaUserRecord | null> {
    const rows = await this.authDb.db
      .select({ id: userTable.id, email: userTable.email })
      .from(memberTable)
      .innerJoin(userTable, eq(memberTable.userId, userTable.id))
      .where(and(eq(memberTable.organizationId, organizationId), eq(memberTable.role, 'owner')))
      .limit(1);
    return rows[0] ?? null;
  }
}
