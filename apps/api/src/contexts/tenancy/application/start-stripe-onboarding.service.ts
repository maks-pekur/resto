import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { StripeOnboardingFailedError } from '../domain/errors';
import {
  STRIPE_CONNECT_PORT,
  TENANT_REPOSITORY,
  type StripeConnectPort,
  type TenantRepository,
} from '../domain/ports';
import type { StripeOnboardingStatus } from '../domain/tenant.aggregate';

export interface StartStripeOnboardingResult {
  readonly onboardingUrl: string;
}

export interface GetStripeStatusResult {
  readonly onboardingStatus: StripeOnboardingStatus;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly canAcceptPayments: boolean;
  readonly requirementsDue: unknown;
}

// D-06: this service is per-tenant and is superseded by per-brand onboarding in Plan 04.
// Stripe fields have moved from TenantSnapshot to BrandSnapshot; this service now returns
// stub 'not_started' status until Plan 03/04 wires the brand-level onboarding endpoint.
@Injectable()
export class StartStripeOnboardingService {
  private readonly logger = new Logger(StartStripeOnboardingService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(STRIPE_CONNECT_PORT) private readonly stripe: StripeConnectPort,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async startOnboarding(): Promise<StartStripeOnboardingResult> {
    const { tenantId } = requireTenantContext();
    const tenant = await this.repo.findCurrentTenant();
    if (tenant === null) {
      throw new StripeOnboardingFailedError(tenantId);
    }
    const snapshot = tenant.toSnapshot();

    try {
      const result = await this.stripe.createExpressAccount({
        tenantId: snapshot.id,
        displayName: snapshot.displayName,
        defaultCurrency: snapshot.defaultCurrency,
      });
      const accountId = result.accountId;
      tenant.linkStripeAccount(accountId);
      await this.repo.save(tenant);
      this.logger.log(
        { tenantId: snapshot.id, accountId },
        'Stripe Express account created and persisted.',
      );
      const link = await this.stripe.createAccountLink({
        accountId,
        returnUrl: this.env.STRIPE_CONNECT_RETURN_URL,
        refreshUrl: this.env.STRIPE_CONNECT_REFRESH_URL,
      });
      return { onboardingUrl: link.url };
    } catch (err) {
      throw new StripeOnboardingFailedError(
        snapshot.id,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  getStatus(): Promise<GetStripeStatusResult> {
    // D-06: stripe status is now per-brand; stub returns 'not_started' until Plan 04
    // wires the brand-level onboarding status endpoint.
    return Promise.resolve({
      onboardingStatus: 'not_started',
      chargesEnabled: false,
      payoutsEnabled: false,
      canAcceptPayments: false,
      requirementsDue: null,
    });
  }
}
