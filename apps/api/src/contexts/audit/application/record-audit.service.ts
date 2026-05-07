import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { type EventEnvelope } from '@resto/events';
import { AuditRecord } from '../domain/audit-record';

@Injectable()
export class RecordAuditService {
  private readonly logger = new Logger(RecordAuditService.name);

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async fromEnvelope(envelope: EventEnvelope): Promise<void> {
    const record = this.project(envelope);
    await this.db.withoutTenant(`audit consumer: ${envelope.type}`, async (tx) => {
      await tx.insert(schema.auditLog).values({
        tenantId: record.tenantId,
        actorKind: record.actorKind,
        actorSubject: record.actorSubject,
        action: record.action,
        targetType: record.targetType,
        targetId: record.targetId,
        payload: record.payload,
        correlationId: record.correlationId,
        occurredAt: record.occurredAt,
      });
    });
    this.logger.debug({ type: envelope.type, tenantId: envelope.tenantId }, 'Audit row recorded');
  }

  private project(envelope: EventEnvelope): AuditRecord {
    const payload = envelope.payload as Record<string, unknown>;
    const targetType = envelope.type.split('.')[1] ?? null;
    const targetId =
      (typeof payload.tenantId === 'string' && payload.tenantId) ||
      (typeof payload.userId === 'string' && payload.userId) ||
      null;
    return {
      tenantId: envelope.tenantId,
      actorKind: 'system',
      actorSubject:
        typeof payload.actorSubject === 'string' && payload.actorSubject.length > 0
          ? payload.actorSubject
          : 'system',
      action: envelope.type,
      targetType,
      targetId,
      payload,
      correlationId: envelope.correlationId,
      occurredAt: envelope.occurredAt,
    };
  }
}
