import { test as base, type BrowserContext } from '@playwright/test';

export interface OperatorCreds {
  readonly email: string;
  readonly password: string;
}

export interface OperatorSessionFixtures {
  readonly operatorSession: (creds: OperatorCreds) => Promise<BrowserContext>;
}

/**
 * Drives a real Better Auth sign-in via the rendered `/login` form so the
 * e2e suite exercises the full server-action fan-out (sign-in →
 * organization/list → set-active). Returns the authenticated
 * BrowserContext; the caller opens pages off it.
 *
 * Returning a context (not a page) lets scenario 6 spawn multiple tabs
 * sharing the same session cookies, which is required to assert
 * `BrandTabSync` `storage`-event propagation.
 */
export const test = base.extend<OperatorSessionFixtures>({
  operatorSession: async ({ browser }, use) => {
    const sign = async (creds: OperatorCreds): Promise<BrowserContext> => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto('/login');
      await page.fill('input[name="email"]', creds.email);
      await page.fill('input[name="password"]', creds.password);
      await page.click('button[type="submit"]');
      await page.waitForURL('**/dashboard', { timeout: 15_000 });
      await page.close();
      return ctx;
    };
    await use(sign);
  },
});

export { expect } from '@playwright/test';
