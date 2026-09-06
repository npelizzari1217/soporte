import { describe, expect, it } from "vitest";
import { ACCIONES_PISO, CATALOGO_MODULOS, PARES_VALIDOS, accionesDeModulo, moduloDe } from "./acciones";

/**
 * Enumeración COMPLETA de los pares que declara
 * `backend/src/shared/domain/acciones.ts`, transcrita a mano porque el
 * frontend no puede importar del backend (son dos paquetes).
 *
 * Va escrita par por par a propósito: un centinela que solo afirmara una
 * cantidad (`toHaveLength(36)`) se arregla subiendo el número, y entonces
 * pasa en verde sin haber comparado nada contra el backend. Acá, para que el
 * test vuelva a verde hay que escribir el par nuevo, que es exactamente el
 * momento en que corresponde ir a mirar el catálogo del backend.
 */
const PARES_DEL_BACKEND = [
  "TICKETS:LECTURA",
  "TICKETS:ALTAS",
  "TICKETS:MODIFICACION",
  "TICKETS:VER_TODOS",
  "TICKETS:ASIGNAR",
  "TICKETS:TRANSICIONAR",
  "TICKETS:OBSERVAR",
  "TICKETS:COMENTAR",
  "COMPRAS:LECTURA",
  "COMPRAS:ALTAS",
  "COMPRAS:MODIFICACION",
  "COMPRAS:BORRADO",
  "COMPRAS:APROBACION",
  "EDILICIA:LECTURA",
  "EDILICIA:ALTAS",
  "EDILICIA:MODIFICACION",
  "EDILICIA:BORRADO",
  "EQUIPOS:LECTURA",
  "EQUIPOS:ALTAS",
  "EQUIPOS:MODIFICACION",
  "EQUIPOS:BORRADO",
  "KB:LECTURA",
  "KB:ALTAS",
  "KB:MODIFICACION",
  "KB:BORRADO",
  "KB:VER_TODOS",
  "KB:PUBLICAR",
  "DASHBOARD:LECTURA",
  "CSAT:LECTURA",
  "PREVENTIVO:LECTURA",
  "PREVENTIVO:ALTAS",
  "PREVENTIVO:MODIFICACION",
  "PREVENTIVO:BORRADO",
  "INSUMOS:LECTURA",
  "INSUMOS:ALTAS",
  "INSUMOS:AJUSTAR",
] as const;

// Espejo del catálogo backend (ADR-P1, sdd/matriz-permisos-por-usuario). No
// re-implementa la validación (eso lo hace el CHECK + el DTO del backend) —
// solo confirma que la UI arma la grilla módulo × acción con el mismo
// vocabulario, sin inventar un código nuevo.
describe("acciones (espejo del catálogo de la matriz)", () => {
  it("declara exactamente los mismos pares que el catálogo del backend", () => {
    // Se comparan ordenados: lo que tiene que coincidir es el CONJUNTO de
    // pares, no el orden en que el catálogo declara sus módulos.
    expect([...PARES_VALIDOS].sort()).toEqual([...PARES_DEL_BACKEND].sort());
  });

  it("la cardinalidad sale de esa enumeración, no de un número escrito aparte", () => {
    expect(PARES_VALIDOS).toHaveLength(PARES_DEL_BACKEND.length);
  });

  it("ningún código con ':' en el nombre de la acción", () => {
    for (const par of PARES_VALIDOS) {
      const [, ...resto] = par.split(":");
      expect(resto.join(":").includes(":")).toBe(false);
    }
  });

  it("IMPRESION no aparece en ningún módulo (piso deshabilitado en todos)", () => {
    expect(PARES_VALIDOS.some((par) => par.endsWith(":IMPRESION"))).toBe(false);
  });

  it("APROBACION solo aparece en COMPRAS", () => {
    const conAprobacion = PARES_VALIDOS.filter((par) => par.endsWith(":APROBACION"));
    expect(conAprobacion).toEqual(["COMPRAS:APROBACION"]);
  });

  it("AJUSTAR solo aparece en INSUMOS", () => {
    const conAjustar = PARES_VALIDOS.filter((par) => par.endsWith(":AJUSTAR"));
    expect(conAjustar).toEqual(["INSUMOS:AJUSTAR"]);
  });

  it("INSUMOS no declara MODIFICACION ni BORRADO: la bitácora es append-only", () => {
    // La ausencia es tan deliberada como la presencia: un movimiento se
    // corrige con otro movimiento. Declararlas prometería en la grilla una
    // operación que ningún endpoint puede ofrecer.
    expect(accionesDeModulo("INSUMOS")).toEqual([
      "INSUMOS:LECTURA",
      "INSUMOS:ALTAS",
      "INSUMOS:AJUSTAR",
    ]);
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

  it("CATALOGO_MODULOS declara los módulos vigentes de la matriz", () => {
    // La lista sale de los pares enumerados arriba: sumar un módulo al espejo
    // sin agregar sus pares —o al revés— deja este test en rojo.
    const modulosDeLosPares = [...new Set(PARES_DEL_BACKEND.map((par) => par.split(":")[0]))];
    expect(Object.keys(CATALOGO_MODULOS).sort()).toEqual(modulosDeLosPares.sort());
  });
});
