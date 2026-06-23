import {
  ITicketStateMachine,
  StateMachineContext,
} from '../../../tickets/domain/state-machine/i-ticket-state-machine';

/**
 * Diagrama de transiciones para el flujo COMPRAS.
 *
 * Extiende el diagrama base con el ciclo de aprobación obligatorio.
 * La transición directa ABIERTO → EN_PROGRESO está BLOQUEADA para COMPRAS:
 * el camino obligatorio pasa por PENDIENTE_APROBACION.
 *
 * Ref spec: [SPEC:compras/Máquina de estados — extensión COMPRAS]
 *
 * ABIERTO ──► PENDIENTE_APROBACION  (solicitante envía a aprobación)
 * ABIERTO ──► CANCELADO             (heredado de base)
 * PENDIENTE_APROBACION ──► APROBADO  (requiere compra:aprobar)
 * PENDIENTE_APROBACION ──► RECHAZADO (requiere compra:aprobar)
 * PENDIENTE_APROBACION ──► CANCELADO (cancelación antes de decisión)
 * APROBADO ──► EN_PROGRESO           (comienza ejecución de la compra)
 * RECHAZADO ──► CERRADO              (estado terminal inmediato post-rechazo)
 * EN_PROGRESO ──► RESUELTO
 * EN_PROGRESO ──► CANCELADO
 * RESUELTO ──► CERRADO
 * RESUELTO ──► EN_PROGRESO           (reapertura)
 * CERRADO ──► (ninguna — terminal)
 * CANCELADO ──► (ninguna — terminal)
 *
 * NOTA: ABIERTO → EN_PROGRESO está intencionalmente AUSENTE de este mapa.
 */
const VALID_TRANSITIONS_COMPRAS = new Map<string, ReadonlySet<string>>([
  ['ABIERTO', new Set(['PENDIENTE_APROBACION', 'CANCELADO'])],
  ['PENDIENTE_APROBACION', new Set(['APROBADO', 'RECHAZADO', 'CANCELADO'])],
  ['APROBADO', new Set(['EN_PROGRESO'])],
  ['RECHAZADO', new Set(['CERRADO'])],
  ['EN_PROGRESO', new Set(['RESUELTO', 'CANCELADO'])],
  ['RESUELTO', new Set(['CERRADO', 'EN_PROGRESO'])],
  // CERRADO y CANCELADO son terminales: no aparecen como clave → retornan false.
]);

/**
 * ComprasStateMachine — estrategia de máquina de estados para tickets COMPRAS.
 *
 * Implementa `ITicketStateMachine` con el flujo de aprobación obligatorio del
 * módulo de compras. Se registra en `TicketStateMachineFactory` para el código
 * de tipo `'COMPRAS'` durante el wiring del módulo NestJS (ComprasModule).
 *
 * Función pura: `puedeTransicionar` no muta el contexto ni mantiene estado.
 * La instancia es segura para uso como singleton en el contenedor DI.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Registro en factory (wiring NestJS — ComprasModule.onModuleInit):
 *   factory.register('COMPRAS', new ComprasStateMachine())
 *
 * Ref spec: [SPEC:compras/Máquina de estados — extensión COMPRAS, Ciclo de aprobación]
 * Ref design: [DESIGN:Máquina de estados Strategy por tipo]
 * Tarea: 4.A.2
 */
export class ComprasStateMachine implements ITicketStateMachine {
  /**
   * Evalúa si la transición desde → hacia es válida para el flujo COMPRAS.
   *
   * No consume el contexto (porcentajeAvance es exclusivo de EdiliciaStateMachine).
   *
   * @param desde Código semántico del estado origen.
   * @param hacia Código semántico del estado destino.
   * @param _ctx  Contexto de evaluación (ignorado en esta implementación).
   */
  puedeTransicionar(desde: string, hacia: string, _ctx: StateMachineContext): boolean {
    const destinos = VALID_TRANSITIONS_COMPRAS.get(desde);
    if (!destinos) return false;
    return destinos.has(hacia);
  }
}
