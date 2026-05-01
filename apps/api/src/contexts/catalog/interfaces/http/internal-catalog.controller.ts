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
import { AuthGuard } from '../../../identity/interfaces/http/auth.guard';
import { Roles } from '../../../identity/interfaces/http/roles.decorator';
import { RolesGuard } from '../../../identity/interfaces/http/roles.guard';
import { ZodValidationPipe } from '../../../tenancy/interfaces/http/zod-validation.pipe';
import { UpsertCategoryInput, UpsertItemInput, UpsertModifierInput } from '../../application/dto';
import { PublishMenuService } from '../../application/publish-menu.service';
import { UpsertCategoryService } from '../../application/upsert-category.service';
import { UpsertItemService } from '../../application/upsert-item.service';
import { UpsertModifierService } from '../../application/upsert-modifier.service';

/**
 * Internal catalog write surface. Used by the seed CLI (RES-81) to
 * provision the menu for design-partner restaurants. No public callers
 * in MVP-1 — the admin UI lands in MVP-2.
 *
 * Auth: JWT via `AuthGuard`, roles `owner` or `manager` via
 * `RolesGuard`. The seed CLI obtains a token from Keycloak's password
 * grant for the tenant's owner user.
 */
@ApiTags('catalog/internal')
@UseGuards(AuthGuard, RolesGuard)
@Roles('owner', 'manager')
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
