import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Sequential execution: futuras suites de integración van a compartir la
    // misma DB de test; evita conflictos de truncate/transacciones cruzadas.
    fileParallelism: false,
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
