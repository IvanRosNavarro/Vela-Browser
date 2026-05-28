import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const requireFromHere = createRequire(import.meta.url);

// libsodium-wrappers-sumo@0.7.16 publica un wrapper ESM cuyo
// `import "./libsodium-sumo.mjs"` queda roto al fallar el packaging del paquete
// (el peer `libsodium-sumo` se publica aparte). La build CJS resuelve bien
// porque `require("libsodium-sumo")` cae en el resolver de Node. En tests
// forzamos la entrada CJS resolviéndola vía Node y aliaseando el bare
// specifier.
const libsodiumWrappersCjs = requireFromHere.resolve('libsodium-wrappers-sumo');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@vela/shared': resolve(__dirname, '../shared/src/index.ts'),
      'libsodium-wrappers-sumo': libsodiumWrappersCjs,
    },
  },
});
