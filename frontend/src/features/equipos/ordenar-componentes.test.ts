import { describe, it, expect } from "vitest";
import { ordenarComponentes, type ComponenteOrdenable } from "./ordenar-componentes";

function make(overrides: Partial<ComponenteOrdenable> & { id: string }): ComponenteOrdenable & { id: string } {
  return {
    activo: true,
    tipoNombre: null,
    descripcion: null,
    capacidad: null,
    ...overrides,
  };
}

describe("ordenarComponentes", () => {
  it("ordena activos primero (alfabético), luego inactivos (alfabético)", () => {
    const zapatoActivo = make({ id: "1", tipoNombre: "Zapato", activo: true });
    const arbolActivo = make({ id: "2", tipoNombre: "Árbol", activo: true });
    const zetaInactivo = make({ id: "3", tipoNombre: "Zeta", activo: false });
    const betaInactivo = make({ id: "4", tipoNombre: "Beta", activo: false });

    const resultado = ordenarComponentes([zapatoActivo, zetaInactivo, arbolActivo, betaInactivo]);

    expect(resultado.map((c) => c.id)).toEqual(["2", "1", "4", "3"]);
  });

  it("sin tipoNombre la clave es vacía: va primero y desempata por descripcion", () => {
    const conTipo = make({ id: "1", tipoNombre: "RAM", descripcion: "A" });
    const sinTipoB = make({ id: "2", tipoNombre: null, descripcion: "B" });
    const sinTipoA = make({ id: "3", tipoNombre: null, descripcion: "A" });

    const resultado = ordenarComponentes([conTipo, sinTipoB, sinTipoA]);

    expect(resultado.map((c) => c.id)).toEqual(["3", "2", "1"]);
  });

  it("desempata por descripcion y luego capacidad cuando el tipo es igual", () => {
    const capacidadGrande = make({ id: "1", tipoNombre: "RAM", descripcion: null, capacidad: "16GB" });
    const capacidadChica = make({ id: "2", tipoNombre: "RAM", descripcion: null, capacidad: "8GB" });
    const conDescripcion = make({ id: "3", tipoNombre: "RAM", descripcion: "Slot 1", capacidad: null });

    const resultado = ordenarComponentes([capacidadGrande, conDescripcion, capacidadChica]);

    // "" (sin descripción) ordena antes que "Slot 1"; entre las dos sin
    // descripción, desempata por capacidad ("16GB" < "8GB" alfabéticamente).
    expect(resultado.map((c) => c.id)).toEqual(["1", "2", "3"]);
  });

  it("no muta el array original", () => {
    const original = [make({ id: "1", tipoNombre: "Z" }), make({ id: "2", tipoNombre: "A" })];
    const copia = [...original];

    ordenarComponentes(original);

    expect(original).toEqual(copia);
  });
});
