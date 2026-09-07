/**
 * resolucion-de-catalogo — la regla de "la AUSENCIA solo prueba algo cuando la
 * lista YA resolvió", separada del texto que la nombra.
 *
 * Es el mismo criterio que documenta el `AGENTS.md` para el select con valor
 * fuera de catálogo, y que `nombreDeCatalogo` ya aplicaba a una celda de tabla.
 * Se extrae acá porque la ficha del insumo necesita la MISMA regla para
 * ramificar la pantalla entera —esqueleto, error de red, "no existe", ficha—, y
 * eso no se puede decidir sobre una etiqueta ya renderizada: la etiqueta es
 * texto, y el `switch` de la ficha necesita el estado.
 *
 * Sin esta extracción, el orden de las guardas quedaría escrito dos veces: una
 * en `nombreDeCatalogo` y otra en la ficha. Una regla de este tipo duplicada se
 * corrige en una copia y queda atrás en la otra EN SILENCIO —no tira error ni
 * log, solo acusa de inexistente a un insumo que está sano y todavía no llegó—.
 */

/**
 * El catálogo tal como lo entrega TanStack Query, sin aplanar.
 *
 * `entradas` es `undefined` mientras la query no resolvió — y llega así a
 * propósito, sin `?? []`: un array vacío por default colapsaría "cargando",
 * "falló" y "el catálogo está realmente vacío" en el mismo valor, que es
 * exactamente el error que este módulo evita.
 */
export interface EstadoCatalogo<T> {
  entradas: T[] | undefined;
  cargando: boolean;
}

/**
 * Los CUATRO desenlaces posibles de buscar un id en un catálogo, como unión
 * discriminada. Son cuatro y no dos porque "no está en la lista" y "la lista no
 * llegó" son afirmaciones distintas: la primera habla del dato, la segunda de
 * la red.
 */
export type ResolucionDeCatalogo<T> =
  /** La query está en vuelo: todavía no se sabe nada. */
  | { estado: "CARGANDO" }
  /** La query no resolvió y ya no está cargando (falló, o nunca arrancó). */
  | { estado: "NO_DISPONIBLE" }
  /** El catálogo resolvió y el id no está: recién acá la ausencia prueba algo. */
  | { estado: "FUERA_DE_CATALOGO" }
  /** El catálogo resolvió y trae la entrada. */
  | { estado: "ENCONTRADA"; entrada: T };

/**
 * Busca un id en su catálogo distinguiendo los cuatro estados posibles.
 *
 * @param id Identificador buscado.
 * @param catalogo Estado crudo de la query del catálogo.
 * @returns La entrada encontrada, o el estado que explica por qué no la hay.
 */
export function resolverDeCatalogo<T extends { id: string }>(
  id: string,
  catalogo: EstadoCatalogo<T>,
): ResolucionDeCatalogo<T> {
  // El orden importa: primero se decide si la lista RESOLVIÓ, y recién ahí se
  // mira si el id está. Invertirlo es el defecto que este módulo evita.
  if (!catalogo.entradas) {
    return { estado: catalogo.cargando ? "CARGANDO" : "NO_DISPONIBLE" };
  }

  const entrada = catalogo.entradas.find((candidata) => candidata.id === id);
  return entrada ? { estado: "ENCONTRADA", entrada } : { estado: "FUERA_DE_CATALOGO" };
}
