import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
      '/v1': { target: 'http://localhost:3000', changeOrigin: false },
      '/internal': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
