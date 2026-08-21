/**
 * `--payments-ready` support for `seed-demo` (10.2 plan 18 Task 3).
 *
 * The payments module always wires the live Stripe SDK — there is no dev
 * stub — so a seeded restaurant can only accept payments if
 * `stripe_account_id` is a real Stripe TEST-mode connected account id that
 * genuinely exists under the developer's Stripe account. Neither this seed
 * nor any script can fabricate one: Express accounts cannot accept
 * `tos_acceptance` via the API, so Connect onboarding requires at least one
 * human pass through Stripe's hosted form. That is the fidelity/
 * reproducibility tradeoff 10.2-18-PLAN.md's Task 3 asked the founder to
 * choose between (Option A vs Option B). This module is Option A: read a
 * real account id from the environment and stamp it onto one seeded
 * tenant, gated by an explicit flag and a dev/test-only guardrail.
 */
import type { Sql } from 'postgres';

const ALLOWED_NODE_ENVS = ['development', 'test'] as const;

export class PaymentsReadyGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentsReadyGuardError';
  }
}

/**
 * Allowlist, not a blocklist — same shape as
 * `packages/db/src/cli/reset-guards.ts:assertNodeEnvAllowed`. An unset or
 * mistyped NODE_ENV must fail closed, not silently pass because it didn't
 * match a forbidden value.
 */
export const assertPaymentsReadyAllowed = (nodeEnv: string | undefined): void => {
  if (!nodeEnv || !(ALLOWED_NODE_ENVS as readonly string[]).includes(nodeEnv)) {
    throw new PaymentsReadyGuardError(
      `--payments-ready refused: NODE_ENV must be one of ${ALLOWED_NODE_ENVS.join('/')} ` +
        `(got ${JSON.stringify(nodeEnv ?? '<unset>')}). This is an allowlist, not a blocklist ` +
        '— typos and unset values are refused. A seed flag that can fabricate payment ' +
        'readiness outside development/test is a real hazard, not a convenience ' +
        '(assertProdGuardrails / ADR-0020 I-3 precedent).',
    );
  }
};

export class MissingStripeTestAccountError extends Error {
  constructor() {
    super(
      'SEED_STRIPE_TEST_ACCOUNT_ID is not set. --payments-ready needs a real Stripe TEST-mode ' +
        'connected account id (starts with "acct_") — the seed cannot fabricate one; Stripe ' +
        'rejects PaymentIntent creation against an account that does not exist. Get one by ' +
        'completing Connect onboarding once, in test mode, for any tenant: sign in as ' +
        'owner@demo.local at http://localhost:4000, open the payments-onboarding screen, and ' +
        'finish the Stripe-hosted Express onboarding form (Stripe test mode has a one-click ' +
        '"skip and use test data" shortcut — no real business details needed). Then read the ' +
        'resulting id back from the tenants row (SELECT stripe_account_id FROM tenants WHERE ' +
        "slug = '<slug>') or the Stripe test-mode dashboard (Connect -> Accounts), and re-run: " +
        'SEED_STRIPE_TEST_ACCOUNT_ID=acct_xxx pnpm resto:seed seed-demo --payments-ready',
    );
    this.name = 'MissingStripeTestAccountError';
  }
}

export const requireStripeTestAccountId = (env: NodeJS.ProcessEnv): string => {
  const value = env.SEED_STRIPE_TEST_ACCOUNT_ID;
  if (!value || value.trim().length === 0) {
    throw new MissingStripeTestAccountError();
  }
  return value.trim();
};

/**
 * Stamps the columns `Tenant.canAcceptPayments()` and
 * `create-checkout-payment.service.ts` read directly onto one tenant row,
 * bypassing the real Connect onboarding flow this seed cannot drive
 * headlessly. `account_type` is set alongside for row coherence — every
 * account this app's own onboarding path creates is `express`
 * (`ensureOnboardingAccount` in stripe-provider.adapter.ts), so a seeded
 * row should look like one, not merely pass the two-column gate the
 * checkout path actually enforces.
 */
export const markTenantPaymentsReady = async (
  sql: Sql,
  tenantId: string,
  stripeAccountId: string,
): Promise<void> => {
  await sql.begin(async (tx) => {
    await tx`SELECT app_bind_tenant(${tenantId}::text, false)`;
    await tx`
      UPDATE tenants
         SET stripe_account_id = ${stripeAccountId},
             account_type = 'express',
             stripe_charges_enabled = true,
             stripe_payouts_enabled = true,
             stripe_onboarding_status = 'complete',
             updated_at = now()
       WHERE id = ${tenantId}
    `;
  });
};
