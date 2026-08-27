/**
 * plan-labels — mapeos enum→etiqueta compartidos por el listado y el detalle
 * de planes de Preventivo (WU-7, hallazgos de revisión #5/#6). Centraliza lo
 * que antes estaba duplicado en `planes-preventivo-list-view.tsx` y
 * `plan-preventivo-detail-view.tsx`, mismo criterio que `resultado-generacion.ts`.
 */
import type { Equipo } from "@/features/equipos/types";
import type { IntervaloUnidad, PlanPreventivo } from "../types";

/**
 * Etiqueta legible de la unidad de cadencia del plan.
 *
 * @param unidad - Unidad de cadencia (`"DIAS"` o `"MESES"`).
 * @returns `"día(s)"` o `"mes(es)"`.
 */
export function unidadIntervaloLabel(unidad: IntervaloUnidad): string {
  return unidad === "DIAS" ? "día(s)" : "mes(es)";
}

/**
 * Etiqueta del objetivo del plan (ADR-PV1: exactamente equipo O ubicación,
 * nunca los dos ni ninguno). Con `equipoId` resuelve el nombre contra el
 * catálogo de equipos; "Equipo" es el fallback mientras el catálogo carga o
 * si el equipo fue dado de baja de él. Con ubicación devuelve el texto libre
 * (ya normalizado a mayúscula por el backend), o "—" si vino vacío.
 *
 * @param plan - Plan cuyo objetivo se etiqueta.
 * @param equipos - Catálogo de equipos ya cargado (o `undefined` mientras carga).
 * @returns La etiqueta a mostrar para el objetivo del plan.
 */
export function objetivoLabel(plan: PlanPreventivo, equipos: Equipo[] | undefined): string {
  if (plan.equipoId) {
    return equipos?.find((equipo) => equipo.id === plan.equipoId)?.nombre ?? "Equipo";
  }
  return plan.ubicacion ?? "—";
}
