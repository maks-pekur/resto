import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { member as memberTable, user as userTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';

export interface MemberView {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly role: string;
}

export interface ListMembersInput {
  readonly tenantId: string;
}

@Injectable()
export class ListMembersService {
  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async execute(input: ListMembersInput): Promise<{ members: MemberView[] }> {
    const members = await this.authDb.db
      .select({ id: memberTable.id, userId: memberTable.userId, role: memberTable.role })
      .from(memberTable)
      .where(eq(memberTable.tenantId, input.tenantId));

    if (members.length === 0) return { members: [] };

    const userIds = members.map((m) => m.userId);
    const users = await this.authDb.db
      .select({ id: userTable.id, email: userTable.email })
      .from(userTable)
      .where(inArray(userTable.id, userIds));

    const userMap = new Map(users.map((u) => [u.id, u.email]));

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: userMap.get(m.userId) ?? '',
        role: m.role,
      })),
    };
  }
}
