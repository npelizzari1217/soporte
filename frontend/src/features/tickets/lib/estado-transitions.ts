import type { TicketEstadoCodigo } from "../types";

/**
 * Grafo de transiciones válidas — mirror de
 * `backend/src/tickets/domain/state-machine/base-ticket-state-machine.ts`.
 * Terminales (sin arcos de salida, sin reapertura): CERRADO, CANCELADO.
 */
const VALID_TRANSITIONS: Record<string, TicketEstadoCodigo[]> = {
  NUEVO: ["ASIGNADO", "CANCELADO"],
  ASIGNADO: ["EN_PROCESO", "CANCELADO"],
  EN_PROCESO: ["RESUELTO", "CANCELADO"],
  RESUELTO: ["CERRADO"],
};

/**
 * Devuelve los códigos de estado a los que se puede transicionar DESDE
 * `estadoActualCodigo`. UI-only — el backend revalida el mismo grafo
 * (doble capa, ADR-3/T9); esta función nunca es la única barrera.
 */
export function getValidNextStates(estadoActualCodigo: string): TicketEstadoCodigo[] {
  return VALID_TRANSITIONS[estadoActualCodigo] ?? [];
}

/**
 * Arcos "de arranque" que ahora cubre el control unificado "Asignar y poner en
 * proceso" (NUEVO→ASIGNADO y ASIGNADO→EN_PROCESO). Se excluyen del flujo de
 * transición MANUAL para no ofrecer dos caminos confusos al mismo destino.
 */
const ARCO_CUBIERTO_POR_ASIGNACION: Record<string, TicketEstadoCodigo> = {
  NUEVO: "ASIGNADO",
  ASIGNADO: "EN_PROCESO",
};

/**
 * Estados destino del flujo de transición MANUAL (control "avanzar estado"):
 * `getValidNextStates` menos el arco de arranque que cubre el botón combinado.
 * Desde NUEVO/ASIGNADO queda solo CANCELADO; desde EN_PROCESO/RESUELTO no
 * cambia (RESUELTO/CERRADO/CANCELADO siguen siendo manuales).
 */
export function getManualNextStates(estadoActualCodigo: string): TicketEstadoCodigo[] {
  const cubierto = ARCO_CUBIERTO_POR_ASIGNACION[estadoActualCodigo];
  return getValidNextStates(estadoActualCodigo).filter((codigo) => codigo !== cubierto);
}

/**
 * True si desde `estadoActualCodigo` el ticket puede llegar a EN_PROCESO vía el
 * control unificado "Asignar y poner en proceso" (solo NUEVO/ASIGNADO). Gatea
 * el montaje de ese control en el detalle.
 */
export function puedeAsignarYPonerEnProceso(estadoActualCodigo: string): boolean {
  return estadoActualCodigo === "NUEVO" || estadoActualCodigo === "ASIGNADO";
}
