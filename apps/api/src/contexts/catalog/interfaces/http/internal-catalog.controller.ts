import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { InternalTokenGuard } from '../../../../shared/api/internal-token.guard';
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
import { UpsertItemSizeService } from '../../application/upsert-item-size.service';
import { UpsertModifierGroupService } from '../../application/upsert-modifier-group.service';
import { UpsertModifierOptionService } from '../../application/upsert-modifier-option.service';
import type { ItemStatusFilter } from '../../domain/ports';
import { Public } from '../../../../shared/auth';
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

const PublishCancelResponseSchema = z.object({
  cancelled: z.boolean(),
});
class PublishCancelResponseDto extends createZodDto(PublishCancelResponseSchema) {}

@ApiTags('catalog/internal')
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal/v1/catalog')
export class InternalCatalogController {
  // CAT-06: must mirror DelayedPublishService.#DELAY_MS so the response documents the Undo window.
  private static readonly PUBLISH_CANCEL_AFTER_MS = 5_000;

  constructor(
    @Inject(UpsertCategoryService) private readonly upsertCategory: UpsertCategoryService,
    @Inject(UpsertItemService) private readonly upsertItem: UpsertItemService,
    @Inject(UpsertModifierGroupService)
    private readonly upsertModifierGroup: UpsertModifierGroupService,
    @Inject(UpsertModifierOptionService)
    private readonly upsertModifierOption: UpsertModifierOptionService,
    @Inject(UpsertItemSizeService)
    private readonly upsertItemSize: UpsertItemSizeService,
    @Inject(StopListService) private readonly stopList: StopListService,
    @Inject(DelayedPublishService) private readonly delayed: DelayedPublishService,
    @Inject(ListCategoriesService) private readonly listCategoriesService: ListCategoriesService,
    @Inject(ListItemsService) private readonly listItemsService: ListItemsService,
    @Inject(GetItemService) private readonly getItemService: GetItemService,
    @Inject(ListModifierGroupsService)
    private readonly listModifierGroupsService: ListModifierGroupsService,
    @Inject(GetModifierGroupService)
    private readonly getModifierGroupService: GetModifierGroupService,
    @Inject(GetStopListService) private readonly getStopListService: GetStopListService,
    @Inject(GetDraftDiffService) private readonly getDraftDiffService: GetDraftDiffService,
    @Inject(ArchiveCategoryService) private readonly archiveCategoryService: ArchiveCategoryService,
    @Inject(ArchiveItemService) private readonly archiveItemService: ArchiveItemService,
    @Inject(GetPhotoUploadUrlService)
    private readonly getPhotoUploadUrlService: GetPhotoUploadUrlService,
    @Inject(ReorderCategoriesService)
    private readonly reorderCategoriesService: ReorderCategoriesService,
  ) {}

  @Post('categories')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: UpsertCategoryInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  category(
    @Body(new RestoZodValidationPipe(UpsertCategoryInputDto)) input: UpsertCategoryInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertCategory.execute(input));
  }

  @Post('categories/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: ReorderCategoriesInputDto })
  @ApiOkResponse({ type: ReorderCategoriesResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  reorderCategories(
    @Body(new RestoZodValidationPipe(ReorderCategoriesInputDto))
    input: ReorderCategoriesInputDto,
  ): Promise<ReorderCategoriesResponseDto> {
    return wrap(() => this.reorderCategoriesService.execute(input));
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: UpsertItemInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  item(
    @Body(new RestoZodValidationPipe(UpsertItemInputDto)) input: UpsertItemInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertItem.execute(input));
  }

  @Post('modifier-groups')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: UpsertModifierGroupInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  modifierGroup(
    @Body(new RestoZodValidationPipe(UpsertModifierGroupInputDto))
    input: UpsertModifierGroupInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertModifierGroup.execute(input));
  }

  @Post('modifier-options')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: UpsertModifierOptionInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  modifierOption(
    @Body(new RestoZodValidationPipe(UpsertModifierOptionInputDto))
    input: UpsertModifierOptionInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertModifierOption.execute(input));
  }

  @Post('item-sizes')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: UpsertItemSizeInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  itemSize(
    @Body(new RestoZodValidationPipe(UpsertItemSizeInputDto))
    input: UpsertItemSizeInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertItemSize.execute(input));
  }

  @Post('stop-list')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: StopItemInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  stopListAdd(
    @Body(new RestoZodValidationPipe(StopItemInputDto)) input: StopItemInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.stopList.stop(input));
  }

  @Delete('stop-list/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  stopListRemove(@Param('itemId') itemId: string): Promise<void> {
    return wrap(() => this.stopList.unstop(itemId));
  }

  @Post('photo-upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: PhotoUploadUrlInputDto })
  @ApiOkResponse({ type: PhotoUploadUrlResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  photoUploadUrl(
    @Body(new RestoZodValidationPipe(PhotoUploadUrlInputDto)) input: PhotoUploadUrlInputDto,
  ): Promise<PhotoUploadUrlResponseDto> {
    return wrap(() => this.getPhotoUploadUrlService.execute(input));
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PublishScheduledResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  publishMenu(): Promise<PublishScheduledResponseDto> {
    return wrap(() => {
      const ctx = requireTenantContext();
      const tenantId = TenantId.parse(ctx.tenantId);
      this.delayed.schedule(tenantId);
      return Promise.resolve({
        scheduled: true,
        cancelAfterMs: InternalCatalogController.PUBLISH_CANCEL_AFTER_MS,
      });
    });
  }

  @Delete('publish')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PublishCancelResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  cancelPublishMenu(): Promise<PublishCancelResponseDto> {
    return wrap(() => {
      const ctx = requireTenantContext();
      const tenantId = TenantId.parse(ctx.tenantId);
      const cancelled = this.delayed.cancelPending(tenantId);
      return Promise.resolve({ cancelled });
    });
  }

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CategoryListResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  listCategories(@Query('parentId') parentId?: string): Promise<CategoryListResponseDto> {
    // No query param → all categories (admin tree view). Empty string → top-level only. UUID → children of that parent.
    const filter: string | null | undefined =
      parentId === undefined ? undefined : parentId === '' ? null : parentId;
    return wrap(() => this.listCategoriesService.execute({ parentId: filter }));
  }

  @Get('items')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ItemListResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
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
  @ApiOkResponse({ type: ItemDetailResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  getItem(@Param('id') id: string): Promise<ItemDetailResponseDto> {
    return wrap(() => this.getItemService.execute({ id }));
  }

  @Get('modifier-groups')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ModifierGroupListResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  listModifierGroups(): Promise<ModifierGroupListResponseDto> {
    return wrap(() => this.listModifierGroupsService.execute());
  }

  @Get('modifier-groups/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ModifierGroupDetailResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  getModifierGroup(@Param('id') id: string): Promise<ModifierGroupDetailResponseDto> {
    return wrap(() => this.getModifierGroupService.execute({ id }));
  }

  @Get('stop-list')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StopListResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  listStopList(): Promise<StopListResponseDto> {
    return wrap(() => this.getStopListService.execute());
  }

  @Get('draft-diff')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DraftDiffResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  getDraftDiff(): Promise<DraftDiffResponseDto> {
    return wrap(() => this.getDraftDiffService.execute());
  }

  @Patch('categories/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  archiveCategory(@Param('id') id: string): Promise<void> {
    return wrap(() => this.archiveCategoryService.execute(id));
  }

  @Patch('items/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  archiveItem(@Param('id') id: string): Promise<void> {
    return wrap(() => this.archiveItemService.execute(id));
  }
}
