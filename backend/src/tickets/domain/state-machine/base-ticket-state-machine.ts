import { ITicketStateMachine, StateMachineContext } from './i-ticket-state-machine';

/**
 * Diagrama de transiciones base — 7 estados fijos (ADR-1/ADR-3).
 *
 * NUEVO ──► ASIGNADO
 * NUEVO ──► CANCELADO
 * ASIGNADO ──► EN_PROCESO
 * ASIGNADO ──► CANCELADO
 * EN_PROCESO ──► RESUELTO
 * EN_PROCESO ──► CANCELADO
 * EN_PROCESO ──► ESPERANDO_CLIENTE
 * ESPERANDO_CLIENTE ──► EN_PROCESO
 * ESPERANDO_CLIENTE ──► RESUELTO
 * ESPERANDO_CLIENTE ──► CANCELADO
 * RESUELTO ──► CERRADO
 *
 * Terminales (sin arcos de salida — sin reapertura, T9/T11): CERRADO, CANCELADO.
 * RESUELTO NO es terminal: tiene un único arco de salida hacia CERRADO.
 *
 * Ref spec: sdd/tickets-core/spec T9. Ref design: ADR-3.
 */
const VALID_TRANSITIONS = new Map<string, ReadonlySet<string>>([
  ['NUEVO', new Set(['ASIGNADO', 'CANCELADO'])],
  ['ASIGNADO', new Set(['EN_PROCESO', 'CANCELADO'])],
  ['EN_PROCESO', new Set(['RESUELTO', 'CANCELADO', 'ESPERANDO_CLIENTE'])],
  ['ESPERANDO_CLIENTE', new Set(['EN_PROCESO', 'RESUELTO', 'CANCELADO'])],
  ['RESUELTO', new Set(['CERRADO'])],
  // CERRADO, CANCELADO: terminales — sin clave → puedeTransicionar retorna false.
]);

/**
 * Implementación base de la máquina de estados de tickets.
 *
 * Codifica el grafo de 7 estados común a todos los tipos de ticket
 * (fallback de `TicketStateMachineFactory`). Función pura: no muta el
 * contexto ni mantiene estado entre llamadas — la misma instancia puede
 * reutilizarse como singleton.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/tickets-core/spec T9. Ref design: ADR-3. Tarea: T4.1.
 */
export class BaseTicketStateMachine implements ITicketStateMachine {
  /**
   * Evalúa si la transición `desde → hacia` es un arco válido del grafo base.
   *
   * El contexto no se consume en la base; implementaciones específicas por
   * tipo (Fases 4/5) pueden usarlo para guardas adicionales.
   */
  puedeTransicionar(desde: string, hacia: string, _ctx: StateMachineContext): boolean {
    const destinos = VALID_TRANSITIONS.get(desde);
    if (!destinos) return false;
    return destinos.has(hacia);
  }
}
