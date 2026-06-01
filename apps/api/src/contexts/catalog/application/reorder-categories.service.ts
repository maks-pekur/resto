import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { ReorderCategoriesInput, ReorderCategoriesResponse } from './dto';

@Injectable()
export class ReorderCategoriesService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: ReorderCategoriesInput): Promise<ReorderCategoriesResponse> {
    requireTenantContext();
    return this.repo.applyCategoryMoves({ moves: input.moves });
  }
}
