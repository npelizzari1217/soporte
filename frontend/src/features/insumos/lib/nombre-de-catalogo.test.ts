import { describe, it, expect } from "vitest";
import {
  ETIQUETA_CATALOGO_CARGANDO,
  ETIQUETA_CATALOGO_NO_DISPONIBLE,
  ETIQUETA_FUERA_DE_CATALOGO,
  nombreDeCatalogo,
} from "./nombre-de-catalogo";

const CATALOGO = [
  { id: "fam-1", nombre: "Consumibles de impresión" },
  { id: "fam-2", nombre: "Cableado" },
];

describe("nombreDeCatalogo", () => {
  it("el catálogo resolvió y trae el id → devuelve el nombre", () => {
    expect(nombreDeCatalogo("fam-2", { entradas: CATALOGO, cargando: false })).toBe("Cableado");
  });

  /**
   * El caso que da sentido a los otros dos: la AUSENCIA recién prueba algo
   * cuando la lista resolvió. Acá resolvió y el id no está, así que el valor
   * quedó fuera del catálogo de verdad (baja lógica: `GET /familias-insumo`
   * devuelve las deshabilitadas, no las eliminadas).
   */
  it("el catálogo resolvió y NO trae el id → lo dice, no inventa un nombre", () => {
    expect(nombreDeCatalogo("fam-9", { entradas: CATALOGO, cargando: false })).toBe(
      ETIQUETA_FUERA_DE_CATALOGO,
    );
  });

  /**
   * La distinción que el `AGENTS.md` documenta para el select con valor fuera
   * de catálogo, aplicada a una celda: con la query en vuelo la ausencia no
   * prueba NADA. Devolver acá la etiqueta de "fuera de catálogo" —o un guion,
   * que se lee como "no tiene"— acusaría de eliminado a un valor que está
   * perfecto y todavía no llegó.
   */
  it("el catálogo está cargando → NO concluye ausencia", () => {
    expect(nombreDeCatalogo("fam-9", { entradas: undefined, cargando: true })).toBe(
      ETIQUETA_CATALOGO_CARGANDO,
    );
  });

  it("el catálogo no resolvió y ya no está cargando (falló) → tampoco concluye ausencia", () => {
    expect(nombreDeCatalogo("fam-9", { entradas: undefined, cargando: false })).toBe(
      ETIQUETA_CATALOGO_NO_DISPONIBLE,
    );
  });

  /** Un id presente en un catálogo que falló tiene que dar lo mismo: no resolvió. */
  it("el id existiría, pero el catálogo no resolvió → no lo resuelve de memoria", () => {
    expect(nombreDeCatalogo("fam-1", { entradas: undefined, cargando: false })).toBe(
      ETIQUETA_CATALOGO_NO_DISPONIBLE,
    );
  });

  /**
   * Un catálogo vacío SÍ es un catálogo resuelto. Es el borde donde el `?? []`
   * de un consumidor descuidado colapsaría "cargando" con "vacío": acá el
   * array vacío llega como dato, no como default.
   */
  it("el catálogo resolvió vacío → es ausencia probada, no falta de datos", () => {
    expect(nombreDeCatalogo("fam-1", { entradas: [], cargando: false })).toBe(
      ETIQUETA_FUERA_DE_CATALOGO,
    );
  });

  it("las tres etiquetas son distintas entre sí", () => {
    const etiquetas = new Set([
      ETIQUETA_CATALOGO_CARGANDO,
      ETIQUETA_CATALOGO_NO_DISPONIBLE,
      ETIQUETA_FUERA_DE_CATALOGO,
    ]);

    expect(etiquetas.size).toBe(3);
  });
});
