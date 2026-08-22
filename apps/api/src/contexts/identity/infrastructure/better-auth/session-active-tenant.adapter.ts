import { Inject, Injectable } from '@nestjs/common';
import type { SessionActiveTenantActivator } from '../../application/ports/session-active-tenant-activator.port';
import { AUTH_TOKEN } from '../../identity.tokens';
import type { Auth } from './auth.config';

@Injectable()
export class BetterAuthSessionActiveTenantActivator implements SessionActiveTenantActivator {
  constructor(@Inject(AUTH_TOKEN) private readonly auth: Auth) {}

  async activateTenant(input: {
    tenantId: string;
    cookieHeader: string;
  }): Promise<{ headers: Headers }> {
    return (
      this.auth.api as unknown as {
        setActiveOrganization: (args: {
          body: { organizationId: string };
          headers: Record<string, string>;
          returnHeaders: true;
        }) => Promise<{ headers: Headers }>;
      }
    ).setActiveOrganization({
      body: { organizationId: input.tenantId },
      headers: { cookie: input.cookieHeader },
      returnHeaders: true,
    });
  }
}
