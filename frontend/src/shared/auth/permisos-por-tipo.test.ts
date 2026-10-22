import { describe, expect, it } from "vitest";
import {
  ACCIONES_TIPO_TICKET,
  PERMISOS_SIN_RESTRICCION,
  permisosPorTipoSchema,
  puedeEnAlgunTipo,
  puedeEnModulo,
  puedeEnTipo,
  puedeVerListaDeUsuarios,
  tiposCon,
  type PermisosPorTipo,
} from "./permisos-por-tipo";

// Mantenimiento solo se lee; Soporte se lee y se modifica; nada de Edilicia.
const PERMISOS: PermisosPorTipo = {
  sinRestriccion: false,
  porTipo: { soporte: ["LECTURA", "MODIFICACION"], mantenimiento: ["LECTURA"] },
  porModulo: { TICKETS: ["LECTURA", "MODIFICACION"], EDILICIA: ["LECTURA"] },
};

describe("permisos por tipo de la sesión (odd/permisos-por-tipo-ticket, T6)", () => {
  it("puedeEnTipo decide por el tipo pedido, no por los demás", () => {
    expect(puedeEnTipo(PERMISOS, "soporte", "MODIFICACION")).toBe(true);
    expect(puedeEnTipo(PERMISOS, "mantenimiento", "MODIFICACION")).toBe(false);
    expect(puedeEnTipo(PERMISOS, "inexistente", "LECTURA")).toBe(false);
  });

  it("puedeEnModulo usa la unión por módulo", () => {
    expect(puedeEnModulo(PERMISOS, "EDILICIA", "LECTURA")).toBe(true);
    expect(puedeEnModulo(PERMISOS, "EDILICIA", "MODIFICACION")).toBe(false);
    expect(puedeEnModulo(PERMISOS, "COMPRAS", "LECTURA")).toBe(false);
  });

  it("puedeEnAlgunTipo mira todos los tipos", () => {
    expect(puedeEnAlgunTipo(PERMISOS, "MODIFICACION")).toBe(true);
    expect(puedeEnAlgunTipo(PERMISOS, "VER_TODOS")).toBe(false);
  });

  it("tiposCon filtra el catálogo y conserva su orden", () => {
    const catalogo = [{ id: "mantenimiento" }, { id: "edilicia" }, { id: "soporte" }];
    expect(tiposCon(PERMISOS, catalogo, "LECTURA").map((t) => t.id)).toEqual(["mantenimiento", "soporte"]);
  });

  it("sin datos (null) nada se ofrece; sin restricción, todo", () => {
    expect(puedeEnTipo(null, "soporte", "LECTURA")).toBe(false);
    expect(puedeEnModulo(null, "TICKETS", "LECTURA")).toBe(false);
    expect(puedeEnAlgunTipo(null, "LECTURA")).toBe(false);
    expect(tiposCon(null, [{ id: "soporte" }], "LECTURA")).toEqual([]);
    expect(puedeEnTipo(PERMISOS_SIN_RESTRICCION, "cualquiera", "BORRADO")).toBe(true);
    expect(puedeEnModulo(PERMISOS_SIN_RESTRICCION, "EDILICIA", "ALTAS")).toBe(true);
  });

  it("el vocabulario espeja el del backend", () => {
    expect([...ACCIONES_TIPO_TICKET]).toEqual([
      "LECTURA",
      "VER_TODOS",
      "ALTAS",
      "MODIFICACION",
      "TRANSICIONAR",
      "ASIGNAR",
      "COMENTAR",
      "OBSERVAR",
      "IMPRESION",
      "BORRADO",
    ]);
  });

  it("el schema rechaza una acción desconocida", () => {
    expect(permisosPorTipoSchema.safeParse(PERMISOS).success).toBe(true);
    expect(
      permisosPorTipoSchema.safeParse({ ...PERMISOS, porTipo: { soporte: ["BORRAR_TODO"] } }).success,
    ).toBe(false);
  });

  it("puedeVerListaDeUsuarios: sin restricción siempre; sin datos nunca; VER_TODOS de Edilicia no cuenta (S7)", () => {
    expect(puedeVerListaDeUsuarios(PERMISOS_SIN_RESTRICCION)).toBe(true);
    expect(puedeVerListaDeUsuarios(null)).toBe(false);
    const soloEdilicia: PermisosPorTipo = {
      sinRestriccion: false,
      porTipo: { edilicia: ["LECTURA", "VER_TODOS"] },
      porModulo: { EDILICIA: ["LECTURA", "VER_TODOS"] },
    };
    expect(puedeVerListaDeUsuarios(soloEdilicia)).toBe(false);
    expect(
      puedeVerListaDeUsuarios({ ...soloEdilicia, porModulo: { TICKETS: ["LECTURA", "VER_TODOS"] } }),
    ).toBe(true);
  });
});
