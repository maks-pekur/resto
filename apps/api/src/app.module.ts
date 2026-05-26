import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { BackgroundJobsModule } from './infrastructure/background-jobs.module';
import { DatabaseModule } from './infrastructure/database.module';
import { NatsModule } from './infrastructure/nats.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './contexts/audit/audit.module';
import { CatalogModule } from './contexts/catalog/catalog.module';
import { TenancyModule } from './contexts/tenancy/tenancy.module';
import { IdentitySessionsModule } from './contexts/identity/identity-sessions.module';
import { IdentityHttpModule } from './contexts/identity/identity-http.module';
import { SharedApiModule } from './shared/api/shared-api.module';
import { CorrelationMiddleware } from './shared/correlation.middleware';
import { ProblemDetailsFilter } from './shared/exception.filter';
import { TenantContextMiddleware } from './shared/tenant-context.middleware';

@Module({
  imports: [
    ConfigModule,
    SharedApiModule,
    DatabaseModule,
    NatsModule,
    HealthModule,
    IdentitySessionsModule,
    TenancyModule,
    IdentityHttpModule,
    CatalogModule,
    AuditModule,
    BackgroundJobsModule,
  ],
  providers: [
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
