#!/usr/bin/env tsx
/**
 * D-23 / 2FA recovery CLI.
 *
 * Usage:
 *   pnpm exec tsx scripts/reset-2fa.ts --user-id <UUID> [--dry-run]
 *
 * Reads DATABASE_URL from env (or .env file in the project root).
 * Requires the `resto_app` role or equivalent write-capable DSN.
 *
 * See infra/runbooks/2fa-recovery.md for the full procedure.
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../packages/db/src/schema/index';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const userIdFlag = args.indexOf('--user-id');
const dryRun = args.includes('--dry-run');

if (userIdFlag === -1 || !args[userIdFlag + 1]) {
  process.stderr.write('Usage: tsx scripts/reset-2fa.ts --user-id <UUID> [--dry-run]\n');
  process.exit(1);
}

const userId = args[userIdFlag + 1];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  process.stderr.write(`Invalid UUID: ${userId}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  process.stderr.write('DATABASE_URL env var is required.\n');
  process.exit(1);
}

const pg = postgres(databaseUrl, { max: 1 });
const db = drizzle(pg, { schema });

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------
const targetUser = await db
  .select({
    id: schema.user.id,
    email: schema.user.email,
    twoFactorEnabled: schema.user.twoFactorEnabled,
  })
  .from(schema.user)
  .where(eq(schema.user.id, userId))
  .limit(1);

if (targetUser.length === 0) {
  process.stderr.write(`User not found: ${userId}\n`);
  await pg.end();
  process.exit(1);
}

const target = targetUser[0];
const sessionRows = await db
  .select({ id: schema.session.id })
  .from(schema.session)
  .where(eq(schema.session.userId, userId));

process.stdout.write('\n--- 2FA Reset Preview ---\n');
process.stdout.write(`User ID:       ${target.id}\n`);
process.stdout.write(`Email:         ${target.email}\n`);
process.stdout.write(`2FA enabled:   ${String(target.twoFactorEnabled)}\n`);
process.stdout.write(
  `Sessions:      ${sessionRows.length.toString()} active session(s) will be revoked\n`,
);
process.stdout.write('\nActions that will execute (single transaction):\n');
process.stdout.write('  1. UPDATE user SET twoFactorEnabled = false\n');
process.stdout.write('  2. DELETE FROM two_factor WHERE userId = ?\n');
process.stdout.write('  3. DELETE FROM session WHERE userId = ?\n');
process.stdout.write('  4. INSERT INTO audit_log (action = identity.two_factor_reset_manual)\n');
process.stdout.write('\n');

if (dryRun) {
  process.stdout.write('[dry-run] No changes applied.\n');
  await pg.end();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`Confirm reset for ${target.email}? (y/N): `);
rl.close();

if (answer.trim().toLowerCase() !== 'y') {
  process.stdout.write('Aborted.\n');
  await pg.end();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Execute (single transaction)
// ---------------------------------------------------------------------------
const actorEmail = process.env['RESET_ACTOR_EMAIL'] ?? 'founder';
const resetAt = new Date().toISOString();

await db.transaction(async (tx) => {
  await tx.update(schema.user).set({ twoFactorEnabled: false }).where(eq(schema.user.id, userId));

  await tx.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));

  await tx.delete(schema.session).where(eq(schema.session.userId, userId));

  await tx.insert(schema.auditLog).values({
    id: randomUUID(),
    tenantId: null,
    actorKind: 'system',
    actorSubject: `founder:manual:${actorEmail}`,
    action: 'identity.two_factor_reset_manual',
    targetType: 'user',
    targetId: userId,
    payload: { reason: 'lost-device-recovery', resetAt },
    occurredAt: sql`now()`,
  });
});

process.stdout.write(`\nReset complete. Audit row written for userId=${userId} at ${resetAt}\n`);
await pg.end();
