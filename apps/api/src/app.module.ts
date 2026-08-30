import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { BackgroundJobsModule } from './infrastructure/background-jobs.module';
import { DatabaseModule } from './infrastructure/database.module';
import { NatsModule } from './infrastructure/nats.module';
import { HealthModule } from './health/health.module';
import { AnalyticsModule } from './contexts/analytics/analytics.module';
import { AuditModule } from './contexts/audit/audit.module';
import { CatalogModule } from './contexts/catalog/catalog.module';
import { NotificationsModule } from './contexts/notifications/notifications.module';
import { OrderingModule } from './contexts/ordering/ordering.module';
import { PaymentsModule } from './contexts/payments/payments.module';
import { TenancyModule } from './contexts/tenancy/tenancy.module';
import { IdentitySessionsModule } from './contexts/identity/identity-sessions.module';
import { IdentityHttpModule } from './contexts/identity/identity-http.module';
import { SharedApiModule } from './shared/api/shared-api.module';
import { CorrelationMiddleware } from './shared/correlation.middleware';
import { ProblemDetailsFilter } from './shared/exception.filter';
import { HttpMetricsInterceptor } from './shared/http-metrics.interceptor';
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
    OrderingModule,
    AnalyticsModule,
    PaymentsModule,
    AuditModule,
    NotificationsModule,
    BackgroundJobsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    CorrelationMiddleware,
    TenantContextMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Correlation runs first so every later middleware (including the
    // tenant resolver's own DB query) is traceable via the same id.
    // Nest 11 moved to path-to-regexp v8, where a bare '*' no longer matches — the wildcard must be
    // named. Getting this wrong is silent: the middleware simply never runs, and tenant binding
    // disappears from every request.
    consumer.apply(CorrelationMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: 'healthz', method: RequestMethod.GET },
        { path: 'readyz', method: RequestMethod.GET },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
