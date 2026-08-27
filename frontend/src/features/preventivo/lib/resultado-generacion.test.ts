import { describe, it, expect } from "vitest";
import { badgeVariantDeResultado, etiquetaResultado } from "./resultado-generacion";
import type { ResultadoGeneracion } from "../types";

/**
 * Los 4 códigos son el CHECK cerrado `preventivo_generacion_resultado_check`
 * (backend) — un código sin mapeo acá rompería el render con `undefined`.
 */
describe("etiquetaResultado / badgeVariantDeResultado", () => {
  it.each<[ResultadoGeneracion, string, string]>([
    ["RESERVADO", "Reservado", "outline"],
    ["GENERADO", "Generado", "success"],
    ["SALTEADO_PENDIENTE", "Salteado (pendiente)", "warning"],
    ["SALTEADO_ATRASO", "Salteado (atraso)", "warning"],
  ])("%s -> etiqueta %s, variante %s", (resultado, etiquetaEsperada, varianteEsperada) => {
    expect(etiquetaResultado(resultado)).toBe(etiquetaEsperada);
    expect(badgeVariantDeResultado(resultado)).toBe(varianteEsperada);
  });
});
