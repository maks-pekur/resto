import { test as base, type BrowserContext, type Page } from '@playwright/test';

export interface OperatorCreds {
  readonly email: string;
  readonly password: string;
}

export interface OperatorSessionResult {
  readonly context: BrowserContext;
  readonly page: Page;
}

export interface OperatorSessionFixtures {
  readonly operatorSession: (creds: OperatorCreds) => Promise<OperatorSessionResult>;
}

/**
 * Drives a real Better Auth sign-in via the rendered `/login` form so the
 * e2e suite exercises the full server-action fan-out (sign-in ->
 * GET /v1/me/tenants -> branch on count). The post-submit destination
 * depends on how many tenants the operator belongs to (D-17): zero
 * lands on `/onboarding`, exactly one hard-navigates cross-host to
 * `<slug>.admin.localhost:4000`, two or more lands on `/pick-tenant`
 * — callers assert their own expected destination, this fixture only
 * waits for the async submit handler to leave `/login`.
 *
 * Returning the context (not just the page) lets scenario 6 open a second
 * tab sharing the same session cookies.
 */
export const test = base.extend<OperatorSessionFixtures>({
  operatorSession: async ({ browser }, use) => {
    const sign = async (creds: OperatorCreds): Promise<OperatorSessionResult> => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('/login');
      await page.fill('input[name="email"]', creds.email);
      await page.fill('input[name="password"]', creds.password);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
      return { context, page };
    };
    await use(sign);
  },
});

export { expect } from '@playwright/test';
