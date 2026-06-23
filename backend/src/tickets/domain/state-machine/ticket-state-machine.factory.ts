import { ITicketStateMachine } from './i-ticket-state-machine';
import { BaseTicketStateMachine } from './base-ticket-state-machine';

/**
 * Factory de máquinas de estados de tickets — Strategy por tipo.
 *
 * Selecciona la implementación de `ITicketStateMachine` apropiada según el
 * código de `tipos_ticket.codigo`. Devuelve `BaseTicketStateMachine` como
 * fallback cuando no existe una implementación registrada para el tipo dado.
 *
 * Extensibilidad (registro en runtime):
 * - Fase 4 — ComprasStateMachine: registrar con codigo 'COMPRAS'.
 * - Fase 5 — EdiliciaStateMachine: registrar con codigo 'EDILICIA'.
 * Las implementaciones específicas se registran en sus respectivos módulos
 * mediante `factory.register(codigo, machine)` en el wiring de NestJS.
 *
 * Instancia-based (no estática): cada instancia mantiene su propio registry,
 * lo que facilita el testing aislado y evita bleeding de estado entre suites.
 * En producción, el contenedor DI de NestJS gestiona el singleton del factory.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref design: [DESIGN:Máquina de estados Strategy por tipo]
 * Tarea: 3.B.2
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
   * Si el tipo no está registrado, retorna el fallback (BaseTicketStateMachine).
   *
   * @param tipoTicketCodigo Valor de `tipos_ticket.codigo` (ej. 'SOPORTE', 'COMPRAS', 'EDILICIA').
   */
  resolve(tipoTicketCodigo: string): ITicketStateMachine {
    return this.registry.get(tipoTicketCodigo) ?? this.fallback;
  }

  /**
   * Registra una implementación específica para un tipo de ticket.
   * Llamado por los módulos de Compras (Fase 4) y Edilicia (Fase 5) en su wiring.
   *
   * @param tipoTicketCodigo Código del tipo de ticket (ej. 'COMPRAS').
   * @param machine          Implementación de ITicketStateMachine para ese tipo.
   */
  register(tipoTicketCodigo: string, machine: ITicketStateMachine): void {
    this.registry.set(tipoTicketCodigo, machine);
  }
}
