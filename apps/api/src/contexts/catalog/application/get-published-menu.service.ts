import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantId } from '@resto/domain';
import {
  CATALOG_CACHE_PORT,
  CATALOG_REPOSITORY,
  MENU_VERSION_PORT,
  type CatalogCachePort,
  type CatalogRepository,
  type MenuVersionPort,
} from '../domain/ports';
import type { PublishedMenu } from '../domain/published-menu';

const CACHE_TTL_SECONDS = 300;

@Injectable()
export class GetPublishedMenuService {
  private readonly logger = new Logger(GetPublishedMenuService.name);

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(CATALOG_CACHE_PORT) private readonly cache: CatalogCachePort,
    @Inject(MENU_VERSION_PORT) private readonly versions: MenuVersionPort,
  ) {}

  async execute(rawTenantId: string): Promise<PublishedMenu> {
    const tenantId = TenantId.parse(rawTenantId);
    const version = await this.versions.current(tenantId);

    const cached = await this.cache.get(tenantId, version);
    if (cached) {
      return cached;
    }

    const menu = await this.repo.loadPublishedMenu(tenantId, version);
    // Fire-and-forget cache write — a failed write must not delay the
    // response; the next request will retry.
    void this.cache.set(menu, CACHE_TTL_SECONDS).catch((err: unknown) => {
      this.logger.warn({ err }, 'Cache write failed.');
    });
    return menu;
  }
}
