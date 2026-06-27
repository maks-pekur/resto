import { Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { wrapWith } from '../../../../shared/api/wrap';
import { Permissions, RequireActiveTenant } from '../../../../shared/auth';
import { StartStripeOnboardingService } from '../../application/start-stripe-onboarding.service';
import { mapDomainError } from './error-mapping';

const OnboardingResponseSchema = z.object({ onboardingUrl: z.string().url() });
class OnboardingResponseDto extends createZodDto(OnboardingResponseSchema) {}

const StripeStatusResponseSchema = z.object({
  onboardingStatus: z.enum(['not_started', 'pending', 'complete', 'restricted']),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  canAcceptPayments: z.boolean(),
  requirementsDue: z.unknown().nullable(),
});
class StripeStatusResponseDto extends createZodDto(StripeStatusResponseSchema) {}

@ApiTags('tenancy')
@Controller('v1/tenancy')
export class StripeOnboardingController {
  readonly #wrap = wrapWith(mapDomainError);

  constructor(
    @Inject(StartStripeOnboardingService)
    private readonly service: StartStripeOnboardingService,
  ) {}

  @Post('stripe-onboarding')
  @HttpCode(HttpStatus.OK)
  @Permissions({ tenant: ['transfer'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: OnboardingResponseDto })
  async startOnboarding(): Promise<OnboardingResponseDto> {
    return this.#wrap(() => this.service.startOnboarding());
  }

  @Get('stripe-status')
  @Permissions({ tenant: ['read'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: StripeStatusResponseDto })
  async getStripeStatus(): Promise<StripeStatusResponseDto> {
    return this.#wrap(() => this.service.getStatus());
  }
}
