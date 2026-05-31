import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RequireActiveTenantGuard } from '../../shared/auth/require-active-tenant.guard';
import { ArchiveCategoryService } from './application/archive-category.service';
import { ArchiveItemService } from './application/archive-item.service';
import { DelayedPublishService } from './application/delayed-publish.service';
import { GetDraftDiffService } from './application/get-draft-diff.service';
import { GetItemService } from './application/get-item.service';
import { GetMenuItemService } from './application/get-menu-item.service';
import { GetModifierGroupService } from './application/get-modifier-group.service';
import { GetPhotoUploadUrlService } from './application/get-photo-upload-url.service';
import { GetPublishedMenuService } from './application/get-published-menu.service';
import { GetStopListService } from './application/get-stop-list.service';
import { ListCategoriesService } from './application/list-categories.service';
import { ListItemsService } from './application/list-items.service';
import { ListModifierGroupsService } from './application/list-modifier-groups.service';
import { PublishMenuService } from './application/publish-menu.service';
import { StopListService } from './application/stop-list.service';
import { UpsertCategoryService } from './application/upsert-category.service';
import { UpsertItemService } from './application/upsert-item.service';
import { UpsertItemSizeService } from './application/upsert-item-size.service';
import { UpsertModifierGroupService } from './application/upsert-modifier-group.service';
import { UpsertModifierOptionService } from './application/upsert-modifier-option.service';
import {
  CATALOG_CACHE_PORT,
  CATALOG_REPOSITORY,
  IMAGE_URL_PORT,
  MENU_VERSION_PORT,
} from './domain/ports';
import { CatalogDrizzleRepository } from './infrastructure/catalog-drizzle.repository';
import { RedisCatalogCacheAdapter } from './infrastructure/redis-catalog-cache.adapter';
import { S3SignedImageUrlAdapter } from './infrastructure/s3-signed-image-url.adapter';
import { InternalCatalogController } from './interfaces/http/internal-catalog.controller';
import { PublicMenuController } from './interfaces/http/public-menu.controller';

@Module({
  imports: [TenancyModule],
  controllers: [PublicMenuController, InternalCatalogController],
  providers: [
    { provide: CATALOG_REPOSITORY, useClass: CatalogDrizzleRepository },
    RedisCatalogCacheAdapter,
    { provide: CATALOG_CACHE_PORT, useExisting: RedisCatalogCacheAdapter },
    { provide: MENU_VERSION_PORT, useExisting: RedisCatalogCacheAdapter },
    { provide: IMAGE_URL_PORT, useClass: S3SignedImageUrlAdapter },
    ListCategoriesService,
    ListItemsService,
    GetItemService,
    ListModifierGroupsService,
    GetModifierGroupService,
    GetStopListService,
    GetDraftDiffService,
    ArchiveCategoryService,
    ArchiveItemService,
    GetPhotoUploadUrlService,
    GetPublishedMenuService,
    GetMenuItemService,
    UpsertCategoryService,
    UpsertItemService,
    UpsertItemSizeService,
    UpsertModifierGroupService,
    UpsertModifierOptionService,
    StopListService,
    DelayedPublishService,
    PublishMenuService,
    RequireActiveTenantGuard,
  ],
})
export class CatalogModule {}
