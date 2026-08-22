import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
      '/api': { target: 'http://localhost:5001', changeOrigin: false },
      '/v1': { target: 'http://localhost:5001', changeOrigin: false },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
