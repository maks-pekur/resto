import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { Permissions, RequireBrand, RequiresTenantContext } from '../../../../shared/auth';
import {
  CategoryListResponseDto,
  DraftDiffResponseDto,
  ItemDetailResponseDto,
  ItemListResponseDto,
  ModifierGroupDetailResponseDto,
  ModifierGroupListResponseDto,
  PhotoUploadUrlInputDto,
  PhotoUploadUrlResponseDto,
  ReorderCategoriesInputDto,
  ReorderCategoriesResponseDto,
  SetItemModifierGroupsInputDto,
  StopItemInputDto,
  StopListResponseDto,
  UpsertCategoryInputDto,
  UpsertItemInputDto,
  UpsertItemSizeInputDto,
  UpsertModifierGroupInputDto,
  UpsertModifierOptionInputDto,
} from '../../application/dto';
import { ArchiveCategoryService } from '../../application/archive-category.service';
import { ArchiveItemService } from '../../application/archive-item.service';
import { DelayedPublishService } from '../../application/delayed-publish.service';
import { GetDraftDiffService } from '../../application/get-draft-diff.service';
import { GetItemService } from '../../application/get-item.service';
import { GetModifierGroupService } from '../../application/get-modifier-group.service';
import { GetPhotoUploadUrlService } from '../../application/get-photo-upload-url.service';
import { GetStopListService } from '../../application/get-stop-list.service';
import { ListCategoriesService } from '../../application/list-categories.service';
import { ListItemsService } from '../../application/list-items.service';
import { ListModifierGroupsService } from '../../application/list-modifier-groups.service';
import { ReorderCategoriesService } from '../../application/reorder-categories.service';
import { StopListService } from '../../application/stop-list.service';
import { UpsertCategoryService } from '../../application/upsert-category.service';
import { UpsertItemService } from '../../application/upsert-item.service';
import { SetItemModifierGroupsService } from '../../application/set-item-modifier-groups.service';
import { UpsertItemSizeService } from '../../application/upsert-item-size.service';
import { UpsertModifierGroupService } from '../../application/upsert-modifier-group.service';
import { UpsertModifierOptionService } from '../../application/upsert-modifier-option.service';
import type { ItemStatusFilter } from '../../domain/ports';
import { wrapWith } from '../../../../shared/api/wrap';
import { mapCatalogError } from './error-mapping';

const wrap = wrapWith(mapCatalogError);

const IdResponseSchema = z.object({ id: z.string().uuid() });
class IdResponseDto extends createZodDto(IdResponseSchema) {}

const PublishScheduledResponseSchema = z.object({
  scheduled: z.boolean(),
  cancelAfterMs: z.number().int().nonnegative(),
});
class PublishScheduledResponseDto extends createZodDto(PublishScheduledResponseSchema) {}

const PublishCancelResponseSchema = z.object({ cancelled: z.boolean() });
class PublishCancelResponseDto extends createZodDto(PublishCancelResponseSchema) {}

@ApiTags('catalog')
@Controller('v1/catalog')
@RequiresTenantContext()
export class CatalogController {
  constructor(
    @Inject(UpsertCategoryService) private readonly upsertCategory: UpsertCategoryService,
    @Inject(UpsertItemService) private readonly upsertItem: UpsertItemService,
    @Inject(UpsertModifierGroupService)
    private readonly upsertModifierGroup: UpsertModifierGroupService,
    @Inject(UpsertModifierOptionService)
    private readonly upsertModifierOption: UpsertModifierOptionService,
    @Inject(UpsertItemSizeService) private readonly upsertItemSize: UpsertItemSizeService,
    @Inject(SetItemModifierGroupsService)
    private readonly setItemModifierGroups: SetItemModifierGroupsService,
    @Inject(StopListService) private readonly stopList: StopListService,
    @Inject(DelayedPublishService) private readonly delayed: DelayedPublishService,
    @Inject(ArchiveCategoryService) private readonly archiveCategoryService: ArchiveCategoryService,
    @Inject(ArchiveItemService) private readonly archiveItemService: ArchiveItemService,
    @Inject(GetPhotoUploadUrlService)
    private readonly getPhotoUploadUrlService: GetPhotoUploadUrlService,
    @Inject(ReorderCategoriesService)
    private readonly reorderCategoriesService: ReorderCategoriesService,
    @Inject(ListCategoriesService) private readonly listCategoriesService: ListCategoriesService,
    @Inject(ListItemsService) private readonly listItemsService: ListItemsService,
    @Inject(GetItemService) private readonly getItemService: GetItemService,
    @Inject(ListModifierGroupsService)
    private readonly listModifierGroupsService: ListModifierGroupsService,
    @Inject(GetModifierGroupService)
    private readonly getModifierGroupService: GetModifierGroupService,
    @Inject(GetStopListService) private readonly getStopListService: GetStopListService,
    @Inject(GetDraftDiffService) private readonly getDraftDiffService: GetDraftDiffService,
  ) {}

