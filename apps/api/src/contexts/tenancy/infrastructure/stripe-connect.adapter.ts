import { Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import type { Env } from '../../../config/env.schema';
import type {
  CancelPaymentIntentInput,
  CancelPaymentIntentResult,
  CreateAccountLinkInput,
  CreateAccountLinkResult,
  CreateExpressAccountInput,
  CreateExpressAccountResult,
  CreatePaymentIntentInput,
  CreatePaymentIntentResult,
  CreateRefundInput,
  CreateRefundResult,
  RetrieveAccountInput,
  RetrieveAccountResult,
  StripeConnectPort,
} from '../domain/ports';

/** D-05 retry budget: [immediate, +250ms, +1000ms, +4000ms] — total < 6s. */
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

/** Minimal Stripe SDK surface this adapter touches — allows test injection. */
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
}

type StripeEnv = Pick<
  Env,
  'STRIPE_APPLICATION_FEE_AMOUNT' | 'STRIPE_CONNECT_RETURN_URL' | 'STRIPE_CONNECT_REFRESH_URL'
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
export class StripeConnectAdapter implements StripeConnectPort {
  readonly #client: StripeClientLike;
  readonly #logger: Logger;

  constructor(client: StripeClientLike, _env: StripeEnv, logger?: Logger) {
    this.#client = client;
    this.#logger = logger ?? new Logger(StripeConnectAdapter.name);
  }

  async ensureExpressAccount(input: {
    tenantId: string;
    displayName: string;
  }): Promise<string | null> {
    const result = await this.createExpressAccount({
      tenantId: input.tenantId as Parameters<typeof this.createExpressAccount>[0]['tenantId'],
      displayName: input.displayName,
    });
    return result.accountId;
  }

  async createExpressAccount(
    input: CreateExpressAccountInput,
  ): Promise<CreateExpressAccountResult> {
    const account = await withRetry(this.#logger, 'accounts.create', () =>
      this.#client.accounts.create({
        type: 'express',
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

  async createAccountLink(input: CreateAccountLinkInput): Promise<CreateAccountLinkResult> {
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

  async retrieveAccount(input: RetrieveAccountInput): Promise<RetrieveAccountResult> {
    const account = await withRetry(this.#logger, 'accounts.retrieve', () =>
      this.#client.accounts.retrieve(input.accountId),
    );
    return {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      requirementsDue: account.requirements?.currently_due ?? null,
    };
  }
}

/** Factory — wraps the real Stripe SDK instance into StripeClientLike. Tests use StripeConnectAdapter directly with a mock. */
export const createStripeClientAdapter = (
  stripe: Stripe,
  env: StripeEnv,
  logger?: Logger,
): StripeConnectAdapter => {
  const client: StripeClientLike = {
    accounts: {
      create: (params, opts) => stripe.accounts.create(params, opts),
      retrieve: (id, params, opts) => stripe.accounts.retrieve(id, params, opts),
    },
    accountLinks: {
      create: (params, opts) => stripe.accountLinks.create(params, opts),
    },
    paymentIntents: {
      create: (params, opts) => stripe.paymentIntents.create(params, opts),
      cancel: (id, params, opts) => stripe.paymentIntents.cancel(id, params, opts),
    },
    refunds: {
      create: (params, opts) => stripe.refunds.create(params, opts),
    },
  };
  return new StripeConnectAdapter(client, env, logger);
};
