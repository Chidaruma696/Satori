import { defineConfig } from 'vite';

// Relative base so the static build works on GitHub Pages under /Satori/ and anywhere else.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  // ffmpeg.wasm starts its own module worker; the dev pre-bundler would break its path.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] },
  worker: { format: 'es' },
});
