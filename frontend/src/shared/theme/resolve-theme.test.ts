import { describe, expect, it } from "vitest";
import { resolveTheme } from "./resolve-theme";

// Spec: PR11 — tema día/noche: localStorage gana sobre prefers-color-scheme;
// sin preferencia guardada, sigue el sistema SOLO como fallback inicial;
// fallback final 'dark'.

describe("resolveTheme", () => {
  it("explicit 'light' preference → always wins, regardless of system preference", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("explicit 'dark' preference → always wins, regardless of system preference", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("no stored preference + system prefers light → falls back to 'light'", () => {
    expect(resolveTheme(null, true)).toBe("light");
  });

  it("no stored preference + system does NOT prefer light → falls back to 'dark'", () => {
    expect(resolveTheme(null, false)).toBe("dark");
  });

  it("invalid/corrupted stored value → treated as no preference, follows system fallback", () => {
    expect(resolveTheme("not-a-theme", true)).toBe("light");
    expect(resolveTheme("not-a-theme", false)).toBe("dark");
  });
});
