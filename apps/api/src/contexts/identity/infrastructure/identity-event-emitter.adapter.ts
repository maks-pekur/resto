import { Inject, Injectable } from '@nestjs/common';
import { getTenantContext, runInTenantContext, TenantAwareDb } from '@resto/db';
import { appendToOutbox, type EventEnvelope } from '@resto/events';
import { randomUUID } from 'node:crypto';
import type { IdentityEventEmitterPort } from '../application/ports/identity-event-emitter.port';

@Injectable()
export class IdentityEventEmitterAdapter implements IdentityEventEmitterPort {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async emit(envelope: EventEnvelope): Promise<void> {
    const aggregateId = envelope.tenantId ?? randomUUID();
    if (!envelope.tenantId) {
      await this.db.withoutTenant(`identity event: ${envelope.type}`, (tx) =>
        appendToOutbox(tx, { envelope, aggregateId }),
      );
      return;
    }
    const run = (): Promise<void> =>
      this.db.withTenant((tx) => appendToOutbox(tx, { envelope, aggregateId }));
    if (getTenantContext()) {
      await run();
      return;
    }
    await runInTenantContext({ tenantId: envelope.tenantId }, run);
  }
}
