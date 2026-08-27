import { describe, it, expect } from "vitest";
import { sectorSchema } from "./schemas";

/**
 * sdd/filtro-prisma H5 — espejo del `@MaxLength` de `CreateSectorDto`
 * (backend). El backend sigue siendo la fuente de verdad real; este schema
 * solo mejora el feedback al usuario antes del round-trip HTTP.
 */
describe("sectorSchema — límites de largo (espejo de CreateSectorDto)", () => {
  it("rechaza codigo de más de 50 caracteres", () => {
    const result = sectorSchema.safeParse({ codigo: "A".repeat(51), nombre: "Computación" });
    expect(result.success).toBe(false);
  });

  it("acepta codigo de exactamente 50 caracteres", () => {
    const result = sectorSchema.safeParse({ codigo: "A".repeat(50), nombre: "Computación" });
    expect(result.success).toBe(true);
  });

  it("rechaza nombre de más de 100 caracteres", () => {
    const result = sectorSchema.safeParse({ codigo: "COMPUTACION", nombre: "N".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("acepta nombre de exactamente 100 caracteres", () => {
    const result = sectorSchema.safeParse({ codigo: "COMPUTACION", nombre: "N".repeat(100) });
    expect(result.success).toBe(true);
  });
});
