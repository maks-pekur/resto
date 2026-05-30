import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, inArray, lt, sql } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';

// D-21 / GDPR retention sweep — invitation rows. Hard deletes are the documented
// exception for GDPR TTL sweeps (ADR-0020 note: resto_app has no DELETE privilege
// on tenant-scoped tables, but invitation is a BA-owned auth table swept by GDPR
// policy rather than the application soft-delete pattern).
@Injectable()
export class InvitationRetentionSchedulerService {
  private readonly logger = new Logger(InvitationRetentionSchedulerService.name);

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'invitation-retention', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      const cutoff = sql`now() - INTERVAL '30 days'`;
      const result = await this.db.withoutTenant(
        'GDPR retention sweep — invitation',
        async (tx) => {
          return tx
            .delete(schema.invitation)
            .where(
              and(
                lt(schema.invitation.expiresAt, cutoff),
                inArray(schema.invitation.status, ['expired', 'revoked', 'accepted']),
              ),
            )
            .returning({ id: schema.invitation.id });
        },
      );
      this.logger.log({ deleted: result.length }, 'Invitation GDPR retention sweep complete');
    } catch (err) {
      this.logger.warn({ err }, 'Invitation GDPR retention sweep failed; will retry next run');
    }
  }
}
