#!/usr/bin/env tsx
/**
 * D-07 brand slug collision preflight gate.
 *
 * Run this script BEFORE shipping the /{brand} route rename (Plan-04)
 * to detect any existing brand whose slug collides with a reserved admin
 * route word. Script gate only — not migration-enforced.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-brand-slug-collisions.ts
 *
 * Reads DATABASE_URL from env (uses the resto_app role; RLS bypassed via
 * withoutTenant so the query sees across all tenants).
 * Exits 0 if clean, non-zero if any colliding brand is found.
 */
import { inArray } from 'drizzle-orm';
import { createDb } from '../packages/db/src/client';
import * as schema from '../packages/db/src/schema/index';
import { RESERVED_SLUGS } from '../packages/domain/src/reserved-slugs';

const main = async (): Promise<void> => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    process.stderr.write('DATABASE_URL env var is required.\n');
    process.exit(1);
  }

  const db = createDb({ url: databaseUrl, maxConnections: 1 });

  const collisions = await db.withoutTenant(
    'D-07 brand slug collision preflight audit',
    async (tx) => {
      return tx
        .select({
          id: schema.brands.id,
          slug: schema.brands.slug,
          status: schema.brands.status,
        })
        .from(schema.brands)
        .where(inArray(schema.brands.slug, RESERVED_SLUGS as unknown as string[]));
    },
  );

  await db.close();

  if (collisions.length === 0) {
    process.stdout.write('D-07 preflight: no brand slug collisions found.\n');
    process.exit(0);
  }

  process.stdout.write(
    `D-07 preflight: ${collisions.length.toString()} brand slug collision(s) found — resolve before shipping the /{brand} route rename:\n`,
  );
  for (const row of collisions) {
    process.stdout.write(`  id=${row.id}  slug="${row.slug}"  status=${row.status}\n`);
  }
  process.exit(1);
};

main().catch((err: unknown) => {
  process.stderr.write(
    `D-07 preflight failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
