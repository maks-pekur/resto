import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { lt, sql } from 'drizzle-orm';
import { schema } from '@resto/db';
import { AUTH_DRIZZLE_TOKEN } from '../../contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../contexts/identity/infrastructure/better-auth/auth-db';

// D-21 / GDPR retention sweep — verification rows. BA deletes verification rows
// on consumption (token-use), but abandoned flows (user never clicked the link)
// leave rows indefinitely. The 1-hour buffer avoids a race between the sweep and
// an in-flight password-reset click (Pitfall 6 RESEARCH.md).
//
// Runs under resto_auth (AuthDrizzle, BYPASSRLS): `verification` is a BA-owned
// credential table whose resto_app privileges are revoked (migration 0027), so a
// resto_app `withoutTenant` sweep silently fails permission-denied. The auth role
// owns the BA tables and holds DELETE.
@Injectable()
export class VerificationRetentionSchedulerService {
  private readonly logger = new Logger(VerificationRetentionSchedulerService.name);

  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'verification-retention', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      const cutoff = sql`now() - INTERVAL '1 hour'`;
      const result = await this.authDb.db
        .delete(schema.verification)
        .where(lt(schema.verification.expiresAt, cutoff))
        .returning({ id: schema.verification.id });
      this.logger.log({ deleted: result.length }, 'Verification GDPR retention sweep complete');
    } catch (err) {
      this.logger.warn({ err }, 'Verification GDPR retention sweep failed; will retry next run');
    }
  }
}
