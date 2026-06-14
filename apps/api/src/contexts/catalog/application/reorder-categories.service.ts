import { Inject, Injectable } from '@nestjs/common';
import { requireBrandContext, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { ReorderCategoriesInput, ReorderCategoriesResponse } from './dto';

@Injectable()
export class ReorderCategoriesService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: ReorderCategoriesInput): Promise<ReorderCategoriesResponse> {
    requireTenantContext();
    const brandId = requireBrandContext();
    return this.repo.applyCategoryMoves({ brandId, moves: input.moves });
  }
}
