/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Terminal (incl. recharts for the P/L chart) is the landing route, so it ships in the main chunk.
  // Aztex Studio is a separate app (its own page, bundle and install manifest), like MetaEditor.
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        studio: fileURLToPath(new URL('./studio.html', import.meta.url)),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
