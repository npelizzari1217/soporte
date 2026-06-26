import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Exclude Playwright e2e specs — they use @playwright/test, not vitest
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
