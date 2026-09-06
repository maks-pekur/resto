import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RequireActiveTenantGuard } from '../../shared/auth/require-active-tenant.guard';
import { ArchiveCategoryService } from './application/categories/archive-category.service';
import { ArchiveItemService } from './application/items/archive-item.service';
import { ArchiveModifierOptionService } from './application/modifiers/archive-modifier-option.service';
import { DefaultLocationResolverService } from './application/default-location-resolver.service';
import { DelayedPublishService } from './application/publishing/delayed-publish.service';
import { GetDraftDiffService } from './application/publishing/get-draft-diff.service';
import { GetItemService } from './application/items/get-item.service';
import { GetMenuAvailabilityService } from './application/availability/get-menu-availability.service';
import { GetMenuItemService } from './application/items/get-menu-item.service';
import { GetModifierGroupService } from './application/modifiers/get-modifier-group.service';
import { GetModifierOptionUsageService } from './application/modifiers/get-modifier-option-usage.service';
import { GetOptionStopListService } from './application/availability/get-option-stop-list.service';
import { GetPhotoUploadUrlService } from './application/get-photo-upload-url.service';
import { GetPublishedMenuService } from './application/publishing/get-published-menu.service';
import { GetStopListAggregateService } from './application/availability/get-stop-list-aggregate.service';
import { GetStopListService } from './application/availability/get-stop-list.service';
import { ListCategoriesService } from './application/categories/list-categories.service';
import { ListItemsService } from './application/items/list-items.service';
import { ListModifierGroupsService } from './application/modifiers/list-modifier-groups.service';
import { ListModifierOptionsService } from './application/modifiers/list-modifier-options.service';
import { OptionStopListService } from './application/availability/option-stop-list.service';
import { PublishMenuService } from './application/publishing/publish-menu.service';
import { ReorderCategoriesService } from './application/categories/reorder-categories.service';
import { SetGroupModifierOptionsService } from './application/modifiers/set-group-modifier-options.service';
import { SetItemCompositionService } from './application/items/set-item-composition.service';
import { SetItemModifierOptionsService } from './application/modifiers/set-item-modifier-options.service';
import { StopListService } from './application/availability/stop-list.service';
import { UpsertCategoryService } from './application/categories/upsert-category.service';
import { UpsertItemService } from './application/items/upsert-item.service';
import { UpsertItemSizeService } from './application/items/upsert-item-size.service';
import { UpsertModifierGroupService } from './application/modifiers/upsert-modifier-group.service';
import { SetItemModifierGroupsService } from './application/modifiers/set-item-modifier-groups.service';
import { UpsertModifierOptionService } from './application/modifiers/upsert-modifier-option.service';
import {
  CATALOG_REPOSITORY,
  IMAGE_URL_PORT,
  MENU_VERSION_PORT,
  STOP_VERSION_PORT,
} from './domain/ports';
import { CatalogDrizzleRepository } from './infrastructure/catalog-drizzle.repository';
import { PostgresMenuVersionAdapter } from './infrastructure/postgres-menu-version.adapter';
import { S3SignedImageUrlAdapter } from './infrastructure/s3-signed-image-url.adapter';
import { CatalogController } from './interfaces/http/catalog.controller';
import { PublicMenuController } from './interfaces/http/public-menu.controller';

@Module({
  imports: [TenancyModule],
  controllers: [PublicMenuController, CatalogController],
  providers: [
    { provide: CATALOG_REPOSITORY, useClass: CatalogDrizzleRepository },
    PostgresMenuVersionAdapter,
    { provide: MENU_VERSION_PORT, useExisting: PostgresMenuVersionAdapter },
    { provide: STOP_VERSION_PORT, useExisting: PostgresMenuVersionAdapter },
    { provide: IMAGE_URL_PORT, useClass: S3SignedImageUrlAdapter },
    ListCategoriesService,
    ListItemsService,
    GetItemService,
    ListModifierGroupsService,
    GetModifierGroupService,
    GetStopListService,
    GetStopListAggregateService,
    GetDraftDiffService,
    ArchiveCategoryService,
    ArchiveItemService,
    GetPhotoUploadUrlService,
    GetPublishedMenuService,
    GetMenuItemService,
    DefaultLocationResolverService,
    GetMenuAvailabilityService,
    UpsertCategoryService,
    ReorderCategoriesService,
    UpsertItemService,
    UpsertItemSizeService,
    SetItemModifierGroupsService,
    UpsertModifierGroupService,
    UpsertModifierOptionService,
    StopListService,
    DelayedPublishService,
    PublishMenuService,
    ListModifierOptionsService,
    ArchiveModifierOptionService,
    GetModifierOptionUsageService,
    SetGroupModifierOptionsService,
    SetItemModifierOptionsService,
    SetItemCompositionService,
    OptionStopListService,
    GetOptionStopListService,
    RequireActiveTenantGuard,
  ],
  exports: [CATALOG_REPOSITORY, MENU_VERSION_PORT, DefaultLocationResolverService],
})
export class CatalogModule {}
