export const SESSION_ACTIVE_TENANT_ACTIVATOR = Symbol('SESSION_ACTIVE_TENANT_ACTIVATOR');

export interface SessionActiveTenantActivator {
  activateTenant(input: { tenantId: string; cookieHeader: string }): Promise<{ headers: Headers }>;
}
