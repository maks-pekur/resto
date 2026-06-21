import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { InternalTokenGuard } from '../../../../shared/api/internal-token.guard';
import {
  CategoryListResponseDto,
  DraftDiffResponseDto,
  ItemDetailResponseDto,
  ItemListResponseDto,
  ModifierGroupDetailResponseDto,
  ModifierGroupListResponseDto,
  StopListResponseDto,
} from '../../application/dto';
import { GetDraftDiffService } from '../../application/get-draft-diff.service';
import { GetItemService } from '../../application/get-item.service';
import { GetModifierGroupService } from '../../application/get-modifier-group.service';
import { GetStopListService } from '../../application/get-stop-list.service';
import { ListCategoriesService } from '../../application/list-categories.service';
import { ListItemsService } from '../../application/list-items.service';
import { ListModifierGroupsService } from '../../application/list-modifier-groups.service';
import type { ItemStatusFilter } from '../../domain/ports';
import { Public } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { mapCatalogError } from './error-mapping';

const wrap = wrapWith(mapCatalogError);

@ApiTags('catalog/internal')
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal/v1/catalog')
export class InternalCatalogController {
  constructor(
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
  getItem(@Param('id', ParseUUIDPipe) id: string): Promise<ItemDetailResponseDto> {
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
  getModifierGroup(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ModifierGroupDetailResponseDto> {
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
}
