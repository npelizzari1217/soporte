import { ITicketStateMachine, StateMachineContext } from './i-ticket-state-machine';

/**
 * Diagrama de transiciones base (7 estados activos, 3 congelados legacy).
 *
 * Fuente: ADR-1 — Change `tickets-maquina-estados-observaciones`
 *
 * ─── Estados activos ───────────────────────────────────────────────────────
 * ABIERTO ──► APROBADO
 * ABIERTO ──► RECHAZADO
 * APROBADO ──► EN_PROGRESO
 * APROBADO ──► RESUELTO
 * APROBADO ──► SUSPENDIDO
 * APROBADO ──► SIN_SOLUCION
 * EN_PROGRESO ──► RESUELTO
 * EN_PROGRESO ──► SUSPENDIDO
 * EN_PROGRESO ──► SIN_SOLUCION
 * SUSPENDIDO ──► EN_PROGRESO
 *
 * ─── Terminales activos (sin arcos de salida) ──────────────────────────────
 * RESUELTO      → (ninguna)
 * SIN_SOLUCION  → (ninguna)
 * RECHAZADO     → (ninguna)
 *
 * ─── Congelados legacy (sin arcos de entrada ni salida) ────────────────────
 * CERRADO, CANCELADO, PENDIENTE_APROBACION → dead data, no transitables.
 * No forman parte del grafo activo; se mantienen en DB por compatibilidad.
 *
 * Nota: el arco legacy ABIERTO → EN_PROGRESO ha sido ELIMINADO.
 *       El arco RESUELTO → EN_PROGRESO (reapertura) ha sido ELIMINADO.
 */
const VALID_TRANSITIONS = new Map<string, ReadonlySet<string>>([
  ['ABIERTO', new Set(['APROBADO', 'RECHAZADO'])],
  ['APROBADO', new Set(['EN_PROGRESO', 'RESUELTO', 'SUSPENDIDO', 'SIN_SOLUCION'])],
  ['EN_PROGRESO', new Set(['RESUELTO', 'SUSPENDIDO', 'SIN_SOLUCION'])],
  ['SUSPENDIDO', new Set(['EN_PROGRESO'])],
  // RESUELTO, SIN_SOLUCION, RECHAZADO: terminales activos — sin arcos de salida.
  // CERRADO, CANCELADO, PENDIENTE_APROBACION: congelados legacy — sin arcos de ningún tipo.
  // No aparecen como clave → puedeTransicionar retornará false para cualquier origen congelado.
]);

/**
 * Implementación base de la máquina de estados de tickets.
 *
 * Contiene las transiciones del diagrama común a todos los flujos
 * (SOPORTE usa el fallback base; COMPRAS y EDILICIA extienden mediante
 * Strategy — ver TicketStateMachineFactory).
 *
 * Función pura: `puedeTransicionar` no muta el contexto ni mantiene estado
 * entre llamadas. La misma instancia puede reutilizarse como singleton.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: Enmienda "Máquina de estados base" (tickets-core/spec.md)
 * Ref design: ADR-1
 * Change: tickets-maquina-estados-observaciones / PR1
 */
export class BaseTicketStateMachine implements ITicketStateMachine {
  /**
   * Evalúa si la transición `desde → hacia` es válida según el diagrama base.
   *
   * No consume el contexto en la base; las implementaciones específicas
   * (ej. EdiliciaStateMachine) pueden usarlo para guardas adicionales.
   */
  puedeTransicionar(desde: string, hacia: string, _ctx: StateMachineContext): boolean {
    const destinos = VALID_TRANSITIONS.get(desde);
    if (!destinos) return false;
    return destinos.has(hacia);
  }
}
