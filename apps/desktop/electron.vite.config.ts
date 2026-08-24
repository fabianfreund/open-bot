import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Main and preload build to CommonJS, Electron's own module has no named ESM
 * exports, and Fastify relies on runtime `require`.
 *
 * `external` is deliberately narrow: Fastify and its websocket plugin resolve
 * themselves at runtime, and everything else (workspace packages, the Codex
 * SDK, zod) is bundled so a packaged app has one file to ship.
 */
const external = ['electron', 'fastify', '@fastify/websocket'];

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve('src/main/index.ts'),
        external,
        output: { format: 'cjs', entryFileNames: 'index.js' },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        external,
        output: { format: 'cjs', entryFileNames: 'index.js' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } },
  },
});
