import { Inject, Injectable } from '@nestjs/common';
import { getTenantContext, type RestoTx, TenantAwareDb } from '@resto/db';
import { appendToOutbox, type EventEnvelope } from '@resto/events';
import { randomUUID } from 'node:crypto';
import type { IdentityEventEmitterPort } from '../application/ports/identity-event-emitter.port';

@Injectable()
export class IdentityEventEmitterAdapter implements IdentityEventEmitterPort {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async emit(envelope: EventEnvelope): Promise<void> {
    const aggregateId = envelope.tenantId ?? randomUUID();
    const append = (tx: RestoTx): Promise<void> => appendToOutbox(tx, { envelope, aggregateId });

    if (!envelope.tenantId) {
      await this.db.withoutTenant(`identity event: ${envelope.type}`, append);
      return;
    }
    if (getTenantContext()) {
      // HTTP path: ALS bound by TenantContextMiddleware. RLS WITH CHECK
      // validates envelope.tenantId against the bound tenant — a forged
      // envelope with a different tenantId is rejected at INSERT time.
      await this.db.withTenant(append);
      return;
    }
    // Non-HTTP path: Better Auth hook fired with no ALS (e.g. `/sign-out`
    // arrived without `x-tenant-slug` and no host resolved). Authoritative
    // tenantId comes from the BA session snapshot. ADR-0020 I-6 forbids
    // seeding ALS here — bind explicitly via TenantAwareDb instead.
    await this.db.withTenantId(envelope.tenantId, append);
  }
}
