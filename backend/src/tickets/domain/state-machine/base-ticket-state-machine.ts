import { ITicketStateMachine, StateMachineContext } from './i-ticket-state-machine';

/**
 * Diagrama de transiciones comunes a TODOS los tipos de ticket.
 *
 * Fuente: [SPEC:tickets-core/Máquina de estados base]
 *
 * ABIERTO ──► EN_PROGRESO
 * ABIERTO ──► CANCELADO
 * EN_PROGRESO ──► RESUELTO  (ver EdiliciaStateMachine para guarda de avance)
 * EN_PROGRESO ──► CANCELADO
 * RESUELTO ──► CERRADO
 * RESUELTO ──► EN_PROGRESO  (reapertura)
 * CERRADO ──► (ninguna — terminal)
 * CANCELADO ──► (ninguna — terminal)
 *
 * Nota: los estados PENDIENTE_APROBACION, APROBADO y RECHAZADO no forman parte
 * del diagrama base; son exclusivos de ComprasStateMachine (Fase 4).
 */
const VALID_TRANSITIONS = new Map<string, ReadonlySet<string>>([
  ['ABIERTO', new Set(['EN_PROGRESO', 'CANCELADO'])],
  ['EN_PROGRESO', new Set(['RESUELTO', 'CANCELADO'])],
  ['RESUELTO', new Set(['CERRADO', 'EN_PROGRESO'])],
  // CERRADO y CANCELADO son terminales: no aparecen como clave → retornarán false.
]);

/**
 * Implementación base de la máquina de estados.
 *
 * Contiene las transiciones comunes a los tres flujos (SOPORTE, COMPRAS, EDILICIA).
 * Las especializaciones por flujo extienden o reemplazan este comportamiento mediante
 * Strategy (ver TicketStateMachineFactory).
 *
 * Función pura: `puedeTransicionar` no muta el contexto ni mantiene estado entre llamadas.
 * Misma instancia puede reutilizarse de forma segura como singleton.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:tickets-core/Máquina de estados base, Transición inválida rechazada]
 * Tarea: 3.B.2
 */
export class BaseTicketStateMachine implements ITicketStateMachine {
  /**
   * Evalúa si la transición desde → hacia es válida según el diagrama base.
   *
   * No consume el contexto — la base no tiene guardas adicionales. Las
   * implementaciones específicas (EdiliciaStateMachine) sí lo usan.
   */
  puedeTransicionar(desde: string, hacia: string, _ctx: StateMachineContext): boolean {
    const destinos = VALID_TRANSITIONS.get(desde);
    if (!destinos) return false;
    return destinos.has(hacia);
  }
}
