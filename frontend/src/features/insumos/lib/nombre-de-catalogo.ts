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
 */

/** Lo mínimo que una entrada de catálogo necesita para nombrar un id. */
export interface EntradaDeCatalogo {
  id: string;
  nombre: string;
}

/**
 * El catálogo tal como lo entrega TanStack Query, sin aplanar.
 *
 * `entradas` es `undefined` mientras la query no resolvió — y llega así a
 * propósito, sin `?? []`: un array vacío por default colapsaría "cargando",
 * "falló" y "el catálogo está realmente vacío" en el mismo valor, que es
 * exactamente el error que este módulo evita.
 */
export interface EstadoCatalogo {
  entradas: EntradaDeCatalogo[] | undefined;
  cargando: boolean;
}

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
  // El orden importa: primero se decide si la lista RESOLVIÓ, y recién ahí se
  // mira si el id está. Invertirlo es el defecto que este módulo evita.
  if (!catalogo.entradas) {
    return catalogo.cargando ? ETIQUETA_CATALOGO_CARGANDO : ETIQUETA_CATALOGO_NO_DISPONIBLE;
  }
  const entrada = catalogo.entradas.find((candidata) => candidata.id === id);
  return entrada ? entrada.nombre : ETIQUETA_FUERA_DE_CATALOGO;
}
