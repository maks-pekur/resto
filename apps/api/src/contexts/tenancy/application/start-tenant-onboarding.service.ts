import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { PAYMENT_PROVIDER_PORT, type PaymentProviderPort } from '../../payments/domain/ports';
import { StripeOnboardingFailedError, TenantNotFoundError } from '../domain/errors';
import { encodeOAuthState, verifyOAuthState } from '../domain/oauth-state';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { Tenant, type StripeOnboardingStatus } from '../domain/tenant.aggregate';

export interface GetTenantOnboardingStatusResult {
  readonly accountType: 'express' | 'standard' | null;
  readonly onboardingStatus: StripeOnboardingStatus;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly canAcceptPayments: boolean;
  readonly requirementsDue: string[] | null;
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
}

export interface HandleOAuthCallbackResult {
  readonly redirectUrl: string;
}

/**
 * Single surviving Stripe Connect onboarding path (D-39) — the tenant-level
 * `linkStripeAccount`/`applyStripeCapabilities` columns this reads/writes are
 * the real, `account.updated`-webhook-driven ones (PAY-05). The dead sibling
 * that called a no-op `Tenant.linkStripeAccount` stub is deleted, not merged.
 */
@Injectable()
export class StartTenantOnboardingService {
  private readonly logger = new Logger(StartTenantOnboardingService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(PAYMENT_PROVIDER_PORT) private readonly provider: PaymentProviderPort,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  private async ensureTenantAccount(): Promise<{ accountId: string; tenant: Tenant }> {
    const { tenantId } = requireTenantContext();
    const tenant = await this.repo.findCurrentTenant();
    if (tenant === null) {
      throw new TenantNotFoundError(tenantId);
    }
    const snapshot = tenant.toSnapshot();
    if (snapshot.stripeAccountId !== null) {
      return { accountId: snapshot.stripeAccountId, tenant };
    }
    try {
      const result = await this.provider.ensureOnboardingAccount({
        tenantId: snapshot.id,
        displayName: snapshot.displayName,
        country: snapshot.country,
        defaultCurrency: snapshot.defaultCurrency,
        accountType: 'express',
      });
      tenant.linkStripeAccount(result.accountId, 'express');
      await this.repo.save(tenant);
      this.logger.log(
        { tenantId: snapshot.id, accountId: result.accountId },
        'Stripe Express account linked to tenant.',
      );
      return { accountId: result.accountId, tenant };
    } catch (err) {
      throw new StripeOnboardingFailedError(
        snapshot.id,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  async createEmbeddedSession(): Promise<CreateEmbeddedSessionResult> {
    const { accountId } = await this.ensureTenantAccount();
    const session = await this.provider.createOnboardingSession({ accountId });
    return { clientSecret: session.clientSecret };
  }

  async createHostedLink(): Promise<CreateHostedLinkResult> {
    const { accountId } = await this.ensureTenantAccount();
    const link = await this.provider.createOnboardingLink({
      accountId,
      returnUrl: this.env.STRIPE_CONNECT_RETURN_URL,
      refreshUrl: this.env.STRIPE_CONNECT_REFRESH_URL,
    });
    return { onboardingUrl: link.url };
  }

  async getStatus(): Promise<GetTenantOnboardingStatusResult> {
    const { tenantId } = requireTenantContext();
    const tenant = await this.repo.findCurrentTenant();
    if (tenant === null) {
      throw new TenantNotFoundError(tenantId);
    }
    const snapshot = tenant.toSnapshot();
    return {
      accountType: snapshot.accountType,
      onboardingStatus: snapshot.stripeOnboardingStatus,
      chargesEnabled: snapshot.stripeChargesEnabled,
      payoutsEnabled: snapshot.stripePayoutsEnabled,
      canAcceptPayments: tenant.canAcceptPayments(),
      requirementsDue: snapshot.stripeRequirementsDue,
    };
  }

  async startOAuth(): Promise<StartOAuthResult> {
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

    const { tenantId } = requireTenantContext();
    const tenant = await this.repo.findCurrentTenant();
    if (tenant === null) {
      throw new TenantNotFoundError(tenantId);
    }
    const snapshot = tenant.toSnapshot();

    const nonce = crypto.randomUUID();
    const signedState = encodeOAuthState({ tenantId: snapshot.id, nonce }, secret);

    const authorizeUrl =
      `https://connect.stripe.com/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&scope=read_write` +
      `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
      `&state=${encodeURIComponent(signedState)}`;

    this.logger.log({ tenantId: snapshot.id }, 'OAuth authorize URL built for tenant.');

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

    const tenantId = TenantId.parse(verified.tenantId);
    const snapshot = await this.repo.findById(tenantId);
    if (snapshot === null) {
      throw new TenantNotFoundError(verified.tenantId);
    }

    const { accountId } = await this.provider.exchangeOAuthCode({ code: input.code });

    const tenant = Tenant.fromSnapshot(snapshot);
    tenant.linkStripeAccount(accountId, 'standard');

    try {
      const capabilities = await this.provider.retrieveAccount({ accountId });
      tenant.applyStripeCapabilities({
        chargesEnabled: capabilities.chargesEnabled,
        payoutsEnabled: capabilities.payoutsEnabled,
        onboardingStatus: capabilities.chargesEnabled ? 'complete' : 'pending',
        requirementsDue: capabilities.requirementsDue,
      });
    } catch {
      this.logger.warn(
        { tenantId: verified.tenantId },
        'Could not retrieve account capabilities after OAuth; will wait for account.updated webhook.',
      );
    }

    await this.repo.save(tenant);

    this.logger.log(
      { tenantId: verified.tenantId, accountId },
      'Tenant linked via Connect Standard OAuth.',
    );

    const adminWebUrl = this.env.ADMIN_WEB_URL ?? '';
    const redirectUrl = `${adminWebUrl}/payouts`;

    return { redirectUrl };
  }
}
