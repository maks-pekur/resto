import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { wrapWith } from '../../../../shared/api/wrap';
import { Permissions, RequireActiveTenant, RequireBrand } from '../../../../shared/auth';
import { StartBrandOnboardingService } from '../../application/start-brand-onboarding.service';
import { mapDomainError } from './error-mapping';

const AccountSessionResponseSchema = z.object({
  clientSecret: z.string(),
});
class AccountSessionResponseDto extends createZodDto(AccountSessionResponseSchema) {}

const AccountLinkResponseSchema = z.object({
  onboardingUrl: z.string().url(),
});
class AccountLinkResponseDto extends createZodDto(AccountLinkResponseSchema) {}

const OnboardingStatusResponseSchema = z.object({
  accountType: z.enum(['express', 'standard']).nullable(),
  onboardingStatus: z.enum(['not_started', 'pending', 'complete', 'restricted']),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  canAcceptPayments: z.boolean(),
  requirementsDue: z.unknown().nullable(),
});
class OnboardingStatusResponseDto extends createZodDto(OnboardingStatusResponseSchema) {}

@ApiTags('tenancy')
@Controller('v1/tenancy/brands/:slug/onboarding')
export class BrandOnboardingController {
  readonly #wrap = wrapWith(mapDomainError);

  constructor(private readonly service: StartBrandOnboardingService) {}

  @Post('account-session')
  @HttpCode(HttpStatus.OK)
  @Permissions({ tenant: ['transfer'] })
  @RequireActiveTenant()
  @RequireBrand()
  @ApiOkResponse({ type: AccountSessionResponseDto })
  async createAccountSession(@Param('slug') slug: string): Promise<AccountSessionResponseDto> {
    return this.#wrap(() => this.service.createEmbeddedSession(slug));
  }

  @Post('account-link')
  @HttpCode(HttpStatus.OK)
  @Permissions({ tenant: ['transfer'] })
  @RequireActiveTenant()
  @RequireBrand()
  @ApiOkResponse({ type: AccountLinkResponseDto })
  async createAccountLink(@Param('slug') slug: string): Promise<AccountLinkResponseDto> {
    return this.#wrap(() => this.service.createHostedLink(slug));
  }

  @Get('status')
  @Permissions({ tenant: ['read'] })
  @RequireActiveTenant()
  @RequireBrand()
  @ApiOkResponse({ type: OnboardingStatusResponseDto })
  async getStatus(@Param('slug') slug: string): Promise<OnboardingStatusResponseDto> {
    return this.#wrap(() => this.service.getStatus(slug));
  }
}
