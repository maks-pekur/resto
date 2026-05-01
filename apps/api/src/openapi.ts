import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { stringify } from 'yaml';

const buildDocumentConfig = (): ReturnType<DocumentBuilder['build']> =>
  new DocumentBuilder()
    .setTitle('Resto API')
    .setDescription('Resto multi-tenant SaaS backend.')
    .setVersion('0.0.0')
    .addBearerAuth()
    .build();

/**
 * Mount Swagger UI at `/docs` and JSON at `/docs-json`. The same
 * document is what `openapi:emit` writes to `docs/api/openapi.yaml`.
 */
export const applyOpenApi = (app: INestApplication): void => {
  const document = SwaggerModule.createDocument(app, buildDocumentConfig());
  SwaggerModule.setup('docs', app, document);
};

/**
 * Emit the OpenAPI document without booting a real HTTP listener — used
 * by `pnpm api:openapi:emit` to keep `docs/api/openapi.yaml` in sync
 * with the controller surface.
 */
export const emitOpenApi = async (outputPath: string): Promise<void> => {
  // Lazy-import so this script can be invoked without OTel side effects.
  const { NestFactory } = await import('@nestjs/core');
  const { FastifyAdapter } = await import('@nestjs/platform-fastify');
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.create(AppModule, new FastifyAdapter({ logger: false }), {
    logger: false,
  });
  await app.init();
  const document = SwaggerModule.createDocument(app, buildDocumentConfig());
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, stringify(document));
  await app.close();
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const target = resolve(import.meta.dirname, '..', '..', '..', 'docs', 'api', 'openapi.yaml');
  emitOpenApi(target).catch((err: unknown) => {
    console.error('openapi:emit failed:', err);
    process.exit(1);
  });
}
