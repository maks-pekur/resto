import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { BrandSlug, TenantId } from '@resto/domain';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { CheckBrandSlugAvailabilityService } from '../../application/check-brand-slug-availability.service';
import { CreateMyBrandService } from '../../application/create-my-brand.service';
import { ListMyBrandsService } from '../../application/list-my-brands.service';
import { BrandDisplayNameTakenError, BrandSlugConflictError } from '../../domain/brand-errors';
import type { OperatorPrincipal } from '../../domain/principal';
import { CurrentOperator } from './decorators/current-principal.decorator';
import { Permissions } from './decorators/permissions.decorator';
import { RequiresTenantContext } from './decorators/requires-tenant-context.decorator';

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

const SlugAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  suggestion: z.string().nullable(),
});
class SlugAvailabilityResponseDto extends createZodDto(SlugAvailabilityResponseSchema) {}

@ApiTags('identity')
@Controller('v1/me')
export class MeBrandsController {
  constructor(
    @Inject(ListMyBrandsService) private readonly list: ListMyBrandsService,
    @Inject(CreateMyBrandService) private readonly create: CreateMyBrandService,
    @Inject(CheckBrandSlugAvailabilityService)
    private readonly checkSlug: CheckBrandSlugAvailabilityService,
  ) {}

  @Get('brands')
  @RequiresTenantContext()
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
  @RequiresTenantContext()
  @HttpCode(HttpStatus.CREATED)
  @Permissions({ brand: ['create'] })
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
      if (err instanceof BrandDisplayNameTakenError) {
        throw new ConflictException({ code: 'brand.display_name_taken', message: err.message });
      }
      throw err;
    }
  }

  /**
   * Live slug-availability check for the admin brand-creation form
   * (RES-180). Operator session required (default-deny AuthGuard);
   * intentionally NOT `@RequiresTenantContext` because slug uniqueness
   * is platform-wide and the lookup must see brands across all tenants.
   * `@Permissions({ brand: ['create'] })` keeps the route gated to
   * users who could actually use the answer.
   */
  @Get('brands/slug-availability')
  @Permissions({ brand: ['create'] })
  @ApiQuery({ name: 'slug', type: String, required: true })
  @ApiOkResponse({ type: SlugAvailabilityResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async slugAvailability(@Query('slug') slug: string): Promise<SlugAvailabilityResponseDto> {
    const parsed = BrandSlug.safeParse(slug);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'brand.slug_invalid',
        message: parsed.error.issues[0]?.message ?? 'Invalid brand slug.',
      });
    }
    const result = await this.checkSlug.execute(parsed.data);
    return { available: result.available, suggestion: result.suggestion };
  }
}
