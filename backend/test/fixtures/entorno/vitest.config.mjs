// Proyecto Vitest mínimo, aislado del padre (ver `exclude` en
// backend/vitest.config.ts). Usado SOLO por
// backend/test/entorno-corte-arranque.spec.ts para lanzar un Vitest hijo de
// verdad y comprobar que falta una variable requerida corta la corrida ANTES
// de que corra cualquier spec.
//
// Deliberadamente SIN `setupFiles` ni `globalSetup`: si heredara el
// `setupFiles` del padre, el `??=` de `test/entorno-test.setup.ts` repondría
// la variable faltante y el corte nunca ocurriría (ver design sdd/fail-fast-env
// ADR-E3). Tampoco necesita el plugin de swc: ni `entorno.ts` ni
// `validar-entorno.ts` usan decoradores, así que el esbuild de Vite alcanza.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {},
});
