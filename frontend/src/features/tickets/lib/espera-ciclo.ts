import type { TicketsFiltros } from "../types";

/**
 * Si el listado de tickets tiene que postergar su pedido hasta conocer el ciclo de la URL
 * (odd/autor-y-filtro-fechas, S2). Con un ciclo y sin alguna de las fechas, el período sale de
 * ese ciclo: pedir antes mostraría por un instante el año en curso. Solo se espera el primer
 * intento: si falló, react-query lo reintenta (`retry: 1`) y esperar el reintento dejaría el
 * listado cargando; se pide con el año en curso.
 *
 * @param filtros Filtros leídos de la URL.
 * @param ciclos Estado de `GET /ciclos`.
 * @returns `true` mientras corre el primer intento.
 */
export function debeEsperarCicloDeLaUrl(
  filtros: Pick<TicketsFiltros, "ciclo" | "fechaDesde" | "fechaHasta">,
  ciclos: { isPending: boolean; failureCount: number },
): boolean {
  return (
    Boolean(filtros.ciclo) &&
    (!filtros.fechaDesde || !filtros.fechaHasta) &&
    ciclos.isPending &&
    ciclos.failureCount === 0
  );
}
