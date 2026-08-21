/**
 * Brings `vitest/globals` ambient types (describe, it, expect, vi, ...) into the
 * `pnpm typecheck` compilation scope.
 *
 * WHY a triple-slash reference instead of `"types": ["vitest/globals", ...]` in
 * `tsconfig.json`: a `types` array disables TypeScript's automatic `@types/*`
 * discovery. This project has six installed `@types/*` packages that would then
 * need to be re-listed here forever — the day someone installs a new `@types/*`
 * package, it silently drops out of scope and produces false production errors
 * with no compiler warning. A triple-slash reference in an ambient `.d.ts` file
 * adds exactly the one type package we want without touching auto-discovery.
 *
 * This file itself is excluded from `tsconfig.build.json` (see its `exclude`
 * array) so `vitest/globals` never leaks into the production build scope.
 */
/// <reference types="vitest/globals" />
