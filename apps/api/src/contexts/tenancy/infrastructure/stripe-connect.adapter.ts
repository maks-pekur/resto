import { Injectable, Logger } from '@nestjs/common';
import type { StripeConnectPort } from '../domain/ports';

/**
 * No-op placeholder. Returns `null` for every call — provisioning still
 * succeeds, the tenants table records `stripe_account_id` as NULL, and
 * the real Stripe-Connect Express flow lands with the payments slice in
 * MVP-2 (ADR-0009 / ADR-0010).
 */
@Injectable()
export class NoopStripeConnectAdapter implements StripeConnectPort {
  private readonly logger = new Logger(NoopStripeConnectAdapter.name);

  ensureExpressAccount(input: { tenantId: string; displayName: string }): Promise<string | null> {
    this.logger.debug(
      { tenantId: input.tenantId },
      'Stripe Connect onboarding skipped — placeholder adapter (MVP-2).',
    );
    return Promise.resolve(null);
  }
}
