import { defineConfig } from "@playwright/test";

/**
 * `pnpm run dev` (Next) escucha en 3000 — 3001 es el BACKEND. Apuntar acá a
 * 3001 mandaba los e2e contra la API, no contra la app. Overrideable por
 * `E2E_BASE_URL` (mismo criterio que las credenciales del seed en
 * `e2e/caminos-criticos.spec.ts`), y un único valor alimenta `use.baseURL` y
 * `webServer.url` para que no puedan volver a divergir.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
