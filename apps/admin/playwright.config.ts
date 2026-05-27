import { defineConfig, devices } from '@playwright/test';

const adminPort = 3001;
const baseURL = process.env.ADMIN_E2E_BASE_URL ?? `http://localhost:${adminPort}`;
const apiOrigin = process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:3000';

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
    command: 'pnpm --filter @resto/admin dev',
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_API_ORIGIN: apiOrigin,
      ADMIN_WEB_URL: baseURL,
      INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN ?? 'dev-internal-token-min-16-chars',
      ACTIVE_BRAND_COOKIE_SECRET:
        process.env.ACTIVE_BRAND_COOKIE_SECRET ?? 'e2e-only-active-brand-secret-AAAA',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
