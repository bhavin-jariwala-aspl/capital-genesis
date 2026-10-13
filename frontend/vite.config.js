import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.{test,spec}.{js,jsx}'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/node_modules\/lucide-react\//.test(id)) return 'vendor-icons';
          if (/\/node_modules\/(react|react-dom|react-router-dom)\//.test(id)) return 'vendor-react';
          if (/\/node_modules\/@dnd-kit\//.test(id)) return 'vendor-dnd';
          if (/\/node_modules\/(recharts|react-apexcharts|apexcharts)\//.test(id)) return 'vendor-charts';
          if (/\/node_modules\/react-grid-layout\//.test(id)) return 'vendor-grid';
          if (/\/node_modules\/@tanstack\/react-query\//.test(id)) return 'vendor-query';
        },
      },
    },
  },
});
