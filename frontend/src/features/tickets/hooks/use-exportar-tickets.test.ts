import { describe, it, expect } from "vitest";
import { buildExportTicketsQueryString } from "./use-exportar-tickets";
import type { TicketsFiltros } from "../types";

/**
 * La exportación tiene que devolver EXACTAMENTE el universo que el usuario
 * está viendo filtrado, pero completo — no la página visible. Por eso el
 * armado de la query string es la única lógica nueva que vale la pena
 * testear acá (el resto ya lo cubre `shared/hooks/use-exportar-csv.spec.ts` y
 * la regresión de `exportar-compras-button.test.tsx`, sdd/exportar-listados-csv).
 */
describe("buildExportTicketsQueryString", () => {
  const FILTROS_PANTALLA: TicketsFiltros = {
    pagina: 3,
    porPagina: 10,
    estado: "estado-1",
    tipo: "tipo-1",
    prioridad: "prioridad-1",
    asignado: "usuario-1",
    busqueda: "no arranca",
  };

  it("descarta pagina y porPagina — el CSV es el universo filtrado completo", () => {
    const params = new URLSearchParams(buildExportTicketsQueryString(FILTROS_PANTALLA));

    expect(params.get("pagina")).toBeNull();
    expect(params.get("porPagina")).toBeNull();
  });

  it("conserva TODOS los filtros de negocio de la pantalla", () => {
    const params = new URLSearchParams(buildExportTicketsQueryString(FILTROS_PANTALLA));

    expect(params.get("estado")).toBe("estado-1");
    expect(params.get("tipo")).toBe("tipo-1");
    expect(params.get("prioridad")).toBe("prioridad-1");
    expect(params.get("asignado")).toBe("usuario-1");
    expect(params.get("busqueda")).toBe("no arranca");
  });

  it("omite claves undefined — nunca viaja `estado=undefined` (el backend lo rechazaría con 400)", () => {
    const qs = buildExportTicketsQueryString({ pagina: 1, porPagina: 10, estado: undefined });

    expect(qs).toBe("");
  });
});
