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
import { assertNoRlsBypass } from '@resto/db';
import { AppModule } from './app.module';
import { ENV_TOKEN } from './config/config.module';
import { loadEnv, type Env } from './config/env.schema';
import { assertProdGuardrails } from './config/prod-guardrails';
import { parseTrustProxy } from './config/trust-proxy';
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

  // ADR-0020 I-3 defense-in-depth: refuse to start if any tracked
  // dev-fallback constant is still present in a non-dev NODE_ENV.
  assertProdGuardrails(env);

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
