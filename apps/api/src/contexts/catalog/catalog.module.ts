import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { GetMenuItemService } from './application/get-menu-item.service';
import { GetPublishedMenuService } from './application/get-published-menu.service';
import { PublishMenuService } from './application/publish-menu.service';
import { UpsertCategoryService } from './application/upsert-category.service';
import { UpsertItemService } from './application/upsert-item.service';
import { UpsertModifierService } from './application/upsert-modifier.service';
import { CATALOG_CACHE_PORT, CATALOG_REPOSITORY, MENU_VERSION_PORT } from './domain/ports';
import { CatalogDrizzleRepository } from './infrastructure/catalog-drizzle.repository';
import { RedisCatalogCacheAdapter } from './infrastructure/redis-catalog-cache.adapter';
import { InternalCatalogController } from './interfaces/http/internal-catalog.controller';
import { PublicMenuController } from './interfaces/http/public-menu.controller';

@Module({
  imports: [IdentityModule, TenancyModule],
  controllers: [PublicMenuController, InternalCatalogController],
  providers: [
    { provide: CATALOG_REPOSITORY, useClass: CatalogDrizzleRepository },
    RedisCatalogCacheAdapter,
    { provide: CATALOG_CACHE_PORT, useExisting: RedisCatalogCacheAdapter },
    { provide: MENU_VERSION_PORT, useExisting: RedisCatalogCacheAdapter },
    GetPublishedMenuService,
    GetMenuItemService,
    UpsertCategoryService,
    UpsertItemService,
    UpsertModifierService,
    PublishMenuService,
  ],
})
export class CatalogModule {}
