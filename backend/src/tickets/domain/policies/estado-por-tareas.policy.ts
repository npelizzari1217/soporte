/**
 * Política "el estado del ticket sigue a sus tareas" (odd/estado-por-tareas, S1-S4).
 *
 * Decide, sin tocar nada, qué arcos recorre el ticket cuando se completa o descompleta una tarea:
 * - completar con tareas pendientes: NUEVO → ASIGNADO → EN_PROCESO; ASIGNADO → EN_PROCESO;
 * - completar la última tarea pendiente: lo anterior y después RESUELTO, también desde EN_PROCESO y
 *   ESPERANDO_CLIENTE;
 * - descompletar en RESUELTO: vuelve a EN_PROCESO como salto correctivo (no es un arco del grafo).
 *
 * En NUEVO sin responsable, quien completa pasa a ser el responsable (decisión del dueño, L2). Los
 * estados terminales y los que no figuran en estas tablas no cambian: la política es fail-safe.
 *
 * Aplica a todo tipo de ticket (S1): las tareas son genéricas desde el punto 12. Revierte el ADR-2 de
 * `TicketEdiliciaEntity` ("completar la última tarea NO resuelve el ticket"). Sin imports de Prisma
 * ni NestJS — dominio puro. Quien la aplica valida cada arco normal contra la máquina de estados.
 */

export type EventoTarea = 'COMPLETAR' | 'DESCOMPLETAR';

export interface SituacionTareas {
  /** Código del estado actual del ticket. */
  estadoActual: string;
  /** `true` si, después del evento, queda alguna tarea activa pendiente. */
  quedanPendientes: boolean;
  /** `true` si el ticket ya tiene responsable (`asignadoId`). */
  tieneResponsable: boolean;
}

export interface ArcoPorTareas {
  /** Código del estado destino. */
  hacia: string;
  /** `true` si no es un arco del grafo y se aplica como salto correctivo del sistema. */
  correctivo: boolean;
}

export interface PlanEstadoPorTareas {
  /** `true` si quien completa pasa a ser el responsable antes del primer arco. */
  asignarAlActor: boolean;
  /** Arcos a recorrer en orden; vacío si el estado no cambia. */
  arcos: readonly ArcoPorTareas[];
}

const SIN_CAMBIO: PlanEstadoPorTareas = { asignarAlActor: false, arcos: [] };

/** Camino hasta EN_PROCESO según el estado actual, cuando quedan tareas pendientes. */
const CAMINO_A_EN_PROCESO: ReadonlyMap<string, readonly string[]> = new Map([
  ['NUEVO', ['ASIGNADO', 'EN_PROCESO']],
  ['ASIGNADO', ['EN_PROCESO']],
]);

/** Camino hasta RESUELTO según el estado actual, cuando se completó la última tarea. */
const CAMINO_A_RESUELTO: ReadonlyMap<string, readonly string[]> = new Map([
  ['NUEVO', ['ASIGNADO', 'EN_PROCESO', 'RESUELTO']],
  ['ASIGNADO', ['EN_PROCESO', 'RESUELTO']],
  ['EN_PROCESO', ['RESUELTO']],
  ['ESPERANDO_CLIENTE', ['RESUELTO']],
]);

/**
 * Plan de estado del ticket para un evento sobre una de sus tareas.
 *
 * @param evento Qué pasó con la tarea.
 * @param situacion Estado actual del ticket, si quedan pendientes y si tiene responsable.
 * @returns Los arcos a recorrer y si hay que asignar el ticket a quien completa.
 */
export function planEstadoPorTareas(
  evento: EventoTarea,
  situacion: SituacionTareas,
): PlanEstadoPorTareas {
  if (evento === 'DESCOMPLETAR') {
    return situacion.estadoActual === 'RESUELTO'
      ? { asignarAlActor: false, arcos: [{ hacia: 'EN_PROCESO', correctivo: true }] }
      : SIN_CAMBIO;
  }

  const camino = (situacion.quedanPendientes ? CAMINO_A_EN_PROCESO : CAMINO_A_RESUELTO).get(
    situacion.estadoActual,
  );
  if (!camino) return SIN_CAMBIO;

  return {
    asignarAlActor: situacion.estadoActual === 'NUEVO' && !situacion.tieneResponsable,
    arcos: camino.map((hacia) => ({ hacia, correctivo: false })),
  };
}
