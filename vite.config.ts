import { defineConfig } from 'vite';

// GitHub Pages project site is served from this repo's subpath.
export default defineConfig({
  base: '/crypto-lab-enigma-forge/',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
