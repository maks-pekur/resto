import { test, expect } from './fixtures/operator-session';
import { FIXTURES, seedScenarioTenants } from './fixtures/seed-tenants';

const apiOrigin = process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:5001';
const adminHostSuffix = 'admin.localhost:4000';

const orgHostRegex = (slug: string, path = ''): RegExp =>
  new RegExp(`^http://${slug}\\.${adminHostSuffix}${path}`);

test.beforeAll(async () => {
  await seedScenarioTenants();
});

test.describe('ADM-00 scaffold smoke-walk', () => {
  // On a fresh navigation the client cannot tell a stale session cookie from no
  // cookie at all — the session cookie is httpOnly. Both land on plain /login.
  // The `?expired=1` notice covers the other, more common case: a 401 on a live
  // page, emitted by api-client's 401 handler.

  test('scenario 1: sign-in with exactly one tenant hard-navigates to its own host', async ({
    operatorSession,
  }) => {
    const { context, page } = await operatorSession(FIXTURES.soloOwner);
    await expect(page).toHaveURL(orgHostRegex(FIXTURES.soloOwner.tenantSlug, '/'));
    const identity = page.getByTestId('tenant-identity');
    await expect(identity).toBeVisible();
    await expect(identity).toContainText(FIXTURES.soloOwner.tenantDisplayName);
    await context.close();
  });

  test('scenario 2: an operator with an unnamed tenant lands on onboarding', async ({
    operatorSession,
  }) => {
    const { context, page } = await operatorSession(FIXTURES.pendingOwner);
    // login.tsx's own single-tenant branch binds the session and
    // hard-navigates to the tenant's own host BEFORE (protected)/_layout.tsx's
    // pending_setup check runs the client-side redirect to /onboarding — the
    // final URL carries the tenant host, not the apex.
    await expect(page).toHaveURL(orgHostRegex(FIXTURES.pendingOwner.tenantSlug, '/onboarding'));
    await expect(page.locator('#displayName')).toBeVisible();
    await context.close();
  });

  test('scenario 3: the tenant identity block is a static label, not a switcher (D-10)', async ({
    operatorSession,
  }) => {
    const { context, page } = await operatorSession(FIXTURES.soloOwner);
    await expect(page).toHaveURL(orgHostRegex(FIXTURES.soloOwner.tenantSlug, '/'));

    const identity = page.getByTestId('tenant-identity');
    await expect(identity).toBeVisible();
    await expect(identity).toContainText(FIXTURES.soloOwner.tenantDisplayName);

    // UI-SPEC S5 / tenant-identity.tsx's own WHY-comment: plain, non-focusable,
    // no menu or expand affordance. Assert the negative directly against the
    // rendered DOM rather than trusting the component's intent.
    const tagName = await identity.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('div');
    await expect(
      identity.locator('button, a, [role="button"], [role="menu"], [tabindex]'),
    ).toHaveCount(0);

    const urlBeforeClick = page.url();
    await identity.click({ force: true });
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    expect(page.url()).toBe(urlBeforeClick);

    await context.close();
  });

  // Scenario 4 (non-owner role gets a filtered tenant list) is deleted,
  // not downgraded to `.fixme` (10.2 plan 19). `GET /v1/me/brands` is gone;
  // its replacement, `GET /v1/me/tenants`, has its own cross-tenant leak case
  // proven server-side with a real second tenant and a real non-member user —
  // apps/api/test/e2e/me-tenants.e2e.spec.ts, "never lists a tenant
  // the user is not a member of — the leak boundary". `apps/api` still has no
  // internal endpoint to bootstrap a non-owner member (the exact blocker the
  // original `oneBrandStaff` fixture comment named), so this admin e2e layer
  // has no way to seed the one actor this scenario needs. Re-proving a
  // server-side authorization fact through browser automation, with no new
  // seed path to exercise it against, adds no coverage the API-level test
  // doesn't already provide — so the scenario is removed rather than kept as
  // a parked placeholder.

  test('scenario 5: a stale session cookie lands on sign-in, never a loop or a blank page', async ({
    operatorSession,
  }) => {
    const { context, page } = await operatorSession(FIXTURES.soloOwner);
    await context.clearCookies();
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: 'expired-fake-session',
        domain: '.admin.localhost',
        path: '/',
        httpOnly: true,
      },
    ]);
    await page.goto('/');
    await page.waitForURL(/\/login(\?|$)/);
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await context.close();
  });

  test('scenario 6: switching tenants kills the token it replaced (D-15)', async ({
    operatorSession,
    request,
  }) => {
    const { context, page } = await operatorSession(FIXTURES.twoOrgOwner);
    await expect(page).toHaveURL(/\/pick-tenant$/);

    await page
      .getByRole('button', { name: FIXTURES.twoOrgOwner.tenantADisplayName, exact: true })
      .click();
    await page.waitForURL(orgHostRegex(FIXTURES.twoOrgOwner.tenantASlug, '/'));

    const cookiesBoundToA = await context.cookies();
    const preSwitchCookie = cookiesBoundToA.find((c) => c.name === 'better-auth.session_token');
    expect(preSwitchCookie).toBeDefined();
    const preSwitchHeader = `${preSwitchCookie?.name ?? ''}=${preSwitchCookie?.value ?? ''}`;

    // The pre-switch token still works, as a control — the assertion below
    // is meaningful only if this one succeeds first.
    const beforeSwitch = await request.get(`${apiOrigin}/v1/me`, {
      headers: { cookie: preSwitchHeader },
    });
    expect(beforeSwitch.status()).toBe(200);

    // "The other tab" — captured above, not a second live Playwright tab.
    // Two same-profile tabs share one cookie jar (10.2 plan 17's own live
    // finding): a genuine second tab in this context would silently follow
    // the switch on its next navigation, not 401. Replaying the value a tab
    // held BEFORE the switch is what proves the old token is dead, not
    // merely superseded — this is how plan 17 proved the same guarantee.
    await page.getByTestId('nav-user-trigger').click();
    await page.getByTestId('nav-switch-tenant').click();
    await page.waitForURL(/\/pick-tenant$/);
    await page
      .getByRole('button', { name: FIXTURES.twoOrgOwner.tenantBDisplayName, exact: true })
      .click();
    await page.waitForURL(orgHostRegex(FIXTURES.twoOrgOwner.tenantBSlug, '/'));

    const replay = await request.get(`${apiOrigin}/v1/me`, {
      headers: { cookie: preSwitchHeader },
    });
    expect(replay.status()).toBe(401);

    await context.close();
  });

  // ADM-04 brand creation roundtrip (scenarios 7a/7b) is deleted, not
  // downgraded to `.fixme`. The create-tenant entry point (the old
  // switcher's "+ Add brand" item) was deliberately not rebuilt when the
  // switcher itself was deleted (D-10) — 10.2-CONTEXT.md tracks this as an
  // open GAP: an owner cannot create a second tenant from inside the
  // app today. There is nothing left to click and no route to drive a
  // Playwright scenario against; when a later phase closes the GAP, its own
  // plan should add the coverage fresh rather than un-park these two.
});
