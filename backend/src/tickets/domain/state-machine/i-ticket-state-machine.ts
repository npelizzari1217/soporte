/**
 * Contexto de evaluación para la máquina de estados de tickets.
 *
 * Diseñado para ser extensible: cada implementación específica por tipo de
 * ticket puede ignorar los campos que no utiliza. `BaseTicketStateMachine`
 * no consume ningún campo del contexto (grafo fijo de 6 estados, ADR-3).
 *
 * Extensibilidad futura (Fases 4/5): máquinas específicas por tipo
 * (COMPRAS/EDILICIA) registradas vía `TicketStateMachineFactory.register`
 * podrán usar guardas adicionales basadas en este contexto sin tocar la
 * máquina base.
 *
 * Ref spec: sdd/tickets-core/spec T9. Ref design: ADR-3.
 */
export interface StateMachineContext {
  readonly [key: string]: unknown;
}

/**
 * Puerto de la máquina de estados de tickets.
 *
 * Implementaciones concretas (Strategy pattern):
 * - `BaseTicketStateMachine`: grafo base de 6 estados (NUEVO→ASIGNADO→
 *   EN_PROCESO→RESUELTO→CERRADO + CANCELADO), común al fallback y a
 *   cualquier tipo sin máquina específica registrada.
 * - Máquinas específicas por tipo (Fases 4/5) se registran en
 *   `TicketStateMachineFactory` sin modificar la base.
 *
 * Las implementaciones DEBEN ser funciones puras: mismo input → mismo
 * output, sin mutación del contexto ni de estado interno entre llamadas.
 * Dominio puro — sin imports de Prisma ni NestJS.
 *
 * Ref spec: sdd/tickets-core/spec T9. Ref design: ADR-3. Tarea: T4.1.
 */
export interface ITicketStateMachine {
  /**
   * Evalúa si la transición de estado es permitida.
   *
   * @param desde Código semántico del estado origen (ej. 'NUEVO').
   * @param hacia Código semántico del estado destino (ej. 'ASIGNADO').
   * @param ctx Contexto de evaluación. Extensible por tipo. No debe ser mutado.
   * @returns `true` si la transición es un arco válido del grafo, `false` en caso contrario.
   */
  puedeTransicionar(desde: string, hacia: string, ctx: StateMachineContext): boolean;
}
