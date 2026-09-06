// @vitest-environment node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(__dirname, '..');
const distAssets = join(projectRoot, 'dist', 'qr', 'assets');

const readBundleJs = (): string => {
  expect(existsSync(distAssets), `expected ${distAssets} after build`).toBe(true);
  const jsFiles = readdirSync(distAssets).filter((f) => f.endsWith('.js'));
  expect(jsFiles.length, 'expected at least one .js asset').toBeGreaterThan(0);
  return jsFiles.map((f) => readFileSync(join(distAssets, f), 'utf8')).join('\n');
};

describe('qr-menu prod bundle', () => {
  it('does not leak dev-only tenant override identifiers', () => {
    // Build with no VITE_TENANT_SLUG in the env — even so, the literal
    // string `VITE_TENANT_SLUG` (used by Vite's env replacement) and the
    // resulting `x-tenant-slug` header value must not appear in the
    // emitted JS. If they do, a future build that DOES set the env var
    // would silently ship a cross-tenant primitive (ADR-0020 I-3,
    // apps/CLAUDE.md "VITE_* is baked into the bundle at build time").
    execSync('pnpm --filter @resto/qr-menu build', {
      cwd: resolve(projectRoot, '..', '..'),
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production', VITE_TENANT_SLUG: '' },
    });
    const bundle = readBundleJs();
    for (const needle of ['VITE_TENANT_SLUG', 'x-tenant-slug']) {
      expect(bundle, `bundle must not contain "${needle}"`).not.toContain(needle);
    }
  }, 60_000);

  it('tree-shakes VITE_TENANT_SLUG even when the env var has a real value', () => {
    const SLUG_FIXTURE = 'leak-test-slug-do-not-ship';
    execSync('pnpm --filter @resto/qr-menu build', {
      cwd: resolve(projectRoot, '..', '..'),
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production', VITE_TENANT_SLUG: SLUG_FIXTURE },
    });
    const bundle = readBundleJs();
    // The fixture value itself MUST be tree-shaken — its presence in the
    // bundle would indicate Vite inlined the env var despite the
    // `import.meta.env.DEV` guard. Same `x-tenant-slug` literal still
    // matters for the header construction.
    for (const needle of ['VITE_TENANT_SLUG', 'x-tenant-slug', SLUG_FIXTURE]) {
      expect(bundle, `bundle must not contain "${needle}"`).not.toContain(needle);
    }
  }, 60_000);

  it('ships hidden source maps (maps emitted, no inline sourceMappingURL)', () => {
    const mapFiles = readdirSync(distAssets).filter((f) => f.endsWith('.map'));
    const bundle = readBundleJs();
    expect(mapFiles.length, 'hidden source maps: .map files must exist').toBeGreaterThan(0);
    expect(bundle, 'hidden source maps: no inline sourceMappingURL comment allowed').not.toContain(
      'sourceMappingURL',
    );
  }, 60_000);

  it('carries no QR or PDF generation dependency', () => {
    // QR/PDF generation lives only in apps/admin (table sticker sheets) — the guest bundle
    // only ever reads a resolved label from GET /v1/tables/:id (T-10.3-46).
    const bundle = readBundleJs();
    for (const needle of ['jsPDF', 'qrcode']) {
      expect(bundle, `bundle must not contain "${needle}"`).not.toContain(needle);
    }
  }, 60_000);
});
