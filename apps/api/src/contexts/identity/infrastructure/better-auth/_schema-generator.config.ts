/**
 * Used only by `pnpm exec @better-auth/cli generate` to emit Drizzle TS.
 * The plugin set MUST match the real composition root in `auth.config.ts`
 * (Task 9). PHASE A omits `phoneNumber` deliberately — Phase D wires it.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, twoFactor, bearer } from 'better-auth/plugins';

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [
    organization({
      ac: {} as never,
      dynamicAccessControl: { enabled: true },
    }),
    twoFactor(),
    bearer(),
  ],
});
