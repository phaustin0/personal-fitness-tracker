import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base so assets resolve under any GitHub Pages repo subpath.
export default defineConfig({
  base: './',
  plugins: [preact()],
});
