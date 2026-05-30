/**
 * Entry point for `apps/api`.
 *
 * Order of operations matters — see comments below. The
 * `bootstrap-telemetry` import MUST be the very first line so OTel
 * patches Node built-ins before NestJS or any infrastructure adapter
 * loads.
 */
import './bootstrap-telemetry';
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  assertInboxProcessedDeletable,
  assertNoBaCredentialAccess,
  assertNoRlsBypass,
  assertSetConfigRevoked,
  assertTenantLockInstalled,
  assertWithoutTenantCallsiteRegistered,
} from '@resto/db';
import { AppModule } from './app.module';
import { assertSystemRolesPresent } from './bootstrap/assert-system-roles-present';
import { ENV_TOKEN } from './config/config.module';
import { loadEnv, type Env } from './config/env.schema';
import { assertProdGuardrails } from './config/prod-guardrails';
import { parseTrustProxy } from './config/trust-proxy';
import { EMAIL_ADAPTER_PORT, type EmailAdapterPort } from './contexts/identity/domain/ports';
import { assertEmailAdapterWired } from './contexts/identity/identity-core.module';
import { applyOpenApi } from './openapi';
import { registerSecurity } from './shared/security';

const bootstrap = async (): Promise<void> => {
  const logger = new Logger('bootstrap');
  // Load env early so the FastifyAdapter sees the validated TRUST_PROXY
  // value (RES-165). The ConfigModule re-loads it inside the container —
  // both calls are pure and produce the same result.
  const bootEnv = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: parseTrustProxy(bootEnv.TRUST_PROXY), logger: false }),
    { abortOnError: true },
  );

  const env = app.get<Env>(ENV_TOKEN);

  // RLS preflight — refuse to start if the DB connection role can
  // bypass row-level security. Surfaces the misconfiguration in the
  // very first log line rather than the day a tenant discovers
  // another tenant's data (RES-83).
  await assertNoRlsBypass(env.DATABASE_URL);

  // RES-243: refuse to start if the GUC lock (app_bind_tenant wrapper +
  // revoked set_config) is not installed. Catches mis-deploy where the
  // new image rolls before `pnpm db:migrate` completes.
  await assertTenantLockInstalled(env.DATABASE_URL);
  await assertSetConfigRevoked(env.DATABASE_URL);

  // TEN-07: refuse to start if migration 0027 has silently regressed and
  // resto_app retains any SELECT/INSERT/UPDATE on the BA credential
  // tables (account, session, two_factor, verification). Heavier DB
  // check runs first so infra misconfig fails fast.
  await assertNoBaCredentialAccess(env.DATABASE_URL);

  // TEN-13: refuse to start if resto_app lacks DELETE on inbox_processed.
  // Without this grant the daily InboxRetentionService cron is a silent
  // no-op (the service swallows permission errors). Defense-in-depth
  // alongside migration 0028 and the GRANT block in roles.sql.
  await assertInboxProcessedDeletable(env.DATABASE_URL);

  // TEN-11: refuse to start if any entry in WITHOUT_TENANT_ALLOWLIST
  // points at a file that no longer exists (renamed / deleted source).
  // Pure FS check (D-08 + Pitfall 6) — the call-site fence itself is
  // the ESLint job (TEN-12).
  assertWithoutTenantCallsiteRegistered();

  // AUTH-09 / D-16 (Phase 3 / Plan 05): refuse to start if the BA
  // accessControl map (the in-code `owner` / `admin` / `staff` presets fed
  // to the organization() plugin at construction time) has drifted from
  // packages/domain SYSTEM_ROLES. Synchronous fail-fast — mirrors the other
  // boot-time assertions above. No DB access; pure code-vs-code equality.
  assertSystemRolesPresent();

  // ADR-0020 I-3 defense-in-depth: refuse to start if any tracked
  // dev-fallback constant is still present in a non-dev NODE_ENV.
  // First pass: env-only (catches missing RESEND_API_KEY before adapter
  // construction — important so the email-adapter factory failure mode is
  // a clean ProdGuardrailsError instead of an opaque DI exception).
  assertProdGuardrails(env);

  // D-01 / D-15 / Skeptic HIGH-2 second pass: now that NestJS has built
  // the EMAIL_ADAPTER_PORT provider, assert the wired adapter class is
  // ResendEmailAdapter (catches a mis-wired MailHog in prod) AND ping it
  // (catches an invalid RESEND_API_KEY before the first invitation).
  const emailAdapter = app.get<EmailAdapterPort>(EMAIL_ADAPTER_PORT);
  assertProdGuardrails(env, { emailAdapterName: emailAdapter.adapterName });
  await assertEmailAdapterWired(
    env.NODE_ENV,
    {
      sendInvitationEmail: () => Promise.resolve(),
      sendResetPassword: () => Promise.resolve(),
      sendVerificationEmail: () => Promise.resolve(),
    },
    emailAdapter,
  );

  await registerSecurity(app, env);
  applyOpenApi(app, env);
  app.enableShutdownHooks();

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  logger.log(`Resto api listening on :${env.API_PORT.toString()}`);
};

bootstrap().catch((err: unknown) => {
  console.error('api failed to start:', err);
  process.exit(1);
});
