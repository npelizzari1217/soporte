import { describe, it, expect } from "vitest";
import { buildComprasQueryString } from "./use-compras";

/**
 * `buildComprasQueryString` es la única lógica no trivial de `useCompras`
 * (mismo criterio que `buildTicketsQueryString`, `features/tickets/hooks/
 * use-tickets.test.ts`): mapea `ComprasFiltros` (paginación opcional) a los
 * query params reales de `GET /compras` (`ListarComprasQueryDto`). Un
 * filtro `undefined` que termine viajando como `"undefined"` en la URL
 * rompería el `@IsInt()`/`@Min(1)` del backend (400 silencioso) — ese es el
 * edge case que vale la pena cubrir.
 */
describe("buildComprasQueryString", () => {
  it("omite filtros undefined — nunca envía la clave", () => {
    const qs = buildComprasQueryString({ pagina: undefined, porPagina: undefined });
    expect(qs).toBe("");
  });

  it("filtros vacíos → query string vacía (primera página sin parámetros)", () => {
    expect(buildComprasQueryString({})).toBe("");
  });

  it("incluye pagina/porPagina cuando ambos están presentes", () => {
    const qs = buildComprasQueryString({ pagina: 2, porPagina: 20 });
    const params = new URLSearchParams(qs);
    expect(params.get("pagina")).toBe("2");
    expect(params.get("porPagina")).toBe("20");
  });
});
