import { Inject, Injectable } from '@nestjs/common';
import { TenantId } from '@resto/domain';
import {
  CATALOG_REPOSITORY,
  MENU_VERSION_PORT,
  type CatalogRepository,
  type MenuVersionPort,
} from '../domain/ports';
import type { PublishedMenu } from '../domain/published-menu';

@Injectable()
export class GetPublishedMenuService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(MENU_VERSION_PORT) private readonly versions: MenuVersionPort,
  ) {}

  async execute(rawTenantId: string): Promise<PublishedMenu> {
    const tenantId = TenantId.parse(rawTenantId);
    const version = await this.versions.current(tenantId);
    return this.repo.loadPublishedMenu(tenantId, version);
  }
}
