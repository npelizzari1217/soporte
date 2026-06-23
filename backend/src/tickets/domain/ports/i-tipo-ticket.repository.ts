/**
 * ITipoTicketRepository — puerto mínimo para acceso al catálogo de tipos de ticket.
 *
 * Se usa en CrearTicketUseCase y TransicionarEstadoUseCase para resolver
 * el `tipoCodigo` a partir del `tipoId` (UUID) almacenado en el ticket.
 * El tipoCodigo es necesario para:
 *   - NumeradorTicket.generarNumero (determina el prefijo SOP/COM/EDI)
 *   - TicketStateMachineFactory.resolve (selecciona la máquina correcta)
 *
 * La implementación concreta vive en tickets/infrastructure/persistence/prisma/.
 *
 * Ref spec: [SPEC:tickets-core/Tabla tipos_ticket]
 * Tarea: 3.C.2, 3.C.6
 */
export interface ITipoTicketRepository {
  /**
   * Retorna el código semántico ('SOPORTE', 'COMPRAS', 'EDILICIA') de un
   * tipo de ticket dado su UUID.
   * Retorna null si el tipo no existe en el catálogo del tenant.
   */
  findCodigoById(tipoId: string): Promise<string | null>;
}

/** Token de inyección de dependencias para ITipoTicketRepository en NestJS. */
export const TIPO_TICKET_REPOSITORY = Symbol('TIPO_TICKET_REPOSITORY');
