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
 * Etiqueta de la anticipación del plan (odd/preventivo-anticipacion): cuánto antes
 * de la fecha del ciclo se genera el ticket.
 *
 * @param plan - Plan cuya anticipación se etiqueta.
 * @returns `"Sin anticipación"` con 0, o `"N día(s) antes"` / `"N mes(es) antes"`.
 */
export function anticipacionLabel(plan: Pick<PlanPreventivo, "anticipacionValor" | "anticipacionUnidad">): string {
  if (plan.anticipacionValor === 0) return "Sin anticipación";
  return `${plan.anticipacionValor} ${unidadIntervaloLabel(plan.anticipacionUnidad)} antes`;
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

/**
 * Aviso del selector de responsable cuando la lista resolvió vacía: nadie cumple la regla del
 * backend (TECNICO o COLABORADOR con el permiso Ver sobre el tipo de ticket del plan,
 * odd/preventivo-por-tipo S5), y sin el aviso el select vacío no dice qué falta.
 */
export const SIN_RESPONSABLES =
  "No hay técnicos habilitados para este tipo de ticket: un técnico o colaborador necesita el permiso Ver sobre el tipo elegido.";

/**
 * Aviso cuando el cambio de tipo deja afuera al responsable elegido: el formulario lo borra para que
 * el usuario elija otro, en vez de guardar uno que el backend rechazaría (S5).
 */
export const RESPONSABLE_NO_HABILITADO_PARA_TIPO =
  "El responsable elegido no está habilitado para el tipo de ticket seleccionado. Elija otro.";

/** Etiqueta del tipo de un plan cuyo tipo ya no está en el catálogo (dado de baja). */
export const TIPO_DADO_DE_BAJA = "Tipo de ticket dado de baja";

/**
 * Nombre del tipo de ticket de un plan (odd/preventivo-por-tipo, S2). El catálogo trae solo los
 * tipos vigentes: con el catálogo resuelto, un tipo ausente es uno dado de baja; mientras carga o si
 * falló, no se sabe y se muestra "—".
 *
 * @param tipoId - Tipo del plan.
 * @param tipos - Catálogo de tipos, o `undefined` mientras carga o si falló.
 * @returns El nombre del tipo, `TIPO_DADO_DE_BAJA`, o "—".
 */
export function tipoPlanLabel(tipoId: string, tipos: { id: string; nombre: string }[] | undefined): string {
  if (!tipos) return "—";
  return tipos.find((tipo) => tipo.id === tipoId)?.nombre ?? TIPO_DADO_DE_BAJA;
}
