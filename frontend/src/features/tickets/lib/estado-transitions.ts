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
