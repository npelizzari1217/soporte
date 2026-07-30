import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Env SMTP dummy para toda la suite — EMAIL_SENDER (tickets.module.ts)
    // es fail-fast (Judgment Day PR3 Ronda 1) y los specs de wiring
    // bootstrapean TicketsModule/AppModule sin SMTP_* real configurado.
    setupFiles: ['./test/setup-env.ts'],
    // Equivalent to jest maxWorkers:1 — integration suites share the same
    // test DB; sequential execution avoids truncate conflicts.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      reportsDirectory: 'coverage',
    },
  },
  plugins: [
    // SWC handles emitDecoratorMetadata for NestJS DI — esbuild alone does not.
    // module: nodenext is the unplugin-swc recommended type for Vitest.
    swc.vite({ module: { type: 'nodenext' } }),
    // Resolves @/* path aliases from tsconfig.json
    tsconfigPaths(),
  ],
});
