import type { TicketEstadoCodigo } from "../types";

/**
 * Grafo de transiciones válidas — mirror de
 * `backend/src/tickets/domain/state-machine/base-ticket-state-machine.ts`.
 * Terminales (sin arcos de salida, sin reapertura): CERRADO, CANCELADO.
 */
const VALID_TRANSITIONS: Record<string, TicketEstadoCodigo[]> = {
  NUEVO: ["ASIGNADO", "CANCELADO"],
  ASIGNADO: ["EN_PROCESO", "CANCELADO"],
  EN_PROCESO: ["ESPERANDO_CLIENTE", "RESUELTO", "CANCELADO"],
  ESPERANDO_CLIENTE: ["EN_PROCESO", "RESUELTO", "CANCELADO"],
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

/**
 * Estados PREVIOS a EN_PROCESO — mirror de `ESTADOS_PRE_PROCESO` del backend.
 * Mientras el ticket esté en uno de estos, la edición de datos sigue abierta a
 * TECNICO+; una vez EN_PROCESO (o posterior), solo ROOT.
 */
const ESTADOS_PRE_PROCESO: TicketEstadoCodigo[] = ["NUEVO", "ASIGNADO"];

/**
 * Estados NO terminales — destinos del "salto correctivo" de ROOT/ADMINISTRADOR
 * (volver atrás/corregir/reabrir). Mirror del backend: el salto NUNCA lleva a un
 * terminal (CERRADO/CANCELADO) ni a ESPERANDO_CLIENTE (`ESTADOS_NO_DESTINO_CORRECTIVO`:
 * a la espera solo se entra por el arco normal desde EN_PROCESO). Sí puede SACAR un
 * ticket de ESPERANDO_CLIENTE.
 */
const ESTADOS_CORRECTIVOS: TicketEstadoCodigo[] = ["NUEVO", "ASIGNADO", "EN_PROCESO", "RESUELTO"];

/**
 * Devuelve los estados NO terminales a los que un corrector (ROOT/ADMINISTRADOR)
 * puede saltar DESDE `estadoActualCodigo` (todos los correctivos menos el actual).
 * UI-only — el backend revalida (salto correctivo, doble capa).
 */
export function getEstadosCorrectivos(estadoActualCodigo: string): TicketEstadoCodigo[] {
  return ESTADOS_CORRECTIVOS.filter((codigo) => codigo !== estadoActualCodigo);
}

/**
 * True si la edición de datos (título/descripción/prioridad) está permitida en
 * `estadoActualCodigo` para el actor. Regla: una vez EN_PROCESO (o posterior),
 * solo ROOT. ROOT (`esRoot=true`) puede SIEMPRE. Mirror del backend
 * (`EditarTicketUseCase` + `TicketBloqueadoParaEdicionError`) — es UX, no la barrera.
 */
export function puedeEditarDatos(estadoActualCodigo: string, esRoot: boolean): boolean {
  if (esRoot) return true;
  return ESTADOS_PRE_PROCESO.includes(estadoActualCodigo as TicketEstadoCodigo);
}
