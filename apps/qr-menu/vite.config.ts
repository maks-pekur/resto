import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 3003,
    host: true,
    // Same-origin in production; in dev the api runs on :3000 and the
    // qr-menu fetches via VITE_API_URL configured by the developer.
  },
});
