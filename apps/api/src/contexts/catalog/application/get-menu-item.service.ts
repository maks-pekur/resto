import { Inject, Injectable } from '@nestjs/common';
import { requireBrandContext, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { PublishedMenuItem } from '../domain/published-menu';
import { MenuItemNotFoundError } from '../domain/errors';

@Injectable()
export class GetMenuItemService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(itemId: string): Promise<PublishedMenuItem> {
    // Fail fast with a clean error if the request resolved no tenant —
    // matches the peer pattern in `get-published-menu.service.ts` and
    // avoids a generic 500 from `db.withTenant` deep in the repo (RES-176).
    requireTenantContext();
    const item = await this.repo.findPublishedItem(itemId, requireBrandContext());
    if (!item) throw new MenuItemNotFoundError(itemId);
    return item;
  }
}
