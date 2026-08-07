import { describe, it, expect } from "vitest";
import { buildTicketsQueryString } from "./use-tickets";

/**
 * `buildTicketsQueryString` es la única lógica no trivial de `useTickets`:
 * mapea `TicketsFiltros` (con campos opcionales) a los query params reales
 * de `GET /tickets` (`ListTicketsQueryDto`). Un filtro `undefined` que
 * termine viajando como `"undefined"` en la URL rompería el `@IsUUID()` del
 * backend (422 silencioso) — ese es el edge case que vale la pena cubrir.
 */
describe("buildTicketsQueryString", () => {
  it("omite filtros undefined — nunca envía la clave (no basta con enviarla vacía, el backend usa @IsOptional)", () => {
    const qs = buildTicketsQueryString({ estado: "e1", tipo: undefined, busqueda: undefined });
    expect(qs).toBe("estado=e1");
  });

  it("filtros vacíos → query string vacía (lista sin filtros)", () => {
    expect(buildTicketsQueryString({})).toBe("");
  });

  it("incluye pagina/porPagina/busqueda combinados con filtros de catálogo", () => {
    const qs = buildTicketsQueryString({
      estado: "e1",
      prioridad: "p1",
      busqueda: "impresora rota",
      pagina: 2,
      porPagina: 20,
    });
    const params = new URLSearchParams(qs);
    expect(params.get("estado")).toBe("e1");
    expect(params.get("prioridad")).toBe("p1");
    expect(params.get("busqueda")).toBe("impresora rota");
    expect(params.get("pagina")).toBe("2");
    expect(params.get("porPagina")).toBe("20");
  });
});
