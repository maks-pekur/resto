import { Logger } from '@nestjs/common';
import { type TenantAwareDb } from '@resto/db';
import { Resend } from 'resend';
import type { Env } from '../../../../config/env.schema';
import type { EmailAdapterPort } from '../../domain/ports';
import { CapturedEmailAdapter } from './captured.adapter';
import { MailhogSmtpAdapter } from './mailhog-smtp.adapter';
import { createResendClientAdapter, type ResendEmailAdapter } from './resend.adapter';

/**
 * `RESEND_API_KEY` placeholder embedded in `.env.example` to keep `pnpm
 * dev:up` working without the operator having a real Resend account. The
 * value MUST NEVER reach staging/production — `assertProdGuardrails` (D-01)
 * rejects it at boot, and so does this factory as a second-line gate.
 */
export const DUMMY_RESEND_API_KEY = 're_test_dummy_for_ci_do_not_use_in_prod';

export class EmailAdapterFactoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailAdapterFactoryError';
  }
}

/**
 * NODE_ENV-keyed adapter selection (D-01, D-13):
 *   development → MailhogSmtpAdapter (docker MailHog on :1025)
 *   test        → CapturedEmailAdapter (in-memory; queryable by tests)
 *   staging|production → ResendEmailAdapter (real Resend SDK)
 *
 * Throws at construction time when staging/production is missing
 * `RESEND_API_KEY` or carries the documented dummy value. This is
 * defense-in-depth alongside `assertProdGuardrails` (D-01) — the factory
 * runs at NestJS DI container build, which is before any controller mounts
 * but after `assertProdGuardrails`. If the schema-level guard is bypassed
 * (env injected via test override that skips loadEnv), this catches it.
 */
export const createEmailAdapter = (
  env: Env,
  deps: { readonly db: TenantAwareDb; readonly logger?: Logger },
): EmailAdapterPort => {
  const logger = deps.logger ?? new Logger('EmailAdapter');

  switch (env.NODE_ENV) {
    case 'test':
      return new CapturedEmailAdapter();

    case 'development':
      return new MailhogSmtpAdapter(env);

    case 'staging':
    case 'production': {
      if (!env.RESEND_API_KEY || env.RESEND_API_KEY.trim().length === 0) {
        throw new EmailAdapterFactoryError(
          `RESEND_API_KEY required in NODE_ENV=${env.NODE_ENV} — Phase 3 D-01 boot guard.`,
        );
      }
      if (env.RESEND_API_KEY === DUMMY_RESEND_API_KEY) {
        throw new EmailAdapterFactoryError(
          `RESEND_API_KEY in NODE_ENV=${env.NODE_ENV} is the documented dummy ` +
            `value (${DUMMY_RESEND_API_KEY}). Set a real key in your deployment ` +
            `secrets (Vault / 1Password Connect / cloud secret manager).`,
        );
      }
      return createResendClientAdapter(new Resend(env.RESEND_API_KEY), env, deps.db, logger);
    }

    default: {
      const exhaustive: never = env.NODE_ENV;
      throw new EmailAdapterFactoryError(`Unsupported NODE_ENV: ${String(exhaustive)}`);
    }
  }
};

/** Type-guard helper used by `assertProdGuardrails` and tests. */
export const isResendEmailAdapter = (adapter: EmailAdapterPort): adapter is ResendEmailAdapter =>
  adapter.adapterName === 'resend';
