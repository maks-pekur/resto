import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './infrastructure/database.module';
import { NatsModule } from './infrastructure/nats.module';
import { HealthModule } from './health/health.module';
import { CatalogModule } from './contexts/catalog/catalog.module';
import { IdentityModule } from './contexts/identity/identity.module';
import { TenancyModule } from './contexts/tenancy/tenancy.module';
import { CorrelationMiddleware } from './shared/correlation.middleware';
import { ProblemDetailsFilter } from './shared/exception.filter';
import { TenantContextMiddleware } from './shared/tenant-context.middleware';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    NatsModule,
    HealthModule,
    IdentityModule,
    TenancyModule,
    CatalogModule,
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
