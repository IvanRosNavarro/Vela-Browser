import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node20',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        webTab: resolve(import.meta.dirname, 'src/webTab.ts'),
        ctxMenu: resolve(import.meta.dirname, 'src/ctxMenu.ts'),
      },
      formats: ['cjs'],
      fileName: (_, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
      output: {
        format: 'cjs',
      },
    },
  },
  resolve: {
    // Las subrutas (`@vela/shared/gestures/swipe`) dejan al preload de las
    // pestañas importar un módulo concreto sin arrastrar zod desde el índice.
    alias: [
      { find: /^@vela\/shared$/, replacement: resolve(import.meta.dirname, '../shared/src/index.ts') },
      { find: /^@vela\/shared\/(.*)$/, replacement: `${resolve(import.meta.dirname, '../shared/src')}/$1` },
    ],
  },
});
