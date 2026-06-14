import { Injectable, Logger } from '@nestjs/common';
import { schema, type RestoTx } from '@resto/db';
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
  'catalog.menu_first_published': 'menu',
  'catalog.menu_republished': 'menu',
  'catalog.item_stopped': 'menu_item',
  'catalog.item_unstopped': 'menu_item',
};

const targetKindFor = (action: string): string | null => {
  const prefix = action.replace(/\.v\d+$/, '');
  return ACTION_TARGET_KIND[prefix] ?? null;
};

@Injectable()
export class RecordAuditService {
  private readonly logger = new Logger(RecordAuditService.name);

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
    // Per-targetType resolution combining identity (WR-03) and catalog (04A-05) flows:
    // - 'tenant' / 'menu' → payload.tenantId (menus are per-tenant 1:1 in RestOS)
    // - 'menu_item' → payload.itemId
    // - 'user' → payload.userId
    // - 'platform' (DLQ alerts) → null
    const targetId = ((): string | null => {
      if (targetType === 'tenant' || targetType === 'menu') {
        return typeof payload.tenantId === 'string' && payload.tenantId.length > 0
          ? payload.tenantId
          : null;
      }
      if (targetType === 'menu_item') {
        return typeof payload.itemId === 'string' && payload.itemId.length > 0
          ? payload.itemId
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
