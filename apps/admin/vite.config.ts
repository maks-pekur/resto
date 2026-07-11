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
    proxy: {
      '/api': { target: 'http://localhost:5001', changeOrigin: false },
      '/v1': { target: 'http://localhost:5001', changeOrigin: false },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
