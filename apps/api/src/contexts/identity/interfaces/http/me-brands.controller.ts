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
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BrandSlug, TenantId } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { CreateMyBrandService } from '../../application/create-my-brand.service';
import { ListMyBrandsService } from '../../application/list-my-brands.service';
import { BrandSlugConflictError } from '../../domain/brand-errors';
import { CurrentOperator } from './decorators/current-principal.decorator';
import { Permissions } from './decorators/permissions.decorator';
import type { OperatorPrincipal } from '../../domain/principal';

const MeBrandSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
});

const MeBrandsResponseSchema = z.object({
  brands: z.array(MeBrandSchema),
  canViewAllBrands: z.boolean(),
});

class MeBrandDto extends createZodDto(MeBrandSchema) {}
class MeBrandsResponseDto extends createZodDto(MeBrandsResponseSchema) {}

const CreateBrandInputSchema = z.object({
  slug: BrandSlug,
  displayName: z.string().trim().min(1).max(120),
});

class CreateBrandInputDto extends createZodDto(CreateBrandInputSchema) {}

@ApiTags('identity')
@Controller('v1/me')
export class MeBrandsController {
  constructor(
    @Inject(ListMyBrandsService) private readonly list: ListMyBrandsService,
    @Inject(CreateMyBrandService) private readonly create: CreateMyBrandService,
  ) {}

  @Get('brands')
  @Permissions({ tenant: ['read'] })
  @ApiOkResponse({ type: MeBrandsResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async getBrands(@CurrentOperator() operator: OperatorPrincipal): Promise<MeBrandsResponseDto> {
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
  @ApiBody({ type: CreateBrandInputDto })
  @ApiCreatedResponse({ type: MeBrandDto })
  @ApiConflictResponse({ type: ProblemDetailsDto, description: 'brand slug taken globally' })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async createBrand(
    @CurrentOperator() operator: OperatorPrincipal,
    @Body(new RestoZodValidationPipe(CreateBrandInputDto)) input: CreateBrandInputDto,
  ): Promise<MeBrandDto> {
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
