/**
 * Construye el query string de un listado a partir de un objeto de filtros,
 * omitiendo las claves cuyo valor es `undefined`.
 *
 * **`undefined` se omite y `null` NO.** No es un descuido: un filtro ausente y
 * un filtro puesto en nulo son cosas distintas para el servidor, y aplanarlos
 * acá le sacaría al llamador la posibilidad de expresar la diferencia.
 *
 * **Las cadenas vacías tampoco se omiten**, y esa es la línea que separa a esta
 * función de las otras del repo. `features/tickets`, `features/kb` y los dos
 * exportadores descartan además el `""`, porque sus filtros nacen de campos de
 * texto donde vacío significa "sin filtrar"; el listado de compras, que es quien
 * la usa acá, no tiene ese caso. Son
 * comportamientos DISTINTOS, no copias de este: unificarlos pediría una función
 * con opciones y tocar esos módulos, y eso no entra acá.
 *
 * **El llamador pasa un spread (`{ ...filtros }`) y no el objeto directo.** Las
 * `interface` de TypeScript no reciben index signature implícita, así que un
 * `ComprasFiltros` no satisface el `Record`; el spread produce un literal que
 * sí. La alternativa —recibir `object`— haría que `Object.entries` caiga en su
 * sobrecarga `(o: {}): [string, any][]` y el valor sería `any`, que este repo
 * prohíbe. Un spread en el llamador es más barato que un `any` acá.
 *
 * @param filtros Objeto de filtros; sus valores se serializan con `String()`.
 * @returns El query string sin el `?` inicial; cadena vacía si no queda ninguna clave.
 */
export function buildQueryString(filtros: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined) continue;
    params.set(clave, String(valor));
  }

  return params.toString();
}
