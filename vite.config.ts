import { defineConfig } from 'vite';

// Relative base so the static build works under any GitHub Pages subpath.
export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
