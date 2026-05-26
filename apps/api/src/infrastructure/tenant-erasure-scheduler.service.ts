import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { OffboardTenantService } from '../contexts/tenancy/application/offboard-tenant.service';

@Injectable()
export class TenantErasureSchedulerService {
  private readonly logger = new Logger(TenantErasureSchedulerService.name);
  private readonly tracer = trace.getTracer('resto.api.erasure-scheduler');

  constructor(@Inject(OffboardTenantService) private readonly offboard: OffboardTenantService) {}

  @Cron('0 2 * * *', { name: 'tenant-erasure', timeZone: 'UTC' })
  async run(): Promise<void> {
    const scheduled = await this.offboard.listScheduled();
    let ok = 0;
    let failed = 0;
    // D-11: sequential continue-on-error; Promise.all would break GDPR head-of-line blocking guarantee.
    for (const t of scheduled) {
      try {
        await this.offboard.executeErasure({ tenantId: t.id });
        ok += 1;
      } catch (err) {
        failed += 1;
        const span = this.tracer.startSpan('erasure.tenant', {
          attributes: { 'tenant.id': t.id },
        });
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        this.logger.warn({ tenantId: t.id, err }, 'Erasure failed; will retry next run');
      }
    }
    this.logger.log({ ok, failed, total: scheduled.length }, 'Erasure cron complete');
  }
}
