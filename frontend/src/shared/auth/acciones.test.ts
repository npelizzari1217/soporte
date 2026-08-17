import { describe, expect, it } from "vitest";
import { ACCIONES_PISO, CATALOGO_MODULOS, PARES_VALIDOS, accionesDeModulo, moduloDe } from "./acciones";

// Espejo del catálogo backend (ADR-P1, sdd/matriz-permisos-por-usuario). No
// re-implementa la validación (eso lo hace el CHECK + el DTO del backend) —
// solo confirma que la UI arma la grilla módulo × acción con el mismo
// vocabulario, sin inventar un código nuevo.
describe("acciones (espejo del catálogo de la matriz)", () => {
  it("28 pares válidos, igual cardinalidad que el backend (R1)", () => {
    expect(PARES_VALIDOS).toHaveLength(28);
  });

  it("ningún código con ':' en el nombre de la acción", () => {
    for (const par of PARES_VALIDOS) {
      const [, ...resto] = par.split(":");
      expect(resto.join(":").includes(":")).toBe(false);
    }
  });

  it("IMPRESION no aparece en ningún módulo (piso deshabilitado en los 6)", () => {
    expect(PARES_VALIDOS.some((par) => par.endsWith(":IMPRESION"))).toBe(false);
  });

  it("APROBACION solo aparece en COMPRAS", () => {
    const conAprobacion = PARES_VALIDOS.filter((par) => par.endsWith(":APROBACION"));
    expect(conAprobacion).toEqual(["COMPRAS:APROBACION"]);
  });

  it("accionesDeModulo('TICKETS') devuelve solo pares que empiezan con 'TICKETS:'", () => {
    const ticketsAcciones = accionesDeModulo("TICKETS");
    expect(ticketsAcciones.length).toBeGreaterThan(0);
    expect(ticketsAcciones.every((par) => par.startsWith("TICKETS:"))).toBe(true);
  });

  it("moduloDe extrae el módulo del código", () => {
    expect(moduloDe("COMPRAS:APROBACION")).toBe("COMPRAS");
  });

  it("ACCIONES_PISO tiene las 6 acciones piso", () => {
    expect(ACCIONES_PISO).toEqual([
      "LECTURA",
      "ALTAS",
      "MODIFICACION",
      "BORRADO",
      "IMPRESION",
      "APROBACION",
    ]);
  });

  it("CATALOGO_MODULOS declara los 6 módulos de la matriz", () => {
    expect(Object.keys(CATALOGO_MODULOS).sort()).toEqual(
      ["COMPRAS", "DASHBOARD", "EDILICIA", "EQUIPOS", "KB", "TICKETS"].sort(),
    );
  });
});
