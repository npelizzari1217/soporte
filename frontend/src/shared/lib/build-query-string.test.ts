import { describe, expect, it } from "vitest";
import { buildQueryString } from "./build-query-string";

describe("buildQueryString", () => {
  it("omite las claves en undefined", () => {
    expect(buildQueryString({ pagina: 1, porPagina: undefined })).toBe("pagina=1");
  });

  it("sin ninguna clave con valor devuelve una cadena vacía", () => {
    expect(buildQueryString({})).toBe("");
    expect(buildQueryString({ pagina: undefined })).toBe("");
  });

  it("serializa números y booleanos con String()", () => {
    expect(buildQueryString({ pagina: 2, soloEnCurso: false })).toBe("pagina=2&soloEnCurso=false");
  });

  // Hermano invertido del primero: sin este caso, una función que descartara
  // TODO seguiría pasando los asserts de omisión.
  it("conserva la cadena vacía, a diferencia de los constructores de tickets y kb", () => {
    expect(buildQueryString({ busqueda: "" })).toBe("busqueda=");
  });

  it("conserva el null, que significa algo distinto de la ausencia", () => {
    expect(buildQueryString({ sectorId: null })).toBe("sectorId=null");
  });
});
