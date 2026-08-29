import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev-only api target. admin and qr-menu once hardcoded different ports, so the two
// dev servers could not run against one api. Both now read the same override, and the
// fallback is :5001 — the `API_PORT` default in `env.schema.ts`, what the seed CLI
// (`tools/scripts/seed/lib/options.ts`) targets, and what `.env.example` ships.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:5001';

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
    // this Host downstream.
    allowedHosts: ['.lvh.me', '.localhost'],
    // Dev only: forward the public/internal api paths to the api on :3000.
    // `changeOrigin: false` keeps the tenant subdomain Host (e.g.
    // `cafe-demo.menu.lvh.me`) so the api resolves the tenant from it,
    // mirroring same-origin production.
    proxy: {
      '/v1': { target: API_TARGET, changeOrigin: false },
      '/internal': { target: API_TARGET, changeOrigin: false },
    },
  },
});
