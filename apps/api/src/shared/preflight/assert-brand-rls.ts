import { Logger } from '@nestjs/common';
import postgres from 'postgres';

const logger = new Logger('bootstrap');

export class BrandRlsNotInstalledError extends Error {
  constructor(public readonly detail: string) {
    super(
      `Brand RLS (D-14) is not installed on the database: ${detail}. ` +
        'Run `pnpm db:migrate` (migration 0058) to install app_bind_brand and the brand isolation policies.',
    );
    this.name = 'BrandRlsNotInstalledError';
  }
}

/**
 * Verify that the SECURITY DEFINER wrapper `app_bind_brand(text,boolean)` exists
 * and a brand isolation policy is present on the `orders` table.
 *
 * Mirrors `assertTenantLockInstalled` — called at boot before controllers mount
 * so a deploy that missed migration 0058 fails fast instead of silently serving
 * cross-brand rows (T-08.2-04).
 */
export const assertBrandRlsInstalled = async (url: string): Promise<void> => {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const fnRows = await client<{ exists: boolean }[]>`
      SELECT to_regprocedure('public.app_bind_brand(text,boolean)') IS NOT NULL AS exists
    `;
    if (!fnRows[0]?.exists) {
      throw new BrandRlsNotInstalledError('app_bind_brand(text,boolean) is missing');
    }
    const policyRows = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'orders'
        AND policyname = 'orders_brand_iso'
    `;
    if ((policyRows[0]?.count ?? 0) === 0) {
      throw new BrandRlsNotInstalledError('orders_brand_iso policy is missing on orders table');
    }
    logger.log('Database preflight passed: app_bind_brand installed and brand RLS policy active.');
  } finally {
    await client.end({ timeout: 5 });
  }
};
