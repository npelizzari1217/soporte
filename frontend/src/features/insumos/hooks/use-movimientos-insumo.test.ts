import { describe, it, expect } from "vitest";
import { buildMovimientosInsumoQueryString } from "./use-movimientos-insumo";

/**
 * `buildMovimientosInsumoQueryString` es la única lógica no trivial de
 * `useMovimientosInsumo`, y se prueba suelta por el mismo criterio que
 * `buildComprasQueryString` (`features/compras/hooks/use-compras.test.ts`):
 * la construcción de la query string no necesita montar la query para
 * verificarse.
 *
 * El edge case que importa es el `undefined`: una clave que viaje como
 * `"undefined"` rompe el `@IsInt()`/`@Min(1)` de
 * `ListarMovimientosInsumoQueryDto` y el usuario se come un 400 por una
 * página que nunca pidió.
 */
describe("buildMovimientosInsumoQueryString", () => {
  it("omite las claves undefined — nunca manda «clave=undefined»", () => {
    expect(buildMovimientosInsumoQueryString({ pagina: undefined, porPagina: undefined })).toBe("");
  });

  it("ventana vacía → query string vacía (la primera página con el tamaño del servidor)", () => {
    expect(buildMovimientosInsumoQueryString({})).toBe("");
  });

  it("incluye pagina y porPagina cuando están presentes", () => {
    const params = new URLSearchParams(
      buildMovimientosInsumoQueryString({ pagina: 3, porPagina: 10 }),
    );
    expect(params.get("pagina")).toBe("3");
    expect(params.get("porPagina")).toBe("10");
  });
});
