import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { StripeOnboardingFailedError } from '../domain/errors';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import type { StripeOnboardingStatus } from '../domain/tenant.aggregate';
import { PAYMENT_PROVIDER_PORT, type PaymentProviderPort } from '../../payments/domain/ports';

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

@Injectable()
export class StartStripeOnboardingService {
  private readonly logger = new Logger(StartStripeOnboardingService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(PAYMENT_PROVIDER_PORT) private readonly provider: PaymentProviderPort,
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
      const result = await this.provider.ensureOnboardingAccount({
        brandId: snapshot.id,
        displayName: snapshot.displayName,
        defaultCurrency: snapshot.defaultCurrency,
        accountType: 'express',
      });
      const accountId = result.accountId;
      tenant.linkStripeAccount(accountId);
      await this.repo.save(tenant);
      this.logger.log(
        { tenantId: snapshot.id, accountId },
        'Stripe Express account created and persisted.',
      );
      const link = await this.provider.createOnboardingLink({
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
    return Promise.resolve({
      onboardingStatus: 'not_started',
      chargesEnabled: false,
      payoutsEnabled: false,
      canAcceptPayments: false,
      requirementsDue: null,
    });
  }
}
