import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
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
