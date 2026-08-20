import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import type { Env } from '../../../../config/env.schema';
import type {
  CancelPaymentIntentInput,
  CancelPaymentIntentResult,
  CreateOnboardingAccountInput,
  CreateOnboardingAccountResult,
  CreateOnboardingLinkInput,
  CreateOnboardingLinkResult,
  CreatePaymentIntentInput,
  CreatePaymentIntentResult,
  CreateRefundInput,
  CreateRefundResult,
  PaymentProviderPort,
  RetrieveAccountInput,
  RetrieveAccountResult,
  WebhookEvent,
} from '../../domain/ports';

const RETRY_DELAYS_MS = [0, 250, 1000, 4000] as const;
const CALL_TIMEOUT_MS = 5500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const jitter = (): number => Math.floor(Math.random() * 100);

const isRetryable = (statusCode: number | null | undefined): boolean => {
  if (statusCode === null || statusCode === undefined) return true;
  return statusCode >= 500 && statusCode <= 599;
};

const getStatusCode = (err: unknown): number | null => {
  if (err !== null && typeof err === 'object' && 'statusCode' in err) {
    const code = (err as Record<string, unknown>).statusCode;
    return typeof code === 'number' ? code : null;
  }
  return null;
};

export interface StripeClientLike {
  readonly accounts: {
    create(
      params: Stripe.AccountCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<{ id: string }>;
    retrieve(
      id: string,
      params?: Stripe.AccountRetrieveParams,
      options?: Stripe.RequestOptions,
    ): Promise<{
      id: string;
      charges_enabled: boolean;
      payouts_enabled: boolean;
      requirements?: { currently_due?: readonly string[] | null } | null;
    }>;
  };
  readonly accountLinks: {
    create(
      params: Stripe.AccountLinkCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<{ url: string; expires_at: number }>;
  };
  readonly accountSessions: {
    create(
      params: Stripe.AccountSessionCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<{ client_secret: string }>;
  };
  readonly paymentIntents: {
    create(
      params: Stripe.PaymentIntentCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<{ id: string; client_secret: string | null; status: string }>;
    cancel(
      id: string,
      params?: Stripe.PaymentIntentCancelParams,
      options?: Stripe.RequestOptions,
    ): Promise<{ id: string; status: string }>;
  };
  readonly refunds: {
    create(
      params: Stripe.RefundCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<{ id: string; status: string | null }>;
  };
  readonly oauth: {
    token(params: {
      grant_type: string;
      code: string;
    }): Promise<{ stripe_user_id?: string | null }>;
  };
}

type StripeEnv = Pick<
  Env,
  | 'STRIPE_APPLICATION_FEE_AMOUNT'
  | 'STRIPE_CONNECT_RETURN_URL'
  | 'STRIPE_CONNECT_REFRESH_URL'
  | 'STRIPE_WEBHOOK_SECRET'
>;

async function withTimeout<T>(fn: () => Promise<T>): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Stripe call timed out after ${String(CALL_TIMEOUT_MS)}ms`));
    }, CALL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function withRetry<T>(logger: Logger, label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt] ?? 0;
    if (delay > 0) await sleep(delay + jitter());
    try {
      return await withTimeout(fn);
    } catch (err) {
      lastErr = err;
      const code = getStatusCode(err);
      if (!isRetryable(code)) {
        logger.warn(
          { label, attempt: attempt + 1, statusCode: code },
          'Stripe call terminal error — not retrying',
        );
        throw err;
      }
      if (attempt < RETRY_DELAYS_MS.length - 1) {
        logger.warn(
          { label, attempt: attempt + 1, statusCode: code },
          'Stripe call transient error — retrying',
        );
      } else {
        logger.error(
          { label, attempt: attempt + 1, statusCode: code },
          'Stripe call exhausted retries',
        );
      }
    }
  }
  throw lastErr;
}

@Injectable()
export class StripeProviderAdapter implements PaymentProviderPort {
  readonly #client: StripeClientLike;
  readonly #logger: Logger;
  readonly #webhookSecret: string;

  constructor(client: StripeClientLike, env: StripeEnv, logger?: Logger) {
    this.#client = client;
    this.#webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? '';
    this.#logger = logger ?? new Logger(StripeProviderAdapter.name);
  }

  async ensureOnboardingAccount(
    input: CreateOnboardingAccountInput,
  ): Promise<CreateOnboardingAccountResult> {
    const account = await withRetry(this.#logger, 'accounts.create', () =>
      this.#client.accounts.create({
        type: 'express',
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.displayName !== '' ? { business_profile: { name: input.displayName } } : {}),
        ...(input.defaultCurrency !== undefined ? { default_currency: input.defaultCurrency } : {}),
      }),
    );
    this.#logger.log(
      { tenantId: input.tenantId, accountId: account.id },
      'Stripe Express account created.',
    );
    return { accountId: account.id };
  }

  async createOnboardingLink(
    input: CreateOnboardingLinkInput,
  ): Promise<CreateOnboardingLinkResult> {
    const link = await withRetry(this.#logger, 'accountLinks.create', () =>
      this.#client.accountLinks.create({
        account: input.accountId,
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        type: 'account_onboarding',
      }),
    );
    return { url: link.url, expiresAt: link.expires_at };
  }

  async createOnboardingSession(input: { accountId: string }): Promise<{ clientSecret: string }> {
    const session = await withRetry(this.#logger, 'accountSessions.create', () =>
      this.#client.accountSessions.create({
        account: input.accountId,
        components: { account_onboarding: { enabled: true } },
      }),
    );
    return { clientSecret: session.client_secret };
  }

  async exchangeOAuthCode(input: { code: string }): Promise<{ accountId: string }> {
    const resp = await withRetry(this.#logger, 'oauth.token', () =>
      this.#client.oauth.token({ grant_type: 'authorization_code', code: input.code }),
    );
    const accountId = resp.stripe_user_id;
    if (accountId === null || accountId === undefined || accountId === '') {
      throw new Error('OAuth token exchange did not return a stripe_user_id');
    }
    return { accountId };
  }

  async retrieveAccount(input: RetrieveAccountInput): Promise<RetrieveAccountResult> {
    const account = await withRetry(this.#logger, 'accounts.retrieve', () =>
      this.#client.accounts.retrieve(input.accountId),
    );
    const currentlyDue = account.requirements?.currently_due ?? null;
    return {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      requirementsDue: currentlyDue ? [...currentlyDue] : null,
    };
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult> {
    const idempotencyKey = `pi:${input.orderId}:${String(input.attempt)}`;
    const pi = await withRetry(this.#logger, 'paymentIntents.create', () =>
      this.#client.paymentIntents.create(
        {
          amount: input.amountMinor,
          currency: input.currency.toLowerCase(),
          application_fee_amount: input.applicationFeeMinor,
          metadata: input.metadata,
        },
        {
          stripeAccount: input.connectedAccountId,
          idempotencyKey,
        },
      ),
    );
    return {
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret ?? '',
      status: pi.status,
    };
  }

  async cancelPaymentIntent(input: CancelPaymentIntentInput): Promise<CancelPaymentIntentResult> {
    const result = await withRetry(this.#logger, 'paymentIntents.cancel', () =>
      this.#client.paymentIntents.cancel(
        input.paymentIntentId,
        input.reason !== undefined
          ? {
              cancellation_reason:
                input.reason as Stripe.PaymentIntentCancelParams.CancellationReason,
            }
          : undefined,
        { stripeAccount: input.connectedAccountId },
      ),
    );
    return { status: result.status };
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    const idempotencyKey = `refund:${input.refundRequestId}`;
    const refund = await withRetry(this.#logger, 'refunds.create', () =>
      this.#client.refunds.create(
        {
          payment_intent: input.paymentIntentId,
          ...(input.amountMinor !== undefined ? { amount: input.amountMinor } : {}),
          reason: input.reason as Stripe.RefundCreateParams.Reason,
        },
        {
          stripeAccount: input.connectedAccountId,
          idempotencyKey,
        },
      ),
    );
    return { stripeRefundId: refund.id, status: refund.status ?? 'unknown' };
  }

  verifyWebhookSignature(input: { rawBody: Buffer; signature: string }): WebhookEvent {
    return Stripe.webhooks.constructEvent(input.rawBody, input.signature, this.#webhookSecret);
  }
}

export const createStripeProviderAdapter = (
  stripe: Stripe,
  env: StripeEnv,
  logger?: Logger,
): StripeProviderAdapter => {
  const client: StripeClientLike = {
    accounts: {
      create: (params, opts) => stripe.accounts.create(params, opts),
      retrieve: (id, params, opts) => stripe.accounts.retrieve(id, params, opts),
    },
    accountLinks: {
      create: (params, opts) => stripe.accountLinks.create(params, opts),
    },
    accountSessions: {
      create: (params, opts) => stripe.accountSessions.create(params, opts),
    },
    paymentIntents: {
      create: (params, opts) => stripe.paymentIntents.create(params, opts),
      cancel: (id, params, opts) => stripe.paymentIntents.cancel(id, params, opts),
    },
    refunds: {
      create: (params, opts) => stripe.refunds.create(params, opts),
    },
    oauth: {
      token: (params) =>
        stripe.oauth.token({ grant_type: 'authorization_code', code: params.code }),
    },
  };
  return new StripeProviderAdapter(client, env, logger);
};
