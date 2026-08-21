import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';

export const createAuthDb = (authDatabaseUrl: string): Sql =>
  postgres(authDatabaseUrl, { max: 1, prepare: false });

export const findUserIdByEmail = async (sql: Sql, email: string): Promise<string | null> => {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM "user" WHERE email = ${email} LIMIT 1
  `;
  return rows[0]?.id ?? null;
};

export const findMemberId = async (
  sql: Sql,
  tenantId: string,
  userId: string,
): Promise<string | null> => {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM member WHERE tenant_id = ${tenantId} AND user_id = ${userId} LIMIT 1
  `;
  return rows[0]?.id ?? null;
};

export const insertStaffMember = async (
  sql: Sql,
  tenantId: string,
  userId: string,
): Promise<string> => {
  const id = randomUUID();
  await sql`
    INSERT INTO member (id, tenant_id, user_id, role, created_at)
    VALUES (${id}, ${tenantId}, ${userId}, 'staff', now())
  `;
  return id;
};
