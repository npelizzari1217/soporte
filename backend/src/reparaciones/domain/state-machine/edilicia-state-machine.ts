import {
  ITicketStateMachine,
  StateMachineContext,
} from '../../../tickets/domain/state-machine/i-ticket-state-machine';

/**
 * Diagrama de transiciones para el flujo EDILICIA.
 *
 * Hereda el diagrama base más la restricción de guarda en EN_PROGRESO → RESUELTO:
 * esa transición solo es válida cuando ctx.porcentajeAvance = 100.
 *
 * Diagrama completo (EDILICIA):
 * ABIERTO ──► EN_PROGRESO
 * ABIERTO ──► CANCELADO
 * EN_PROGRESO ──► RESUELTO  (SOLO cuando porcentajeAvance = 100)
 * EN_PROGRESO ──► CANCELADO
 * RESUELTO ──► CERRADO
 * RESUELTO ──► EN_PROGRESO  (reapertura)
 * CERRADO ──► (ninguna — terminal)
 * CANCELADO ──► (ninguna — terminal)
 *
 * Nota: Completar la última subtarea (porcentajeAvance → 100) NO transiciona
 * el estado automáticamente. La transición a RESUELTO es EXPLÍCITA y debe
 * ser iniciada por el usuario vía TransicionarEstadoUseCase.
 *
 * Ref spec: [SPEC:reparaciones/Máquina de estados — extensión EDILICIA]
 */
const VALID_TRANSITIONS_EDILICIA = new Map<string, ReadonlySet<string>>([
  ['ABIERTO', new Set(['EN_PROGRESO', 'CANCELADO'])],
  ['EN_PROGRESO', new Set(['RESUELTO', 'CANCELADO'])],
  ['RESUELTO', new Set(['CERRADO', 'EN_PROGRESO'])],
  // CERRADO y CANCELADO son terminales: no aparecen como clave → retornan false.
]);

/**
 * EdiliciaStateMachine — estrategia de máquina de estados para tickets EDILICIA.
 *
 * Implementa `ITicketStateMachine` con la guarda de avance obligatoria en
 * `EN_PROGRESO → RESUELTO`: la transición solo es válida cuando
 * `ctx.porcentajeAvance === 100`.
 *
 * Se registra en `TicketStateMachineFactory` para el código de tipo `'EDILICIA'`
 * durante el wiring del módulo NestJS (ReparacionesModule.onModuleInit).
 *
 * Función pura: `puedeTransicionar` no muta el contexto ni mantiene estado.
 * La instancia es segura para uso como singleton en el contenedor DI.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Registro en factory (wiring NestJS — ReparacionesModule.onModuleInit):
 *   factory.register('EDILICIA', new EdiliciaStateMachine())
 *
 * Ref spec: [SPEC:reparaciones/Máquina de estados — extensión EDILICIA,
 *            Guard de avance en transición a RESUELTO,
 *            Completar subtarea no transiciona automáticamente]
 * Ref design: [DESIGN:Máquina de estados Strategy por tipo]
 * Tarea: 5.A.4
 */
export class EdiliciaStateMachine implements ITicketStateMachine {
  /**
   * Evalúa si la transición desde → hacia es válida para el flujo EDILICIA.
   *
   * Para `EN_PROGRESO → RESUELTO`: aplica la guarda de avance.
   * La transición solo es válida cuando `ctx.porcentajeAvance === 100`.
   * Si `porcentajeAvance` es undefined, la guarda NO se satisface (conservador).
   *
   * Para todas las demás transiciones: delega al mapa base del flujo edilicio.
   *
   * @param desde Código semántico del estado origen (ej. 'EN_PROGRESO').
   * @param hacia Código semántico del estado destino (ej. 'RESUELTO').
   * @param ctx   Contexto de evaluación. `porcentajeAvance` es relevante aquí.
   * @returns `true` si la transición es válida, `false` en caso contrario.
   */
  puedeTransicionar(desde: string, hacia: string, ctx: StateMachineContext): boolean {
    const destinos = VALID_TRANSITIONS_EDILICIA.get(desde);
    if (!destinos) return false;
    if (!destinos.has(hacia)) return false;

    // Guarda específica para EDILICIA: EN_PROGRESO → RESUELTO requiere avance = 100
    if (desde === 'EN_PROGRESO' && hacia === 'RESUELTO') {
      return ctx.porcentajeAvance === 100;
    }

    return true;
  }
}
