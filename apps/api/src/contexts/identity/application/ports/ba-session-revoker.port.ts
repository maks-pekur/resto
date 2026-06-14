export interface BaSessionRevoker {
  revokeTenantSessions(tenantId: string): Promise<{ revokedSessionsCount: number }>;
}

export const BA_SESSION_REVOKER = Symbol('BA_SESSION_REVOKER');