  @Post('categories')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @RequireBrand()
  @ApiBody({ type: UpsertCategoryInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  category(
    @Body(new RestoZodValidationPipe(UpsertCategoryInputDto)) input: UpsertCategoryInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertCategory.execute(input));
  }

  @Post('categories/reorder')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @RequireBrand()
  @ApiBody({ type: ReorderCategoriesInputDto })
  @ApiOkResponse({ type: ReorderCategoriesResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  reorderCategories(
    @Body(new RestoZodValidationPipe(ReorderCategoriesInputDto)) input: ReorderCategoriesInputDto,
  ): Promise<ReorderCategoriesResponseDto> {
    return wrap(() => this.reorderCategoriesService.execute(input));
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @RequireBrand()
  @ApiBody({ type: UpsertItemInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  item(
    @Body(new RestoZodValidationPipe(UpsertItemInputDto)) input: UpsertItemInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertItem.execute(input));
  }

  @Post('modifier-groups')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @RequireBrand()
  @ApiBody({ type: UpsertModifierGroupInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  modifierGroup(
    @Body(new RestoZodValidationPipe(UpsertModifierGroupInputDto))
    input: UpsertModifierGroupInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertModifierGroup.execute(input));
  }

  @Post('modifier-options')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @RequireBrand()
  @ApiBody({ type: UpsertModifierOptionInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  modifierOption(
    @Body(new RestoZodValidationPipe(UpsertModifierOptionInputDto))
    input: UpsertModifierOptionInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertModifierOption.execute(input));
  }

  @Post('item-sizes')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @RequireBrand()
  @ApiBody({ type: UpsertItemSizeInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  itemSize(
    @Body(new RestoZodValidationPipe(UpsertItemSizeInputDto)) input: UpsertItemSizeInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertItemSize.execute(input));
  }

  @Put('items/:id/modifier-groups')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @RequireBrand()
  @ApiBody({ type: SetItemModifierGroupsInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  setItemModifierGroupsRoute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new RestoZodValidationPipe(SetItemModifierGroupsInputDto))
    input: SetItemModifierGroupsInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() =>
      this.setItemModifierGroups.execute({ itemId: id, modifierGroupIds: input.modifierGroupIds }),
    );
  }

  @Post('stop-list')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @RequireBrand()
  @ApiBody({ type: StopItemInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  stopListAdd(
    @Body(new RestoZodValidationPipe(StopItemInputDto)) input: StopItemInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.stopList.stop(input));
  }

  @Delete('stop-list/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ menu: ['update'] })
  @RequireBrand()
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  stopListRemove(@Param('itemId', ParseUUIDPipe) itemId: string): Promise<void> {
    return wrap(() => this.stopList.unstop(itemId));
  }

  @Post('photo-upload-url')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiBody({ type: PhotoUploadUrlInputDto })
  @ApiOkResponse({ type: PhotoUploadUrlResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  photoUploadUrl(
    @Body(new RestoZodValidationPipe(PhotoUploadUrlInputDto)) input: PhotoUploadUrlInputDto,
  ): Promise<PhotoUploadUrlResponseDto> {
    return wrap(() => this.getPhotoUploadUrlService.execute(input));
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiOkResponse({ type: PublishScheduledResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  publishMenu(): Promise<PublishScheduledResponseDto> {
    return wrap(() => {
      const ctx = requireTenantContext();
      const tenantId = TenantId.parse(ctx.tenantId);
      this.delayed.schedule(tenantId);
      return Promise.resolve({
        scheduled: true,
        cancelAfterMs: DelayedPublishService.CANCEL_WINDOW_MS,
      });
    });
  }

  @Delete('publish')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
  @ApiOkResponse({ type: PublishCancelResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  cancelPublishMenu(): Promise<PublishCancelResponseDto> {
    return wrap(() => {
      const ctx = requireTenantContext();
      const tenantId = TenantId.parse(ctx.tenantId);
      const cancelled = this.delayed.cancelPending(tenantId);
      return Promise.resolve({ cancelled });
    });
  }

  @Patch('categories/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ menu: ['delete'] })
  @RequireBrand()
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  archiveCategory(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return wrap(() => this.archiveCategoryService.execute(id));
  }

  @Patch('items/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ menu: ['delete'] })
  @RequireBrand()
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  archiveItem(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return wrap(() => this.archiveItemService.execute(id));
  }

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['read'] })
  @RequireBrand()
  @ApiOkResponse({ type: CategoryListResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  listCategories(@Query('parentId') parentId?: string): Promise<CategoryListResponseDto> {
    const filter: string | null | undefined =
      parentId === undefined ? undefined : parentId === '' ? null : parentId;
    return wrap(() => this.listCategoriesService.execute({ parentId: filter }));
  }

  @Get('items')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['read'] })
  @RequireBrand()
  @ApiOkResponse({ type: ItemListResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  listItems(
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ItemListResponseDto> {
    const allowed: readonly ItemStatusFilter[] = [
      'all',
      'active',
      'draft',
      'published',
      'archived',
    ];
    const statusFilter: ItemStatusFilter | undefined =
      status && (allowed as readonly string[]).includes(status)
        ? (status as ItemStatusFilter)
        : undefined;
    const parsedLimit = limit !== undefined ? Number.parseInt(limit, 10) : undefined;
    const parsedOffset = offset !== undefined ? Number.parseInt(offset, 10) : undefined;
    return wrap(() =>
      this.listItemsService.execute({
        ...(statusFilter !== undefined ? { status: statusFilter } : {}),
        categoryId: categoryId ?? null,
        q: q ?? null,
        ...(parsedLimit !== undefined && Number.isFinite(parsedLimit)
          ? { limit: parsedLimit }
          : {}),
        ...(parsedOffset !== undefined && Number.isFinite(parsedOffset)
          ? { offset: parsedOffset }
          : {}),
      }),
    );
  }

  @Get('items/:id')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['read'] })
  @RequireBrand()
  @ApiOkResponse({ type: ItemDetailResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  getItem(@Param('id', ParseUUIDPipe) id: string): Promise<ItemDetailResponseDto> {
    return wrap(() => this.getItemService.execute({ id }));
  }

  @Get('modifier-groups')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['read'] })
  @RequireBrand()
  @ApiOkResponse({ type: ModifierGroupListResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  listModifierGroups(): Promise<ModifierGroupListResponseDto> {
    return wrap(() => this.listModifierGroupsService.execute());
  }

  @Get('modifier-groups/:id')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['read'] })
  @RequireBrand()
  @ApiOkResponse({ type: ModifierGroupDetailResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  getModifierGroup(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ModifierGroupDetailResponseDto> {
    return wrap(() => this.getModifierGroupService.execute({ id }));
  }

  @Get('stop-list')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['read'] })
  @RequireBrand()
  @ApiOkResponse({ type: StopListResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  listStopList(): Promise<StopListResponseDto> {
    return wrap(() => this.getStopListService.execute());
  }

  @Get('draft-diff')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['read'] })
  @ApiOkResponse({ type: DraftDiffResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  getDraftDiff(): Promise<DraftDiffResponseDto> {
    return wrap(() => this.getDraftDiffService.execute());
  }
}
