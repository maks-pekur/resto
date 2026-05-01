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
import type { Env } from './config/env.schema';
import { applyOpenApi } from './openapi';

const bootstrap = async (): Promise<void> => {
  const logger = new Logger('bootstrap');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, logger: false }),
    { abortOnError: true },
  );

  const env = app.get<Env>(ENV_TOKEN);

  // RLS preflight — refuse to start if the DB connection role can
  // bypass row-level security. Surfaces the misconfiguration in the
  // very first log line rather than the day a tenant discovers
  // another tenant's data (RES-83).
  await assertNoRlsBypass(env.DATABASE_URL);

  applyOpenApi(app);
  app.enableShutdownHooks();

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  logger.log(`Resto api listening on :${env.API_PORT.toString()}`);
};

bootstrap().catch((err: unknown) => {
  console.error('api failed to start:', err);
  process.exit(1);
});
