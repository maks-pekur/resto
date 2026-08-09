import { defineConfig, devices } from '@playwright/test';

// Vite (apps/admin) serves on :4000 (vite.config.ts) — this also matches
// the api's default CORS_ALLOWED_ORIGINS/ADMIN_WEB_URL dev defaults
// (env.schema.ts), so no server-side env overrides are needed to run this
// suite locally. The prior :3001 value + NEXT_PUBLIC_*/ACTIVE_BRAND_COOKIE_*
// env vars were Next.js-era leftovers from before the Vite SPA migration
// (07.6) and did not match this app's real dev topology.
const adminPort = 4000;
const baseURL = process.env.ADMIN_E2E_BASE_URL ?? `http://localhost:${adminPort}`;
const apiOrigin = process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:5001';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/fixtures/**', '**/README*.md'],
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: `pnpm --filter @resto/admin exec vite --port ${String(adminPort)}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_API_ORIGIN: apiOrigin,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
