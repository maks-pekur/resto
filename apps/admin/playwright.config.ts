import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The suite provisions tenants through /internal/v1/*, so it needs the same
// INTERNAL_API_TOKEN the running api booted with; without it every run 401s.
const loadRepoEnv = (key: string): string | undefined => {
  if (process.env[key] !== undefined) return process.env[key];
  try {
    for (const line of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && match[1] === key) return match[2];
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const internalApiToken = loadRepoEnv('INTERNAL_API_TOKEN');
if (internalApiToken !== undefined) process.env.INTERNAL_API_TOKEN = internalApiToken;

// Vite (apps/admin) serves on :4000 (vite.config.ts) — this also matches
// the api's default CORS_ALLOWED_ORIGINS/ADMIN_WEB_URL dev defaults
// (env.schema.ts), so no server-side env overrides are needed to run this
// suite locally. The prior :3001 value + NEXT_PUBLIC_*/ACTIVE_BRAND_COOKIE_*
// env vars were Next.js-era leftovers from before the Vite SPA migration
// (07.6) and did not match this app's real dev topology.
const adminPort = 4000;
const websitePort = 3002;
const baseURL = process.env.ADMIN_E2E_BASE_URL ?? `http://localhost:${adminPort}`;
const apiOrigin = process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:5001';
export const websiteBaseURL =
  process.env.WEBSITE_E2E_BASE_URL ?? `http://localhost:${String(websitePort)}`;

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
    locale: 'ru-RU',
  },
  webServer: [
    {
      // No VITE_API_ORIGIN: the admin app calls the api via same-origin
      // relative paths through vite.config.ts's own /api and /v1 proxy
      // (hardcoded to localhost:5001, matching this suite's apiOrigin default).
      command: `pnpm --filter @resto/admin exec vite --port ${String(adminPort)}`,
      url: `${baseURL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter website exec next dev --port ${String(websitePort)}`,
      port: websitePort,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NEXT_PUBLIC_API_ORIGIN: apiOrigin,
      },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
