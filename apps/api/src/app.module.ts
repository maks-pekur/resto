import {
  BadRequestException,
  MiddlewareConsumer,
  Module,
  RequestMethod,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { createZodValidationPipe } from 'nestjs-zod';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './infrastructure/database.module';
import { NatsModule } from './infrastructure/nats.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './contexts/audit/audit.module';
import { CatalogModule } from './contexts/catalog/catalog.module';
import { TenancyModule } from './contexts/tenancy/tenancy.module';
import { IdentityHttpModule } from './contexts/identity/identity-http.module';
import { CorrelationMiddleware } from './shared/correlation.middleware';
import { ProblemDetailsFilter } from './shared/exception.filter';
import { TenantContextMiddleware } from './shared/tenant-context.middleware';

/**
 * Global Zod validation pipe — runs on every `@Body()`/`@Query()`/`@Param()`
 * typed with a `createZodDto(...)` class. Validation failures throw
 * `BadRequestException({code:'validation.failed', ...})` so the global
 * `ProblemDetailsFilter` renders them as RFC-7807 problem+json with a
 * stable `type` URI of `https://resto.app/problems/validation.failed`.
 */
const RestoZodValidationPipe = createZodValidationPipe({
  createValidationException: (zodError) => {
    const issues =
      zodError && typeof zodError === 'object' && 'issues' in zodError
        ? (zodError as { issues: { path: (string | number)[]; message: string }[] }).issues
        : [];
    const detail = issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ');
    return new BadRequestException({
      code: 'validation.failed',
      message: detail || 'Validation failed.',
    });
  },
});

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    NatsModule,
    HealthModule,
    TenancyModule,
    IdentityHttpModule,
    CatalogModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: RestoZodValidationPipe },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    CorrelationMiddleware,
    TenantContextMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Correlation runs first so every later middleware (including the
    // tenant resolver's own DB query) is traceable via the same id.
    consumer.apply(CorrelationMiddleware).forRoutes('*');
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: 'healthz', method: RequestMethod.GET },
        { path: 'readyz', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
