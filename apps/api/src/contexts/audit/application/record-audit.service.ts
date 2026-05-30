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
    // WR-02: prefer withTenantId for tenant-bound events so RLS stays scoped
    // and the bypass-WARN log line is not emitted for ordinary tenant audit
    // rows. withoutTenant remains the legitimate path for platform-level
    // events whose envelope tenantId is null (e.g. identity.email_dispatch_failed
    // DLQ branch, tenancy.tenant_erasure_completed).
    if (envelope.tenantId !== null) {
      await this.db.withTenantId(envelope.tenantId, (tx) =>
        this.fromEnvelopeWithTx(envelope, tx),
      );
      return;
    }
    await this.db.withoutTenant(`audit platform event: ${envelope.type}`, (tx) =>
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
    // WR-03: per-event target resolution. `tenant`-typed events MUST take
    // targetId from payload.tenantId — using payload.userId would point at
    // the operator instead of the tenant. `user`-typed events take userId.
    // `platform`-typed events (DLQ alerts) have no target — leave null.
    const targetId = (() => {
      if (targetType === 'tenant') {
        return typeof payload.tenantId === 'string' && payload.tenantId.length > 0
          ? payload.tenantId
          : null;
      }
      if (targetType === 'user') {
        return typeof payload.userId === 'string' && payload.userId.length > 0
          ? payload.userId
          : null;
      }
      return null;
    })();
    // WR-03: actorUserId (when BA surfaces the calling user) is the truthful
    // actor for role-change events. Fall back to actorSubject literal, then
    // to payload.userId (the subject of the change — semantically wrong but
    // preserves Phase 3 e2e baseline; WARN once so the gap is visible).
    const actorUserId =
      typeof payload.actorUserId === 'string' && payload.actorUserId.length > 0
        ? payload.actorUserId
        : null;
    const actorSubjectLiteral =
      typeof payload.actorSubject === 'string' && payload.actorSubject.length > 0
        ? payload.actorSubject
        : null;
    const subjectUserId =
      typeof payload.userId === 'string' && payload.userId.length > 0 ? payload.userId : null;
    let actorSubject: string;
    if (actorUserId !== null) actorSubject = actorUserId;
    else if (actorSubjectLiteral !== null) actorSubject = actorSubjectLiteral;
    else if (subjectUserId !== null) {
      actorSubject = subjectUserId;
      if (envelope.type.startsWith('identity.role_changed')) {
        this.logger.warn(
          { type: envelope.type, fallbackActor: subjectUserId },
          'role_changed audit row missing actorUserId — falling back to subject userId.',
        );
      }
    } else actorSubject = 'system';
    return {
      tenantId: envelope.tenantId,
      actorKind: 'system',
      actorSubject,
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
