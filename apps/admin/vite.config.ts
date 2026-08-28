import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev-only api target. admin hardcoded :5001 while qr-menu hardcoded :3000, so the
// two dev servers could not run against one api and the seed CLI (which defaults to
// :3000) worked for neither. Both now read the same override.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

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
