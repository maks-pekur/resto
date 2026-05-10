import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { BrandSlug, TenantId } from '@resto/domain';
import { CreateMyBrandService } from '../../application/create-my-brand.service';
import { ListMyBrandsService } from '../../application/list-my-brands.service';
import { BrandSlugConflictError } from '../../domain/brand-errors';
import { ZodValidationPipe } from '../../../tenancy/interfaces/http/zod-validation.pipe';
import { CurrentOperator } from './decorators/current-principal.decorator';
import { Permissions } from './decorators/permissions.decorator';
import type { OperatorPrincipal } from '../../domain/principal';

interface MeBrandsResponseBrand {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export interface MeBrandsResponse {
  readonly brands: readonly MeBrandsResponseBrand[];
  readonly canViewAllBrands: boolean;
}

const CreateBrandInput = z.object({
  slug: BrandSlug,
  displayName: z.string().trim().min(1).max(120),
});

type CreateBrandInputT = z.infer<typeof CreateBrandInput>;

@ApiTags('identity')
@Controller('v1/me')
export class MeBrandsController {
  constructor(
    @Inject(ListMyBrandsService) private readonly list: ListMyBrandsService,
    @Inject(CreateMyBrandService) private readonly create: CreateMyBrandService,
  ) {}

  @Get('brands')
  @Permissions({ tenant: ['read'] })
  async getBrands(@CurrentOperator() operator: OperatorPrincipal): Promise<MeBrandsResponse> {
    if (!operator.tenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    const result = await this.list.execute({
      userId: operator.userId,
      tenantId: TenantId.parse(operator.tenantId),
    });
    return {
      brands: result.brands.map((b) => ({ id: b.id, slug: b.slug, displayName: b.displayName })),
      canViewAllBrands: result.canViewAllBrands,
    };
  }

  @Post('brands')
  @HttpCode(HttpStatus.CREATED)
  @Permissions({ settings: ['update'] })
  @UsePipes(new ZodValidationPipe(CreateBrandInput))
  async createBrand(
    @CurrentOperator() operator: OperatorPrincipal,
    @Body() input: CreateBrandInputT,
  ): Promise<MeBrandsResponseBrand> {
    if (!operator.tenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    try {
      const snapshot = await this.create.execute({
        tenantId: TenantId.parse(operator.tenantId),
        slug: input.slug,
        displayName: input.displayName,
      });
      return { id: snapshot.id, slug: snapshot.slug, displayName: snapshot.displayName };
    } catch (err) {
      if (err instanceof BrandSlugConflictError) {
        throw new ConflictException({ code: 'brand.slug_taken', message: err.message });
      }
      throw err;
    }
  }
}
