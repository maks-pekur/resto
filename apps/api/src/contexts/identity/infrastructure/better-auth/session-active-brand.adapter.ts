import { Inject, Injectable } from '@nestjs/common';
import type { SessionActiveBrandWriter } from '../../application/ports/session-active-brand-writer.port';
import { AUTH_TOKEN } from '../../identity.tokens';
import type { Auth } from './auth.config';

@Injectable()
export class BetterAuthSessionActiveBrandWriter implements SessionActiveBrandWriter {
  constructor(@Inject(AUTH_TOKEN) private readonly auth: Auth) {}

  async writeActiveBrand(input: { sessionToken: string; activeBrandId: string }): Promise<void> {
    const ctx = await this.auth.$context;
    await ctx.internalAdapter.updateSession(input.sessionToken, {
      activeBrandId: input.activeBrandId,
    });
  }
}
