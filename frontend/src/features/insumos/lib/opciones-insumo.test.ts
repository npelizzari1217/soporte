import { describe, it, expect } from "vitest";
import { opcionesDeInsumo } from "./opciones-insumo";
import type { Insumo } from "../types";

function buildInsumo(overrides: Partial<Insumo> = {}): Insumo {
  return {
    id: "ins-1",
    codigo: "TON-001",
    nombre: "Tóner negro",
    familiaId: "fam-1",
    unidadMedidaId: "um-1",
    stockMinimo: null,
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("opcionesDeInsumo", () => {
  it("etiqueta cada insumo con su código y su nombre", () => {
    const opciones = opcionesDeInsumo([buildInsumo()]);

    expect(opciones).toEqual([{ id: "ins-1", nombre: "TON-001 — Tóner negro" }]);
  });

  /**
   * `GET /insumos` devuelve los vigentes, habilitados Y deshabilitados, y el
   * backend acepta que un ítem apunte a uno deshabilitado. Filtrarlo dejaría al
   * `<select>` sin la `<option>` de un valor que el servidor sí guarda.
   */
  it("conserva el insumo deshabilitado y lo marca en la etiqueta", () => {
    const opciones = opcionesDeInsumo([
      buildInsumo(),
      buildInsumo({ id: "ins-2", codigo: "PAP-002", nombre: "Papel A4", activo: false }),
    ]);

    expect(opciones).toEqual([
      { id: "ins-1", nombre: "TON-001 — Tóner negro" },
      { id: "ins-2", nombre: "PAP-002 — Papel A4 (deshabilitado)" },
    ]);
  });

  it("hermano invertido: el insumo habilitado no lleva la marca de deshabilitado", () => {
    const opciones = opcionesDeInsumo([buildInsumo({ activo: true })]);

    expect(opciones[0].nombre).not.toContain("deshabilitado");
  });

  it("respeta el orden en que vino el catálogo", () => {
    const opciones = opcionesDeInsumo([
      buildInsumo({ id: "ins-9", codigo: "ZZZ-009", nombre: "Último" }),
      buildInsumo({ id: "ins-1", codigo: "AAA-001", nombre: "Primero" }),
    ]);

    expect(opciones.map((opcion) => opcion.id)).toEqual(["ins-9", "ins-1"]);
  });

  it("con el catálogo vacío devuelve una lista vacía", () => {
    expect(opcionesDeInsumo([])).toEqual([]);
  });
});
