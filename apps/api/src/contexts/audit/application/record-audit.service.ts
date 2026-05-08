import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { type EventEnvelope } from '@resto/events';
import { AuditRecord } from '../domain/audit-record';

// TODO(RES-future): move targetKind onto defineEventContract once the map crosses 5 entries.
const ACTION_TARGET_KIND: Record<string, string> = {
  'tenancy.tenant_provisioned': 'tenant',
  'tenancy.tenant_archived': 'tenant',
  'identity.signed_in': 'user',
  'identity.signed_out': 'user',
};

const targetKindFor = (action: string): string | null => {
  const prefix = action.replace(/\.v\d+$/, '');
  return ACTION_TARGET_KIND[prefix] ?? null;
};

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
        ipAddress: record.ipAddress,
        userAgent: record.userAgent,
        correlationId: record.correlationId,
        occurredAt: record.occurredAt,
      });
    });
    this.logger.debug({ type: envelope.type, tenantId: envelope.tenantId }, 'Audit row recorded');
  }

  private project(envelope: EventEnvelope): AuditRecord {
    const payload = envelope.payload as Record<string, unknown>;
    const ipAddress = typeof payload.ipAddress === 'string' ? payload.ipAddress : null;
    const userAgent = typeof payload.userAgent === 'string' ? payload.userAgent : null;
    const targetType = targetKindFor(envelope.type);
    const targetId =
      (typeof payload.userId === 'string' && payload.userId) ||
      (typeof payload.tenantId === 'string' && payload.tenantId) ||
      null;
    return {
      tenantId: envelope.tenantId,
      actorKind: 'system',
      actorSubject:
        typeof payload.actorSubject === 'string' && payload.actorSubject.length > 0
          ? payload.actorSubject
          : typeof payload.userId === 'string' && payload.userId.length > 0
            ? payload.userId
            : 'system',
      action: envelope.type,
      targetType,
      targetId,
      payload,
      ipAddress,
      userAgent,
      correlationId: envelope.correlationId,
      occurredAt: envelope.occurredAt,
    };
  }
}
