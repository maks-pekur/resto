import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, inArray, lt, sql } from 'drizzle-orm';
import { schema } from '@resto/db';
import { AUTH_DRIZZLE_TOKEN } from '../../contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../contexts/identity/infrastructure/better-auth/auth-db';

// D-21 / GDPR retention sweep — invitation rows. Hard deletes are the documented
// exception for GDPR TTL sweeps.
//
// Runs under resto_auth (AuthDrizzle, BYPASSRLS): `invitation` is a BA-owned auth
// table and resto_app has no DELETE privilege on it, so a resto_app `withoutTenant`
// sweep silently fails permission-denied. The auth role owns the BA tables and
// holds DELETE.
@Injectable()
export class InvitationRetentionSchedulerService {
  private readonly logger = new Logger(InvitationRetentionSchedulerService.name);

  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'invitation-retention', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      const cutoff = sql`now() - INTERVAL '30 days'`;
      const result = await this.authDb.db
        .delete(schema.invitation)
        .where(
          and(
            lt(schema.invitation.expiresAt, cutoff),
            inArray(schema.invitation.status, ['expired', 'revoked', 'accepted']),
          ),
        )
        .returning({ id: schema.invitation.id });
      this.logger.log({ deleted: result.length }, 'Invitation GDPR retention sweep complete');
    } catch (err) {
      this.logger.warn({ err }, 'Invitation GDPR retention sweep failed; will retry next run');
    }
  }
}
