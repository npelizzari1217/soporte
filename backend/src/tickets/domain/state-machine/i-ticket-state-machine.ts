/**
 * Contexto de evaluación para la máquina de estados de tickets.
 *
 * Diseñado para ser extensible: cada implementación específica por flujo
 * puede ignorar los campos que no utiliza.
 *
 * Extensibilidad futura:
 * - Fase 5 (EdiliciaStateMachine): usa `porcentajeAvance` para la guarda
 *   EN_PROGRESO → RESUELTO (solo válida cuando porcentaje = 100).
 * - Fase 4 (ComprasStateMachine): no necesita campos adicionales; el flujo
 *   de aprobación se modela con estados propios (PENDIENTE_APROBACION, APROBADO, RECHAZADO).
 *
 * Ref spec: [SPEC:tickets-core/Máquina de estados base]
 * Ref design: [DESIGN:Máquina de estados Strategy por tipo]
 */
export interface StateMachineContext {
  /**
   * Porcentaje de avance del ticket edilicio (0-100).
   * Requerido por EdiliciaStateMachine para evaluar la guarda de transición
   * EN_PROGRESO → RESUELTO. Si es undefined, EdiliciaStateMachine trata la
   * guarda como no satisfecha (transición denegada).
   * Ignorado por BaseTicketStateMachine y ComprasStateMachine.
   */
  porcentajeAvance?: number;
}

/**
 * Puerto de la máquina de estados de tickets.
 *
 * Implementaciones concretas (Strategy pattern):
 * - BaseTicketStateMachine: diagrama base común a todos los tipos.
 * - ComprasStateMachine (Fase 4): extiende con flujo de aprobación.
 * - EdiliciaStateMachine (Fase 5): extiende con guarda de avance en RESUELTO.
 *
 * Las implementaciones DEBEN ser funciones puras: mismo input → mismo output,
 * sin mutación del contexto ni de estado interno entre llamadas.
 *
 * Ref spec: [SPEC:tickets-core/Máquina de estados base]
 * Tarea: 3.B.2
 */
export interface ITicketStateMachine {
  /**
   * Evalúa si la transición de estado es permitida para este tipo de ticket.
   *
   * @param desde Código semántico del estado origen (ej. 'ABIERTO').
   * @param hacia Código semántico del estado destino (ej. 'EN_PROGRESO').
   * @param ctx  Contexto de evaluación. Extensible por flujo. No debe ser mutado.
   * @returns `true` si la transición es válida, `false` en caso contrario.
   */
  puedeTransicionar(desde: string, hacia: string, ctx: StateMachineContext): boolean;
}
