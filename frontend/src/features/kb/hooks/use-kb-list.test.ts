import { describe, it, expect } from "vitest";
import { buildKbQueryString } from "./use-kb-list";

/**
 * `buildKbQueryString` es la única lógica no trivial de `useKbList` (mismo
 * criterio que `buildTicketsQueryString` de B1): un filtro `undefined` que
 * viaje como `"undefined"` en la URL rompería el `@IsOptional()` de
 * `ListKbArticulosQueryDto` (422 silencioso).
 */
describe("buildKbQueryString", () => {
  it.each([
    [{ busqueda: "impresora", page: undefined }, "busqueda=impresora"],
    [{}, ""],
    [{ busqueda: "impresora", page: 2, pageSize: 20 }, "busqueda=impresora&page=2&pageSize=20"],
  ])("mapea filtros a query string, omitiendo claves undefined (%#)", (filtros, expected) => {
    expect(buildKbQueryString(filtros)).toBe(expected);
  });
});
