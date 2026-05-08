import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import { appendToOutbox, type EventEnvelope } from '@resto/events';
import type { IdentityEventEmitterPort } from '../application/ports/identity-event-emitter.port';

@Injectable()
export class IdentityEventEmitterAdapter implements IdentityEventEmitterPort {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async emit(envelope: EventEnvelope): Promise<void> {
    await this.db.withoutTenant(`identity event: ${envelope.type}`, async (tx) => {
      await appendToOutbox(tx, { envelope, aggregateId: envelope.tenantId ?? randomUUID() });
    });
  }
}
