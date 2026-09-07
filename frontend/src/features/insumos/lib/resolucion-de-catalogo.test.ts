import { describe, it, expect } from "vitest";
import { resolverDeCatalogo } from "./resolucion-de-catalogo";

const CATALOGO = [
  { id: "ins-1", nombre: "Tóner negro" },
  { id: "ins-2", nombre: "Cable de red" },
];

/**
 * Es la MISMA regla que ya probaba `nombre-de-catalogo.test.ts`, pero acá se
 * la mira sin el texto encima: lo que devuelve es el estado, y el texto es
 * decisión de cada pantalla. La ficha del insumo necesita ramificar la vista
 * entera —esqueleto, error de red, 404 de pantalla, contenido—, y eso no se
 * puede hacer sobre una etiqueta ya renderizada.
 */
describe("resolverDeCatalogo", () => {
  it("el catálogo resolvió y trae el id → devuelve la entrada encontrada", () => {
    const resolucion = resolverDeCatalogo("ins-2", { entradas: CATALOGO, cargando: false });

    expect(resolucion).toEqual({ estado: "ENCONTRADA", entrada: CATALOGO[1] });
  });

  it("el catálogo resolvió y NO trae el id → recién ahí la ausencia prueba algo", () => {
    expect(resolverDeCatalogo("ins-9", { entradas: CATALOGO, cargando: false })).toEqual({
      estado: "FUERA_DE_CATALOGO",
    });
  });

  /** Con la query en vuelo la ausencia no prueba NADA: el id puede llegar después. */
  it("el catálogo está cargando → NO concluye ausencia", () => {
    expect(resolverDeCatalogo("ins-9", { entradas: undefined, cargando: true })).toEqual({
      estado: "CARGANDO",
    });
  });

  it("el catálogo no resolvió y ya no está cargando (falló) → tampoco concluye ausencia", () => {
    expect(resolverDeCatalogo("ins-1", { entradas: undefined, cargando: false })).toEqual({
      estado: "NO_DISPONIBLE",
    });
  });

  /** Un catálogo vacío SÍ resolvió: es ausencia probada, no falta de datos. */
  it("el catálogo resolvió vacío → es ausencia probada", () => {
    expect(resolverDeCatalogo("ins-1", { entradas: [], cargando: false })).toEqual({
      estado: "FUERA_DE_CATALOGO",
    });
  });
});
