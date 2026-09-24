/**
 * combinarFeriados — pure merge of `GET /feriados` (global) and
 * `GET /feriados-cliente` (the tenant's own) into one sorted, origin-tagged
 * list for the combined client screen (task 8.1, WU8, D8 design.md).
 * Client-side merge, never a combined backend endpoint — D8's rejected
 * alternative (a) would make a tenant use case read the master list and blur
 * the isolation response the spec asserts.
 *
 * Sorted by the ISO `fecha` STRING (`YYYY-MM-DD`, lexicographic) — never via
 * `new Date(...)`, same criterion as `ultimaGeneracion`
 * (`use-planes-preventivo.ts`): `FechaCalendario`'s clave is always this exact
 * format, so string comparison is both correct and sidesteps the `@db.Date`
 * UTC-shift trap entirely (no `Date` construction at all in this function).
 */
import type { Feriado, FeriadoCliente, OrigenFeriado } from "./types";

/** Una fila de la lista combinada — el shape que consume `DataTable`. */
export interface FilaFeriadoCombinada {
  id: string;
  fecha: string;
  descripcion: string;
  origen: OrigenFeriado;
}

/**
 * @param globales - Feriados nacionales (`GET /feriados`), en cualquier orden.
 * @param propios - Feriados propios del tenant (`GET /feriados-cliente`), en cualquier orden.
 * @returns Ambas listas mergeadas y ordenadas por `fecha` ascendente (string).
 */
export function combinarFeriados(
  globales: Feriado[],
  propios: FeriadoCliente[],
): FilaFeriadoCombinada[] {
  const filas: FilaFeriadoCombinada[] = [
    ...globales.map((feriado) => ({ ...feriado, origen: "GLOBAL" as const })),
    ...propios.map((feriado) => ({ ...feriado, origen: "CLIENTE" as const })),
  ];

  return filas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}
