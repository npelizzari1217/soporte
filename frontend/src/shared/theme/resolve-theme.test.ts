import { describe, it, expect } from "vitest";
import { resolveTheme } from "./resolve-theme";

/**
 * T1.1 — resolveTheme() unit tests (RED phase)
 *
 * Pura, sin DOM, sin mocks. Cubre los 5 casos canónicos del contrato.
 * Orden de resolución: pref explícita → prefers-color-scheme → default dark.
 */
describe("resolveTheme()", () => {
  it("devuelve 'dark' cuando no hay preferencia y el sistema es oscuro", () => {
    expect(resolveTheme(null, false)).toBe("dark");
  });

  it("devuelve 'light' cuando no hay preferencia y el sistema prefiere claro", () => {
    expect(resolveTheme(null, true)).toBe("light");
  });

  it("devuelve 'dark' cuando la preferencia explícita es dark, aunque el sistema sea claro", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("devuelve 'light' cuando la preferencia explícita es light, aunque el sistema sea oscuro", () => {
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("devuelve 'dark' para valores de preferencia inválidos (fallback seguro)", () => {
    expect(resolveTheme("invalid", false)).toBe("dark");
  });
});
