// @vitest-environment node
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  const m = manifest();

  it("lleva las decisiones del dueño", () => {
    expect(m.name).toBe("Soporte Sesitec");
    expect(m.short_name).toBe("Soporte");
    expect(m.start_url).toBe("/tickets");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#2563eb");
    expect(m.background_color).toBe("#ffffff");
  });

  it("declara los cuatro íconos, sin combinar 'any maskable'", () => {
    const icons = (m.icons ?? []).map((i) => [i.src, i.sizes, i.type, i.purpose]);
    expect(icons).toEqual([
      ["/icons/icon-192.png", "192x192", "image/png", "any"],
      ["/icons/icon-512.png", "512x512", "image/png", "any"],
      ["/icons/icon-maskable-192.png", "192x192", "image/png", "maskable"],
      ["/icons/icon-maskable-512.png", "512x512", "image/png", "maskable"],
    ]);
  });

  it("cada ícono existe bajo public/", () => {
    for (const icon of m.icons ?? []) {
      expect(existsSync(path.join(process.cwd(), "public", icon.src)), icon.src).toBe(true);
    }
  });
});
