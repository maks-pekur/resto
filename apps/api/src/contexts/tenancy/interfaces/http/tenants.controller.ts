import { ENV_TOKEN } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { requireTenantContext } from '@resto/db';
import { ContentLocaleSchema } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { TenantQueriesService } from '../../application/tenant-queries.service';
import { OffboardTenantService } from '../../application/offboard-tenant.service';
import { ScheduleOffboardingInputDto } from '../../application/dto';
import {
  AllowArchivedTenant,
  LocationNeutral,
  Permissions,
  RequiresTenantContext,
} from '../../../../shared/auth';
import { mapDomainError } from './error-mapping';
import { TenantResponseDto, toResponse } from './tenant-response';
import { SetContentLocalesService } from '../../application/set-content-locales.service';
import { UpdateBrandService } from '../../application/update-brand.service';
import { GetBrandLogoUploadUrlService } from '../../application/get-brand-logo-upload-url.service';
import {
  BrandLogoUploadUrlInputDto,
  BrandLogoUploadUrlResponseDto,
  UpdateBrandInputDto,
} from '../../application/dto';

const TenantDomainSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  kind: z.string(),
  isPrimary: z.boolean(),
  verifiedAt: z.string().nullable(),
});

class TenantDomainDto extends createZodDto(TenantDomainSchema) {}

const SetContentLocalesInputSchema = z.object({
  defaultLocale: ContentLocaleSchema,
  contentLocales: z.array(ContentLocaleSchema).min(1),
});
class SetContentLocalesInputDto extends createZodDto(SetContentLocalesInputSchema) {}

@ApiTags('tenancy')
@LocationNeutral()
@Controller('v1/tenants')
export class TenantsController {
  constructor(
    @Inject(TenantQueriesService) private readonly queries: TenantQueriesService,
    @Inject(OffboardTenantService) private readonly offboarding: OffboardTenantService,
    @Inject(SetContentLocalesService)
    private readonly setContentLocales: SetContentLocalesService,
    @Inject(UpdateBrandService) private readonly updateBrand: UpdateBrandService,
    @Inject(GetBrandLogoUploadUrlService)
    private readonly brandLogoUploadUrl: GetBrandLogoUploadUrlService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  @Get('me')
  @Permissions({ tenant: ['read'] })
  @RequiresTenantContext()
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async getMe(): Promise<TenantResponseDto> {
    try {
      return toResponse(await this.queries.getCurrentTenant(), this.env.MEDIA_PUBLIC_BASE_URL);
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Patch('me/locales')
  @Permissions({ settings: ['update'] })
  @RequiresTenantContext()
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async setLocales(
    @Body(new RestoZodValidationPipe(SetContentLocalesInputDto)) input: SetContentLocalesInputDto,
  ): Promise<TenantResponseDto> {
    try {
      return toResponse(
        await this.setContentLocales.execute(input),
        this.env.MEDIA_PUBLIC_BASE_URL,
      );
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Patch('me/brand')
  @Permissions({ settings: ['update'] })
  @RequiresTenantContext()
  @ApiBody({ type: UpdateBrandInputDto })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async setBrand(
    @Body(new RestoZodValidationPipe(UpdateBrandInputDto)) input: UpdateBrandInputDto,
  ): Promise<TenantResponseDto> {
    try {
      return toResponse(await this.updateBrand.execute(input), this.env.MEDIA_PUBLIC_BASE_URL);
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Post('me/brand/logo-upload-url')
  @HttpCode(HttpStatus.OK)
  @Permissions({ settings: ['update'] })
  @RequiresTenantContext()
  @ApiBody({ type: BrandLogoUploadUrlInputDto })
  @ApiOkResponse({ type: BrandLogoUploadUrlResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async brandLogoUpload(
    @Body(new RestoZodValidationPipe(BrandLogoUploadUrlInputDto))
    input: BrandLogoUploadUrlInputDto,
  ): Promise<BrandLogoUploadUrlResponseDto> {
    try {
      return await this.brandLogoUploadUrl.execute(input);
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Get('me/domains')
  @Permissions({ tenant: ['read'] })
  @RequiresTenantContext()
  @ApiOkResponse({ type: TenantDomainDto, isArray: true })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async getMeDomains(): Promise<TenantDomainDto[]> {
    try {
      const domains = await this.queries.listCurrentTenantDomains();
      return domains.map((d) => ({
        id: d.id,
        domain: d.domain,
        kind: d.kind,
        isPrimary: d.isPrimary,
        verifiedAt: d.verifiedAt?.toISOString() ?? null,
      }));
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Post('me/offboard')
  @HttpCode(HttpStatus.ACCEPTED)
  @Permissions({ tenant: ['delete'] })
  @RequiresTenantContext()
  @ApiBody({ type: ScheduleOffboardingInputDto })
  @ApiAcceptedResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async scheduleOffboarding(
    @Body(new RestoZodValidationPipe(ScheduleOffboardingInputDto))
    input: ScheduleOffboardingInputDto,
  ): Promise<TenantResponseDto> {
    try {
      const { tenantId } = requireTenantContext();
      const snapshot = await this.offboarding.schedule({
        tenantId,
        requestedBy: input.requestedBy,
      });
      return toResponse(snapshot, this.env.MEDIA_PUBLIC_BASE_URL);
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Delete('me/offboard')
  @HttpCode(HttpStatus.OK)
  @Permissions({ tenant: ['delete'] })
  @RequiresTenantContext()
  // scheduleOffboarding stamps archivedAt, which otherwise makes this route
  // unreachable exactly when it is needed — the owner could request deletion
  // but never undo it. Auth and tenant:delete still apply.
  @AllowArchivedTenant()
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async cancelOffboarding(): Promise<TenantResponseDto> {
    try {
      const { tenantId } = requireTenantContext();
      const snapshot = await this.offboarding.cancel({ tenantId });
      return toResponse(snapshot, this.env.MEDIA_PUBLIC_BASE_URL);
    } catch (err) {
      throw mapDomainError(err);
    }
  }
}
