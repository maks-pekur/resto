import { test, expect } from './fixtures/operator-session';
import { FIXTURES, seedScenarioTenants } from './fixtures/seed-tenants';

const apiOrigin = process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:3000';

test.beforeAll(async () => {
  await seedScenarioTenants();
});

test.describe('ADM-00 scaffold smoke-walk', () => {
  test('scenario 1: valid sign-in lands on /dashboard with brand list', async ({
    operatorSession,
  }) => {
    const ctx = await operatorSession(FIXTURES.threeBrands);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="brand-switcher-trigger"]')).toBeVisible();
    await ctx.close();
  });

  // FIXME (jointly owned by Plans 04 + 05):
  //   - Plan 04 ships the EmptyState component and wires it into the 0-brand path.
  //   - Plan 05 flips this `.fixme` to active `test()`.
  // Today: redirects to /onboarding/brand. After Plan 04: inline EmptyState.
  test.fixme('scenario 2: 0-brand tenant renders EmptyState empty-variant', async ({
    operatorSession,
  }) => {
    const ctx = await operatorSession(FIXTURES.zeroBrands);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await expect(page.locator('text=/your tenant has no brands/i')).toBeVisible();
    await expect(page.locator('a[href*="/onboarding/brand"]')).toBeVisible();
    await ctx.close();
  });

  test('scenario 3: 3+ brand tenant — dropdown switcher selects and persists', async ({
    operatorSession,
  }) => {
    const ctx = await operatorSession(FIXTURES.threeBrands);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await page.locator('[data-testid="brand-switcher-trigger"]').click();
    const items = page.locator('[role="menuitem"]:not([data-active="true"])');
    await items.first().click();
    await page.waitForLoadState('networkidle');
    const cookies = await ctx.cookies();
    const activeBrand = cookies.find((c) => c.name === 'resto.active_brand');
    expect(activeBrand).toBeDefined();
    expect(activeBrand?.httpOnly).toBe(true);
    await ctx.close();
  });

  // FIXME (Phase 03 — RBAC seed):
  //   `apps/api` exposes no internal endpoint to bootstrap a non-owner
  //   member on a tenant. `seedScenarioTenants` cannot provision the
  //   `oneBrandStaff` operator referenced here. Phase 03 ships the
  //   staff-role bootstrap path (REQUIREMENTS.md §AUTH-seed) — at which
  //   point this `.fixme` flips to active `test()` and the assertion
  //   below verifies `/v1/me/brands` filters by role.
  test.fixme('scenario 4: non-owner role gets filtered /v1/me/brands', async ({
    operatorSession,
    request,
  }) => {
    const ctx = await operatorSession(FIXTURES.oneBrandStaff);
    const cookies = await ctx.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const res = await request.get(`${apiOrigin}/v1/me/brands`, {
      headers: { cookie: cookieHeader, accept: 'application/json' },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { brands: unknown[] };
    expect(body.brands).toBeInstanceOf(Array);
    expect(body.brands.length).toBeGreaterThanOrEqual(1);
    await ctx.close();
  });

  test('scenario 5: expired session redirects to /login?expired=1', async ({ operatorSession }) => {
    const ctx = await operatorSession(FIXTURES.threeBrands);
    await ctx.clearCookies();
    await ctx.addCookies([
      {
        name: 'better-auth.session_token',
        value: 'expired-fake-session',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?.*expired=1/);
    await expect(page.locator('text=/session expired/i')).toBeVisible();
    await ctx.close();
  });

  test('scenario 6: multi-tab brand-sync converges within 1s', async ({ operatorSession }) => {
    const ctx = await operatorSession(FIXTURES.threeBrands);
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    const tabC = await ctx.newPage();
    await Promise.all([tabA.goto('/dashboard'), tabB.goto('/dashboard'), tabC.goto('/dashboard')]);
    await tabA.locator('[data-testid="brand-switcher-trigger"]').click();
    const items = tabA.locator('[role="menuitem"]:not([data-active="true"])');
    await items.first().click();
    await tabB.waitForTimeout(500);
    await tabC.waitForTimeout(500);
    const cookieAfter = (await ctx.cookies()).find((c) => c.name === 'resto.active_brand')?.value;
    expect(cookieAfter).toBeTruthy();
    await ctx.close();
  });
});
