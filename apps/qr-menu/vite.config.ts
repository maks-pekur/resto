import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev-only api target. admin and qr-menu once hardcoded different ports, so the two
// dev servers could not run against one api. Both now read the same override, and the
// fallback is :5001 — the `API_PORT` default in `env.schema.ts`, what the seed CLI
// (`tools/scripts/seed/lib/options.ts`) targets, and what `.env.example` ships.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:5001';
const MEDIA_TARGET = process.env.MEDIA_PROXY_TARGET ?? 'http://localhost:9000';

// A phone only hands the camera to a secure origin, so testing the QR scan on a real device
// needs https even in dev. `pnpm dev:cert` mints the pair; without it — or with `DEV_TLS=0`,
// which is what a tunnel in front of the server wants — it stays http.
const certPath = fileURLToPath(new URL('../../infra/dev-certs/dev.pem', import.meta.url));
const keyPath = fileURLToPath(new URL('../../infra/dev-certs/dev-key.pem', import.meta.url));
const devTls =
  process.env.DEV_TLS !== '0' && existsSync(certPath) && existsSync(keyPath)
    ? { https: { cert: readFileSync(certPath), key: readFileSync(keyPath) } }
    : {};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 3003,
    host: true,
    // Tenant subdomains (e.g. `cafe-demo.menu.lvh.me`) must be allowed through
    // Vite's host check so the dev server serves them; the tenant resolves from
    // this Host downstream. `.nip.io` is the same shape over a LAN address, for a
    // real phone: `pizza.menu.192.168.1.5.nip.io` resolves to 192.168.1.5. A tunnel host
    // (VS Code port forwarding, cloudflared) carries no tenant label at all — the api falls
    // back to TENANT_DEV_FALLBACK_SLUG there.
    allowedHosts: ['.lvh.me', '.localhost', '.nip.io', '.devtunnels.ms', '.trycloudflare.com'],
    ...devTls,
    // Dev only: forward the public/internal api paths to the api on :3000.
    // `changeOrigin: false` keeps the tenant subdomain Host (e.g.
    // `cafe-demo.menu.lvh.me`) so the api resolves the tenant from it,
    // mirroring same-origin production.
    proxy: {
      '/v1': { target: API_TARGET, changeOrigin: false },
      '/internal': { target: API_TARGET, changeOrigin: false },
      // Dev only: object storage speaks plain http on localhost, which a phone can neither
      // reach nor load into an https page. Same-origin through here, it can do both — point
      // MEDIA_PUBLIC_BASE_URL at `<this origin>/media/<bucket>`.
      '/media': {
        target: MEDIA_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/media/u, ''),
      },
    },
  },
});
