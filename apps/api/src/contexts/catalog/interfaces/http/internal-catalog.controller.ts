import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
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
  StopItemInputDto,
  UpsertCategoryInputDto,
  UpsertItemInputDto,
  UpsertItemSizeInputDto,
  UpsertModifierGroupInputDto,
  UpsertModifierOptionInputDto,
} from '../../application/dto';
import { DelayedPublishService } from '../../application/delayed-publish.service';
import { StopListService } from '../../application/stop-list.service';
import { UpsertCategoryService } from '../../application/upsert-category.service';
import { UpsertItemService } from '../../application/upsert-item.service';
import { UpsertItemSizeService } from '../../application/upsert-item-size.service';
import { UpsertModifierGroupService } from '../../application/upsert-modifier-group.service';
import { UpsertModifierOptionService } from '../../application/upsert-modifier-option.service';
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

/**
 * Internal catalog write surface. Used by the seed CLI to provision the
 * menu for design-partner restaurants. No public callers in MVP-1 — the
 * admin UI lands in MVP-2.
 *
 * Auth: shared `INTERNAL_API_TOKEN` via `InternalTokenGuard` (ADR-0012).
 * The seed CLI passes the same token the api enforces. Real per-user
 * IAM lands when MVP-2 introduces the admin UI; until then the
 * internal token is the only call site.
 */
@ApiTags('catalog/internal')
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal/v1/catalog')
export class InternalCatalogController {
  // CAT-06: 5_000 ms must mirror DelayedPublishService.#DELAY_MS so the
  // operator-facing Undo window is documented in the response payload.
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

  /**
   * CAT-06: schedule a delayed publish. DelayedPublishService installs a
   * 5-second in-memory timer per tenant; calling this endpoint a second
   * time within the window auto-cancels the prior pending timer.
   *
   * Stateless on the controller side — the returned `cancel` handle from
   * `schedule(tenantId)` is discarded because operator Undo runs through
   * `DELETE /publish` calling `cancelPending(tenantId)` instead. The
   * service's per-tenant Map is the source of truth.
   */
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

  /**
   * CAT-06 Undo: cancel the currently-pending publish for this tenant if
   * the 5-second window has not yet elapsed. `cancelled: false` means no
   * pending timer exists (either it already fired or none was scheduled).
   */
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
}
