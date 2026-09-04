import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Huso fijo para toda la suite. `formatearInstante` muestra los instantes
    // en el reloj de quien mira, así que sin esto cualquier test que afirme
    // una hora concreta pasa o falla según dónde esté parada la máquina que
    // lo corre. Los cuatro husos que prueban ESE comportamiento los fija
    // `formato-fecha.test.ts` por bloque, y pisan este valor.
    env: { TZ: "America/Argentina/Buenos_Aires" },
    globals: true,
    // Excluye specs de Playwright — usan @playwright/test, no vitest.
    exclude: ["e2e/**", "node_modules/**"],
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
