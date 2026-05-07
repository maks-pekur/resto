import { z } from 'zod';

export const AuditActorKind = z.enum(['platform_user', 'tenant_user', 'system', 'service']);
export type AuditActorKind = z.infer<typeof AuditActorKind>;

export const AuditRecord = z.object({
  tenantId: z.string().uuid().nullable(),
  actorKind: AuditActorKind,
  actorSubject: z.string().min(1),
  action: z.string().min(1),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  payload: z.record(z.unknown()).nullable(),
  correlationId: z.string().uuid().nullable(),
  occurredAt: z.date(),
});
export type AuditRecord = z.infer<typeof AuditRecord>;
