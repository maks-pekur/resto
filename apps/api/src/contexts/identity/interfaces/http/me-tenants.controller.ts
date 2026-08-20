import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TenantSlugValue } from '@resto/domain';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { CheckTenantSlugAvailabilityService } from '../../application/check-tenant-slug-availability.service';
import { ListMyTenantsService } from '../../application/list-my-tenants.service';
import type { OperatorPrincipal } from '../../domain/principal';
import { CurrentOperator } from './decorators/current-principal.decorator';
import { TenantSlugRateLimitGuard } from './guards/tenant-slug-rate-limit.guard';
import { BrandNeutral, LocationNeutral, Permissions } from '../../../../shared/auth';

const MeTenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
  status: z.string(),
});

const MeTenantsResponseSchema = z.object({
  tenants: z.array(MeTenantSchema),
});

class MeTenantsResponseDto extends createZodDto(MeTenantsResponseSchema) {}

const SlugAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  suggestion: z.string().nullable(),
});
class SlugAvailabilityResponseDto extends createZodDto(SlugAvailabilityResponseSchema) {}

@ApiTags('identity')
@Controller('v1/me')
@BrandNeutral()
@LocationNeutral()
export class MeTenantsController {
  constructor(
    @Inject(ListMyTenantsService) private readonly list: ListMyTenantsService,
    @Inject(CheckTenantSlugAvailabilityService)
    private readonly checkSlug: CheckTenantSlugAvailabilityService,
  ) {}

  /**
   * The organizations the signed-in user is a member of (D-02). Backs the
   * sign-in picker (D-17) — deliberately NOT `@RequiresTenantContext`,
   * since a fresh session has no organization bound yet and this endpoint
   * is exactly how the picker learns what to offer.
   */
  @Get('tenants')
  @Permissions({ tenant: ['read'] })
  @ApiOkResponse({ type: MeTenantsResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async getTenants(@CurrentOperator() operator: OperatorPrincipal): Promise<MeTenantsResponseDto> {
    const result = await this.list.execute({ userId: operator.userId });
    return {
      tenants: result.tenants.map((t) => ({
        id: t.id,
        slug: t.slug,
        displayName: t.displayName,
        status: t.status,
      })),
    };
  }

  /**
   * Live slug-availability check for onboarding (RES-180). Operator
   * session required (default-deny AuthGuard); intentionally NOT
   * `@RequiresTenantContext` because slug uniqueness is platform-wide and
   * the lookup must see tenants across the whole platform.
   */
  @Get('tenants/slug-availability')
  @UseGuards(TenantSlugRateLimitGuard)
  @Permissions({ tenant: ['read'] })
  @ApiQuery({ name: 'slug', type: String, required: true })
  @ApiOkResponse({ type: SlugAvailabilityResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async slugAvailability(@Query('slug') slug: string): Promise<SlugAvailabilityResponseDto> {
    const parsed = TenantSlugValue.safeParse(slug);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'tenant.slug_invalid',
        message: parsed.error.issues[0]?.message ?? 'Invalid tenant slug.',
      });
    }
    const result = await this.checkSlug.execute(parsed.data);
    return { available: result.available, suggestion: result.suggestion };
  }
}
