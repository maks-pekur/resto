import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { InternalTokenGuard } from '../../../../shared/api/internal-token.guard';
import {
  UpsertCategoryInputDto,
  UpsertItemInputDto,
  UpsertModifierInputDto,
} from '../../application/dto';
import { PublishMenuService } from '../../application/publish-menu.service';
import { UpsertCategoryService } from '../../application/upsert-category.service';
import { UpsertItemService } from '../../application/upsert-item.service';
import { UpsertModifierService } from '../../application/upsert-modifier.service';
import { Public } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { mapCatalogError } from './error-mapping';

const wrap = wrapWith(mapCatalogError);

const IdResponseSchema = z.object({ id: z.string().uuid() });
class IdResponseDto extends createZodDto(IdResponseSchema) {}

const PublishResponseSchema = z.object({
  tenantId: z.string().uuid(),
  version: z.number().int().nonnegative(),
});
class PublishResponseDto extends createZodDto(PublishResponseSchema) {}

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
  constructor(
    @Inject(UpsertCategoryService) private readonly upsertCategory: UpsertCategoryService,
    @Inject(UpsertItemService) private readonly upsertItem: UpsertItemService,
    @Inject(UpsertModifierService) private readonly upsertModifier: UpsertModifierService,
    @Inject(PublishMenuService) private readonly publish: PublishMenuService,
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

  @Post('modifiers')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: UpsertModifierInputDto })
  @ApiOkResponse({ type: IdResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  modifier(
    @Body(new RestoZodValidationPipe(UpsertModifierInputDto)) input: UpsertModifierInputDto,
  ): Promise<IdResponseDto> {
    return wrap(() => this.upsertModifier.execute(input));
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PublishResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  publishMenu(): Promise<PublishResponseDto> {
    return wrap(() => this.publish.execute());
  }
}
