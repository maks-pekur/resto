import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { PublishedMenuItem } from '../domain/published-menu';
import { MenuItemNotFoundError } from '../domain/errors';

@Injectable()
export class GetMenuItemService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(itemId: string): Promise<PublishedMenuItem> {
    const item = await this.repo.findPublishedItem(itemId);
    if (!item) throw new MenuItemNotFoundError(itemId);
    return item;
  }
}
