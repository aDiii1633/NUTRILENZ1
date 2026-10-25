import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./admin', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  build: { outDir: '../dist-admin', emptyOutDir: true },
});
