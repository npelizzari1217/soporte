/**
 * Compara dos identificadores de fila que viven en una columna `uuid` de
 * Postgres.
 *
 * **La comparación NO es sensible a mayúsculas, y eso no es una tolerancia: es
 * la semántica de la columna.** Un `uuid` no es texto — Postgres normaliza el
 * literal al parsearlo, así que `9F1B…` y `9f1b…` son exactamente la MISMA
 * fila para la base. Un `===` sobre los strings crudos dice que son distintos,
 * y ahí empieza el problema: el código responde una pregunta —"¿es el mismo
 * registro?"— con una respuesta que la base contradice.
 *
 * Existe como función compartida porque esa pregunta se hace en más de un
 * lugar, y ya se contestó de dos maneras distintas: un caso de uso normalizaba
 * y la entidad que decide primero comparaba en crudo, así que la regla escrita
 * no era la que gobernaba. Dos dueños de la misma pregunta dan dos respuestas
 * el día que una de las dos se toca.
 *
 * `null` es la ausencia de vínculo y solo iguala con otra ausencia: no hay
 * normalización que aplicarle.
 *
 * @param a Primer identificador, o `null` si no hay vínculo.
 * @param b Segundo identificador, o `null` si no hay vínculo.
 * @returns `true` si los dos apuntan a la misma fila, o si los dos son `null`.
 */
export function esElMismoId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) {
    return a == null && b == null;
  }
  return a.toLowerCase() === b.toLowerCase();
}
