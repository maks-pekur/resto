import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type { TenantId } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { CatalogCachePort, MenuVersionPort } from '../domain/ports';
import type { PublishedMenu } from '../domain/published-menu';

const VERSION_KEY = (tenantId: string): string => `catalog:menu:version:${tenantId}`;
const MENU_KEY = (tenantId: string, version: number, brandId: string | null): string =>
  `catalog:menu:${tenantId}:${brandId ?? 'no-brand'}:${version.toString()}`;

/**
 * Redis-backed cache for the public catalog read path.
 *
 * Two collaborating responsibilities packed into one adapter (the
 * Redis client lifecycle is shared):
 *
 * - `MenuVersionPort` — monotonic per-tenant counter; publish bumps it
 *   and old menu keys become unreachable until TTL evicts them. When
 *   Redis is unavailable (no `REDIS_URL` or a runtime error) the adapter
 *   falls back to `nextval('menu_versions_seq')` in Postgres (CAT-10 /
 *   D-4a-07) — a global sequence, but each version is still a unique
 *   cache-bust key.
 * - `CatalogCachePort` — `(tenantId, version)`-keyed cached projections.
 *   `invalidate` lets non-publish writes (stop-list toggles) flush the
 *   current cache entry without bumping the version (D-4a-10 / Pattern 2
 *   Option B).
 */
@Injectable()
export class RedisCatalogCacheAdapter
  implements CatalogCachePort, MenuVersionPort, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisCatalogCacheAdapter.name);
  private readonly client: Redis | null;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  ) {
    if (!env.REDIS_URL) {
      this.logger.warn('REDIS_URL is not set — catalog cache disabled.');
      this.client = null;
      return;
    }
    this.client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.client.on('error', (err: Error) => {
      this.logger.warn({ err }, 'Redis connection error — cache will fall back to DB reads.');
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  async current(tenantId: TenantId): Promise<number> {
    if (!this.client) return 1;
    try {
      const raw = await this.client.get(VERSION_KEY(tenantId));
      if (!raw) return 1;
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    } catch (err) {
      this.logger.warn({ err }, 'Failed to read menu version — defaulting to 1.');
      return 1;
    }
  }

  async bump(tenantId: TenantId): Promise<number> {
    if (!this.client) {
      return this.#nextvalBump(tenantId);
    }
    try {
      return await this.client.incr(VERSION_KEY(tenantId));
    } catch (err) {
      this.logger.warn({ tenantId, err }, 'Redis unavailable — falling back to menu_versions_seq.');
      return this.#nextvalBump(tenantId);
    }
  }

  // @withoutTenant-allowlist — RES-252 I-1: nextval is a platform-level
  // sequence (no tenant_id column on `menu_versions_seq`); there is no
  // tenant to bind, and the operation is the documented fallback for
  // Redis outage (D-4a-07 / CAT-10).
  async #nextvalBump(tenantId: TenantId): Promise<number> {
    const result = await this.db.withoutTenant(
      'menu version nextval fallback — Redis unavailable',
      async (tx) => tx.execute<{ v: string }>(sql`SELECT nextval('menu_versions_seq') AS v`),
    );
    const raw = (result as readonly { v: string }[])[0]?.v;
    if (!raw) {
      this.logger.warn(
        { tenantId },
        'nextval(menu_versions_seq) returned no row — defaulting to wall clock.',
      );
      return Date.now();
    }
    return Number(raw);
  }

  async get(
    tenantId: TenantId,
    version: number,
    brandId?: string | null,
  ): Promise<PublishedMenu | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(MENU_KEY(tenantId, version, brandId ?? null));
      return raw ? (JSON.parse(raw) as PublishedMenu) : null;
    } catch (err) {
      this.logger.warn({ err }, 'Failed to read catalog cache.');
      return null;
    }
  }

  async set(menu: PublishedMenu, ttlSeconds: number, brandId?: string | null): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(
        MENU_KEY(menu.tenantId, menu.version, brandId ?? null),
        JSON.stringify(menu),
        'EX',
        ttlSeconds,
      );
    } catch (err) {
      this.logger.warn({ err }, 'Failed to write catalog cache.');
    }
  }

  async invalidate(tenantId: TenantId, version: number, brandId?: string | null): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(MENU_KEY(tenantId, version, brandId ?? null));
    } catch (err) {
      this.logger.warn({ tenantId, version, err }, 'Failed to invalidate catalog cache key.');
    }
  }
}
