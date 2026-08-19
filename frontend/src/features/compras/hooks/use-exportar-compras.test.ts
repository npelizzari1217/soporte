import { describe, it, expect } from "vitest";
import { buildExportComprasQueryString } from "./use-exportar-compras";
import type { ComprasFiltros } from "../types";

/**
 * La exportación tiene que devolver EXACTAMENTE el universo que el usuario
 * está viendo filtrado, pero completo — no la página visible. Por eso el
 * armado de la query string es la única lógica que vale la pena testear acá:
 * si se colara `pagina`/`porPagina`, el CSV traería 10 filas y el usuario no
 * tendría forma de darse cuenta (el archivo baja igual).
 */
describe("buildExportComprasQueryString", () => {
  const FILTROS_PANTALLA: ComprasFiltros = {
    pagina: 3,
    porPagina: 10,
    estado: "COMPLETADAS",
    sectorId: "sector-1",
    fechaDesde: "2026-01-01",
    fechaHasta: "2026-06-30",
  };

  it("descarta pagina y porPagina — el CSV es el universo filtrado completo", () => {
    const params = new URLSearchParams(buildExportComprasQueryString(FILTROS_PANTALLA));

    expect(params.get("pagina")).toBeNull();
    expect(params.get("porPagina")).toBeNull();
  });

  it("conserva TODOS los filtros de negocio de la pantalla", () => {
    const params = new URLSearchParams(buildExportComprasQueryString(FILTROS_PANTALLA));

    expect(params.get("estado")).toBe("COMPLETADAS");
    expect(params.get("sectorId")).toBe("sector-1");
    expect(params.get("fechaDesde")).toBe("2026-01-01");
    expect(params.get("fechaHasta")).toBe("2026-06-30");
  });

  it("omite claves undefined — nunca viaja `sectorId=undefined` (el backend lo rechazaría con 400)", () => {
    const qs = buildExportComprasQueryString({ pagina: 1, porPagina: 10, sectorId: undefined });

    expect(qs).toBe("");
  });
});
