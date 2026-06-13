import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { Permissions, RequiresTenantContext } from '../../../../shared/auth';
import {
  PhotoUploadUrlInputDto,
  PhotoUploadUrlResponseDto,
  ReorderCategoriesInputDto,
  ReorderCategoriesResponseDto,
  StopItemInputDto,
  UpsertCategoryInputDto,
  UpsertItemInputDto,
  UpsertItemSizeInputDto,
  UpsertModifierGroupInputDto,
  UpsertModifierOptionInputDto,
} from '../../application/dto';
import { ArchiveCategoryService } from '../../application/archive-category.service';
import { ArchiveItemService } from '../../application/archive-item.service';
import { DelayedPublishService } from '../../application/delayed-publish.service';
import { GetPhotoUploadUrlService } from '../../application/get-photo-upload-url.service';
import { ReorderCategoriesService } from '../../application/reorder-categories.service';
import { StopListService } from '../../application/stop-list.service';
import { UpsertCategoryService } from '../../application/upsert-category.service';
import { UpsertItemService } from '../../application/upsert-item.service';
import { UpsertItemSizeService } from '../../application/upsert-item-size.service';
import { UpsertModifierGroupService } from '../../application/upsert-modifier-group.service';
import { UpsertModifierOptionService } from '../../application/upsert-modifier-option.service';
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
    @Inject(StopListService) private readonly stopList: StopListService,
    @Inject(DelayedPublishService) private readonly delayed: DelayedPublishService,
    @Inject(ArchiveCategoryService) private readonly archiveCategoryService: ArchiveCategoryService,
    @Inject(ArchiveItemService) private readonly archiveItemService: ArchiveItemService,
    @Inject(GetPhotoUploadUrlService)
    private readonly getPhotoUploadUrlService: GetPhotoUploadUrlService,
    @Inject(ReorderCategoriesService)
    private readonly reorderCategoriesService: ReorderCategoriesService,
  ) {}

  @Post('categories')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
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
  @ApiBody({ type: UpsertItemSizeInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  itemSize(
    @Body(new RestoZodValidationPipe(UpsertItemSizeInputDto)) input: UpsertItemSizeInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertItemSize.execute(input));
  }

  @Post('stop-list')
  @HttpCode(HttpStatus.OK)
  @Permissions({ menu: ['update'] })
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
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  stopListRemove(@Param('itemId') itemId: string): Promise<void> {
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
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  archiveCategory(@Param('id') id: string): Promise<void> {
    return wrap(() => this.archiveCategoryService.execute(id));
  }

  @Patch('items/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ menu: ['delete'] })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  archiveItem(@Param('id') id: string): Promise<void> {
    return wrap(() => this.archiveItemService.execute(id));
  }
}
