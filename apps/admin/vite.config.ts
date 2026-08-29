import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev-only api target. admin and qr-menu once hardcoded different ports, so the two
// dev servers could not run against one api. Both now read the same override, and the
// fallback is :5001 — the `API_PORT` default in `env.schema.ts`, what the seed CLI
// (`tools/scripts/seed/lib/options.ts`) targets, and what `.env.example` ships.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:5001';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['@tanstack/react-router'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 4000,
    // D-21: per-tenant dev hosts, e.g. pizza.admin.localhost:4000.
    // `host: true` binds beyond loopback so a `*.localhost` subdomain
    // request reaches this server; `allowedHosts` is Vite's own separate
    // check against the incoming Host header (CVE-2025-24010 class of fix).
    host: true,
    allowedHosts: ['.admin.localhost'],
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/v1': { target: API_TARGET, changeOrigin: false },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
