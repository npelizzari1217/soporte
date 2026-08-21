// Proyecto Vitest mínimo, aislado del padre (ver `exclude` en
// backend/vitest.config.ts), usado SOLO por
// backend/test/guardarrail-corte-corrida.spec.ts para lanzar un Vitest hijo
// de verdad y comprobar que el guardarraíl corta la corrida completa antes
// del primer spec.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globalSetup: path.join(__dirname, '../../guardarrail-host.global-setup.mjs'),
  },
});
