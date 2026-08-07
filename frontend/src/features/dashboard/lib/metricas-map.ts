/**
 * metricas-map — funciones PURAS que mapean `MetricasDashboard` (shape del
 * backend, solo IDs) al `ChartDatum[]`/número que consumen las primitivas de
 * `shared/charts/*` (Extract-Before-Mock: mismo patrón que
 * `buildTicketsQueryString`/`computeDonutSegments`).
 *
 * Ref spec: sdd/beta-frontend/spec R-M2. Tarea: T2.3, T2.4, T2.5.
 */
import type { ChartDatum } from "@/shared/charts/bar-chart";
import type { MetricasDashboard } from "../types";

/** T2.3 — abiertos/cerrados como dos categorías del BarChart. */
export function toAbiertosCerradosChartData(
  metricas: Pick<MetricasDashboard, "abiertos" | "cerrados">,
): ChartDatum[] {
  return [
    { label: "Abiertos", value: metricas.abiertos },
    { label: "Cerrados", value: metricas.cerrados },
  ];
}

/**
 * T2.3 — tiempo promedio de resolución como único punto del LineChart.
 * `null` (sin cerrados con SLA aplicable, backend D2) → array vacío, NUNCA
 * un punto en 0 — 0 horas y "sin datos" son señales distintas.
 */
export function toTiempoPromedioChartData(horas: number | null): ChartDatum[] {
  if (horas === null) return [];
  return [{ label: "Promedio (h)", value: horas }];
}

/**
 * T2.4 — carga por agente (HBarChart). Resuelve `asignadoId → nombre` vía
 * el map de usuarios asignables (`GET /usuarios`, G2). Un id sin match
 * (usuario dado de baja entre la consulta de métricas y la de usuarios) usa
 * el id crudo como fallback — nunca rompe el render.
 */
export function toCargaPorAgenteChartData(
  cargaPorAgente: MetricasDashboard["cargaPorAgente"],
  usuarioNombreMap: Map<string, string>,
): ChartDatum[] {
  return cargaPorAgente.map((item) => ({
    label: usuarioNombreMap.get(item.asignadoId) ?? item.asignadoId,
    value: item.abiertos,
  }));
}

/**
 * T2.4 — distribución por tipo/prioridad (DonutChart), genérica sobre el
 * campo de id (`tipoId`/`prioridadId`) vía `idSelector`. Mismo fallback que
 * `toCargaPorAgenteChartData` para ids sin match en el catálogo.
 */
export function toDistribucionChartData<T extends { total: number }>(
  items: T[],
  idSelector: (item: T) => string,
  nombreMap: Map<string, string>,
): ChartDatum[] {
  return items.map((item) => {
    const id = idSelector(item);
    return { label: nombreMap.get(id) ?? id, value: item.total };
  });
}

/**
 * T2.5 — % cumplimiento SLA (GaugeChart, escala 0-100). El backend calcula
 * `porcentaje` como fracción `0..1` (ADR-P5); `null` cuando `cerradosConSla
 * =0` (evita división por cero) se muestra como `0`, redondeado a entero
 * (el gauge renderiza el número tal cual, sin decimales).
 */
export function toSlaPercentage(cumplimientoSla: MetricasDashboard["cumplimientoSla"]): number {
  if (cumplimientoSla.porcentaje === null) return 0;
  return Math.round(cumplimientoSla.porcentaje * 100);
}
