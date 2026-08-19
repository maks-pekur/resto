import { test, expect } from './fixtures/operator-session';
import { FIXTURES, seedScenarioTenants } from './fixtures/seed-tenants';

const apiOrigin = process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:3000';

test.beforeAll(async () => {
  await seedScenarioTenants();
});

test.describe('ADM-00 scaffold smoke-walk', () => {
  // On a fresh navigation the client cannot tell a stale session cookie from no
  // cookie at all — the session cookie is httpOnly. Both land on plain /login.
  // The `?expired=1` notice covers the other, more common case: a 401 on a live
  // page, emitted by api-client's 401 handler.

  // Scenarios 3, 6, 7a and 7b are fixme, not broken: they exercise the brand
  // switcher, cross-tab brand sync and add-brand-from-switcher, all of which
  // phase 10.2 (brand-pinned sessions) removes. Rewrite them with that phase.
  //

  test('scenario 1: valid sign-in lands on /dashboard with brand list', async ({
    operatorSession,
  }) => {
    const ctx = await operatorSession(FIXTURES.threeBrands);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="brand-switcher-trigger"]')).toBeVisible();
    await ctx.close();
  });

  test('scenario 2: an operator with no brands lands on brand onboarding', async ({
    operatorSession,
  }) => {
    const ctx = await operatorSession(FIXTURES.zeroBrands);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await page.waitForURL('**/onboarding/brand');
    await expect(page.locator('text=/create your first brand/i')).toBeVisible();
    await ctx.close();
  });

  test.fixme('scenario 3: 3+ brand tenant — dropdown switcher selects and persists', async ({
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

  test('scenario 5: a stale session cookie lands on sign-in, never a loop or a blank page', async ({
    operatorSession,
  }) => {
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
    await page.waitForURL(/\/login(\?|$)/);
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await ctx.close();
  });

  test.fixme('scenario 6: multi-tab brand-sync converges within 1s', async ({
    operatorSession,
  }) => {
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

  // ADM-04 brand creation roundtrip — two sub-flows per CONTEXT D-14 + F-6
  // revision: single-brand operators reach onboarding through the Plus icon
  // adjacent to the static brand label (Plan 04 introduced
  // `data-testid="brand-switcher-add-brand"`); multi-brand operators reach
  // it through the existing dropdown's `+ Add brand` item. Both sub-flows
  // verify the Plan 03 HMAC signed-cookie pipeline produces a valid signed
  // cookie on brand-creation success.
  test.fixme('scenario 7a (ADM-04 single-brand): operator clicks Plus icon and creates a brand', async ({
    operatorSession,
  }) => {
    const ctx = await operatorSession(FIXTURES.oneBrandOwner);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="brand-switcher-static"]')).toBeVisible();
    const addBrandBtn = page.locator('[data-testid="brand-switcher-add-brand"]');
    await expect(addBrandBtn).toBeVisible();
    await addBrandBtn.click();
    await page.waitForURL(/\/onboarding\/brand/, { timeout: 10_000 });
    const stamp = Date.now().toString();
    await page.fill('input[name="slug"]', `test-brand-${stamp}`);
    await page.fill('input[name="displayName"]', `Test Brand ${stamp}`);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
    const cookies = await ctx.cookies();
    const activeBrand = cookies.find((c) => c.name === 'resto.active_brand');
    expect(activeBrand).toBeDefined();
    expect(activeBrand?.httpOnly).toBe(true);
    const parts = (activeBrand?.value ?? '').split('.');
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect((parts[parts.length - 1] ?? '').length).toBeGreaterThan(0);
    await ctx.close();
  });

  test.fixme('scenario 7b (ADM-04 multi-brand): operator opens dropdown and clicks + Add brand', async ({
    operatorSession,
  }) => {
    const ctx = await operatorSession(FIXTURES.threeBrands);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    const trigger = page.locator('[data-testid="brand-switcher-trigger"]');
    await expect(trigger).toBeVisible();
    await trigger.click();
    await page.locator('a[href*="/onboarding/brand"]').click();
    await page.waitForURL(/\/onboarding\/brand/, { timeout: 10_000 });
    const stamp = Date.now().toString();
    await page.fill('input[name="slug"]', `extra-brand-${stamp}`);
    await page.fill('input[name="displayName"]', `Extra Brand ${stamp}`);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
    const cookies = await ctx.cookies();
    const activeBrand = cookies.find((c) => c.name === 'resto.active_brand');
    expect(activeBrand).toBeDefined();
    expect(activeBrand?.httpOnly).toBe(true);
    const parts = (activeBrand?.value ?? '').split('.');
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect((parts[parts.length - 1] ?? '').length).toBeGreaterThan(0);
    await ctx.close();
  });
});
