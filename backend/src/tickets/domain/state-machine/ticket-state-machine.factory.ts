import { ITicketStateMachine } from './i-ticket-state-machine';
import { BaseTicketStateMachine } from './base-ticket-state-machine';

/**
 * Token de inyección de dependencias para `TicketStateMachineFactory`.
 *
 * Permite mockear la factory en tests de use cases (PR6/PR7) sin acoplarse
 * a la implementación concreta. Mismo patrón que `TICKET_REPOSITORY`.
 */
export const TICKET_STATE_MACHINE_FACTORY = Symbol('TICKET_STATE_MACHINE_FACTORY');

/**
 * Factory de máquinas de estados de tickets — Strategy por tipo.
 *
 * Selecciona la implementación de `ITicketStateMachine` apropiada según el
 * código de `tipos_ticket.codigo`. Devuelve `BaseTicketStateMachine` como
 * fallback cuando no existe una implementación registrada para el tipo dado.
 *
 * Extensibilidad (registro en runtime, Fases 4/5): máquinas específicas por
 * tipo se registran vía `factory.register(codigo, machine)` en el wiring de
 * NestJS de sus respectivos módulos, sin tocar la base.
 *
 * Instancia-based (no estática): cada instancia mantiene su propio registry,
 * lo que aísla tests entre sí. En producción, el contenedor DI de NestJS
 * gestiona el singleton de la factory.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/tickets-core/spec T9. Ref design: ADR-3. Tarea: T4.2.
 */
export class TicketStateMachineFactory {
  private readonly registry: Map<string, ITicketStateMachine>;
  private readonly fallback: ITicketStateMachine;

  /**
   * @param fallback Máquina usada cuando no hay registro para el tipo pedido.
   *                 Por defecto: `BaseTicketStateMachine`.
   */
  constructor(fallback: ITicketStateMachine = new BaseTicketStateMachine()) {
    this.registry = new Map();
    this.fallback = fallback;
  }

  /**
   * Devuelve la máquina de estados para el tipo de ticket indicado.
   * Si el tipo no está registrado, retorna el fallback (`BaseTicketStateMachine`).
   *
   * @param tipoTicketCodigo Valor de `tipos_ticket.codigo` (ej. 'SOPORTE', 'COMPRAS', 'EDILICIA').
   */
  resolve(tipoTicketCodigo: string): ITicketStateMachine {
    return this.registry.get(tipoTicketCodigo) ?? this.fallback;
  }

  /**
   * Registra (o sobrescribe) una implementación específica para un tipo de ticket.
   * Llamado por los módulos de Compras (Fase 4) y Edilicia (Fase 5) en su wiring.
   *
   * @param tipoTicketCodigo Código del tipo de ticket (ej. 'COMPRAS').
   * @param machine Implementación de `ITicketStateMachine` para ese tipo.
   */
  register(tipoTicketCodigo: string, machine: ITicketStateMachine): void {
    this.registry.set(tipoTicketCodigo, machine);
  }
}
