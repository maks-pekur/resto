import { Inject, Injectable } from '@nestjs/common';
import type { SessionActiveLocationWriter } from '../../application/ports/session-active-location-writer.port';
import { AUTH_TOKEN } from '../../identity.tokens';
import type { Auth } from './auth.config';

@Injectable()
export class BetterAuthSessionActiveLocationWriter implements SessionActiveLocationWriter {
  constructor(@Inject(AUTH_TOKEN) private readonly auth: Auth) {}

  async writeActiveLocation(input: {
    sessionToken: string;
    activeLocationId: string | null;
  }): Promise<void> {
    const ctx = await this.auth.$context;
    await ctx.internalAdapter.updateSession(input.sessionToken, {
      activeLocationId: input.activeLocationId,
    });
  }

  async readActiveLocationId(sessionToken: string): Promise<string | null> {
    const ctx = await this.auth.$context;
    const found = await ctx.internalAdapter.findSession(sessionToken);
    const activeLocationId = (found?.session as { activeLocationId?: string | null } | undefined)
      ?.activeLocationId;
    return activeLocationId ?? null;
  }
}
