import { defineConfig } from 'drizzle-kit';

/**
 * `generate` (offline diff) does not need a live database — it only reads
 * the schema and emits SQL. `migrate`, `push`, and `studio` do need it,
 * and will fail fast on the placeholder URL below.
 */
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://placeholder@localhost/placeholder';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
  casing: 'snake_case',
  migrations: {
    table: 'drizzle_migrations',
    schema: 'public',
  },
});
