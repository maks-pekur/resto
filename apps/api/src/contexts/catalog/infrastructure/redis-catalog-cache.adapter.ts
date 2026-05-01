import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import type { TenantId } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { CatalogCachePort, MenuVersionPort } from '../domain/ports';
import type { PublishedMenu } from '../domain/published-menu';

const VERSION_KEY = (tenantId: string): string => `catalog:menu:version:${tenantId}`;
const MENU_KEY = (tenantId: string, version: number): string =>
  `catalog:menu:${tenantId}:${version.toString()}`;

/**
 * Redis-backed cache for the public catalog read path.
 *
 * Two collaborating responsibilities packed into one adapter (the
 * Redis client lifecycle is shared):
 *
 * - `MenuVersionPort` — monotonic per-tenant counter; publish bumps it
 *   and old menu keys become unreachable until TTL evicts them.
 * - `CatalogCachePort` — `(tenantId, version)`-keyed cached projections.
 *
 * On boot or Redis outage the adapter degrades to a no-op: reads return
 * null (forcing a DB query), version returns 1, bump returns Date.now()-
 * derived counter so writes keep a monotone version locally.
 */
@Injectable()
export class RedisCatalogCacheAdapter
  implements CatalogCachePort, MenuVersionPort, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisCatalogCacheAdapter.name);
  private readonly client: Redis | null;

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {
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
    if (!this.client) return Date.now();
    try {
      return await this.client.incr(VERSION_KEY(tenantId));
    } catch (err) {
      this.logger.warn({ err }, 'Failed to bump menu version — falling back to wall clock.');
      return Date.now();
    }
  }

  async get(tenantId: TenantId, version: number): Promise<PublishedMenu | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(MENU_KEY(tenantId, version));
      return raw ? (JSON.parse(raw) as PublishedMenu) : null;
    } catch (err) {
      this.logger.warn({ err }, 'Failed to read catalog cache.');
      return null;
    }
  }

  async set(menu: PublishedMenu, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(
        MENU_KEY(menu.tenantId, menu.version),
        JSON.stringify(menu),
        'EX',
        ttlSeconds,
      );
    } catch (err) {
      this.logger.warn({ err }, 'Failed to write catalog cache.');
    }
  }
}
