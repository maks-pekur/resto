import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import type { TenantId } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { CatalogCachePort } from '../domain/ports';
import type { PublishedMenu } from '../domain/published-menu';

const MENU_KEY = (tenantId: string, version: number, brandId: string): string =>
  `catalog:menu:${tenantId}:${brandId}:${version.toString()}`;

@Injectable()
export class RedisCatalogCacheAdapter implements CatalogCachePort, OnApplicationShutdown {
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

  async get(tenantId: TenantId, version: number, brandId: string): Promise<PublishedMenu | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(MENU_KEY(tenantId, version, brandId));
      return raw ? (JSON.parse(raw) as PublishedMenu) : null;
    } catch (err) {
      this.logger.warn({ err }, 'Failed to read catalog cache.');
      return null;
    }
  }

  async set(menu: PublishedMenu, ttlSeconds: number, brandId: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(
        MENU_KEY(menu.tenantId, menu.version, brandId),
        JSON.stringify(menu),
        'EX',
        ttlSeconds,
      );
    } catch (err) {
      this.logger.warn({ err }, 'Failed to write catalog cache.');
    }
  }

  async invalidate(tenantId: TenantId, version: number, brandId: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(MENU_KEY(tenantId, version, brandId));
    } catch (err) {
      this.logger.warn({ tenantId, version, err }, 'Failed to invalidate catalog cache key.');
    }
  }
}
