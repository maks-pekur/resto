import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { metrics, type Counter } from '@opentelemetry/api';
import type { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getTenantContext } from '@resto/db';

const inferStatusCode = (err: unknown): number => {
  if (err instanceof HttpException) return err.getStatus();
  return 500;
};

/**
 * TEN-10 / D-05: per-tenant HTTP rate + error rate. Cardinality watch:
 * 50+ tenants × 20 routes ≈ 1000 series — monitor at scaling event, no
 * enforcement now. Labels intentionally exclude PII: only `tenant.id`
 * (UUID or `'platform'`), `http.method`, `http.route` (route shape, not
 * query strings or bodies).
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly meter = metrics.getMeter('resto.api.http');
  private readonly requestsCounter: Counter = this.meter.createCounter('http.server.requests', {
    description: 'HTTP requests handled, labeled by tenant.id and method',
    unit: '1',
  });
  private readonly errorsCounter: Counter = this.meter.createCounter('http.server.errors', {
    description: '5xx responses, labeled by tenant.id and status_code',
    unit: '1',
  });

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') {
      return next.handle();
    }
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const tenantId = getTenantContext()?.tenantId ?? 'platform';
    const method = req.method;
    // Prefer the matched route template (`/v1/tenants/:id`) over the raw URL
    // (`/v1/tenants/abc?query=x`) — keeps cardinality bounded and avoids
    // leaking ids/secrets into label values.
    const route =
      (req as unknown as { routeOptions?: { url?: string } }).routeOptions?.url ??
      (req as unknown as { routerPath?: string }).routerPath ??
      req.url;
    const attrs = {
      'tenant.id': tenantId,
      'http.method': method,
      'http.route': route,
    };

    return next.handle().pipe(
      tap({
        next: () => {
          this.requestsCounter.add(1, attrs);
        },
        error: (err: unknown) => {
          this.requestsCounter.add(1, attrs);
          this.errorsCounter.add(1, {
            ...attrs,
            'http.status_code': inferStatusCode(err),
          });
        },
      }),
    );
  }
}
