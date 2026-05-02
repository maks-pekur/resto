import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from '../../../tenancy/interfaces/http/internal-token.guard';
import { ZodValidationPipe } from '../../../tenancy/interfaces/http/zod-validation.pipe';
import { UpsertCategoryInput, UpsertItemInput, UpsertModifierInput } from '../../application/dto';
import { PublishMenuService } from '../../application/publish-menu.service';
import { UpsertCategoryService } from '../../application/upsert-category.service';
import { UpsertItemService } from '../../application/upsert-item.service';
import { UpsertModifierService } from '../../application/upsert-modifier.service';
import { Public } from '../../../identity/interfaces/http/decorators/public.decorator';

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
  @UsePipes(new ZodValidationPipe(UpsertCategoryInput))
  category(@Body() input: UpsertCategoryInput): Promise<{ id: string }> {
    return this.upsertCategory.execute(input);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(UpsertItemInput))
  item(@Body() input: UpsertItemInput): Promise<{ id: string }> {
    return this.upsertItem.execute(input);
  }

  @Post('modifiers')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(UpsertModifierInput))
  modifier(@Body() input: UpsertModifierInput): Promise<{ id: string }> {
    return this.upsertModifier.execute(input);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  publishMenu(): Promise<{ tenantId: string; version: number }> {
    return this.publish.execute();
  }
}
