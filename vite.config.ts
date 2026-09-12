import { defineConfig } from 'vite';

// Relative base so the static build works on GitHub Pages under /Satori/ and anywhere else.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
