import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, TenantAwareDb, type RestoTx } from '@resto/db';
import { type EventEnvelope } from '@resto/events';
import { AuditRecord } from '../domain/audit-record';

// TODO(RES-future): move targetKind onto defineEventContract once the map crosses 8 entries.
const ACTION_TARGET_KIND: Record<string, string> = {
  'tenancy.tenant_provisioned': 'tenant',
  'tenancy.tenant_archived': 'tenant',
  'tenancy.tenant_suspended': 'tenant',
  'tenancy.tenant_resumed': 'tenant',
  'tenancy.tenant_offboarding_scheduled': 'tenant',
  'tenancy.tenant_offboarding_cancelled': 'tenant',
  'tenancy.tenant_erasure_completed': 'tenant',
  'identity.signed_in': 'user',
  'identity.signed_out': 'user',
  'identity.password_reset_completed': 'user',
  // AUTH-09 / D-16a (Phase 3 / Plan 05): role-change audit row closes the
  // Phase 1 BLOCKED entry in audit-gap.md. Payload always carries `userId`.
  'identity.role_changed': 'user',
  // AUTH-10 / D-05: platform-level alert. DLQ branch may have no userId
  // (poison envelope unparseable) so this is NOT 'user'.
  'identity.email_dispatch_failed': 'platform',
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
    await this.db.withoutTenant(`audit consumer: ${envelope.type}`, (tx) =>
      this.fromEnvelopeWithTx(envelope, tx),
    );
  }

  async fromEnvelopeWithTx(envelope: EventEnvelope, tx: RestoTx): Promise<void> {
    const record = this.project(envelope);
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
