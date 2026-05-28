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
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'electron-updater',
        'node:sqlite',
        'libsodium-wrappers-sumo',
        'libsodium-wrappers',
        /^electron-chrome-extensions(\/.*)?$/,
        'archiver',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
      output: {
        format: 'cjs',
      },
    },
  },
  resolve: {
    alias: {
      '@vela/shared': resolve(import.meta.dirname, '../shared/src/index.ts'),
    },
  },
});
