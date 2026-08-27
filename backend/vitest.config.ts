import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Sequential execution: futuras suites de integración van a compartir la
    // misma DB de test; evita conflictos de truncate/transacciones cruzadas.
    fileParallelism: false,
    // EL ORDEN IMPORTA. Primero el guardarraíl: corta la corrida ENTERA antes
    // del primer spec si alguna DATABASE_URL_* apunta fuera de localhost (ver
    // design sdd/regeneracion-reproducible D1). Recién después el barrido, que
    // dropea bases y por eso nunca debe correr sin ese corte adelante.
    globalSetup: [
      './test/guardarrail-host.global-setup.mjs',
      './test/barrido-huerfanas.global-setup.mjs',
    ],
    // Defaults de las 3 variables de entorno requeridas por `src/config/entorno.ts`
    // (ver sdd/fail-fast-env ADR-E2). `setupFiles` es el único hook que corre
    // ANTES de importar el archivo de spec — un `beforeAll` llegaría tarde.
    setupFiles: ['./test/entorno-test.setup.ts'],
    // Los fixtures de `guardarrail-corte-corrida.spec.ts` y de
    // `entorno-corte-arranque.spec.ts` son proyectos Vitest propios que se
    // lanzan como proceso hijo: no deben contarse ni correr dos veces dentro
    // de la suite padre.
    exclude: [...configDefaults.exclude, 'test/fixtures/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      reportsDirectory: 'coverage',
    },
  },
  plugins: [
    // SWC habilita emitDecoratorMetadata para DI de NestJS — esbuild solo no alcanza.
    swc.vite({ module: { type: 'nodenext' } }),
    tsconfigPaths(),
  ],
});
