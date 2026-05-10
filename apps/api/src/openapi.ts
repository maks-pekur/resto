import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { OpenAPIObject } from '@nestjs/swagger';
import { stringify } from 'yaml';

const buildDocumentConfig = (): ReturnType<DocumentBuilder['build']> =>
  new DocumentBuilder()
    .setTitle('Resto API')
    .setDescription('Resto multi-tenant SaaS backend.')
    .setVersion('0.0.0')
    .addBearerAuth()
    .build();

/**
 * Strip every path under `/internal/v1/*` from the public OpenAPI doc
 * (RES-175). Mounting Swagger UI at `/docs` without auth would otherwise
 * leak the existence and shape of every internal/admin endpoint.
 * Admin tooling reads the internal surface from the emitted YAML
 * artifact (`docs/api/openapi.yaml` — see `emitOpenApi` below) instead.
 */
const stripInternalPaths = (doc: OpenAPIObject): OpenAPIObject => {
  const filtered: typeof doc.paths = {};
  for (const [path, def] of Object.entries(doc.paths)) {
    if (path.startsWith('/internal/')) continue;
    filtered[path] = def;
  }
  return { ...doc, paths: filtered };
};

/**
 * Mount Swagger UI at `/docs` and JSON at `/docs-json`. The
 * publicly-served document hides `/internal/v1/*` (RES-175); the
 * artifact written by `emitOpenApi` keeps the full surface so admin
 * tooling can codegen against it.
 */
export const applyOpenApi = (app: INestApplication): void => {
  const document = stripInternalPaths(
    cleanupOpenApiDoc(SwaggerModule.createDocument(app, buildDocumentConfig())),
  );
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
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, buildDocumentConfig()));
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
