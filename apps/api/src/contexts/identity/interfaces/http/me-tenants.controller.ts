import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TenantSlugValue } from '@resto/domain';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { wrapWith } from '../../../../shared/api/wrap';
import { CheckTenantSlugAvailabilityService } from '../../application/check-tenant-slug-availability.service';
import { ListMyTenantsService } from '../../application/list-my-tenants.service';
import { FinalizeTenantSetupService } from '../../application/finalize-tenant-setup.service';
import { FinalizeTenantSetupInputDto } from '../../application/dto';
import type { OperatorPrincipal } from '../../domain/principal';
import { CurrentOperator } from './decorators/current-principal.decorator';
import { TenantSlugRateLimitGuard } from './guards/tenant-slug-rate-limit.guard';
import { LocationNeutral, Permissions } from '../../../../shared/auth';
import { mapIdentityError } from './error-mapping';

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

const OnboardingResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
  status: z.literal('active'),
});
class OnboardingResponseDto extends createZodDto(OnboardingResponseSchema) {}

const wrap = wrapWith(mapIdentityError);

@ApiTags('identity')
@Controller('v1/me')
@LocationNeutral()
export class MeTenantsController {
  constructor(
    @Inject(ListMyTenantsService) private readonly list: ListMyTenantsService,
    @Inject(CheckTenantSlugAvailabilityService)
    private readonly checkSlug: CheckTenantSlugAvailabilityService,
    @Inject(FinalizeTenantSetupService) private readonly finalizeSetup: FinalizeTenantSetupService,
  ) {}

  /**
   * The tenants the signed-in user is a member of (D-02). Backs the
   * sign-in picker (D-17) — deliberately NOT `@RequiresTenantContext`,
   * since a fresh session has no tenant bound yet and this endpoint
   * is exactly how the picker learns what to offer. `@Permissions` is
   * deliberately ALSO absent here (found live, 10.2-17): BA's org-scoped
   * `hasPermission` needs an already-bound `activeOrganizationId` to
   * evaluate against, which a fresh sign-in never has — the decorator
   * 403'd every call, defeating this endpoint's own stated purpose. Safe
   * without it: the query is scoped to `operator.userId` (AuthGuard's own
   * default-deny already requires an authenticated operator principal),
   * never a client-supplied id, so there is no cross-tenant read here to
   * gate.
   */
  @Get('tenants')
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

  /**
   * D-30/D-31: names the restaurant, derives its slug and flips the
   * tenant from `'pending_setup'` to `'active'`. Deliberately reads
   * the target tenant from the session (`activeOrganizationId`), not
   * a body parameter — T-10.2-13-02. Intentionally NOT `@RequiresTenantContext`
   * — every write here goes through `db.withoutTenant` (system-context
   * services), never `ScopedTx`, so there is no ALS tenant binding to
   * require; a freshly-signed-up owner also has no `x-tenant-id` header or
   * subdomain host to resolve one from at this point in the flow.
   */
  @Post('tenants/onboarding')
  @HttpCode(HttpStatus.OK)
  @Permissions({ tenant: ['read'] })
  @ApiBody({ type: FinalizeTenantSetupInputDto })
  @ApiOkResponse({ type: OnboardingResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async finalizeOnboarding(
    @CurrentOperator() operator: OperatorPrincipal,
    @Body(new RestoZodValidationPipe(FinalizeTenantSetupInputDto))
    input: FinalizeTenantSetupInputDto,
  ): Promise<OnboardingResponseDto> {
    const tenantId = operator.tenantId;
    if (!tenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    const result = await wrap(() =>
      this.finalizeSetup.execute({ tenantId, displayName: input.displayName }),
    );
    return { id: result.id, slug: result.slug, displayName: result.displayName, status: 'active' };
  }
}
