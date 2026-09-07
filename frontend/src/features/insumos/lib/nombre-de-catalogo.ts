/**
 * nombre-de-catalogo — resuelve el id que una fila guarda contra el catálogo
 * que lo nombra, SIN colapsar "todavía no llegó" con "no está".
 *
 * Es la clase de defecto "select con valor fuera de catálogo" del `AGENTS.md`,
 * trasladada a una celda de tabla: detectar la baja por AUSENCIA en la lista
 * traída solo vale cuando esa lista YA resolvió. Con el catálogo cargando o
 * caído, la ausencia no prueba NADA — y un guion en la celda se lee como "este
 * insumo no tiene familia", que es una afirmación sobre el dato, no sobre la
 * red.
 *
 * Vive acá y no dentro del componente porque las dos columnas (familia y
 * unidad de medida) necesitan la misma regla, y una regla de presentación
 * duplicada se corrige en una copia y queda atrás en la otra EN SILENCIO —
 * mismo criterio que `opciones-insumo.ts`.
 *
 * La regla EN SÍ —el orden de las guardas— ya no vive acá: la resuelve
 * `resolverDeCatalogo`, porque la ficha del insumo la necesita igual para
 * ramificar la pantalla entera. Este módulo quedó como lo que siempre fue de
 * este lado: el TEXTO con el que una celda nombra cada desenlace.
 */
import { resolverDeCatalogo, type EstadoCatalogo as EstadoDeCatalogoDe } from "./resolucion-de-catalogo";

/** Lo mínimo que una entrada de catálogo necesita para nombrar un id. */
export interface EntradaDeCatalogo {
  id: string;
  nombre: string;
}

/** El catálogo de nombres tal como lo entrega TanStack Query, sin aplanar. */
export type EstadoCatalogo = EstadoDeCatalogoDe<EntradaDeCatalogo>;

/** El catálogo está en vuelo: no se sabe nada todavía. */
export const ETIQUETA_CATALOGO_CARGANDO = "Cargando…";

/**
 * El catálogo no resolvió y ya no está cargando (falló, o nunca arrancó). Es
 * un problema de la pantalla, no del insumo: por eso NO dice nada sobre el
 * valor guardado.
 */
export const ETIQUETA_CATALOGO_NO_DISPONIBLE = "Sin datos del catálogo";

/**
 * El catálogo resolvió y el id no está: ahí sí la ausencia prueba algo. Los
 * endpoints de familias y unidades devuelven las deshabilitadas y excluyen
 * solo la baja lógica, así que faltar de esa lista significa eliminado del
 * catálogo — no "deshabilitado".
 */
export const ETIQUETA_FUERA_DE_CATALOGO = "Fuera del catálogo";

/**
 * Nombra el id contra su catálogo, distinguiendo los tres estados posibles.
 *
 * @param id Identificador guardado en la fila (ej. `insumo.familiaId`).
 * @param catalogo Estado crudo de la query del catálogo.
 * @returns El nombre si el catálogo resolvió y lo trae; si no, la etiqueta que
 *   corresponde al estado — nunca un guion ni el id crudo.
 */
export function nombreDeCatalogo(id: string, catalogo: EstadoCatalogo): string {
  const resolucion = resolverDeCatalogo(id, catalogo);

  // Sin `default`: el `switch` exhaustivo sobre la unión es lo que hace que un
  // estado nuevo en `ResolucionDeCatalogo` rompa el typecheck acá en vez de
  // caer en silencio en una rama genérica.
  switch (resolucion.estado) {
    case "CARGANDO":
      return ETIQUETA_CATALOGO_CARGANDO;
    case "NO_DISPONIBLE":
      return ETIQUETA_CATALOGO_NO_DISPONIBLE;
    case "FUERA_DE_CATALOGO":
      return ETIQUETA_FUERA_DE_CATALOGO;
    case "ENCONTRADA":
      return resolucion.entrada.nombre;
  }
}
