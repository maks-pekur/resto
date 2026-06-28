import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { BrandSlug, TenantId } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { PAYMENT_PROVIDER_PORT, type PaymentProviderPort } from '../../payments/domain/ports';
import { Brand } from '../domain/brand.aggregate';
import type { BrandOnboardingStatus } from '../domain/brand.aggregate';
import { BRAND_REPOSITORY, type BrandRepository } from '../domain/ports';

export interface GetBrandOnboardingStatusResult {
  readonly accountType: 'express' | 'standard' | null;
  readonly onboardingStatus: BrandOnboardingStatus;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly canAcceptPayments: boolean;
  readonly requirementsDue: unknown;
}

export interface CreateEmbeddedSessionResult {
  readonly clientSecret: string;
}

export interface CreateHostedLinkResult {
  readonly onboardingUrl: string;
}

@Injectable()
export class StartBrandOnboardingService {
  private readonly logger = new Logger(StartBrandOnboardingService.name);

  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brandRepo: BrandRepository,
    @Inject(PAYMENT_PROVIDER_PORT) private readonly provider: PaymentProviderPort,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  private async ensureBrandAccount(slug: string): Promise<{ accountId: string; brand: Brand }> {
    const { tenantId: rawTenantId } = requireTenantContext();
    const snapshot = await this.brandRepo.findByTenantAndSlug(
      TenantId.parse(rawTenantId),
      BrandSlug.parse(slug),
    );
    if (snapshot === null) {
      throw new NotFoundException(`Brand "${slug}" not found.`);
    }
    const brand = Brand.fromSnapshot(snapshot);
    if (snapshot.stripeAccountId !== null) {
      return { accountId: snapshot.stripeAccountId, brand };
    }
    const result = await this.provider.ensureOnboardingAccount({
      brandId: snapshot.id,
      displayName: snapshot.displayName,
      ...(snapshot.defaultCurrency !== null ? { defaultCurrency: snapshot.defaultCurrency } : {}),
      accountType: 'express',
    });
    brand.linkPaymentAccount(result.accountId, 'express');
    await this.brandRepo.updatePaymentConnection(brand);
    this.logger.log(
      { brandId: snapshot.id, accountId: result.accountId },
      'Stripe Express account linked to brand.',
    );
    return { accountId: result.accountId, brand };
  }

  async createEmbeddedSession(slug: string): Promise<CreateEmbeddedSessionResult> {
    const { accountId } = await this.ensureBrandAccount(slug);
    const session = await this.provider.createOnboardingSession({ accountId });
    return { clientSecret: session.clientSecret };
  }

  async createHostedLink(slug: string): Promise<CreateHostedLinkResult> {
    const { accountId } = await this.ensureBrandAccount(slug);
    const link = await this.provider.createOnboardingLink({
      accountId,
      returnUrl: this.env.STRIPE_CONNECT_RETURN_URL,
      refreshUrl: this.env.STRIPE_CONNECT_REFRESH_URL,
    });
    return { onboardingUrl: link.url };
  }

  async getStatus(slug: string): Promise<GetBrandOnboardingStatusResult> {
    const { tenantId: rawTenantId } = requireTenantContext();
    const snapshot = await this.brandRepo.findByTenantAndSlug(
      TenantId.parse(rawTenantId),
      BrandSlug.parse(slug),
    );
    if (snapshot === null) {
      throw new NotFoundException(`Brand "${slug}" not found.`);
    }
    const brand = Brand.fromSnapshot(snapshot);
    return {
      accountType: snapshot.accountType,
      onboardingStatus: snapshot.stripeOnboardingStatus,
      chargesEnabled: snapshot.stripeChargesEnabled,
      payoutsEnabled: snapshot.stripePayoutsEnabled,
      canAcceptPayments: brand.canAcceptPayments(),
      requirementsDue: snapshot.stripeRequirementsDue,
    };
  }
}
