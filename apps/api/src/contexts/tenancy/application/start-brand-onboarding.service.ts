import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { BrandSlug, TenantId } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { PAYMENT_PROVIDER_PORT, type PaymentProviderPort } from '../../payments/domain/ports';
import { Brand } from '../domain/brand.aggregate';
import type { BrandOnboardingStatus } from '../domain/brand.aggregate';
import { encodeOAuthState, verifyOAuthState } from '../domain/oauth-state';
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

export interface StartOAuthResult {
  readonly authorizeUrl: string;
  readonly nonce: string;
}

export interface HandleOAuthCallbackInput {
  readonly code: string;
  readonly state: string;
  readonly nonce: string;
  readonly slugFromPath?: string;
}

export interface HandleOAuthCallbackResult {
  readonly redirectUrl: string;
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

  async startOAuth(slug: string): Promise<StartOAuthResult> {
    const clientId = this.env.STRIPE_CONNECT_CLIENT_ID;
    const redirectUrl = this.env.STRIPE_CONNECT_OAUTH_REDIRECT_URL;
    const secret = this.env.BETTER_AUTH_SECRET;
    if (!clientId) {
      throw new BadRequestException('Stripe Connect OAuth is not configured (missing client_id).');
    }
    if (!redirectUrl) {
      throw new BadRequestException('Stripe Connect OAuth redirect URL is not configured.');
    }
    if (!secret) {
      throw new BadRequestException('OAuth state signing secret is not configured.');
    }

    const { tenantId: rawTenantId } = requireTenantContext();
    const snapshot = await this.brandRepo.findByTenantAndSlug(
      TenantId.parse(rawTenantId),
      BrandSlug.parse(slug),
    );
    if (snapshot === null) {
      throw new NotFoundException(`Brand "${slug}" not found.`);
    }

    const nonce = crypto.randomUUID();
    const signedState = encodeOAuthState({ brandId: snapshot.id, nonce }, secret);

    const authorizeUrl =
      `https://connect.stripe.com/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&scope=read_write` +
      `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
      `&state=${encodeURIComponent(signedState)}`;

    this.logger.log({ brandId: snapshot.id }, 'OAuth authorize URL built for brand.');

    return { authorizeUrl, nonce };
  }

  async handleOAuthCallback(input: HandleOAuthCallbackInput): Promise<HandleOAuthCallbackResult> {
    const secret = this.env.BETTER_AUTH_SECRET;
    if (!secret) {
      throw new BadRequestException('OAuth state signing secret is not configured.');
    }

    const verified = verifyOAuthState(input.state, secret);
    if (verified === null) {
      throw new BadRequestException('Invalid or expired OAuth state.');
    }

    if (verified.nonce !== input.nonce) {
      throw new BadRequestException('OAuth state nonce mismatch — possible replay attack.');
    }

    const snapshot = await this.brandRepo.findById(verified.brandId as never);
    if (snapshot === null) {
      throw new NotFoundException(`Brand "${verified.brandId}" not found.`);
    }

    const { accountId } = await this.provider.exchangeOAuthCode({ code: input.code });

    const brand = Brand.fromSnapshot(snapshot);
    brand.linkPaymentAccount(accountId, 'standard');

    try {
      const capabilities = await this.provider.retrieveAccount({ accountId });
      brand.applyPaymentCapabilities({
        chargesEnabled: capabilities.chargesEnabled,
        payoutsEnabled: capabilities.payoutsEnabled,
        onboardingStatus: capabilities.chargesEnabled ? 'complete' : 'pending',
        requirementsDue: capabilities.requirementsDue,
      });
    } catch {
      this.logger.warn(
        { brandId: verified.brandId },
        'Could not retrieve account capabilities after OAuth; will wait for account.updated webhook.',
      );
    }

    await this.brandRepo.updatePaymentConnection(brand);

    this.logger.log(
      { brandId: verified.brandId, accountId },
      'Brand linked via Connect Standard OAuth.',
    );

    const adminWebUrl = this.env.ADMIN_WEB_URL ?? '';
    const brandSnap = brand.toSnapshot();
    const redirectUrl = `${adminWebUrl}/dashboard/${brandSnap.slug}/brands/${brandSnap.slug}/payouts`;

    return { redirectUrl };
  }
}
