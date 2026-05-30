import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { lt, sql } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';

// D-21 / GDPR retention sweep — verification rows. BA deletes verification rows
// on consumption (token-use), but abandoned flows (user never clicked the link)
// leave rows indefinitely. The 1-hour buffer avoids a race between the sweep and
// an in-flight password-reset click (Pitfall 6 RESEARCH.md).
@Injectable()
export class VerificationRetentionSchedulerService {
  private readonly logger = new Logger(VerificationRetentionSchedulerService.name);

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'verification-retention', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      const cutoff = sql`now() - INTERVAL '1 hour'`;
      const result = await this.db.withoutTenant(
        'GDPR retention sweep — verification',
        async (tx) => {
          return tx
            .delete(schema.verification)
            .where(lt(schema.verification.expiresAt, cutoff))
            .returning({ id: schema.verification.id });
        },
      );
      this.logger.log({ deleted: result.length }, 'Verification GDPR retention sweep complete');
    } catch (err) {
      this.logger.warn({ err }, 'Verification GDPR retention sweep failed; will retry next run');
    }
  }
}
