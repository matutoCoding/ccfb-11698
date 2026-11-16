/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
